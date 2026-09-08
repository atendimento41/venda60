import fs from "fs";
import path from "path";
import pg from "pg";

/** Carrega .env.local sobrescrevendo variáveis já existentes (teste). */
function loadEnvForce() {
  const envPath = path.join(process.cwd(), ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key) process.env[key] = val;
  }
}

loadEnvForce();

const url = process.env.DATABASE_URL || "";
console.log("host=", url.replace(/:[^:@]+@/, ":***@"));
console.log("ssl_flag=", process.env.DATABASE_SSL);

const c = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

try {
  await c.connect();
  const r = await c.query("select current_database() as db, current_user as u, version() as v");
  console.log("OK", r.rows[0].db, r.rows[0].u);
  console.log(String(r.rows[0].v).slice(0, 80));
  const t = await c.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public'"
  );
  console.log("tabelas_public", t.rows[0].n);
  await c.end();
} catch (e) {
  console.error("FAIL", e?.message || e);
  process.exit(1);
}
