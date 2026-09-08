-- =============================================================================
-- Usuário da app Controle de Vendas — banco 60minutos_vendas
-- Execute no DBeaver (ou psql) conectado como postgres (superuser).
--
-- ANTES DE EXECUTAR: troque SENHA_FORTE_AQUI pela senha desejada.
-- Se a senha tiver @ # etc., use URL-encode na DATABASE_URL (@ → %40).
--
-- DATABASE_URL:
-- postgresql://cv_vendas_app:6om1nut0%24_v3nd1%24@95.216.252.42:5432/60minutos_vendas
-- (senha literal: 6om1nut0$_v3nd1$ — o $ vira %24 na URL)
-- =============================================================================

-- ========== PASSO 1 — banco "postgres" (conexão inicial) ==========

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cv_vendas_app') THEN
    CREATE ROLE cv_vendas_app WITH
      LOGIN
      PASSWORD '6om1nut0$_v3nd1$'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      CONNECTION LIMIT 50;
  ELSE
    ALTER ROLE cv_vendas_app WITH
      LOGIN
      PASSWORD '6om1nut0$_v3nd1$'
      CONNECTION LIMIT 50;
  END IF;
END $$;

-- Não acessa o banco postgres (só o da app)
REVOKE ALL ON DATABASE postgres FROM cv_vendas_app;
REVOKE CONNECT ON DATABASE postgres FROM cv_vendas_app;

-- Dono do banco da aplicação
ALTER DATABASE "60minutos_vendas" OWNER TO cv_vendas_app;

-- Pode conectar no banco da app
GRANT CONNECT, TEMPORARY ON DATABASE "60minutos_vendas" TO cv_vendas_app;


-- ========== PASSO 2 — conecte no banco "60minutos_vendas" e execute ==========

-- Schema public
GRANT ALL ON SCHEMA public TO cv_vendas_app;
ALTER SCHEMA public OWNER TO cv_vendas_app;

-- Dono + permissões em TODAS as tabelas existentes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO cv_vendas_app', r.tablename);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO cv_vendas_app', r.tablename);
  END LOOP;
END $$;

-- Dono + permissões em TODAS as sequences (IDs auto-incremento)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO cv_vendas_app', r.sequence_name);
    EXECUTE format('GRANT ALL PRIVILEGES ON SEQUENCE public.%I TO cv_vendas_app', r.sequence_name);
  END LOOP;
END $$;

-- Objetos criados no futuro (migrate / ensure-schema)
ALTER DEFAULT PRIVILEGES FOR ROLE cv_vendas_app IN SCHEMA public
  GRANT ALL ON TABLES TO cv_vendas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cv_vendas_app IN SCHEMA public
  GRANT ALL ON SEQUENCES TO cv_vendas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cv_vendas_app IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO cv_vendas_app;

-- Também para objetos criados pelo postgres (superuser) no schema public
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO cv_vendas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO cv_vendas_app;


-- ========== PASSO 3 — conferir (opcional) ==========

-- SELECT tablename, tableowner
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;

-- SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'cv_vendas_app';

-- Teste como app user:
-- SET ROLE cv_vendas_app;
-- SELECT COUNT(*) FROM vendas;
-- SELECT COUNT(*) FROM usuarios;
-- RESET ROLE;


-- =============================================================================
-- Tabelas desta aplicação (referência):
--   usuarios, vendedores, itens, estoque, vendas, prime_vendas,
--   log_operacoes, entrega_unik, unik_vinculos, unik_loja_status,
--   movimentos_estoque, estoque_snapshots
-- =============================================================================
