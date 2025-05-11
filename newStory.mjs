import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: "us-east-2" });

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
  const data = {
	"id": event.body.id,
	"title": event.body.title,
	"setting": event.body.setting,
  "theme": event.body.theme,
	"instructions": event.body.instructions,
	"winners": event.body.winners,
	"winningPlayers": [],
	"players": event.body.players,
  "content": []
};

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  });

  try {
    await s3.send(command);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "File uploaded to S3 successfully!" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
