import { createHash, randomBytes } from "crypto";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";

export function googleOAuthConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export function appBaseUrl(req?: Request): string {
  const env = String(process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (env) return env;
  if (req) {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  }
  return "";
}

export function googleRedirectUri(req?: Request): string {
  return `${appBaseUrl(req)}/api/auth/google/callback`;
}

export function gerarOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function urlAutorizacaoGoogle(opts: { state: string; req?: Request }): string {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(opts.req),
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    prompt: "select_account",
    access_type: "online",
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export type GoogleProfile = {
  email: string;
  emailVerified: boolean;
  nome: string;
  sub: string;
};

export async function trocarCodePorPerfilGoogle(
  code: string,
  req?: Request
): Promise<GoogleProfile> {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = googleRedirectUri(req);

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error_description || tokenJson.error || "Falha ao obter token do Google."
    );
  }

  const infoRes = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    sub?: string;
  };
  if (!infoRes.ok || !info.email) {
    throw new Error("Google não retornou e-mail da conta.");
  }

  const email = String(info.email).trim().toLowerCase();
  const emailVerified =
    info.email_verified === true || info.email_verified === "true";

  return {
    email,
    emailVerified,
    nome: String(info.name || "").trim() || email,
    sub: String(info.sub || ""),
  };
}

export function cookieOAuthState(state: string, nextPath: string): string {
  const secure = process.env.VERCEL ? " Secure;" : "";
  const payload = encodeURIComponent(JSON.stringify({ s: state, n: nextPath || "/" }));
  return `oauth_google=${payload}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600;${secure}`;
}

export function cookieOAuthStateClear(): string {
  return "oauth_google=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function lerCookieOAuthState(
  cookieHeader: string | null
): { state: string; next: string } | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)oauth_google=([^;]+)/);
  if (!m) return null;
  try {
    const data = JSON.parse(decodeURIComponent(m[1])) as { s?: string; n?: string };
    if (!data?.s) return null;
    return { state: String(data.s), next: String(data.n || "/") };
  } catch {
    return null;
  }
}
