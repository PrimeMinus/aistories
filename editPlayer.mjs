import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const s3 = new S3Client({ region: "us-east-2" });

// Helper to convert stream to string
const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });

export const handler = async (event) => {

  event.body = JSON.parse(event.body);

  // Authorization Verification
  if (event.headers.authorization != "Bearer 1953") {
    return {
        statusCode: 403,
        body: "Forbidden"
    };
  }

  const bucketName = "warneraieliminationstories";
  const key = `${event.body.storyId}.json`;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    const response = await s3.send(command);
    const fileContents = await streamToString(response.Body); // body is a stream
    const story = JSON.parse(fileContents);

    if (event.body.player.id == "") {
      event.body.player.id = (Math.floor(Math.random() * 999) + 1000).toString()
    }

    var playerIndex = -1;
    for (var i = 0; i < story.players.length; i++) {
      if (story.players[i].id == event.body.player.id) {
        playerIndex = i;
        i = story.players.length;
      }
    }
    // if player does not exist create player
    if (playerIndex == -1) {
      story.players.push(event.body.player);
    } else {
      // if player name is "" delete the player
      if (event.body.player.name == "") {
        story.players.splice(playerIndex, 1);
      } else {
        story.players[playerIndex] = event.body.player;
      }
    }

    // ensure winner count is still valid after player modifications
    if (story.winners >= story.players.length) {
      story.winners = story.players.length - 1;
    }

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(story, null, 2),
      ContentType: "application/json",
    });
    await s3.send(putCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "File read successfully.",
        content: story,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
