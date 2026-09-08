import { NextResponse } from "next/server";
import { db } from "@/db";
import { entregaUnik, itens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mensagemErroApi } from "@/lib/api-error";
import { parseDataUrl } from "@/lib/foto";
import { normalizeText, normalizeUpper } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sku = normalizeText(searchParams.get("sku"));
    const unikId = Number(searchParams.get("unikId") || 0);

    let foto = "";
    if (sku) {
      const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
      foto = normalizeText(item?.fotoUrl);
      if (!foto) {
        const rows = await db.select().from(entregaUnik);
        const row = rows.find((r) => normalizeUpper(r.sku) === normalizeUpper(sku));
        foto = normalizeText(row?.fotoUrl);
      }
    } else if (unikId > 0) {
      const [row] = await db.select().from(entregaUnik).where(eq(entregaUnik.id, unikId));
      foto = normalizeText(row?.fotoUrl);
      if (!foto && row?.sku) {
        const [item] = await db.select().from(itens).where(eq(itens.sku, row.sku));
        foto = normalizeText(item?.fotoUrl);
      }
    } else {
      return NextResponse.json({ error: "Informe sku ou unikId." }, { status: 400 });
    }

    if (!foto) {
      return new NextResponse(null, { status: 404 });
    }

    if (foto.startsWith("http://") || foto.startsWith("https://")) {
      return NextResponse.redirect(foto);
    }

    const parsed = parseDataUrl(foto);
    if (!parsed) {
      return NextResponse.json({ error: "Formato de foto inválido." }, { status: 400 });
    }

    return new NextResponse(parsed.buffer, {
      headers: {
        "Content-Type": parsed.mime,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}
