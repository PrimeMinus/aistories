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

  // Pick winner(s)
  story.winningPlayers = []
  while (story.winningPlayers.length < story.winners) {
    // generage random number between 0 and story.players.length
    var random = Math.floor(Math.random() * story.players.length);
    if (!story.winningPlayers.includes(story.players[random].name)) {
      story.winningPlayers.push(story.players[random].name);
    }
  }

  // set up alive players
  var alivePlayers = []
  story.players.forEach(player => {
    if (!story.winningPlayers.includes(player.name)) {
      alivePlayers.push(player.name)
    }
  });

  // Story Prompt
  var storyPrompt = "SETTING:\n"+story.setting+"\nTHEME:\n"+story.theme+"CHARACTERS:\n"+JSON.stringify(story.players)+"\nINSTRUCTIONS:\n"+story.instructions
  story.content = []
  var pluralS = ""
  if (story.winners > 1) {
    pluralS = "s"
  }
  var messageHistory = [
    {
      "role": "system",
      "content": `Say "STOP" at any point to end the line\nDo not respond with more than 70 words\nOne players line per response\nOnce a player is eliminated they can no longer compete\nBefore ending, announce the winner\nThere will be ${story.winners} winner${pluralS}\nRespond each time with the player's name, their dialogue, and details about what the player is doing. Or describe how they've eliminated another player.`
    }
  ]
  messageHistory.push({
    "role": "user",
    "content": storyPrompt
  })
  
  try {
    while (alivePlayers.length >= story.winners && story.content.length < 50) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: messageHistory,
        max_completion_tokens: 100,
        // temperature: 1,
        stop: ["STOP"]
      });
      
      // append to story content
      story.content.push(completion.choices[0].message.content)
      
      //append to history
      messageHistory.push({
        "role": "assistant",
        "content": completion.choices[0].message.content
      })
      
      // role dice to determine if a player should be eliminated
      if (Math.random() < 0.3) {
        var eliminateNext = ""
        // generage random number between 0 and alivePlayer.length
        var random = Math.floor(Math.random() * alivePlayers.length);
        eliminateNext = alivePlayers[random]
        alivePlayers.splice(random, 1)
        messageHistory.push({
          "role": "user",
          "content": `Alive players: ${story.winningPlayers},${alivePlayers}. Eliminate ${eliminateNext}. Genterate the next line.`
        })
        
        // if no player eliminated
      } else if (alivePlayers.length > 0) {
        messageHistory.push({
          "role": "user",
          "content": "Do not eliminate anyone. Genterate the next line."
        })
      }

      // ---end of WHILE loop---
    }
    messageHistory.push({
      "role": "user",
      "content": `Announce the winner${pluralS}: ${story.winningPlayers}`
    })
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: messageHistory,
      max_completion_tokens: 100,
      // temperature: 1,
      stop: ["STOP"]
    });
    // append to story content
    story.content.push(completion.choices[0].message.content)

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
