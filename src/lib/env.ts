// SERVER-ONLY. Validates required env vars at boot so misconfiguration fails
// immediately and loudly instead of surfacing as a confusing 500 later.

const REQUIRED_SERVER_ENV = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "MONGODB_URI",
  "AWS_REGION",
  "S3_LECTURES_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const;

let validated = false;

export function validateServerEnv() {
  if (validated) return;

  const missing = REQUIRED_SERVER_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required server environment variable(s): ${missing.join(", ")}. ` +
        `Check your .env file — see .env.example if present.`,
    );
  }

  validated = true;
}