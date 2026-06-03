const express = require('express');
const supabase = require('../lib/supabase');
const router  = express.Router();

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

router.post('/', async (req, res) => {
  const { session_id, state, email } = req.body;
  if (!state) return res.status(400).json({ error: 'State obrigatório.' });

  const ip_address = getIP(req);
  const now = new Date().toISOString();

  if (session_id) {
    const { error } = await supabase.from('sessions').update({
      state, updated_at: now, ip_address,
      ...(email ? { email } : {})
    }).eq('id', session_id);
    if (error) return res.status(500).json({ error: 'Erro ao atualizar sessão.' });
    return res.json({ session_id });
  }

  const { data, error } = await supabase.from('sessions')
    .insert({ state, email: email || null, ip_address })
    .select().single();

  if (error) return res.status(500).json({ error: 'Erro ao criar sessão.' });
  res.json({ session_id: data.id });
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('sessions')
    .select('*').eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Sessão não encontrada.' });
  res.json({ state: data.state, updated_at: data.updated_at });
});

module.exports = router;
