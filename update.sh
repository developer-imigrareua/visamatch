#!/bin/bash
# update.sh — Visa Match · Atualização segura
# Uso: bash update.sh
#
# SEGURO: opera APENAS em /var/www/visamatch
# NÃO toca em: liv-ai, n8n, PM2, SSL existente

set -e

APP_DIR="/var/www/visamatch"
BRANCH="main"

echo ""
echo "🚀 Visa Match — Update"
echo "──────────────────────────────────"
echo "⚠️  Apenas /var/www/visamatch será afetado."
echo ""

cd $APP_DIR

# ── 1. Pull do código ──
echo "⬇️  Puxando código do GitHub..."
git pull origin $BRANCH
echo ""

# ── 2. Nginx ──
echo "🌐 Atualizando Nginx (apenas visamatch)..."
cp nginx/visamatch.conf /etc/nginx/sites-available/visamatch
nginx -t
systemctl reload nginx
echo "   ✅ Nginx recarregado"
echo ""

# ── 3. Container Docker ──
echo "🐳 Rebuilding container visamatch..."
docker compose up -d --build
echo ""

# ── 4. Status ──
echo "📊 Status final:"
docker ps --filter "name=visamatch" --format "   Container: {{.Names}} | Status: {{.Status}} | Porta: {{.Ports}}"
echo ""
echo "✅ Update concluído!"
echo "   Frontend: http://$(curl -s ifconfig.me 2>/dev/null || echo '69.62.95.58')"
echo "   Admin:    http://$(curl -s ifconfig.me 2>/dev/null || echo '69.62.95.58')/admin"
echo "   Logs:     docker logs -f visamatch"
echo ""
