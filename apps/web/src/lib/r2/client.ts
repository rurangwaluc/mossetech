import { S3Client } from '@aws-sdk/client-s3';

let cachedClient: S3Client | null =
  null;

function requiredEnv(name: string) {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required for R2 media storage.`,
    );
  }

  return value;
}

export function getR2BucketName() {
  return requiredEnv(
    'R2_BUCKET_NAME',
  );
}

export function getR2Client() {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: requiredEnv(
      'R2_ENDPOINT',
    ),
    credentials: {
      accessKeyId: requiredEnv(
        'R2_ACCESS_KEY_ID',
      ),
      secretAccessKey: requiredEnv(
        'R2_SECRET_ACCESS_KEY',
      ),
    },
  });

  return cachedClient;
}
