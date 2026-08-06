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
    // 'start' e 'complete' só podem ocorrer uma vez por sessão — o frontend já
    // protege contra disparo duplicado, mas isso é a garantia definitiva
    // (double-click, corrida, ou qualquer outro caminho que dispare 2x).
    // 'view' pode repetir livremente (reload/revisita é esperado).
    if (event !== 'view') {
      const { data: existing } = await supabase
        .from('funnel_events').select('id')
        .eq('session_id', String(session_id)).eq('event', event)
        .limit(1).maybeSingle();
      if (existing) return res.json({ success: true, deduped: true });
    }

    const { error } = await supabase.from('funnel_events').insert({
      session_id: String(session_id),
      event,
      visto: visto || null,
      score: (score === 0 || score) ? Math.round(Number(score)) : null,
      time_to_complete: (time_to_complete === 0 || time_to_complete) ? Math.round(Number(time_to_complete)) : null,
    });
    // Corrida rara (dois POSTs quase simultâneos passam a checagem acima antes
    // de qualquer um inserir): o índice único no banco rejeita o 2º insert
    // (23505 = unique_violation) — trata como sucesso idempotente, não como erro.
    if (error && error.code !== '23505') throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Funnel event error:', err.message);
    // Tracking não deve quebrar o fluxo do usuário — responde 200 mesmo em falha
    res.json({ success: false });
  }
});

module.exports = router;
