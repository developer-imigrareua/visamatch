const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Salvar ou atualizar sessão
router.post('/', async (req, res) => {
  const { session_id, state } = req.body;

  if (!state) return res.status(400).json({ error: 'State obrigatório.' });

  if (session_id) {
    // Atualizar sessão existente
    const { error } = await supabase
      .from('sessions')
      .update({ state, updated_at: new Date().toISOString() })
      .eq('id', session_id);

    if (error) return res.status(500).json({ error: 'Erro ao atualizar sessão.' });
    return res.json({ session_id });
  }

  // Criar nova sessão
  const { data, error } = await supabase
    .from('sessions')
    .insert({ state })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Erro ao criar sessão.' });
  res.json({ session_id: data.id });
});

// Recuperar sessão
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Sessão não encontrada.' });
  res.json({ state: data.state, updated_at: data.updated_at });
});

module.exports = router;
