const express = require('express');
const { analyzeProfile } = require('../services/analyzer');
const supabase = require('../lib/supabase');
const router = express.Router();

// POST /analyze
// Body: { nome, email, phone, visto, vistos, profile }
router.post('/', async (req, res) => {
  const { nome, email, phone, visto, vistos, profile, localScores, utm } = req.body;

  if (!profile) return res.status(400).json({ error: 'Profile obrigatório.' });

  try {
    // 1. Roda os agentes IA com scores locais pré-calculados
    const analysis = await analyzeProfile({ nome, email, visto, vistos, profile, localScores });

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
          profile: { ...profile, ai_analysis: analysis, _utm: utm || undefined },
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
          profile: { ...profile, ai_analysis: analysis, _utm: utm || undefined },
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

// POST /analyze/send-email — envia relatório por e-mail (sem auth obrigatória)
router.post('/send-email', async (req, res) => {
  const { email, nome, visto, score, aprovacao_pct, classificacao } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

  try {
    const { sendAnalysisReport } = require('../services/mailer');
    const pct = aprovacao_pct ?? score ?? 0;
    await sendAnalysisReport(
      email,
      nome || 'Usuário',
      visto || '—',
      pct,
      classificacao || ''
    );
    console.log('Report email sent to:', email, 'visto:', visto, 'score:', pct);
    res.json({ success: true, message: `Relatório enviado para ${email}` });
  } catch(err) {
    console.error('Send email error:', err.message);
    res.status(500).json({ error: 'Erro ao enviar e-mail: ' + err.message });
  }
});

module.exports = router;
