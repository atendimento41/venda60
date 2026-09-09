import nodemailer from "nodemailer";

export function smtpConfigurado(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      (process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim())
  );
}

function criarTransport() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: String(process.env.SMTP_USER || "").trim(),
      pass: String(process.env.SMTP_PASS || "").trim(),
    },
  });
}

export async function enviarEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  if (!smtpConfigurado()) {
    throw new Error("SMTP não configurado (SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM).");
  }
  const from =
    String(process.env.SMTP_FROM || "").trim() || String(process.env.SMTP_USER || "").trim();
  const transport = criarTransport();
  await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
