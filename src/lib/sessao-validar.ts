import { getClient } from "@/db";
import { ensureUsuariosTable } from "./ensure-usuarios";
import type { SessaoUsuario } from "./roles";
import { parsePaginas } from "./roles";

export async function validarSessaoNoBanco(sessao: SessaoUsuario): Promise<SessaoUsuario | null> {
  await ensureUsuariosTable();
  const rs = await getClient().execute({
    sql: "SELECT ativo, sessao_ver, paginas, vendedor_id FROM usuarios WHERE id = ? LIMIT 1",
    args: [sessao.id],
  });
  const row = rs.rows[0] as
    | { ativo: boolean | number; sessao_ver: number; paginas: string; vendedor_id?: string | null }
    | undefined;
  if (!row) return null;
  const ativo = row.ativo === true || row.ativo === 1;
  if (!ativo) return null;

  const dbVer = Number(row.sessao_ver) || 1;
  const tokenVer = sessao.sv ?? 1;
  if (tokenVer !== dbVer) return null;

  return {
    ...sessao,
    paginas: parsePaginas(row.paginas),
    vendedorId: String(row.vendedor_id || "").trim() || null,
  };
}

export async function incrementarSessaoVer(userId: number): Promise<void> {
  await getClient().execute({
    sql: "UPDATE usuarios SET sessao_ver = COALESCE(sessao_ver, 1) + 1 WHERE id = ?",
    args: [userId],
  });
}
