// src/lib/mailer.ts
// SERVER-ONLY. Centralized email sender — now backed by Resend instead of
// AWS SES (SES production access was denied). Every outbound email in the
// app goes through sendMail() (single) or sendMailBatch() (many); the
// exported function signatures are unchanged from the SES version so no
// caller (otp.ts, admin.ts, promoter-admin.ts, mentor-onboarding.ts, etc.)
// needs to change.
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const rawEmailFrom = process.env.EMAIL_FROM;

if (!RESEND_API_KEY) {
  throw new Error("Resend is not configured — RESEND_API_KEY must be set");
}
if (!rawEmailFrom) {
  throw new Error("EMAIL_FROM is not set");
}

// Reassigned to a plain `string` (rather than `string | undefined`) so
// every function below — not just the code right after this check — sees
// the narrowed type without needing a `!` non-null assertion at each call site.
const EMAIL_FROM: string = rawEmailFrom;

const resend = new Resend(RESEND_API_KEY);

// Thrown instead of the raw Resend error so callers can catch one
// well-known type and decide how to respond to the client, without needing
// to know anything about the Resend SDK's own error shape.
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
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });

    // The Resend SDK doesn't throw on API-level failures (bad address,
    // domain not verified, rate limit, etc.) — it resolves with an `error`
    // field instead. Normalize that into the same thrown-error path as a
    // network/SDK failure so every caller only has to catch MailSendError.
    if (error) {
      console.error(`[mailer] FAILED to=${to} subject="${subject}":`, error);
      throw new MailSendError(`Failed to send email to ${to}`, error);
    }

    console.log(`[mailer] sent to=${to} subject="${subject}" messageId=${data?.id}`);
    return { messageId: data?.id ?? "" };
  } catch (error) {
    if (error instanceof MailSendError) throw error;
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
// of Promise.all-ing them — Resend's default rate limit is 2 requests/sec,
// and blasting them concurrently just produces a wall of 429s.
//
// A failure on one recipient never stops the rest of the batch from
// sending — failures are collected and returned, not thrown, so a single
// bad/unverified address can't cancel an announcement to everyone else.
//
// CAVEAT: this runs inline in whatever server function calls it, awaited
// to completion. For a serverless deployment (e.g. Vercel) with a request
// timeout, a large recipient list can exceed that timeout before the batch
// finishes. Fine for small purchaser/announcement lists today — once
// audiences grow, move this to a real background job/queue, or switch to
// Resend's native batch endpoint (resend.batch.send, up to 100 emails per
// call) instead of calling it directly from an admin action.
export async function sendMailBatch(
  items: SendMailParams[],
  opts: { delayMs?: number } = {},
): Promise<SendMailBatchResult> {
  const delayMs = opts.delayMs ?? 550; // ~2 req/sec, matches Resend's default rate limit
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