# Deploy na Vercel — passo a passo

## 1. Configurar o projeto na Vercel

- **Root Directory:** `vercel` *(se o repositório inclui a pasta pai na raiz)*
- **Framework:** Next.js (detectado automaticamente)
- **Build Command:** `next build` *(padrão — não use db:migrate no build)*
- **Install Command:** `npm install`

## 2. Banco PostgreSQL (obrigatório em produção)

Use um PostgreSQL acessível pela Vercel (ex.: Docker no Hetzner).

Usuário recomendado: **`cv_vendas_app`** — permissão somente no banco `60minutos_vendas`.

Para criar o usuário:

```bash
cd vercel
node scripts/create-app-db-user.mjs
```

## 3. Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Valor | Ambientes |
|----------|-------|-----------|
| `DATABASE_URL` | `postgresql://cv_vendas_app:senha@host:5432/60minutos_vendas` | Production, Preview, Development |
| `SESSION_SECRET` | texto longo aleatório (login) | Production |
| `APP_TIMEZONE` | `America/Sao_Paulo` *(opcional)* | Production |
| `DATABASE_SSL` | `1` *(se o Postgres exigir SSL)* | Production |
| `HEALTH_TOKEN` | token opcional para monitoramento | Production |

> Se a senha tiver `#`, use `%23` na URL.

## 4. Criar tabelas (no seu PC, se banco vazio)

Com `DATABASE_URL` no `.env.local`:

```bash
cd vercel
npm run db:migrate
npm run db:import -- --clear
```

*(Coloque os CSVs exportados do Google Sheets em `import-data/` antes do import.)*

## 5. Deploy

```bash
cd vercel
npx vercel --prod
```

Ou push no Git conectado à Vercel.

## 6. Testar

- `https://seu-app.vercel.app/login` — faça login
- Lançar venda e relatórios

`/api/health` exige login (ou `?token=HEALTH_TOKEN` se configurado).

---

## Erros comuns

| Sintoma | Causa | Solução |
|---------|-------|---------|
| Build falha em `db:migrate` | Migração no build | Use só `next build` |
| App abre mas APIs falham | `DATABASE_URL` errada ou firewall | Confira URL, senha URL-encoded, porta 5432 aberta para Vercel |
| `DATABASE_URL não configurada na Vercel` | Env vars ausentes | Passo 3 acima |
| Root errado | Deploy da pasta raiz | Root Directory = `vercel` |
| Connection timeout | Firewall Hetzner | Libere 5432 ou use túnel/VPN |
| Região | Latência BR | `vercel.json` usa `gru1` (São Paulo) |

## Avisos do npm no build (normais)

Estes avisos **não impedem** o deploy:

- `deprecated @esbuild-kit/...`
- `allow-scripts esbuild/sharp`
