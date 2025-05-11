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
  const key = `${event.body.id}.json`;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    // read from the S3 bucket
    const response = await s3.send(command);
    const fileContents = await streamToString(response.Body); // body is a stream
    const story = JSON.parse(fileContents);

    story.title = event.body.title;
    story.setting = event.body.setting;
    story.theme = event.body.theme;
    story.instructions = event.body.instructions;
    story.winners = event.body.winners;

    // write to the S3 bucket
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
