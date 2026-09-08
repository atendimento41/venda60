import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

export function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarSenha(senha: string, stored: string): boolean {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const atual = scryptSync(senha, salt, 64);
  const esperado = Buffer.from(hash, "hex");
  if (atual.length !== esperado.length) return false;
  return timingSafeEqual(atual, esperado);
}
