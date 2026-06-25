const express = require('express');
const { analyzeProfile } = require('../services/analyzer');
const { buildHubSpotProperties, upsertContact, createNote } = require('../services/hubspot');
const supabase = require('../lib/supabase');
const router = express.Router();

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// ── Fallback local: monta uma análise mínima a partir dos scores locais ──
// Usado quando a IA falha/expira, para NUNCA perder uma conclusão real.
function buildLocalFallback(localScores, vistos, visto) {
  const targets = (vistos && vistos.length) ? vistos : [visto || 'EB-2 NIW'];
  const resultados = targets.map(v => {
    const sc = (localScores && localScores[v] != null) ? localScores[v] : 0;
    const cls = sc >= 70 ? 'Alta' : sc >= 40 ? 'Moderada' : sc >= 0 ? 'Em Desenvolvimento' : 'Incompatível';
    return {
      visto: v,
      score: sc,
      aprovacao_pct: Math.max(0, Math.min(100, sc)),
      classificacao: cls,
      recomendacao_parceiro: (cls === 'Alta' || cls === 'Moderada') ? 'liv' : 'phoenix',
      _fallback: true,
    };
  });
  const melhor = [...resultados].sort((a, b) => b.score - a.score)[0];
  return { resultados, melhor, isDual: resultados.length > 1, gerado_em: new Date().toISOString(), _fallback: true };
}

// ── Persiste a conclusão do lead (Supabase + HubSpot) ──
// Idempotente por e-mail: atualiza o parcial existente ou insere um novo.
async function persistCompletion({ nome, email, phone, profile, utm, analysis }) {
  const bestScore   = analysis.melhor?.score ?? null;
  const bestPct     = analysis.melhor?.aprovacao_pct ?? null;
  const bestVisto   = analysis.melhor?.visto ?? null;
  const bestClassif = analysis.melhor?.classificacao ?? null;

  const payload = {
    nome, phone,
    visto_recomendado: bestVisto,
    score: bestScore,
    aprovacao_pct: bestPct,
    classificacao: bestClassif,
    completo: true,
    etapa_abandono: null,
    profile: { ...profile, ai_analysis: analysis, _completo: true, _utm: utm || undefined },
    updated_at: new Date().toISOString(),
  };

  // Atualiza o parcial existente (mesmo e-mail, ainda não concluído) ou insere
  const { data: existing } = await supabase
    .from('leads').select('id').eq('email', email)
    .eq('completo', false).order('created_at', { ascending: false }).limit(1).single();

  let leadId;
  if (existing) {
    await supabase.from('leads').update(payload).eq('id', existing.id);
    leadId = existing.id;
  } else {
    const { data } = await supabase.from('leads')
      .insert({ email, hubspot_synced: false, ...payload })
      .select('id').single();
    leadId = data?.id;
  }

  // Sincroniza no HubSpot como 'completed'
  if (HUBSPOT_TOKEN && leadId) {
    try {
      const props = buildHubSpotProperties(nome, email, phone, bestVisto, bestScore, profile, utm, 'completed');
      const { hubspotId, error: hsErr } = await upsertContact(HUBSPOT_TOKEN, props);
      if (hubspotId) {
        await supabase.from('leads')
          .update({ hubspot_synced: true, hubspot_contact_id: String(hubspotId), hubspot_error: null })
          .eq('id', leadId);
        await createNote(HUBSPOT_TOKEN, hubspotId,
          `✅ Preencheu VisaMatch\nVisto: ${bestVisto || '—'}\nScore: ${bestScore ?? '—'}${analysis._fallback ? '\n(análise via fallback local — IA indisponível no momento)' : ''}`);
      } else {
        console.error('HubSpot sync failed (analyze):', hsErr);
        await supabase.from('leads').update({ hubspot_error: hsErr, hubspot_payload: props }).eq('id', leadId);
      }
    } catch (e) {
      console.error('HubSpot request failed (analyze):', e.message);
      await supabase.from('leads').update({ hubspot_error: e.message || String(e) }).eq('id', leadId);
    }
  }

  return leadId;
}

// POST /analyze
// Body: { nome, email, phone, visto, vistos, profile, localScores, utm }
router.post('/', async (req, res) => {
  const { nome, email, phone, visto, vistos, profile, localScores, utm } = req.body;

  if (!profile) return res.status(400).json({ error: 'Profile obrigatório.' });

  try {
    // 1. Roda os agentes IA com scores locais pré-calculados
    const analysis = await analyzeProfile({ nome, email, visto, vistos, profile, localScores });

    // 2. Persiste a conclusão (Supabase + HubSpot) — não bloqueia a resposta em caso de erro de persistência
    if (email) {
      try { await persistCompletion({ nome, email, phone, profile, utm, analysis }); }
      catch (e) { console.error('persistCompletion (sucesso IA) error:', e); }
    }

    // 3. Retorna análise completa para o frontend
    return res.json(analysis);

  } catch (err) {
    console.error('Analyze error:', err);

    // IA indisponível: AINDA ASSIM persiste a conclusão com os scores locais.
    // Isso evita "leads fantasma" (jornada completa registrada como parcial).
    if (email) {
      try {
        const fallback = buildLocalFallback(localScores, vistos, visto);
        await persistCompletion({ nome, email, phone, profile, utm, analysis: fallback });
        console.log('Lead concluído via fallback local após falha de IA:', email);
      } catch (e) {
        console.error('persistCompletion (fallback) error:', e);
      }
    }

    // Mantém o contrato atual: 500 → frontend exibe seu resultado local (buildResult)
    return res.status(500).json({
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

// Export principal é o router (usado por index.js: app.use('/analyze', router)).
// Helpers anexados para reuso (ex: script de backfill).
module.exports = router;
module.exports.persistCompletion = persistCompletion;
module.exports.buildLocalFallback = buildLocalFallback;
