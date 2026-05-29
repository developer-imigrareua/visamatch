#!/bin/bash
# deploy.sh — Script de deploy para VPS Hostinger
# Uso: bash deploy.sh
# Rodar na primeira vez: bash deploy.sh --setup

set -e

APP_DIR="/var/www/visamatch"
REPO="https://github.com/developer-imigrareua/visamatch.git"
BRANCH="main"
SERVICE="visamatch-api"

echo "🚀 Visa Match — Deploy iniciado"

# ── SETUP INICIAL (apenas na primeira vez) ──
if [ "$1" == "--setup" ]; then
  echo "📦 Instalando dependências do sistema..."
  apt-get update -qq
  apt-get install -y nginx nodejs npm git certbot python3-certbot-nginx

  echo "📦 Instalando PM2..."
  npm install -g pm2

  echo "📁 Criando diretório do app..."
  mkdir -p $APP_DIR
  git clone $REPO $APP_DIR
  cd $APP_DIR/backend
  npm install --production

  echo "⚙️  Configurando Nginx..."
  cp $APP_DIR/nginx/visamatch.conf /etc/nginx/sites-available/visamatch
  ln -sf /etc/nginx/sites-available/visamatch /etc/nginx/sites-enabled/visamatch
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  echo "🔑 Criando arquivo .env..."
  echo "Copie o conteúdo de .env.example para $APP_DIR/backend/.env e preencha as chaves."
  cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env
  echo ""
  echo "⚠️  ATENÇÃO: Edite $APP_DIR/backend/.env com as chaves reais antes de continuar!"
  echo "  nano $APP_DIR/backend/.env"
  echo ""

  echo "▶️  Iniciando API com PM2..."
  cd $APP_DIR/backend
  pm2 start src/index.js --name $SERVICE
  pm2 save
  pm2 startup

  echo "✅ Setup concluído!"
  exit 0
fi

# ── DEPLOY PADRÃO (atualizações) ──
echo "⬇️  Atualizando código..."
cd $APP_DIR
git pull origin $BRANCH

echo "📦 Instalando dependências..."
cd $APP_DIR/backend
npm install --production

echo "♻️  Reiniciando API..."
pm2 restart $SERVICE

echo "🔄 Recarregando Nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "✅ Deploy concluído com sucesso!"
pm2 status $SERVICE
