/**
 * Atualiza senha do cv_vendas_app no Postgres.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const NOVA_SENHA = "6om1nut0$_v3nd1$";
const APP_USER = "cv_vendas_app";

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

function escSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildAppUrl(host, password) {
  return `postgresql://${APP_USER}:${encodeURIComponent(password)}@${host}/60minutos_vendas`;
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return "95.216.252.42:5432";
  }
}

function updateEnvLocal(newUrl) {
  const envPath = path.join(ROOT, ".env.local");
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  if (/^DATABASE_URL=/m.test(text)) {
    text = text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${newUrl}`);
  } else {
    text += `\nDATABASE_URL=${newUrl}\n`;
  }
  fs.writeFileSync(envPath, text, "utf8");
}

async function main() {
  const env = { ...loadEnvFile(path.join(ROOT, ".env.local")), ...process.env };
  const baseUrl = env.ADMIN_DATABASE_URL || env.DATABASE_URL;
  if (!baseUrl) throw new Error("Defina DATABASE_URL ou ADMIN_DATABASE_URL no .env.local");

  const adminUrl = env.ADMIN_DATABASE_URL
    ? env.ADMIN_DATABASE_URL
    : baseUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");

  const admin = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 20000 });
  await admin.connect();

  const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_USER]);
  if (!exists.rowCount) {
    await admin.query(
      `CREATE ROLE ${APP_USER} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 50`
    );
    console.log("Usuário criado:", APP_USER);
  }

  await admin.query(`ALTER ROLE ${APP_USER} WITH LOGIN PASSWORD ${escSqlLiteral(NOVA_SENHA)}`);
  await admin.end();

  const appUrl = buildAppUrl(hostFromUrl(baseUrl), NOVA_SENHA);
  const app = new pg.Client({ connectionString: appUrl, connectionTimeoutMillis: 20000 });
  await app.connect();
  await app.query("SELECT current_user, current_database()");
  await app.end();

  updateEnvLocal(appUrl);

  console.log("\nSenha atualizada com sucesso.");
  console.log("Login DB:", APP_USER);
  console.log("Senha:", NOVA_SENHA);
  console.log("\nDATABASE_URL (copie para a Vercel):");
  console.log(appUrl);
  console.log("\n.env.local atualizado.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
