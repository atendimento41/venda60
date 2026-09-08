/**
 * Corrige datas de vendas (e movimentos relacionados) gravadas em UTC para horário São Paulo.
 *
 * Uso:
 *   npx tsx scripts/corrigir-fuso-vendas-hoje.mjs              # dry-run (hoje)
 *   npx tsx scripts/corrigir-fuso-vendas-hoje.mjs --apply      # aplica no banco
 *   npx tsx scripts/corrigir-fuso-vendas-hoje.mjs --data=2026-09-01 --apply
 */
import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env.js";
import {
  dataYmd,
  hojeISO,
  normalizarDataVendaISO,
  sqlMargemDiaApp,
} from "../src/lib/utils.js";

loadEnvLocal();

function argValue(name, fallback) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

const apply = process.argv.includes("--apply");
const dia = argValue("data", hojeISO());

if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
  console.error("Data inválida. Use YYYY-MM-DD.");
  process.exit(1);
}

function precisaCorrigir(valor) {
  const s = String(valor || "").trim();
  if (!s) return false;
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) return true;
  return false;
}

function corrigir(valor) {
  const antes = String(valor || "").trim();
  const depois = normalizarDataVendaISO(antes);
  return antes !== depois ? depois : null;
}

const margem = sqlMargemDiaApp(dia, dia);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
});

try {
  console.log(`Dia (fuso app): ${dia}`);
  console.log(`Modo: ${apply ? "APLICAR" : "dry-run"}`);
  console.log(`Margem SQL: ${margem.sqlInicio} .. ${margem.sqlFim}\n`);

  const vendasRes = await pool.query(
    `SELECT id, data, sku, unidade, vendedor, cancelado_em
     FROM vendas
     WHERE data >= $1 AND data <= $2
     ORDER BY id`,
    [margem.sqlInicio, margem.sqlFim]
  );

  const vendasDia = vendasRes.rows.filter((r) => dataYmd(r.data) === dia);
  const vendasCorrigir = [];

  for (const row of vendasDia) {
    const novaData = corrigir(row.data);
    const novoCancelado = row.cancelado_em ? corrigir(row.cancelado_em) : null;
    if (novaData || novoCancelado) {
      vendasCorrigir.push({
        id: row.id,
        sku: row.sku,
        unidade: row.unidade,
        vendedor: row.vendedor,
        dataAntes: row.data,
        dataDepois: novaData || row.data,
        canceladoAntes: row.cancelado_em,
        canceladoDepois: novoCancelado,
      });
    }
  }

  console.log(`Vendas no dia ${dia}: ${vendasDia.length}`);
  console.log(`Vendas a corrigir (UTC → São Paulo): ${vendasCorrigir.length}\n`);

  for (const v of vendasCorrigir) {
    console.log(
      `  #${v.id} ${v.sku} @ ${v.unidade} | ${v.dataAntes} → ${v.dataDepois}`
    );
    if (v.canceladoDepois) {
      console.log(`    cancelado_em: ${v.canceladoAntes} → ${v.canceladoDepois}`);
    }
  }

  const movRes = await pool.query(
    `SELECT id, data_hora, sku, unidade, tipo, referencia
     FROM movimentos_estoque
     WHERE data_hora >= $1 AND data_hora <= $2
     ORDER BY id`,
    [margem.sqlInicio, margem.sqlFim]
  );

  const movDia = movRes.rows.filter((r) => dataYmd(r.data_hora) === dia);
  const movCorrigir = [];

  for (const row of movDia) {
    const nova = corrigir(row.data_hora);
    if (nova) {
      movCorrigir.push({
        id: row.id,
        sku: row.sku,
        unidade: row.unidade,
        tipo: row.tipo,
        antes: row.data_hora,
        depois: nova,
      });
    }
  }

  console.log(`\nMovimentos estoque no dia ${dia}: ${movDia.length}`);
  console.log(`Movimentos a corrigir: ${movCorrigir.length}\n`);

  for (const m of movCorrigir.slice(0, 20)) {
    console.log(`  #${m.id} ${m.tipo} ${m.sku} | ${m.antes} → ${m.depois}`);
  }
  if (movCorrigir.length > 20) {
    console.log(`  ... e mais ${movCorrigir.length - 20}`);
  }

  const primeRes = await pool.query(
    `SELECT id, data, item, unidade FROM prime_vendas
     WHERE data >= $1 AND data <= $2 ORDER BY id`,
    [margem.sqlInicio, margem.sqlFim]
  );
  const primeDia = primeRes.rows.filter((r) => dataYmd(r.data) === dia);
  const primeCorrigir = primeDia
    .map((row) => {
      const nova = corrigir(row.data);
      return nova ? { id: row.id, antes: row.data, depois: nova, item: row.item } : null;
    })
    .filter(Boolean);

  console.log(`\nPrime vendas no dia ${dia}: ${primeDia.length}`);
  console.log(`Prime a corrigir: ${primeCorrigir.length}`);

  if (!apply) {
    console.log("\nDry-run concluído. Use --apply para gravar.");
    process.exit(0);
  }

  if (!vendasCorrigir.length && !movCorrigir.length && !primeCorrigir.length) {
    console.log("\nNada a corrigir.");
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const v of vendasCorrigir) {
      if (v.canceladoDepois) {
        await client.query(
          `UPDATE vendas SET data = $1, cancelado_em = $2 WHERE id = $3`,
          [v.dataDepois, v.canceladoDepois, v.id]
        );
      } else {
        await client.query(`UPDATE vendas SET data = $1 WHERE id = $2`, [v.dataDepois, v.id]);
      }
    }

    for (const m of movCorrigir) {
      await client.query(`UPDATE movimentos_estoque SET data_hora = $1 WHERE id = $2`, [
        m.depois,
        m.id,
      ]);
    }

    for (const p of primeCorrigir) {
      await client.query(`UPDATE prime_vendas SET data = $1 WHERE id = $2`, [p.depois, p.id]);
    }

    await client.query("COMMIT");
    console.log(
      `\nCorreção aplicada: ${vendasCorrigir.length} vendas, ${movCorrigir.length} movimentos, ${primeCorrigir.length} prime.`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
