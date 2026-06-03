#!/bin/bash
# update.sh — Visa Match · Atualização segura
# SEGURO: opera APENAS em /var/www/visamatch
# NÃO toca em: liv-ai, n8n, PM2, SSL existente do Certbot

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

# ── 2. Nginx — atualiza APENAS as rotas, preserva SSL do Certbot ──
echo "🌐 Atualizando rotas Nginx (preservando SSL do Certbot)..."
python3 -c "
import re, sys
try:
    with open('/etc/nginx/sites-enabled/visamatch', 'r') as f:
        c = f.read()
    # Garante que auth e user estão nas rotas
    old = 'transcribe|lead|session|health|analyze'
    new = 'transcribe|lead|session|health|analyze|auth|user'
    if new not in c:
        c = c.replace(old, new)
        with open('/etc/nginx/sites-enabled/visamatch', 'w') as f:
            f.write(c)
        print('   Rotas atualizadas: auth|user adicionados')
    else:
        print('   Rotas ja estao corretas')
except Exception as e:
    print('   Aviso:', e)
"
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
echo "   Frontend: https://visamatch.imigrareua.com"
echo "   Admin:    https://visamatch.imigrareua.com/admin"
echo "   Logs:     docker logs -f visamatch"
echo ""
