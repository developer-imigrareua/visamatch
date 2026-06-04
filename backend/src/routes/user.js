const express = require('express');
const jwt     = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const { sendAnalysisReport } = require('../services/mailer');
const router  = express.Router();

const JWT_SECRET = process.env.USER_JWT_SECRET || 'user_jwt_fallback';

// ── Middleware de autenticação do usuário ──
function authUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// ── GET /user/me ──
router.get('/me', authUser, async (req, res) => {
  const { data } = await supabase.from('users')
    .select('id,email,nome,phone,created_at').eq('id', req.user.userId).single();
  if (!data) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(data);
});

// ── PATCH /user/profile ── atualiza nome e telefone
router.patch('/profile', authUser, async (req, res) => {
  const { nome, phone } = req.body;
  if (!nome && !phone) return res.status(400).json({ error: 'Informe nome ou telefone.' });
  const updates = {};
  if (nome)  updates.nome  = nome.trim();
  if (phone) updates.phone = phone.trim();
  const { error } = await supabase.from('users').update(updates).eq('id', req.user.userId);
  if (error) { console.error('Update profile error:', error); return res.status(500).json({ error: 'Erro ao atualizar.' }); }
  res.json({ success: true });
});

// ── GET /user/analyses ── lista análises do usuário
router.get('/analyses', authUser, async (req, res) => {
  const { data, error } = await supabase.from('user_analyses')
    .select('id,visto,score,aprovacao_pct,classificacao,created_at')
    .eq('user_id', req.user.userId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Erro ao buscar análises.' });
  res.json(data || []);
});

// ── GET /user/analyses/:id ── análise completa
router.get('/analyses/:id', authUser, async (req, res) => {
  const { data } = await supabase.from('user_analyses')
    .select('*').eq('id', req.params.id).eq('user_id', req.user.userId).single();
  if (!data) return res.status(404).json({ error: 'Análise não encontrada.' });
  res.json(data);
});

// ── POST /user/analyses ── salva análise vinculada ao usuário
router.post('/analyses', authUser, async (req, res) => {
  const { visto, score, aprovacao_pct, classificacao, profile, analysis_json } = req.body;

  const { data, error } = await supabase.from('user_analyses').insert({
    user_id: req.user.userId,
    visto, score, aprovacao_pct, classificacao,
    profile, analysis_json
  }).select().single();

  if (error) return res.status(500).json({ error: 'Erro ao salvar análise.' });
  res.json(data);
});

// ── POST /user/send-report ── envia relatório por e-mail
router.post('/send-report', authUser, async (req, res) => {
  const { visto, score, classificacao } = req.body;
  const { data: user } = await supabase.from('users')
    .select('email,nome').eq('id', req.user.userId).single();
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  try {
    await sendAnalysisReport(user.email, user.nome, visto, score, classificacao);
    res.json({ message: 'Relatório enviado para ' + user.email });
  } catch(err) {
    console.error('Send report error:', err);
    res.status(500).json({ error: 'Erro ao enviar e-mail.' });
  }
});

module.exports = router;
