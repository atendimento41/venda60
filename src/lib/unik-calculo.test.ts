import { describe, expect, it } from "vitest";
import {
  calcularLinhaRelatorioUnik,
  custo60DaVenda,
  custo60Unitario,
  custoUnikRelatorioVendas,
  custoUnitarioLancamento,
  maxCustoSugestaoDeLancamentos,
  resolverCustoUnikUnitario,
  roundMoney,
  unitCustoLancamento,
  valorFinalEncomenda,
} from "./unik-calculo";

describe("custo60Unitario", () => {
  it("12% do valor unitário", () => {
    expect(custo60Unitario(29.9)).toBe(3.59);
  });
});

describe("custo60DaVenda", () => {
  it("12% do total (unit × qtd)", () => {
    expect(custo60DaVenda(29.9, 1)).toBe(3.59);
    expect(custo60DaVenda(29.9, 2)).toBe(7.18);
  });
});

describe("custoUnikRelatorioVendas", () => {
  it("usa só cadastro do item", () => {
    expect(custoUnikRelatorioVendas(14)).toBe(14);
    expect(custoUnikRelatorioVendas(0)).toBeNull();
  });
});

describe("resolverCustoUnikUnitario", () => {
  it("prioriza lançamento", () => {
    expect(resolverCustoUnikUnitario(14, 99)).toBe(14);
  });
  it("usa cadastro se lançamento vazio", () => {
    expect(resolverCustoUnikUnitario(0, 14)).toBe(14);
    expect(resolverCustoUnikUnitario(null, 14)).toBe(14);
  });
  it("null se ambos vazios", () => {
    expect(resolverCustoUnikUnitario(0, 0)).toBeNull();
  });
});

describe("calcularLinhaRelatorioUnik", () => {
  it("exemplo A403 qtd 1", () => {
    const r = calcularLinhaRelatorioUnik({
      quantidade: 1,
      valorVenda: 29.9,
      custoUnik: 14,
    });
    expect(r.totalVendido).toBe(29.9);
    expect(r.custo60).toBe(3.59);
    expect(r.resultado).toBe(12.31);
    expect(r.receberUnik).toBe(20.16);
    expect(r.receber60).toBe(9.75);
  });

  it("multiplica pela quantidade no final", () => {
    const r = calcularLinhaRelatorioUnik({
      quantidade: 2,
      valorVenda: 29.9,
      custoUnik: 14,
    });
    expect(r.totalVendido).toBe(59.8);
    expect(r.custo60).toBe(7.18);
    expect(r.receberUnik).toBe(40.32);
    expect(r.receber60).toBe(19.5);
  });

  it("receber60 = metade do resultado + custo 60 unit × qtd", () => {
    const r = calcularLinhaRelatorioUnik({
      quantidade: 2,
      valorVenda: 29.9,
      custoUnik: 14,
    });
    const resultadoUnit = roundMoney(29.9 - custo60Unitario(29.9) - 14);
    const receber60Unit = roundMoney(resultadoUnit / 2 + custo60Unitario(29.9));
    expect(r.receber60).toBe(roundMoney(receber60Unit * 2));
  });
});

describe("unitCustoLancamento", () => {
  it("divide custo total pela qtd do lançamento", () => {
    expect(unitCustoLancamento(100, 5)).toBe(20);
    expect(unitCustoLancamento(14, 1)).toBe(14);
  });
});

describe("valorFinalEncomenda", () => {
  it("usa o maior entre custo e sugestão e multiplica pela quantidade", () => {
    expect(valorFinalEncomenda(0, 18, 8)).toBe(144);
    expect(valorFinalEncomenda(75, 18, 2)).toBe(150);
    expect(valorFinalEncomenda(10, 10, 3)).toBe(30);
  });
});

describe("custoUnitarioLancamento", () => {
  it("entrega: custo já é unitário (não divide pela qtd)", () => {
    expect(custoUnitarioLancamento(15, 11, false)).toBe(15);
  });
  it("encomenda: custo é total do lançamento", () => {
    expect(custoUnitarioLancamento(100, 5, true)).toBe(20);
  });
});

describe("maxCustoSugestaoDeLancamentos", () => {
  it("mantém o maior custo e sugestão entre nomes do mesmo SKU", () => {
    const skuMap = { "DK CLICK": "A123" };
    const r = maxCustoSugestaoDeLancamentos(
      "A123",
      [
        { nome: "DK CLICK", custo: 15, quantidade: 11, sugestaoVenda: 29.9 },
        { nome: "COGUMELO CLICK", custo: 14, quantidade: 1, sugestaoVenda: 25 },
      ],
      skuMap
    );
    expect(r.custo).toBe(15);
    expect(r.sugestaoVenda).toBe(29.9);
  });
});
