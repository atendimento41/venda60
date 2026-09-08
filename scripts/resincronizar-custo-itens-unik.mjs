/**
 * Corrige no banco custo/sugestão dos itens UNIK afetados pelo bug
 * (custo unitário dividido erroneamente pela quantidade).
 *
 * Uso:
 *   npx tsx scripts/resincronizar-custo-itens-unik.mjs           # aplica
 *   npx tsx scripts/resincronizar-custo-itens-unik.mjs --dry-run # só lista
 */
import { loadEnvLocal } from "../src/lib/load-env.js";
import { resincronizarCustosSugestaoItensUnik } from "../src/services/unik.ts";

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const r = await resincronizarCustosSugestaoItensUnik({ dryRun });

console.log(`Modo: ${dryRun ? "dry-run" : "APLICAR"}`);
console.log(`SKUs com lançamento/vínculo: ${r.itens}`);
console.log(`Itens a corrigir: ${r.atualizados}\n`);

for (const a of r.alterados) {
  const custoMudou = a.custoAntes !== a.custoDepois;
  const sugMudou = a.sugestaoAntes !== a.sugestaoDepois;
  console.log(`${a.sku} — ${a.descricao}`);
  if (custoMudou) {
    console.log(`  custo: R$ ${a.custoAntes.toFixed(2)} → R$ ${a.custoDepois.toFixed(2)}`);
  }
  if (sugMudou) {
    console.log(`  sugestão: R$ ${a.sugestaoAntes.toFixed(2)} → R$ ${a.sugestaoDepois.toFixed(2)}`);
  }
}

if (!dryRun && r.atualizados > 0) {
  console.log(`\n${r.atualizados} item(ns) corrigido(s) no banco.`);
} else if (!dryRun) {
  console.log("\nNenhuma correção necessária — cadastro já está alinhado aos lançamentos.");
}
