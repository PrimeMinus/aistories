import { OpenAI } from "openai";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const s3 = new S3Client({ region: "us-east-2" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper to convert stream to string
const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });

export const handler = async (event) => {

  // Authorization Verification
  if (event.headers.authorization != "Bearer 1953") {
    return {
        statusCode: 403,
        body: "Forbidden"
    };
  }

  event.body = JSON.parse(event.body);

  const bucketName = "warneraieliminationstories";
  const key = event.body.id+".json";

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    const response = await s3.send(command);
    const fileContents = await streamToString(response.Body); // body is a stream

    var story = JSON.parse(fileContents);

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }

  // ensure winner count is valid
  if (story.winners < 1 || story.winners + 1 > story.players.length) {
    return {
      statusCode: 500,
      body: "Invalid number of winners"
    };
  }

  // update story status to loading
  story.content[0] = "loading"
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: JSON.stringify(story, null, 2),
    ContentType: "application/json",
  });
  await s3.send(putCommand);

  // Pick winner(s)
  story.winningPlayers = []
  while (story.winningPlayers.length < story.winners) {
    // generate random number between 0 and story.players.length
    var random = Math.floor(Math.random() * story.players.length);
    if (!story.winningPlayers.includes(story.players[random].name)) {
      story.winningPlayers.push(story.players[random].name);
    }
  }

  // Story Prompt
  var storyPrompt = "SETTING:\n"+story.setting+"\nTHEME:\n"+story.theme+"CHARACTERS:\n"+JSON.stringify(playerArrayToString(story.players))+"\nINSTRUCTIONS:\n"+story.instructions
  story.content = []
  var pluralS = ""
  var areOrIs = "is"
  if (story.winners > 1) {
    pluralS = "s"
    areOrIs = "are"
    
  }
  var messageHistory = [
    {
      "role": "system",
      "content": `You are an AI assitant, your job is to create a story for the user using the instructions they have given you. Do not use formatting characters. Ensure that there ${areOrIs} ${story.winners} winner${pluralS}. They should be: ${story.winningPlayers.join(", ")}. Say "STOP" at the end of the story to end your message.`
    }
  ]
  messageHistory.push({
    "role": "user",
    "content": storyPrompt
  })
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: messageHistory,
      // temperature: 1,
      stop: ["STOP"]
    })

    // append to story content
    story.content = stringToArray(completion.choices[0].message.content)

    // --- write to the S3 bucket ---
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(story, null, 2),
      ContentType: "application/json",
    });
    await s3.send(putCommand);

    return {
      statusCode: 200,
      body: JSON.stringify(messageHistory),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function stringToArray(str) {
  var array = []
  var isFinished = false
  while (!isFinished) {
    array.push(str.substring(0, str.indexOf("\n")))
    if (array[array.length - 1] == "") {
      array.pop()
    }
    str = str.substring(str.indexOf("\n") + 1)

    if (!str.includes("\n")) {
      isFinished = true
    }
  }
  array.push(str)
  return array
}

function playerArrayToString(players) {
  var string = ""
  for (var i = 0; i < players.length; i++) {
    string += players[i].name
    if (players[i].characteristics != "") {
      string += " (" + players[i].characteristics + ") "
    }
  }
  return string
}