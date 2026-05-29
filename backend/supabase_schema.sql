-- ══════════════════════════════════════════════
-- Visa Match — Schema Supabase
-- Rodar no SQL Editor: supabase.com/dashboard/project/ghfwdkmvpfhuawucbulo/sql/new
-- ══════════════════════════════════════════════

-- ── LEADS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  -- Contato
  nome                TEXT,
  email               TEXT NOT NULL,
  phone               TEXT,

  -- Resultado
  visto_recomendado   TEXT,
  score               INTEGER,
  aprovacao_pct       INTEGER,
  classificacao       TEXT,    -- Alta / Moderada / Em Desenvolvimento / Incompatível

  -- Status do lead
  completo            BOOLEAN DEFAULT false,   -- true = completou o fluxo
  etapa_abandono      TEXT,    -- onde parou: contato / abandono_fundos / nurturing_contato / etc.

  -- Dados completos
  profile             JSONB,   -- todas as respostas do fluxo + análise IA

  -- HubSpot
  hubspot_synced      BOOLEAN DEFAULT false,
  hubspot_contact_id  TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_leads_email       ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_completo    ON leads(completo);
CREATE INDEX IF NOT EXISTS idx_leads_created_at  ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_visto       ON leads(visto_recomendado);

-- ── SESSIONS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  email       TEXT,    -- para identificar o usuário
  state       JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

-- ── Migração: adicionar colunas se tabela já existe ──
-- (rodar apenas se a tabela leads já foi criada antes)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS aprovacao_pct   INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS classificacao   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS completo        BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS etapa_abandono  TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS email        TEXT;
