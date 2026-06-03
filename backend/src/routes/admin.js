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
    // Total de leads
    const { count: total } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // Leads por visto
    const { data: porVisto } = await supabase
      .from('leads')
      .select('visto_recomendado')
      .not('visto_recomendado', 'is', null);

    const vistoCount = porVisto.reduce((acc, r) => {
      acc[r.visto_recomendado] = (acc[r.visto_recomendado] || 0) + 1;
      return acc;
    }, {});

    // Leads por classificação de score
    const { data: scores } = await supabase
      .from('leads')
      .select('score')
      .not('score', 'is', null);

    const scoreClass = { alta: 0, moderada: 0, desenvolvimento: 0, incompativel: 0 };
    scores.forEach(({ score }) => {
      if (score >= 70) scoreClass.alta++;
      else if (score >= 40) scoreClass.moderada++;
      else if (score >= 0) scoreClass.desenvolvimento++;
      else scoreClass.incompativel++;
    });

    // Leads não sincronizados com HubSpot
    const { count: pendentesHubspot } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('hubspot_synced', false);

    // Leads dos últimos 7 dias
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: ultimos7dias } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', seteDiasAtras);

    // Leads dos últimos 30 dias agrupados por dia
    const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: porDia } = await supabase
      .from('leads')
      .select('created_at')
      .gte('created_at', trintaDiasAtras)
      .order('created_at', { ascending: true });

    const timeline = porDia.reduce((acc, r) => {
      const dia = r.created_at.slice(0, 10);
      acc[dia] = (acc[dia] || 0) + 1;
      return acc;
    }, {});

    res.json({
      total,
      ultimos7dias,
      pendentesHubspot,
      porVisto: vistoCount,
      porScore: scoreClass,
      timeline
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Erro ao buscar métricas.' });
  }
});

// ── GET /api/admin/leads ──
router.get('/leads', auth, async (req, res) => {
  const { page = 1, limit = 20, visto, score_min, score_max, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('leads')
      .select('id, created_at, nome, email, phone, visto_recomendado, score, hubspot_synced, hubspot_contact_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (visto) query = query.eq('visto_recomendado', visto);
    if (score_min) query = query.gte('score', score_min);
    if (score_max) query = query.lte('score', score_max);
    if (search) query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);

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

// ── GET /api/admin/sessions ── sessões ativas
router.get('/sessions', auth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const { data, count, error } = await supabase
      .from('sessions')
      .select('id, created_at, updated_at, email, state->step, state->prog, state->visto', { count: 'exact' })
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

module.exports = router;
