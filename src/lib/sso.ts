/**
 * SSO entre Hub e módulos (mesmo SSO_SECRET nos 4 deploys).
 * Token curto: payload.b64url + HMAC-SHA256.
 */
export type SsoPayload = {
  sub: number;
  login: string;
  nome: string;
  paginas: string[] | "*";
  unidades: string[];
  modulo: "venda60" | "omie_lancamento" | "financeiro-60";
  exp: number;
};

const DEFAULT_SSO = "troque-SSO_SECRET-em-producao-60min";
const TTL_MS = 60_000;

function secret(): string {
  const s = process.env.SSO_SECRET || DEFAULT_SSO;
  if (process.env.VERCEL && s === DEFAULT_SSO) {
    console.warn("[sso] SSO_SECRET padrão em produção.");
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

export async function emitirSsoToken(
  user: Omit<SsoPayload, "exp" | "modulo">,
  modulo: SsoPayload["modulo"]
): Promise<string> {
  const payload: SsoPayload = {
    ...user,
    modulo,
    exp: Date.now() + TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function lerSsoToken(token: string | null | undefined): Promise<SsoPayload | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const esperado = await hmac(body);
  if (esperado.length !== sig.length) return null;
  let ok = 0;
  for (let i = 0; i < esperado.length; i++) ok |= esperado.charCodeAt(i) ^ sig.charCodeAt(i);
  if (ok !== 0) return null;
  try {
    const data = JSON.parse(fromB64url(body)) as SsoPayload;
    if (!data?.login || data.paginas == null || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function ssoConfigurado(): boolean {
  return Boolean(process.env.SSO_SECRET && process.env.SSO_SECRET !== DEFAULT_SSO);
}
