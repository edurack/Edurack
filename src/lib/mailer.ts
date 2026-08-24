// src/lib/mailer.ts
// SERVER-ONLY. Centralized AWS SES sender — replaces the old EmailJS REST
// calls that used to live in src/lib/otp.ts. Every outbound email in the
// app should go through sendMail() (single) or sendMailBatch() (many) so
// there's one transport to configure, monitor, and swap out later if needed.
import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error(
    "AWS SES is not configured — AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY must be set",
  );
}
if (!EMAIL_FROM) {
  throw new Error("EMAIL_FROM is not set");
}

const sesClient = new SESv2Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const transporter = nodemailer.createTransport({
  SES: { sesClient, SendEmailCommand },
});

// Thrown instead of the raw SES/Nodemailer error so callers can catch one
// well-known type and decide how to respond to the client, without needing
// to know anything about the SES SDK's own error shapes.
export class MailSendError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MailSendError";
    this.cause = cause;
  }
}

export type SendMailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendMail({ to, subject, html }: SendMailParams): Promise<{ messageId: string }> {
  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });
    console.log(`[mailer] sent to=${to} subject="${subject}" messageId=${info.messageId}`);
    return { messageId: info.messageId as string };
  } catch (error) {
    console.error(`[mailer] FAILED to=${to} subject="${subject}":`, error);
    throw new MailSendError(`Failed to send email to ${to}`, error);
  }
}

export type SendMailBatchResult = {
  sent: number;
  failed: number;
  failures: { to: string; error: unknown }[];
};

// Sends a list of emails one at a time with a delay between each, instead
// of Promise.all-ing them — SES sandbox (and most fresh production
// accounts) caps you at ~1 send/second, and blasting them concurrently
// just produces a wall of throttling errors.
//
// A failure on one recipient never stops the rest of the batch from
// sending — failures are collected and returned, not thrown, so a single
// bad/unverified address can't cancel an announcement to everyone else.
//
// CAVEAT: this runs inline in whatever server function calls it, awaited
// to completion. For a serverless deployment (e.g. Vercel) with a request
// timeout, a large recipient list can exceed that timeout before the batch
// finishes. Fine for small purchaser/announcement lists today — once
// audiences grow, move this to a real background job/queue instead of
// calling it directly from an admin action.
export async function sendMailBatch(
  items: SendMailParams[],
  opts: { delayMs?: number } = {},
): Promise<SendMailBatchResult> {
  const delayMs = opts.delayMs ?? 1100;
  let sent = 0;
  const failures: { to: string; error: unknown }[] = [];

  for (const item of items) {
    try {
      await sendMail(item);
      sent++;
    } catch (error) {
      failures.push({ to: item.to, error });
    }
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { sent, failed: failures.length, failures };
}