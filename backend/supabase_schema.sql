-- Leads completos (backup do HubSpot)
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  nome TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  visto_recomendado TEXT,
  score INTEGER,
  profile JSONB,
  hubspot_synced BOOLEAN DEFAULT false,
  hubspot_contact_id TEXT
);

-- Índice para busca por email
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_hubspot_synced ON leads(hubspot_synced);

-- Sessões em andamento (para retomada de onde parou)
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  state JSONB NOT NULL
);

-- Limpar sessões antigas automaticamente (mais de 30 dias)
SELECT cron.schedule(
  'cleanup-old-sessions',
  '0 3 * * *',
  $$ DELETE FROM sessions WHERE updated_at < now() - interval '30 days' $$
);
