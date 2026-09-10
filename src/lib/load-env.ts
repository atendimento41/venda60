import fs from "fs";
import path from "path";

function carregarArquivoEnv(fileName: string) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] == null) process.env[key] = val;
  }
}

/** Carrega .env.local e .env para scripts (tsx não carrega sozinho). */
export function loadEnvLocal() {
  carregarArquivoEnv(".env.local");
  carregarArquivoEnv(".env");
}
