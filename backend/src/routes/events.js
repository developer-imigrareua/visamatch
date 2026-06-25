const express = require('express');
const supabase = require('../lib/supabase');
const router = express.Router();

// POST /events — registra eventos de funil (view / start / complete)
// Alimenta a tabela funnel_events usada nas métricas do Analytics.
// Body: { session_id, event, visto?, score?, time_to_complete? }
const VALID_EVENTS = ['view', 'start', 'complete'];

router.post('/', async (req, res) => {
  const { session_id, event, visto, score, time_to_complete } = req.body || {};

  if (!session_id || !event) return res.status(400).json({ error: 'session_id e event obrigatórios.' });
  if (!VALID_EVENTS.includes(event)) return res.status(400).json({ error: 'Evento inválido.' });

  try {
    const { error } = await supabase.from('funnel_events').insert({
      session_id: String(session_id),
      event,
      visto: visto || null,
      score: (score === 0 || score) ? Math.round(Number(score)) : null,
      time_to_complete: (time_to_complete === 0 || time_to_complete) ? Math.round(Number(time_to_complete)) : null,
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Funnel event error:', err.message);
    // Tracking não deve quebrar o fluxo do usuário — responde 200 mesmo em falha
    res.json({ success: false });
  }
});

module.exports = router;
