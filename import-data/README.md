# Importação da planilha Google → PostgreSQL

## Passo 1 — Exportar do Google Sheets

Na planilha **Controle de Vendas - 60MINUTOS**, exporte cada aba como CSV:

| Aba na planilha | Salvar como (nesta pasta) |
|-----------------|---------------------------|
| **Vendedores** | `vendedores.csv` |
| **Itens** | `itens.csv` |
| **Estoque** | `estoque.csv` |
| **Vendas** | `vendas.csv` |
| **PRIME VENDA** | `prime-venda.csv` |
| **Log Operacoes** | `log-operacoes.csv` *(opcional)* |
| **entrega UNIK** | `entrega-unik.csv` *(opcional)* |

### Como exportar

1. Abra a aba desejada
2. **Arquivo → Transferir → Fazer download → Valores separados por vírgula (.csv)**
3. Renomeie o arquivo conforme a tabela acima
4. Copie para esta pasta: `vercel/import-data/`

> **Dica:** O Google Sheets no Brasil costuma exportar com `;` como separador — o script detecta automaticamente.

## Passo 2 — Rodar a importação

```bash
cd vercel
npm run db:migrate
npm run db:import
```

### Opções

```bash
# Limpar banco antes de importar (substitui tudo)
npm run db:import -- --clear

# Pasta customizada
npm run db:import -- --dir=C:\Downloads\export-planilha
```

## Ordem de importação

1. Vendedores  
2. Itens  
3. Estoque  
4. Vendas  
5. SKUs de vendas sem cadastro → criados automaticamente em Itens  
6. PRIME VENDA  
7. Log Operacoes  
8. entrega UNIK  

## Colunas reconhecidas (flexível)

O script aceita variações de nome de coluna. Exemplos:

**Vendas:** `data`, `id_vendedor`, `vendedor`, `unidade`, `sku`, `item`, `quantidade`, `valor_recebido`, `status`, `cancelado_por`, `categoria - dash`, `meep` / `subcategoria`

**Itens:** `sku`, `categoria dash`, `categoria meep`, `descrição`, `preço`, `ativo`, `custo`, `foto url`

**Estoque:** `sku`, `unidade`, `quantidade`, `nome`

Datas aceitas: `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss`, `yyyy-MM-dd`, número serial do Excel.

## Importar no PostgreSQL (produção)

Configure `.env.local` com `DATABASE_URL` do Postgres, depois:

```bash
npm run db:migrate
npm run db:import -- --clear
```

## Verificar

```bash
npm run dev
```

Abra http://localhost:3000 e confira vendas, estoque e relatórios.
