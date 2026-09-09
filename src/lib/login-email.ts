import { normalizarEmail, validarEmail } from "./email-verificacao";

/** Login interno: só a-z 0-9 . _ - */
export function normalizarLogin(v: string): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * Se a pessoa colar e-mail no campo login, vira:
 * login = parte antes do @ (sanitizada) + email pessoal preenchido.
 */
export function resolverLoginEEmail(opts: {
  login: string;
  email?: string | null;
}): { login: string; email: string } {
  let login = normalizarLogin(opts.login);
  let email = opts.email != null ? normalizarEmail(opts.email) : "";

  if (login.includes("@")) {
    if (!email) email = normalizarEmail(login);
    const local = login.split("@")[0] || "";
    login = local.replace(/[^a-z0-9._-]/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  }

  if (!login) {
    throw new Error("Usuário obrigatório. Ex.: felipe.travassos (o e-mail vai no campo E-mail pessoal).");
  }
  if (!/^[a-z0-9._-]+$/.test(login)) {
    throw new Error(
      "Usuário (login) só pode ter letras, números, ponto, _ ou -. Coloque o e-mail no campo E-mail pessoal."
    );
  }
  if (email && !validarEmail(email)) {
    throw new Error("E-mail pessoal inválido.");
  }
  return { login, email };
}
