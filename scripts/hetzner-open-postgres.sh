#!/bin/bash
# Execute NO SERVIDOR Hetzner (SSH em 95.216.252.42)
# Objetivo: permitir conexão remota na porta 5432 (Vercel → Postgres)
#
# Uso:
#   chmod +x hetzner-open-postgres.sh
#   sudo ./hetzner-open-postgres.sh

set -e

echo "=== 1. Firewall UFW (se existir) ==="
if command -v ufw >/dev/null 2>&1; then
  ufw allow 5432/tcp || true
  ufw status || true
else
  echo "UFW não instalado — confira o Hetzner Cloud Firewall no painel web."
fi

echo ""
echo "=== 2. Localizar Postgres ==="

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi postgres; then
  CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)
  echo "Postgres em Docker: $CONTAINER"
  echo ""
  echo ">>> Edite postgresql.conf e pg_hba.conf DENTRO do container ou no volume montado."
  echo ">>> Depois: docker restart $CONTAINER"
  echo ""
  echo "Dentro do container, pg_hba.conf precisa de:"
  echo "  host all all 0.0.0.0/0 scram-sha-256"
  echo "postgresql.conf:"
  echo "  listen_addresses = '*'"
  exit 0
fi

PG_CONF=$(find /etc/postgresql /var/lib/pgsql /etc -name postgresql.conf 2>/dev/null | head -1)
if [ -z "$PG_CONF" ]; then
  echo "ERRO: postgresql.conf não encontrado."
  echo "Se Postgres roda em Docker, use: docker ps"
  exit 1
fi

PG_DIR=$(dirname "$PG_CONF")
PG_HBA="$PG_DIR/pg_hba.conf"

echo "postgresql.conf: $PG_CONF"
echo "pg_hba.conf:     $PG_HBA"

echo ""
echo "=== 3. listen_addresses = '*' ==="
if grep -q "^listen_addresses" "$PG_CONF"; then
  sed -i "s/^#*listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
else
  echo "listen_addresses = '*'" >> "$PG_CONF"
fi

echo ""
echo "=== 4. pg_hba.conf — permitir remoto ==="
if ! grep -q "0.0.0.0/0" "$PG_HBA" 2>/dev/null; then
  cat >> "$PG_HBA" <<'EOF'

# Vercel / conexões externas
host    all    all    0.0.0.0/0    scram-sha-256
host    all    all    ::/0         scram-sha-256
EOF
  echo "Linhas adicionadas em pg_hba.conf"
else
  echo "Regra 0.0.0.0/0 já existe em pg_hba.conf"
fi

echo ""
echo "=== 5. Reiniciar Postgres ==="
if systemctl is-active postgresql >/dev/null 2>&1; then
  systemctl restart postgresql
  echo "postgresql reiniciado (systemctl)"
elif systemctl is-active postgresql@* >/dev/null 2>&1; then
  systemctl restart 'postgresql@*'
  echo "postgresql@* reiniciado"
else
  service postgresql restart || true
  echo "Tente reiniciar manualmente se falhou"
fi

echo ""
echo "=== 6. Porta 5432 escutando? ==="
ss -tlnp | grep 5432 || netstat -tlnp | grep 5432 || echo "Verifique se 5432 está aberta"

echo ""
echo "=== PRONTO ==="
echo "Teste na Vercel:"
echo "  https://vendas60.vercel.app/api/health?token=SEU_HEALTH_TOKEN"
echo ""
echo "IMPORTANTE: no painel Hetzner Cloud → Firewalls → libere TCP 5432 de Any IPv4"
