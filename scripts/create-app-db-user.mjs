/**
 * Cria usuário PostgreSQL dedicado à app (somente banco 60minutos_vendas).
 *
 * Requer conexão admin (superuser), ex.:
 *   ADMIN_DATABASE_URL=postgresql://postgres:SENHA@95.216.252.42:5432/postgres
 *
 * Uso:
 *   node scripts/create-app-db-user.mjs
 *   node scripts/create-app-db-user.mjs --disable-old-user
 *
 * Gera senha aleatória e imprime a nova DATABASE_URL.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const APP_USER = "cv_vendas_app";
const DB_NAME = "60minutos_vendas";

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

function adminUrlFromEnv(env) {
  if (env.ADMIN_DATABASE_URL) return env.ADMIN_DATABASE_URL;
  const base = env.DATABASE_URL || "";
  if (!base) {
    throw new Error(
      "Defina ADMIN_DATABASE_URL (postgres superuser) ou DATABASE_URL no .env.local"
    );
  }
  return base.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
}

function dbUrl(adminUrl, dbName) {
  const u = new URL(adminUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return "HOST:5432";
  }
}

function buildAppUrl(host, password) {
  return `postgresql://${APP_USER}:${encodeURIComponent(password)}@${host}/${DB_NAME}`;
}

function updateEnvLocal(newUrl) {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return false;
  let text = fs.readFileSync(envPath, "utf8");
  if (/^DATABASE_URL=/m.test(text)) {
    text = text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${newUrl}`);
  } else {
    text += `\nDATABASE_URL=${newUrl}\n`;
  }
  fs.writeFileSync(envPath, text, "utf8");
  return true;
}

function escSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function setRolePassword(client, role, password) {
  await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${escSqlLiteral(password)}`);
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(ROOT, ".env.local")),
    ...process.env,
  };
  const disableOld = process.argv.includes("--disable-old-user");
  const password =
    env.APP_DB_PASSWORD?.trim() || crypto.randomBytes(24).toString("base64url");

  const adminUrl = adminUrlFromEnv(env);
  const admin = new pg.Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 20_000,
  });

  await admin.connect();
  console.log(`Conectado como admin em ${hostFromUrl(adminUrl)}`);

  const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_USER]);
  if (exists.rowCount) {
    await setRolePassword(admin, APP_USER, password);
    console.log(`Usuário ${APP_USER} já existia — senha atualizada.`);
  } else {
    await admin.query(
      `CREATE ROLE ${APP_USER} WITH LOGIN
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 20`
    );
    await setRolePassword(admin, APP_USER, password);
    console.log(`Usuário ${APP_USER} criado.`);
  }

  await admin.query(`REVOKE ALL ON DATABASE postgres FROM ${APP_USER}`);
  await admin.query(`REVOKE CONNECT ON DATABASE postgres FROM ${APP_USER}`);

  const dbExists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (!dbExists.rowCount) {
    throw new Error(`Banco ${DB_NAME} não encontrado.`);
  }

  await admin.query(`ALTER DATABASE "${DB_NAME}" OWNER TO ${APP_USER}`);
  console.log(`Owner do banco ${DB_NAME}: ${APP_USER}`);

  const dbAdmin = new pg.Client({ connectionString: dbUrl(adminUrl, DB_NAME) });
  await dbAdmin.connect();

  const tables = await dbAdmin.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  for (const row of tables.rows) {
    await dbAdmin.query(`ALTER TABLE public."${row.tablename}" OWNER TO ${APP_USER}`);
  }

  const seqs = await dbAdmin.query(
    `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`
  );
  for (const row of seqs.rows) {
    await dbAdmin.query(`ALTER SEQUENCE public."${row.sequence_name}" OWNER TO ${APP_USER}`);
  }

  await dbAdmin.query(`GRANT ALL ON SCHEMA public TO ${APP_USER}`);
  await dbAdmin.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${APP_USER} IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER}`
  );
  await dbAdmin.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${APP_USER} IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO ${APP_USER}`
  );
  await dbAdmin.end();

  const appUrl = buildAppUrl(hostFromUrl(adminUrl), password);
  const app = new pg.Client({ connectionString: appUrl });
  await app.connect();
  await app.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'");
  await app.end();

  if (disableOld) {
    const oldUser = env.OLD_DB_USER || "60minutos";
    try {
      await admin.query(`ALTER ROLE "${oldUser}" WITH NOLOGIN`);
      console.log(`Login desativado: ${oldUser}`);
    } catch (e) {
      console.warn(`Não foi possível desativar ${oldUser}:`, e.message);
    }
  }

  await admin.end();

  const updated = updateEnvLocal(appUrl);

  console.log("\n--- Pronto ---");
  console.log("Usuário:", APP_USER);
  console.log("Banco:", DB_NAME);
  console.log("Senha:", password);
  console.log("\nDATABASE_URL (copie para a Vercel → Production):");
  console.log(appUrl);
  if (updated) console.log("\n.env.local atualizado.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
