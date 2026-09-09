import { NextResponse } from "next/server";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import { confirmarEmailPorToken } from "@/lib/email-verificacao";

export async function GET(req: Request) {
  await ensureUsuariosTable();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const result = await confirmarEmailPorToken(token);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
