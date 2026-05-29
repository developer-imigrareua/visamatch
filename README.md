# Visa Match — ImigrarEUA

Triagem inteligente de pré-elegibilidade para vistos americanos.

## Estrutura

```
visamatch/
├── frontend/
│   └── index.html          # SPA completo do chat
└── backend/
    ├── src/
    │   ├── index.js         # Entry point Express
    │   └── routes/
    │       ├── transcribe.js  # POST /transcribe — Whisper STT
    │       ├── lead.js        # POST /lead — Supabase + HubSpot
    │       └── session.js     # POST/GET /session — retomada de sessão
    ├── supabase_schema.sql  # Criar tabelas no Supabase
    ├── .env.example         # Variáveis de ambiente necessárias
    └── package.json
```

## Setup local

```bash
cd backend
cp .env.example .env
# Preencher as chaves no .env
npm install
npm run dev
```

## Setup no Supabase

1. Acessar o SQL Editor no dashboard do Supabase
2. Executar o conteúdo de `backend/supabase_schema.sql`

## Variáveis de ambiente necessárias

| Variável | Descrição |
|---|---|
| `OPENAI_API_KEY` | Chave da OpenAI (Whisper STT) |
| `HUBSPOT_TOKEN` | Token privado do HubSpot |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Service key do Supabase (não a anon key) |
| `PORT` | Porta do servidor (padrão: 3000) |
| `FRONTEND_URL` | URL do frontend para CORS |

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Status da API |
| POST | `/transcribe` | Transcreve áudio via Whisper |
| POST | `/lead` | Salva lead no Supabase + HubSpot |
| POST | `/session` | Cria ou atualiza sessão |
| GET | `/session/:id` | Recupera sessão salva |

## Deploy (VPS Hostinger)

```bash
# No servidor
git clone https://github.com/developer-imigrareua/visamatch.git
cd visamatch/backend
npm install --production
# Configurar .env com as chaves reais
npm start
```

Recomendado usar PM2 para manter o processo rodando:
```bash
npm install -g pm2
pm2 start src/index.js --name visamatch-api
pm2 save
```
