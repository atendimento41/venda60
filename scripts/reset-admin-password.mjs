/**
 * Reseta a senha do usuário admin.
 * Uso: node scripts/reset-admin-password.mjs [senha]
 * Lê DATABASE_URL ou ADMIN_DATABASE_URL do .env.local
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const env = { ...loadEnvFile(path.join(ROOT, ".env.local")), ...process.env };
  const url = env.ADMIN_DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL ou ADMIN_DATABASE_URL no .env.local");

  const senha = process.argv[2] || "123456";
  if (senha.length < 4) throw new Error("Senha deve ter pelo menos 4 caracteres.");

  const pool = new pg.Pool({ connectionString: url });
  try {
    const hash = hashSenha(senha);
    const r = await pool.query(
      `UPDATE usuarios SET senha_hash = $1 WHERE lower(login) = 'admin' RETURNING id, login, nome`,
      [hash]
    );
    if (!r.rowCount) {
      await pool.query(
        `INSERT INTO usuarios (login, nome, senha_hash, paginas, ativo)
         VALUES ('admin', 'Administrador', $1, '*', TRUE)`,
        [hash]
      );
      console.log("Usuário admin criado.");
    } else {
      console.log("Senha atualizada para:", r.rows[0].login, `(${r.rows[0].nome})`);
    }
    console.log("Login: admin");
    console.log("Senha:", senha);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
