// SERVER-ONLY. Never import this from a component or client-side file.
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.AWS_S3_BUCKET; // unified with lib/s3.ts — was previously S3_LECTURES_BUCKET

if (!REGION || !BUCKET) {
  throw new Error("AWS_REGION / AWS_S3_BUCKET are not set");
}

const s3Client = new S3Client({ region: REGION });

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4; // 4 hours — long enough for one sitting

// Defensive: some lecture rows created before this file's key/URL contract
// was fixed may still have a full https://... URL stored instead of a bare
// S3 key. Rather than requiring a manual DB cleanup, unwrap either shape
// down to the bare key GetObjectCommand actually needs.
function extractKey(input: string): string {
  if (!input.includes("://")) return input; // already a bare key — nothing to do
  try {
    const url = new URL(input);
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return input; // not a parseable URL — pass through as-is and let S3 report the real error
  }
}

/**
 * Takes an S3 object key (e.g. "lectures/batch123/1699999999-demo.mp4") —
 * or, for backward compatibility, a full CloudFront/S3 URL — and returns a
 * temporary, playable, signed URL.
 *
 * New uploads (mentor-uploads.ts) should always pass a bare key going
 * forward. The full-URL fallback above only exists to keep lectures
 * uploaded before that contract was fixed playable without a DB migration.
 */
export async function signLectureUrl(objectKeyOrUrl: string): Promise<string> {
  const objectKey = extractKey(objectKeyOrUrl);
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey });
  return getS3SignedUrl(s3Client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}