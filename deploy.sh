#!/bin/bash
# deploy.sh — Visa Match · EasyPanel + Docker Swarm
#
# SEGURO: opera apenas em /etc/easypanel/projects/monitoring/visamatch
# NÃO toca em: outros projetos, Traefik, configurações do EasyPanel
#
# Uso:
#   bash deploy.sh           → atualiza (clone → build → service update)
#   bash deploy.sh --help    → mostra este help

set -e

REPO="https://github.com/developer-imigrareua/visamatch.git"
BRANCH="main"
CODE_DIR="/etc/easypanel/projects/monitoring/visamatch/code"
SERVICE="monitoring_visamatch"
TMP_DIR="/tmp/visamatch-deploy-$$"
TAG="easypanel/monitoring/visamatch:$(date +%s)"

echo ""
echo "🚀 Visa Match — Deploy (EasyPanel)"
echo "────────────────────────────────────────"

if [ "$1" == "--help" ]; then
  echo "Uso: bash deploy.sh"
  echo ""
  echo "  Clona o repositório, copia arquivos para $CODE_DIR,"
  echo "  constrói nova imagem Docker e atualiza o serviço Swarm."
  echo ""
  echo "  Requer:"
  echo "    - Acesso ao GitHub (token configurado ou repo público)"
  echo "    - Docker Swarm ativo com serviço '$SERVICE'"
  exit 0
fi

# ── 1. Clonar código mais recente ──────────────────────────────
echo "⬇️  Clonando código mais recente..."
rm -rf "$TMP_DIR"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$TMP_DIR"
echo "   ✅ Clone concluído"

# ── 2. Copiar arquivos para pasta do EasyPanel ─────────────────
echo ""
echo "📁 Copiando arquivos..."

mkdir -p "$CODE_DIR/backend/src"
mkdir -p "$CODE_DIR/frontend"
mkdir -p "$CODE_DIR/admin"

cp -r "$TMP_DIR/backend/"   "$CODE_DIR/"
cp -r "$TMP_DIR/frontend/"  "$CODE_DIR/"
[ -d "$TMP_DIR/admin" ] && cp -r "$TMP_DIR/admin/" "$CODE_DIR/" || true
cp    "$TMP_DIR/Dockerfile" "$CODE_DIR/"

echo "   ✅ Arquivos copiados"

# ── 3. Limpar clone temporário ─────────────────────────────────
rm -rf "$TMP_DIR"

# ── 4. Build da imagem Docker ──────────────────────────────────
echo ""
echo "🐳 Construindo imagem: $TAG"
cd "$CODE_DIR"
docker build -t "$TAG" .
echo "   ✅ Build concluído"

# ── 5. Atualizar serviço Docker Swarm ─────────────────────────
echo ""
echo "🔄 Atualizando serviço $SERVICE..."
docker service update \
  --image "$TAG" \
  --force \
  "$SERVICE"
echo "   ✅ Serviço atualizado"

# ── 6. Verificar status ────────────────────────────────────────
echo ""
echo "⏳ Aguardando container estabilizar..."
sleep 6

echo ""
echo "📊 Status do serviço:"
docker service ps "$SERVICE" --no-trunc \
  --format "{{.Name}} | {{.CurrentState}} | {{.Image}}" | head -5

echo ""
echo "🌐 Verificando resposta HTTP..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://visamatch.imigrareua.com/ 2>/dev/null || echo "erro")
if [ "$HTTP_CODE" == "200" ]; then
  echo "   ✅ Site respondendo: HTTP $HTTP_CODE"
else
  echo "   ⚠️  HTTP $HTTP_CODE — verifique: docker service logs $SERVICE --tail 50"
fi

echo ""
echo "✅ Deploy concluído!"
echo "   Tag: $TAG"
echo "   URL: https://visamatch.imigrareua.com"
echo "   Logs: docker service logs $SERVICE --tail 50 -f"
echo ""
