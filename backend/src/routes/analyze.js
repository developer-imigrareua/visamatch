const express = require('express');
const { analyzeProfile } = require('../services/analyzer');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// POST /analyze
// Body: { nome, email, phone, visto, vistos, profile }
router.post('/', async (req, res) => {
  const { nome, email, phone, visto, vistos, profile } = req.body;

  if (!profile) return res.status(400).json({ error: 'Profile obrigatório.' });

  try {
    // 1. Roda os agentes IA
    const analysis = await analyzeProfile({ nome, email, visto, vistos, profile });

    // 2. Salva lead no Supabase com a análise completa
    const bestScore = analysis.melhor?.score ?? null;
    const bestVisto = analysis.melhor?.visto ?? visto;

    if (email) {
      await supabase.from('leads').insert({
        nome,
        email,
        phone,
        visto_recomendado: bestVisto,
        score: bestScore,
        profile: { ...profile, ai_analysis: analysis },
        hubspot_synced: false,
      }).then(({ error }) => {
        if (error) console.error('Supabase save error:', error);
      });
    }

    // 3. Retorna análise para o frontend
    res.json(analysis);

  } catch (err) {
    console.error('Analyze error:', err);

    // Fallback: se a IA falhar, retorna análise básica sem travar o usuário
    res.status(500).json({
      error: 'Erro na análise IA.',
      fallback: true,
      message: 'Não foi possível gerar a análise neste momento. Nossa equipe entrará em contato.'
    });
  }
});

module.exports = router;
