import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function getS3Client() {
  // TEMPORARY DEBUG — remove once the bucket name issue is confirmed fixed.
  const bucket = process.env.AWS_S3_BUCKET;
  console.log("BUCKET VALUE:", JSON.stringify(bucket), "LENGTH:", bucket?.length);

  if (!client) {
    client = new S3Client({ region: process.env.AWS_REGION! });
  }
  return client;
}

function publicUrlFor(key: string) {
  return `https://${process.env.AWS_CLOUDFRONT_DOMAIN}/${key}`;
}

// ─── Simple single-PUT presign — used for images and small files ─────────
// Currently unused (images/files stayed on Supabase), kept in case a
// future upload type wants a simple single-PUT path without multipart.
export async function createPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });
  return { uploadUrl, publicUrl: publicUrlFor(key) };
}

// ─── Multipart upload — used for lecture videos ───────────────────────────
// Three-phase flow, mirroring the TUS session lifecycle this replaces:
// 1. create()  — opens an upload session, returns an uploadId tied to a key
// 2. presignPart() — one short-lived signed URL per chunk, requested lazily
//    so a resumed upload only needs URLs for the parts it hasn't sent yet
// 3. complete() — stitches the uploaded parts into one object by ETag+number
export async function createMultipartUpload(key: string, contentType: string) {
  const command = new CreateMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });
  const result = await getS3Client().send(command);
  if (!result.UploadId) throw new Error("S3 did not return an upload id.");
  return { uploadId: result.UploadId, key };
}

export async function presignUploadPart(key: string, uploadId: string, partNumber: number) {
  const command = new UploadPartCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  // Parts can sit queued client-side for a while on a slow connection —
  // give each part URL a longer window than the simple single-PUT case.
  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  const command = new CompleteMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
    },
  });
  await getS3Client().send(command);
  return publicUrlFor(key);
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  const command = new AbortMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    UploadId: uploadId,
  });
  await getS3Client().send(command);
}