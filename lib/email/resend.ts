import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status?: number };

function fromAddress(): string {
  const configured = process.env.PARENT_INVITE_FROM_EMAIL?.trim();
  if (configured) return configured;
  // Resend test sender — only delivers to the account owner's email until a domain is verified.
  return "Film Room <onboarding@resend.dev>";
}

export function isEmailSendingConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmailViaResend(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Email sending is not configured. Add RESEND_API_KEY in the environment.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        body.message ||
        body.name ||
        `Email provider rejected the send (${response.status}).`,
    };
  }

  return { ok: true, id: typeof body.id === "string" ? body.id : "sent" };
}
