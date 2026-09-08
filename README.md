# Controle de Vendas — 60 Minutos (Vercel)

Migração completa do sistema Google Apps Script + Planilha para **Next.js 15 + PostgreSQL**.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 15 (App Router) + React 19 |
| Backend | API Routes (`/api/*`) |
| Banco | **PostgreSQL** (`pg` + Drizzle ORM) |
| Deploy | Vercel |

## Módulos migrados

- Lançamento de vendas (com estoque)
- Lançamento PRIME
- Relatório index (diário + comissões mensais)
- Relatório detalhado
- Relatório PRIME
- Relatório diário
- Consulta de estoque
- Admin de estoque
- Cadastro de itens
- Cancelamento de vendas
- Saídas mensais (início / saídas / final)
- Log de operações (30 dias)
- Histórico de movimentos de estoque

## Desenvolvimento local

```bash
cd vercel
npm install
cp .env.example .env.local
# Edite DATABASE_URL com PostgreSQL
npm run dev
```

Acesse: http://localhost:3000

## Deploy na Vercel

**Guia completo:** [`DEPLOY.md`](./DEPLOY.md)

Resumo:

1. **Root Directory** na Vercel = `vercel` *(se o repositório inclui esta pasta na raiz)*
2. Configure `DATABASE_URL` (PostgreSQL) e `SESSION_SECRET`
3. Deploy — o build usa apenas `next build`
4. Teste login e lançamento de venda

### Variáveis de ambiente

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | `postgresql://cv_vendas_app:senha@host:5432/60minutos_vendas` |
| `SESSION_SECRET` | texto longo aleatório |
| `APP_TIMEZONE` | `America/Sao_Paulo` *(opcional)* |

### Importar dados da planilha

Exporte cada aba do Google Sheets como CSV e coloque em `import-data/`:

| Aba | Arquivo |
|-----|---------|
| Vendedores | `vendedores.csv` |
| Itens | `itens.csv` |
| Estoque | `estoque.csv` |
| Vendas | `vendas.csv` |
| PRIME VENDA | `prime-venda.csv` |

Depois rode (com `DATABASE_URL` apontando para o Postgres):

```bash
npm run db:migrate
npm run db:import -- --clear
```

Guia completo: **`import-data/README.md`**

## Melhorias em relação ao Apps Script

- **Movimentos de estoque** registrados em `movimentos_estoque` (auditoria completa)
- **Snapshots mensais** possíveis via `estoque_snapshots`
- **Cancelamentos** com data (`cancelado_em`)
- Sem limite de 6 min do Apps Script
- UI moderna e responsiva
- API REST documentada em `/api/*`

## Estrutura

```
vercel/
├── src/
│   ├── app/           # Páginas Next.js
│   ├── app/api/       # API REST
│   ├── components/    # UI compartilhada
│   ├── db/            # Schema + migração
│   ├── lib/           # Utilitários
│   └── services/      # Regras de negócio
└── public/            # Assets estáticos (logo)
```

## Fotos de itens

As fotos são gravadas no banco (campo `fotoUrl`), redimensionadas no cadastro — não dependem de pasta no servidor.

## Versão

`2026.08.22-vercel-v1`
