// SERVER-ONLY. Never import this from a component or client-side file.
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_LECTURES_BUCKET;

if (!REGION || !BUCKET) {
  throw new Error("AWS_REGION / S3_LECTURES_BUCKET are not set");
}

const s3Client = new S3Client({ region: REGION });

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4; // 4 hours — long enough for one sitting

/**
 * Takes an S3 object key (e.g. "lectures/batch123/session456.mp4") — NOT a
 * full URL — and returns a temporary, playable, signed URL.
 *
 * THIS IS THE ONLY FUNCTION THAT CHANGES WHEN SWAPPING TO CLOUDFRONT.
 * Every call site (batch-hub.ts etc.) passes an S3 key and gets back a
 * signed URL; the call sites never know or care which signing scheme
 * produced it.
 */
export async function signLectureUrl(objectKey: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey });
  return getS3SignedUrl(s3Client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}