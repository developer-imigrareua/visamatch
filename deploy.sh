#!/bin/bash
# deploy.sh — Visa Match · VPS Hostinger
#
# SEGURO: opera apenas em /var/www/visamatch
# NÃO toca em: liv-ai, n8n, nginx existente, PM2, SSL existente
#
# Uso:
#   bash deploy.sh --setup   → primeira vez (instala nginx conf + sobe container)
#   bash deploy.sh           → atualiza (pull + rebuild + restart)

set -e

APP_DIR="/var/www/visamatch"
REPO="https://github.com/developer-imigrareua/visamatch.git"
BRANCH="main"
CONTAINER="visamatch"
NGINX_CONF="/etc/nginx/sites-available/visamatch"
NGINX_LINK="/etc/nginx/sites-enabled/visamatch"

echo ""
echo "🚀 Visa Match — Deploy"
echo "─────────────────────────────────────"

# Garante que não está mexendo em outros projetos
if [ "$(pwd)" != "$APP_DIR" ] && [ "$1" != "--setup" ]; then
  cd $APP_DIR 2>/dev/null || { echo "❌ Diretório $APP_DIR não encontrado. Rode com --setup primeiro."; exit 1; }
fi

# ── SETUP INICIAL ──────────────────────────────────────────────
if [ "$1" == "--setup" ]; then
  echo "📁 Clonando repositório em $APP_DIR..."
  if [ -d "$APP_DIR/.git" ]; then
    echo "   Repositório já existe, atualizando..."
    cd $APP_DIR && git pull origin $BRANCH
  else
    git clone $REPO $APP_DIR
    cd $APP_DIR
  fi

  echo ""
  echo "🔑 Configurando .env..."
  if [ ! -f "$APP_DIR/backend/.env" ]; then
    cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env
    echo "   ⚠️  ATENÇÃO: Preencha as chaves em $APP_DIR/backend/.env antes de continuar!"
    echo "   Comando: nano $APP_DIR/backend/.env"
    echo ""
    read -p "   Pressione ENTER após preencher o .env para continuar..."
  else
    echo "   .env já existe, mantendo."
  fi

  echo ""
  echo "🌐 Configurando Nginx (APENAS novo arquivo, sem tocar nos existentes)..."
  if [ ! -f "$NGINX_CONF" ]; then
    cp $APP_DIR/nginx/visamatch.conf $NGINX_CONF
    ln -sf $NGINX_CONF $NGINX_LINK
    echo "   ✅ Novo site adicionado: visamatch"
  else
    echo "   Config Nginx já existe, atualizando..."
    cp $APP_DIR/nginx/visamatch.conf $NGINX_CONF
  fi

  echo "   Validando Nginx (sem reiniciar serviços existentes)..."
  nginx -t
  systemctl reload nginx
  echo "   ✅ Nginx recarregado com sucesso"

  echo ""
  echo "🐳 Subindo container Docker isolado..."
  cd $APP_DIR
  docker compose up -d --build

  echo ""
  echo "🔒 SSL — Para ativar HTTPS (não afeta certificados existentes):"
  echo "   certbot --nginx -d visamatch.imigrareua.com"

  echo ""
  echo "✅ Setup concluído!"
  echo "   Frontend: https://visamatch.imigrareua.com"
  echo "   Admin:    https://visamatch.imigrareua.com/admin"
  echo "   API:      https://visamatch.imigrareua.com/api/health"
  exit 0
fi

# ── DEPLOY PADRÃO (atualizações) ───────────────────────────────
echo "⬇️  Atualizando código..."
cd $APP_DIR
git pull origin $BRANCH

echo ""
echo "🐳 Rebuild e restart do container..."
docker compose up -d --build

echo ""
echo "⏳ Aguardando container ficar saudável..."
sleep 5

echo ""
echo "📊 Status:"
docker compose ps

echo ""
echo "✅ Deploy concluído!"
echo "   Logs: docker logs -f $CONTAINER"
