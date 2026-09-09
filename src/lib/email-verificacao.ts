import { createHash, randomBytes } from "crypto";
import { getClient } from "@/db";
import { enviarEmail, smtpConfigurado } from "./mailer";

const TOKEN_HORAS = 48;

export function normalizarEmail(v: unknown): string {
  return String(v || "")
    .trim()
    .toLowerCase();
}

export function validarEmail(email: string): boolean {
  if (!email) return false;
  // validação prática (não RFC completa)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function gerarTokenVerificacao() {
  const token = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + TOKEN_HORAS * 60 * 60 * 1000);
  return { token, hash: hashToken(token), expira };
}

function appBaseUrl() {
  const base = String(process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (base) return base;
  return "";
}

function nomeSistema() {
  return String(process.env.APP_NOME_EMAIL || "60 Vendas").trim() || "60 Vendas";
}

export type ResultadoVerificacaoEmail = {
  enviado: boolean;
  aviso?: string;
};

/** Grava token e tenta enviar e-mail. Não falha o cadastro se SMTP estiver ausente. */
export async function dispararVerificacaoEmail(opts: {
  userId: number;
  email: string;
  nome: string;
  login: string;
}): Promise<ResultadoVerificacaoEmail> {
  const email = normalizarEmail(opts.email);
  if (!validarEmail(email)) {
    throw new Error("E-mail pessoal inválido.");
  }

  const { token, hash, expira } = gerarTokenVerificacao();
  await getClient().execute({
    sql: `UPDATE usuarios
          SET email = ?,
              email_verificado_em = NULL,
              email_token_hash = ?,
              email_token_expira = ?
          WHERE id = ?`,
    args: [email, hash, expira.toISOString(), opts.userId],
  });

  if (!smtpConfigurado()) {
    return {
      enviado: false,
      aviso: "E-mail salvo; configure SMTP para enviar a verificação.",
    };
  }

  const base = appBaseUrl();
  if (!base) {
    return {
      enviado: false,
      aviso: "E-mail salvo; defina APP_BASE_URL para montar o link de verificação.",
    };
  }

  const link = `${base}/verificar-email?token=${encodeURIComponent(token)}`;
  const sistema = nomeSistema();
  const assunto = `${sistema} — confirme seu e-mail`;
  const text = [
    `Olá, ${opts.nome}!`,
    "",
    `Seu login em ${sistema} é: ${opts.login}`,
    "Confirme seu e-mail pessoal clicando no link abaixo (válido por 48 horas):",
    link,
    "",
    "Se você não solicitou isso, ignore esta mensagem.",
  ].join("\n");
  const html = `
    <p>Olá, <strong>${escapeHtml(opts.nome)}</strong>!</p>
    <p>Seu login em <strong>${escapeHtml(sistema)}</strong> é: <code>${escapeHtml(opts.login)}</code></p>
    <p>Confirme seu e-mail pessoal para dar mais credibilidade ao cadastro:</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#e11c24;color:#fff;text-decoration:none;border-radius:4px">Confirmar e-mail</a></p>
    <p style="color:#666;font-size:13px">Ou copie: ${escapeHtml(link)}</p>
    <p style="color:#666;font-size:13px">Link válido por ${TOKEN_HORAS} horas.</p>
  `;

  try {
    await enviarEmail({ to: email, subject: assunto, html, text });
    return { enviado: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao enviar e-mail.";
    return { enviado: false, aviso: `E-mail salvo; envio falhou: ${msg}` };
  }
}

export async function limparEmailUsuario(userId: number) {
  await getClient().execute({
    sql: `UPDATE usuarios
          SET email = NULL,
              email_verificado_em = NULL,
              email_token_hash = NULL,
              email_token_expira = NULL
          WHERE id = ?`,
    args: [userId],
  });
}

export async function confirmarEmailPorToken(tokenRaw: string): Promise<{ ok: boolean; message: string }> {
  const token = String(tokenRaw || "").trim();
  if (!token) return { ok: false, message: "Token ausente." };

  const hash = hashToken(token);
  const rs = await getClient().execute({
    sql: `SELECT id, email, email_token_expira, email_verificado_em
          FROM usuarios
          WHERE email_token_hash = ?
          LIMIT 1`,
    args: [hash],
  });
  const row = rs.rows?.[0] as
    | {
        id: number;
        email?: string;
        email_token_expira?: string;
        email_verificado_em?: string;
      }
    | undefined;

  if (!row) return { ok: false, message: "Link inválido ou já utilizado." };
  if (row.email_verificado_em) {
    return { ok: true, message: "Este e-mail já estava verificado." };
  }

  const expira = row.email_token_expira ? new Date(String(row.email_token_expira)) : null;
  if (!expira || Number.isNaN(expira.getTime()) || expira.getTime() < Date.now()) {
    return { ok: false, message: "Link expirado. Peça um novo envio na tela de Usuários." };
  }

  await getClient().execute({
    sql: `UPDATE usuarios
          SET email_verificado_em = ?,
              email_token_hash = NULL,
              email_token_expira = NULL
          WHERE id = ?`,
    args: [new Date().toISOString(), row.id],
  });

  return { ok: true, message: "E-mail confirmado com sucesso. Obrigado!" };
}

export async function reenviarVerificacao(userId: number): Promise<ResultadoVerificacaoEmail> {
  const rs = await getClient().execute({
    sql: "SELECT id, login, nome, email, email_verificado_em FROM usuarios WHERE id = ? LIMIT 1",
    args: [userId],
  });
  const row = rs.rows?.[0] as
    | {
        id: number;
        login: string;
        nome: string;
        email?: string | null;
        email_verificado_em?: string | null;
      }
    | undefined;
  if (!row) throw new Error("Usuário não encontrado.");
  const email = normalizarEmail(row.email);
  if (!email) throw new Error("Este usuário não tem e-mail pessoal cadastrado.");
  if (row.email_verificado_em) {
    return { enviado: false, aviso: "E-mail já verificado." };
  }
  return dispararVerificacaoEmail({
    userId: row.id,
    email,
    nome: String(row.nome),
    login: String(row.login),
  });
}

export function statusEmailUsuario(row: {
  email?: string | null;
  email_verificado_em?: string | null;
}): { email: string; emailVerificado: boolean; emailStatus: "—" | "Pendente" | "Verificado" } {
  const email = normalizarEmail(row.email);
  if (!email) return { email: "", emailVerificado: false, emailStatus: "—" };
  if (row.email_verificado_em) {
    return { email, emailVerificado: true, emailStatus: "Verificado" };
  }
  return { email, emailVerificado: false, emailStatus: "Pendente" };
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
