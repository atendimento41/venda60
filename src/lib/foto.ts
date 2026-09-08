import { normalizeText } from "./utils";

/** Valida tamanho de base64 antes de gravar no banco. */
export function validarFotoUrl(fotoUrl: string): string {
  const foto = normalizeText(fotoUrl);
  if (foto.startsWith("data:") && foto.length > 700_000) {
    throw new Error("Foto muito grande. Use uma imagem menor.");
  }
  return foto;
}

/** URL para exibir foto sem enviar base64 em listagens JSON. */
export function urlFotoApi(params: { sku?: string; unikId?: number }): string {
  if (params.sku) return `/api/foto?sku=${encodeURIComponent(params.sku)}`;
  if (params.unikId) return `/api/foto?unikId=${params.unikId}`;
  return "";
}

/**
 * Listagens: http(s) passa direto; base64 vira rota /api/foto.
 * Fotos ficam no banco (TEXT) — o usuário não faz upload por URL externa.
 */
export function fotoUrlParaListagem(
  url: string | null | undefined,
  ref?: { sku?: string; unikId?: number }
): string {
  const u = String(url || "").trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("data:") || u.length > 0) {
    return urlFotoApi(ref || {});
  }
  if (ref?.sku || ref?.unikId) return urlFotoApi(ref);
  return "";
}

export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}
