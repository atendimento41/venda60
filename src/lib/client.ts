export const UNIDADES = ["PKS", "SSU", "PIER 21", "TGS"];

export type VendedorClient = {
  id: string;
  nome: string;
  ativo: boolean;
  unidades: string[];
};

/** Empty/missing unidades = todas (legado). */
export function unidadesDoVendedor(unidades: string[] | undefined | null): string[] {
  if (!unidades || unidades.length === 0) return [...UNIDADES];
  return UNIDADES.filter((u) => unidades.includes(u));
}

/** Interseção: vendedor ∩ usuário (lista vazia em qualquer um = todas). */
export function intersecaoUnidades(
  unidadesVendedor: string[] | undefined | null,
  unidadesUsuario: string[] | undefined | null
): string[] {
  const v = unidadesDoVendedor(unidadesVendedor);
  const u = unidadesDoVendedor(unidadesUsuario);
  return v.filter((x) => u.includes(x));
}

export { formatMoeda, formatMoedaOuNull } from "./format";

export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export function mesAtualISO(): string {
  return hojeISO().slice(0, 7);
}

export const UNIK_MES_INICIO_DADOS = "2026-02";

export function mesOffsetISO(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDataHora(value: unknown): string {
  const s = String(value || "").trim();
  if (!s) return "—";
  if (s.includes("T") || (s.length > 10 && s.includes(":"))) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(d);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, day] = s.slice(0, 10).split("-");
    return `${day}/${m}/${y}`;
  }
  return s;
}

export function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function comprimirFoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("A foto deve ter no máximo 8 MB."));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 480;
      let w = img.width;
      let h = img.height;
      if (w > h && w > max) {
        h = Math.round((h * max) / w);
        w = max;
      } else if (h > max) {
        w = Math.round((w * max) / h);
        h = max;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

export function isApiError(v: unknown): v is { error: string } {
  return Boolean(v && typeof v === "object" && "error" in v && !Array.isArray(v));
}

export async function apiGet<T>(url: string): Promise<{
  data: T | null;
  error: string | null;
}> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || isApiError(json)) {
      return {
        data: null,
        error: isApiError(json) ? json.error : `Erro ${res.status}`,
      };
    }
    return { data: json as T, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Falha de rede",
    };
  }
}

export async function apiPost<T>(url: string, body: unknown): Promise<{
  data: T | null;
  error: string | null;
}> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || isApiError(json)) {
      return {
        data: null,
        error: isApiError(json) ? json.error : `Erro ${res.status}`,
      };
    }
    return { data: json as T, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Falha de rede",
    };
  }
}
