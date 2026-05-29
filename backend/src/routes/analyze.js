const express = require('express');
const { analyzeProfile } = require('../services/analyzer');
const supabase = require('../lib/supabase');
const router = express.Router();

// POST /analyze
// Body: { nome, email, phone, visto, vistos, profile }
router.post('/', async (req, res) => {
  const { nome, email, phone, visto, vistos, profile } = req.body;

  if (!profile) return res.status(400).json({ error: 'Profile obrigatório.' });

  try {
    // 1. Roda os agentes IA
    const analysis = await analyzeProfile({ nome, email, visto, vistos, profile });

    // 2. Salva lead completo no Supabase
    const bestScore    = analysis.melhor?.score ?? null;
    const bestPct      = analysis.melhor?.aprovacao_pct ?? null;
    const bestVisto    = analysis.melhor?.visto ?? visto;
    const bestClassif  = analysis.melhor?.classificacao ?? null;

    if (email) {
      // Tenta atualizar lead parcial existente pelo email
      const { data: existing } = await supabase
        .from('leads').select('id').eq('email', email)
        .eq('completo', false).order('created_at', { ascending: false }).limit(1).single();

      if (existing) {
        await supabase.from('leads').update({
          nome, phone,
          visto_recomendado: bestVisto,
          score: bestScore,
          aprovacao_pct: bestPct,
          classificacao: bestClassif,
          completo: true,
          etapa_abandono: null,
          profile: { ...profile, ai_analysis: analysis },
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await supabase.from('leads').insert({
          nome, email, phone,
          visto_recomendado: bestVisto,
          score: bestScore,
          aprovacao_pct: bestPct,
          classificacao: bestClassif,
          completo: true,
          etapa_abandono: null,
          profile: { ...profile, ai_analysis: analysis },
          hubspot_synced: false,
        });
      }
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
