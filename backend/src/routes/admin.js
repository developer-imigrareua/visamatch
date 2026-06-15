const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const router = express.Router();

// ── Middleware de autenticação ──
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  try {
    req.admin = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// ── POST /api/admin/login ──
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  const token = jwt.sign({ role: 'admin' }, process.env.ADMIN_JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

// ── GET /api/admin/stats ──
router.get('/stats', auth, async (req, res) => {
  try {
    // Date range (padrão: 30 dias)
    const now = new Date();
    const defaultFrom = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const from = req.query.from ? new Date(req.query.from).toISOString() : defaultFrom;
    const to   = req.query.to   ? new Date(req.query.to + 'T23:59:59').toISOString() : now.toISOString();
    const rangeMs = new Date(to) - new Date(from);
    const prevFrom = new Date(new Date(from) - rangeMs).toISOString();

    const pct = (cur, prev) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    // Totais no período e período anterior
    const [{ count: total }, { count: totalPrev }, { count: completos }, { count: completosPrev }] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', from).lte('created_at', to),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', prevFrom).lte('created_at', from),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('completo', true).gte('created_at', from).lte('created_at', to),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('completo', true).gte('created_at', prevFrom).lte('created_at', from),
    ]);

    // Pendentes HubSpot (global)
    const { count: pendentesHubspot } = await supabase
      .from('leads').select('*', { count: 'exact', head: true }).eq('hubspot_synced', false);

    // Últimos 7 dias (KPI fixo)
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: ultimos7dias } = await supabase
      .from('leads').select('*', { count: 'exact', head: true }).gte('created_at', seteDiasAtras);

    // Por visto no período
    const { data: porVistoRaw } = await supabase
      .from('leads').select('visto_recomendado').not('visto_recomendado', 'is', null)
      .gte('created_at', from).lte('created_at', to);
    const vistoCount = (porVistoRaw || []).reduce((acc, r) => {
      acc[r.visto_recomendado] = (acc[r.visto_recomendado] || 0) + 1;
      return acc;
    }, {});

    // Score no período
    const { data: scores } = await supabase
      .from('leads').select('score').not('score', 'is', null)
      .gte('created_at', from).lte('created_at', to);
    const scoreClass = { alta: 0, moderada: 0, desenvolvimento: 0, incompativel: 0 };
    (scores || []).forEach(({ score }) => {
      if (score >= 70) scoreClass.alta++;
      else if (score >= 40) scoreClass.moderada++;
      else if (score >= 0) scoreClass.desenvolvimento++;
      else scoreClass.incompativel++;
    });

    // Timeline por dia + completos por dia
    const { data: porDia } = await supabase
      .from('leads').select('created_at, completo')
      .gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending: true });
    const timeline = {}, timelineCompletos = {};
    (porDia || []).forEach(r => {
      const dia = r.created_at.slice(0, 10);
      timeline[dia] = (timeline[dia] || 0) + 1;
      if (r.completo) timelineCompletos[dia] = (timelineCompletos[dia] || 0) + 1;
    });

    // Média de idade
    const { data: idadeRows } = await supabase
      .from('leads').select('profile').not('profile', 'is', null)
      .gte('created_at', from).lte('created_at', to);
    const idades = (idadeRows || []).map(r => r.profile?.idade).filter(v => v && v >= 10 && v <= 100);
    const mediaIdade = idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null;

    // UTM aggregations (todos os parâmetros) — reutiliza idadeRows
    const utmRows = idadeRows;
    const porUtmSource = {}, porUtmMedium = {}, porUtmCampaign = {},
          porUtmContent = {}, porUtmTerm = {}, porUtmAffType = {}, porUtmAffName = {};
    (utmRows || []).forEach(r => {
      const utm = r.profile?._utm || {};
      if (utm.utm_source)        porUtmSource[utm.utm_source]               = (porUtmSource[utm.utm_source] || 0) + 1;
      if (utm.utm_medium)        porUtmMedium[utm.utm_medium]               = (porUtmMedium[utm.utm_medium] || 0) + 1;
      if (utm.utm_campaign)      porUtmCampaign[utm.utm_campaign]           = (porUtmCampaign[utm.utm_campaign] || 0) + 1;
      if (utm.utm_content)       porUtmContent[utm.utm_content]             = (porUtmContent[utm.utm_content] || 0) + 1;
      if (utm.utm_term)          porUtmTerm[utm.utm_term]                   = (porUtmTerm[utm.utm_term] || 0) + 1;
      if (utm.utm_affiliatetype) porUtmAffType[utm.utm_affiliatetype]       = (porUtmAffType[utm.utm_affiliatetype] || 0) + 1;
      if (utm.utm_affiliatename) porUtmAffName[utm.utm_affiliatename]       = (porUtmAffName[utm.utm_affiliatename] || 0) + 1;
    });

    res.json({
      total, totalPrev, totalChange: pct(total, totalPrev),
      completos, completosPrev, completosChange: pct(completos, completosPrev),
      conversionRate: total > 0 ? Math.round((completos / total) * 100) : 0,
      conversionRatePrev: totalPrev > 0 ? Math.round(((completosPrev || 0) / totalPrev) * 100) : 0,
      ultimos7dias, pendentesHubspot,
      porVisto: vistoCount, porScore: scoreClass,
      timeline, timelineCompletos,
      porUtmSource, porUtmMedium, porUtmCampaign,
      porUtmContent, porUtmTerm, porUtmAffType, porUtmAffName,
      mediaIdade,
      from, to,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Erro ao buscar métricas.' });
  }
});

// ── GET /api/admin/leads ──
router.get('/leads', auth, async (req, res) => {
  const { page = 1, limit = 20, visto, score_min, score_max, search, utm_source, from, to } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('leads')
      .select('id, created_at, updated_at, nome, email, phone, visto_recomendado, score, hubspot_synced, hubspot_contact_id, profile', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (visto) query = query.eq('visto_recomendado', visto);
    if (score_min) query = query.gte('score', score_min);
    if (score_max) query = query.lte('score', score_max);
    if (search) query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
    if (from) query = query.gte('created_at', new Date(from).toISOString());
    if (to)   query = query.lte('created_at', new Date(to + 'T23:59:59').toISOString());

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ leads: data, total: count, page: +page, pages: Math.ceil(count / limit) });
  } catch (err) {
    console.error('Admin leads error:', err);
    res.status(500).json({ error: 'Erro ao buscar leads.' });
  }
});

// ── GET /api/admin/leads/:id ──
router.get('/leads/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Lead não encontrado.' });
  res.json(data);
});

// ── GET /api/admin/users ──
router.get('/users', auth, async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;
  try {
    let query = supabase
      .from('users')
      .select('id, created_at, email, nome', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (search) query = query.or(`email.ilike.%${search}%,nome.ilike.%${search}%`);
    const { data, count, error } = await query;
    if (error) throw error;

    // Enriquece com contagem de análises
    const enriched = await Promise.all((data || []).map(async u => {
      const { count: nAnalyses } = await supabase
        .from('user_analyses').select('*', { count: 'exact', head: true }).eq('user_id', u.id);
      return { ...u, n_analyses: nAnalyses || 0 };
    }));

    res.json({ users: enriched, total: count, page: +page, pages: Math.ceil(count / limit) });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Erro ao buscar usuários.' });
  }
});

// ── PATCH /api/admin/users/:id ── atualiza e-mail ou nome
router.patch('/users/:id', auth, async (req, res) => {
  const { email, nome } = req.body;
  if (!email && !nome) return res.status(400).json({ error: 'Informe email ou nome.' });
  try {
    const updates = {};
    if (email) updates.email = email.toLowerCase().trim();
    if (nome)  updates.nome  = nome.trim();
    const { error } = await supabase.from('users').update(updates).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch(err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

// ── DELETE /api/admin/users/:id ── remove usuário e suas análises
router.delete('/users/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('users').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch(err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Erro ao remover usuário.' });
  }
});

// ── GET /api/admin/users/:id/analyses ──
router.get('/users/:id/analyses', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_analyses')
    .select('id, created_at, visto, score, aprovacao_pct, classificacao')
    .eq('user_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Erro ao buscar análises.' });
  res.json(data || []);
});

// ── GET /api/admin/funnel ── funil de abandono por etapa
router.get('/funnel', auth, async (req, res) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const from = req.query.from ? new Date(req.query.from).toISOString() : defaultFrom;
    const to   = req.query.to   ? new Date(req.query.to + 'T23:59:59').toISOString() : now.toISOString();

    // Todos os leads no período com profile (para extrair etapa de abandono granular)
    const { data: allLeads } = await supabase
      .from('leads').select('completo, etapa_abandono, profile, created_at')
      .gte('created_at', from).lte('created_at', to);

    const { count: total } = await supabase
      .from('leads').select('*', { count: 'exact', head: true })
      .gte('created_at', from).lte('created_at', to);

    const { count: completos } = await supabase
      .from('leads').select('*', { count: 'exact', head: true })
      .eq('completo', true).gte('created_at', from).lte('created_at', to);

    // Abandono granular: lê profile._etapa_abandono ou etapa_abandono
    const abandonMap = {};
    (allLeads || []).filter(l => !l.completo).forEach(l => {
      const etapa = l.profile?._etapa_abandono || l.etapa_abandono || 'desconhecido';
      abandonMap[etapa] = (abandonMap[etapa] || 0) + 1;
    });

    // Sessões em andamento (últimos 7 dias para "quentes")
    const { data: sessions } = await supabase
      .from('sessions').select('state->step, state->prog, state->_device, updated_at')
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const stepMap = {};
    (sessions || []).forEach(r => {
      const k = r.step || 'welcome';
      stepMap[k] = (stepMap[k] || 0) + 1;
    });

    // Mapeamento step → etapa do funil (granular, cobrindo todos os steps reais do fluxo)
    const STEP_TO_FUNNEL = {
      welcome: 'contato', disclaimer_legal: 'contato', check_email_exists: 'contato',
      contact_email: 'contato', contact_name: 'contato', contact_phone: 'contato',
      chat_confirm_data: 'contato',
      path_select: 'triagem', path_select2: 'triagem',
      path_niw: 'triagem', path_eb1: 'triagem', path_o1: 'triagem',
      path_l1: 'triagem', path_e2: 'triagem', path_family: 'triagem',
      path_offramp_sem_perfil: 'offramp',
      pi_local: 'perfil_pessoal', pi_profissao: 'perfil_pessoal', pi_casado: 'perfil_pessoal',
      pi_filhos: 'perfil_pessoal', pi_renda: 'perfil_pessoal', pi_planos: 'perfil_pessoal',
      pi_prazo: 'perfil_pessoal', pi_fundos: 'perfil_pessoal',
      ac_grau: 'formacao', ac_instituicao: 'formacao', ac_curso: 'formacao',
      ac_status: 'formacao', ac_posgrad: 'formacao', ac_conclusao: 'formacao',
      pe_emp1: 'experiencia', pe_cargo1: 'experiencia', pe_entrada1: 'experiencia',
      pe_saida1: 'experiencia', pe_segunda: 'experiencia', pe_terceira: 'experiencia',
      pe_gap_check: 'experiencia', pe_projetos: 'experiencia',
      sc_niw_1: 'scoring', sc_niw_hab: 'scoring', sc_eb1_intro: 'scoring',
      sc_eb1_1: 'scoring', sc_eb1_decide: 'scoring',
      sc_o1_1: 'scoring', sc_o1_5: 'scoring',
      resultado: 'resultado',
    };

    // Funil com dados reais de abandono por etapa
    const funnelSteps = [
      { id: 'contato',         label: 'Contato',           icon: '📧' },
      { id: 'triagem',         label: 'Triagem / Caminho', icon: '🔀' },
      { id: 'offramp',         label: 'Offramp (sem perfil)', icon: '🚪' },
      { id: 'perfil_pessoal',  label: 'Perfil Pessoal',    icon: '👤' },
      { id: 'formacao',        label: 'Formação Acadêmica',icon: '🎓' },
      { id: 'experiencia',     label: 'Experiência',       icon: '💼' },
      { id: 'scoring',         label: 'Scoring / Critérios', icon: '📊' },
      { id: 'resultado',       label: 'Análise Completa',  icon: '✅' },
    ];

    // Agrega abandono por etapa do funil (usando mapa de steps)
    const funnelAbandonMap = {};
    Object.entries(abandonMap).forEach(([step, count]) => {
      const etapa = STEP_TO_FUNNEL[step] || step;
      funnelAbandonMap[etapa] = (funnelAbandonMap[etapa] || 0) + count;
    });
    const funnelStepMap = {};
    Object.entries(stepMap).forEach(([step, count]) => {
      const etapa = STEP_TO_FUNNEL[step] || step;
      funnelStepMap[etapa] = (funnelStepMap[etapa] || 0) + count;
    });

    const funnel = funnelSteps.map(s => ({
      ...s,
      abandons:    funnelAbandonMap[s.id] || 0,
      em_andamento: funnelStepMap[s.id] || 0,
    }));

    // Dispositivos
    const deviceMap = {};
    (sessions || []).forEach(r => {
      const d = r._device || 'desktop';
      deviceMap[d] = (deviceMap[d] || 0) + 1;
    });

    // Top steps de abandono granular (raw, para exibir no detalhe)
    const topAbandonSteps = Object.entries(abandonMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([step, count]) => ({ step, count }));

    const conversionRate = total > 0 ? Math.round(((completos || 0) / total) * 100) : 0;
    const exitMap = { ...abandonMap };

    res.json({
      funnel, total, completos, conversionRate,
      abandonMap, funnelAbandonMap, stepMap, topAbandonSteps,
      deviceMap, exitMap, from, to
    });
  } catch (err) {
    console.error('Funnel error:', err);
    res.status(500).json({ error: 'Erro ao calcular funil.' });
  }
});

// ── GET /api/admin/sessions ── sessões ativas
router.get('/sessions', auth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const { data, count, error } = await supabase
      .from('sessions')
      .select('id, created_at, updated_at, email, ip_address, state->step, state->prog, state->visto, state->nome, state->_device', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ sessions: data || [], total: count, page: +page, pages: Math.ceil(count / limit) });
  } catch (err) {
    console.error('Admin sessions error:', err);
    res.status(500).json({ error: 'Erro ao buscar sessões.' });
  }
});

// ── GET /api/admin/overview ── stats ampliado
router.get('/overview', auth, async (req, res) => {
  try {
    const [
      { count: totalLeads },
      { count: totalUsers },
      { count: totalAnalyses },
      { count: activeSessions }
    ] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('user_analyses').select('*', { count: 'exact', head: true }),
      supabase.from('sessions').select('*', { count: 'exact', head: true })
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);
    res.json({ totalLeads, totalUsers, totalAnalyses, activeSessions });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar overview.' });
  }
});

// ── GET /api/admin/health ── verifica conexões externas
router.get('/health', auth, async (req, res) => {
  const fetch = require('node-fetch');
  const nodemailer = require('nodemailer');

  const check = async (name, fn) => {
    const t0 = Date.now();
    try {
      const result = await fn();
      return { name, ok: true, ms: Date.now() - t0, detail: result || null };
    } catch (err) {
      return { name, ok: false, ms: Date.now() - t0, detail: err.message || String(err) };
    }
  };

  const results = await Promise.all([
    check('Supabase', async () => {
      const { error } = await supabase.from('leads').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return 'Query OK';
    }),

    check('HubSpot', async () => {
      const token = process.env.HUBSPOT_TOKEN;
      if (!token) throw new Error('HUBSPOT_TOKEN não configurado');
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return `HTTP 200`;
    }),

    check('OpenAI', async () => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY não configurado');
      const r = await fetch('https://api.openai.com/v1/models?limit=1', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return 'HTTP 200';
    }),

    check('SMTP', async () => {
      const host = process.env.SMTP_HOST;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      if (!host || !user || !pass) throw new Error('Credenciais SMTP incompletas');
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });
      await transporter.verify();
      return 'Autenticado';
    }),
  ]);

  res.json({ checks: results, ts: new Date().toISOString() });
});

// ── GET /api/admin/hubspot-logs ── leads com problema no HubSpot
router.get('/hubspot-logs', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('id, created_at, nome, email, visto_recomendado, score, hubspot_synced, hubspot_contact_id, hubspot_error, hubspot_payload')
      .eq('hubspot_synced', false)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar logs HubSpot.' });
  }
});

// ── POST /api/admin/hubspot-retry/:id ── retentar sincronização
router.post('/hubspot-retry/:id', auth, async (req, res) => {
  const fetch = require('node-fetch');
  const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
  if (!HUBSPOT_TOKEN) return res.status(500).json({ error: 'HUBSPOT_TOKEN não configurado.' });

  async function resolveHubSpotId(emailAddr) {
    const r1 = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(emailAddr)}?idProperty=email`, {
      headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` }
    });
    if (r1.ok) return (await r1.json()).id;
    const r2 = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: 'email', operator: 'EQ', value: emailAddr }] },
          { filters: [{ propertyName: 'hs_additional_emails', operator: 'CONTAINS_TOKEN', value: emailAddr }] }
        ],
        properties: ['email', 'hs_additional_emails'],
        limit: 1
      })
    });
    if (r2.ok) {
      const body = await r2.json();
      if (body.results?.length) return body.results[0].id;
    }
    return null;
  }

  try {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    // Usa payload salvo se disponível, senão reconstrói dados básicos
    const properties = lead.hubspot_payload || {
      email: lead.email,
      firstname: (lead.nome || '').split(' ')[0] || '',
      lastname: (lead.nome || '').split(' ').slice(1).join(' ') || '',
      phone: lead.phone || '',
    };

    const hsRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties })
    });

    let hubspotId = null;
    if (hsRes.ok) {
      hubspotId = (await hsRes.json()).id;
    } else if (hsRes.status === 409) {
      const conflict = await hsRes.json();
      const inlineId = conflict?.message?.match(/ID:\s*(\d+)/i)?.[1]
        || (conflict?.error === 'CONTACT_EXISTS' ? conflict?.identityProfile?.vid : null);
      hubspotId = inlineId || await resolveHubSpotId(lead.email);
      if (hubspotId) {
        const upRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${hubspotId}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties })
        });
        if (!upRes.ok) hubspotId = null;
      }
    } else {
      const errText = await hsRes.text();
      await supabase.from('leads').update({ hubspot_error: `HTTP ${hsRes.status}: ${errText}` }).eq('id', lead.id);
      return res.status(400).json({ error: `HubSpot retornou ${hsRes.status}`, detail: errText });
    }

    if (hubspotId) {
      await supabase.from('leads').update({ hubspot_synced: true, hubspot_contact_id: String(hubspotId), hubspot_error: null }).eq('id', lead.id);

      // Note de atividade (não bloqueia o retry mesmo se falhar por scope)
      try {
        const nr = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: {
              hs_note_body: `✅ Preencheu VisaMatch\nVisto recomendado: ${lead.visto_recomendado || '—'}\nScore: ${lead.score != null ? lead.score : '—'}\n(Retry manual pelo admin)`,
              hs_timestamp: new Date().toISOString()
            },
            associations: [{
              to: { id: String(hubspotId) },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
            }]
          })
        });
        if (!nr.ok) console.error('HubSpot note retry HTTP:', nr.status, await nr.text());
      } catch (_) {}

      res.json({ success: true, hubspot_contact_id: hubspotId });
    } else {
      await supabase.from('leads').update({ hubspot_error: 'Retry: contato não encontrado/criado' }).eq('id', lead.id);
      res.status(400).json({ error: 'Não foi possível criar/encontrar contato no HubSpot.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
