import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    await s3.send(command);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "File deleted successfully." }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
