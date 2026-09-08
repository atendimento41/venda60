/** Política mínima: 8+ chars, 1 maiúscula, 1 número, 1 especial. */
export const REGRAS_SENHA_TEXTO =
  "Mínimo 8 caracteres, com 1 letra maiúscula, 1 número e 1 caractere especial.";

export function validarSenhaSegura(senha: string): string | null {
  const s = String(senha || "");
  if (s.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(s)) return "A senha deve ter pelo menos 1 letra maiúscula.";
  if (!/[0-9]/.test(s)) return "A senha deve ter pelo menos 1 número.";
  if (!/[^A-Za-z0-9]/.test(s)) return "A senha deve ter pelo menos 1 caractere especial.";
  return null;
}
