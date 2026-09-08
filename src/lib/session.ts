import type { SessaoUsuario } from "./roles";

const COOKIE = "cv_session";
const MAX_AGE = 60 * 60 * 24 * 7;
const DEFAULT_SECRET = "troque-SESSION_SECRET-em-producao-60min";

function secret(): string {
  const s = process.env.SESSION_SECRET || DEFAULT_SECRET;
  if (process.env.VERCEL && s === DEFAULT_SECRET) {
    console.warn("[segurança] SESSION_SECRET padrão em produção — configure um valor forte na Vercel.");
  }
  return s;
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bin: string;
  if (typeof data === "string") {
    bin = btoa(unescape(encodeURIComponent(data)));
  } else {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    bin = btoa(s);
  }
  return bin.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string): string {
  const pad = s + "===".slice((s.length + 3) % 4);
  const b64 = pad.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return b64url(sig);
}

export async function criarTokenSessao(user: Omit<SessaoUsuario, "exp">): Promise<string> {
  const payload: SessaoUsuario = {
    ...user,
    exp: Date.now() + MAX_AGE * 1000,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function lerTokenSessao(token: string | undefined | null): Promise<SessaoUsuario | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const esperado = await hmac(body);
  if (esperado.length !== sig.length) return null;
  let ok = 0;
  for (let i = 0; i < esperado.length; i++) ok |= esperado.charCodeAt(i) ^ sig.charCodeAt(i);
  if (ok !== 0) return null;
  try {
    const data = JSON.parse(fromB64url(body)) as SessaoUsuario;
    if (!data?.login || data.paginas == null || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function cookieSessao(token: string): string {
  const secure = process.env.VERCEL ? " Secure;" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE};${secure}`;
}

export function cookieLogout(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function nomeCookieSessao(): string {
  return COOKIE;
}
