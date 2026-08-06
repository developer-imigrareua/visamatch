const express = require('express');
const { analyzeProfile } = require('../services/analyzer');
const { buildHubSpotProperties, upsertContact, upsertContactStatus, createNote, uploadFile, createNoteWithAttachment } = require('../services/hubspot');
const { generateReportPdf } = require('../services/pdfReport');
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
// Idempotente por e-mail: UMA PESSOA = UMA LINHA, sempre.
async function persistCompletion({ nome, email, phone, profile, utm, analysis }) {
  const bestScore   = analysis.melhor?.score ?? null;
  const bestPct     = analysis.melhor?.aprovacao_pct ?? null;
  const bestVisto   = analysis.melhor?.visto ?? null;
  const bestClassif = analysis.melhor?.classificacao ?? null;

  // Localiza a linha existente ANTES de montar o payload, para MESCLAR o
  // profile e preservar campos gravados no lead (ex: _utm, _etapa_abandono)
  // que podem não vir no profile do request.
  // Prefere converter o parcial em aberto; se a pessoa JÁ concluiu antes,
  // atualiza a análise naquela mesma linha. Antes o filtro era só
  // `completo=false`: quem refazia o VisaMatch não casava com nada e ganhava
  // uma segunda linha de lead para o mesmo e-mail.
  const { data: rows } = await supabase
    .from('leads').select('id, profile, completo, completed_at')
    .eq('email', email).order('created_at', { ascending: true });
  const abertos = (rows || []).filter(r => !r.completo);
  const existing = abertos.length
    ? abertos[abertos.length - 1]          // parcial mais recente
    : (rows || [])[0] || null;             // senão, a linha canônica (mais antiga)

  const prevProfile = (existing && existing.profile) || {};
  // UTM: prioriza o recebido, senão preserva o que já existia no lead.
  const finalUtm = utm || prevProfile._utm || (profile && profile._utm) || undefined;
  const mergedProfile = {
    ...prevProfile,
    ...(profile || {}),
    ai_analysis: analysis,
    _completo: true,
  };
  if (finalUtm) mergedProfile._utm = finalUtm;

  const payload = {
    nome, phone,
    visto_recomendado: bestVisto,
    score: bestScore,
    aprovacao_pct: bestPct,
    classificacao: bestClassif,
    completo: true,
    etapa_abandono: null,
    profile: mergedProfile,
    updated_at: new Date().toISOString(),
    // completed_at é IMUTÁVEL: numa reconclusão, mantém a data da primeira
    // conclusão. Reescrever aqui moveria a conclusão de um período já fechado
    // para o atual — o mês passado perderia 1 completo retroativamente.
    completed_at: (existing && existing.completed_at) || new Date().toISOString(),
  };

  // O supabase-js NÃO lança exceção em erro de banco (constraint, RLS, JSONB
  // malformado etc.) — ele resolve normalmente com { error }. Sem checar isso
  // explicitamente, uma escrita que falhasse passava como sucesso, silenciosamente.
  let leadId;
  if (existing) {
    const { error: updErr } = await supabase.from('leads').update(payload).eq('id', existing.id);
    if (updErr) throw updErr;
    leadId = existing.id;
  } else {
    const { data, error: insErr } = await supabase.from('leads')
      .insert({ email, hubspot_synced: false, ...payload })
      .select('id').single();
    if (insErr) throw insErr;
    leadId = data?.id;
  }

  // Sincroniza no HubSpot como 'completed'
  if (HUBSPOT_TOKEN && leadId) {
    try {
      const props = buildHubSpotProperties(nome, email, phone, bestVisto, bestScore, mergedProfile, finalUtm, 'completed');
      const { hubspotId, error: hsErr } = await upsertContactStatus(HUBSPOT_TOKEN, props, 'completed');
      if (hubspotId) {
        await supabase.from('leads')
          .update({ hubspot_synced: true, hubspot_contact_id: String(hubspotId), hubspot_error: null })
          .eq('id', leadId);
        const noteBody = `✅ Preencheu VisaMatch\nVisto: ${bestVisto || '—'}\nScore: ${bestScore ?? '—'}${analysis._fallback ? '\n(análise via fallback local — IA indisponível no momento)' : ''}`;

        // Anexa o PDF de respostas (perguntas → respostas) ao contato.
        // Fire-and-forget: não bloqueia a resposta da análise ao usuário.
        (async () => {
          try {
            const pdf = await generateReportPdf({
              nome, email, phone, visto: bestVisto,
              vistos: (analysis.resultados || []).map(r => r.visto),
              score: bestScore, profile: mergedProfile
            });
            const safeName = `VisaMatch_${(nome || 'Lead').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}.pdf`;
            const fileId = await uploadFile(HUBSPOT_TOKEN, pdf, safeName);
            const ok = await createNoteWithAttachment(HUBSPOT_TOKEN, hubspotId, noteBody, fileId);
            if (!ok || !fileId) {
              console.error('PDF respostas attach falhou para', email, '| fileId:', fileId);
              await createNote(HUBSPOT_TOKEN, hubspotId, noteBody);
            }
          } catch (e) {
            console.error('PDF respostas generation/attach error:', e.message);
            createNote(HUBSPOT_TOKEN, hubspotId, noteBody).catch(() => {});
          }
        })();
      } else {
        // Falha de sync: registra status pretendido + retorno da API (sem PII) e
        // mantém hubspot_synced=false para reprocessamento seguro.
        console.error('HubSpot sync failed (analyze) [completed] lead', leadId, ':', hsErr);
        await supabase.from('leads').update({ hubspot_synced: false, hubspot_error: `[completed] ${hsErr}`, hubspot_payload: props }).eq('id', leadId);
      }
    } catch (e) {
      console.error('HubSpot request failed (analyze) [completed] lead', leadId, ':', e.message);
      await supabase.from('leads').update({ hubspot_synced: false, hubspot_error: `[completed] ${e.message || String(e)}` }).eq('id', leadId);
    }
  }

  return leadId;
}

// Registra uma falha crítica de forma PERSISTENTE (não só console.error) —
// os logs do EasyPanel são efêmeros e não guardam histórico entre restarts.
async function logSystemError(context, email, err) {
  try {
    await supabase.from('system_errors').insert({
      context, email: email || null, message: String((err && err.message) || err),
    });
  } catch (_) { /* nunca deixa o log de erro derrubar o fluxo principal */ }
}

// Tenta persistir a conclusão com 2 novas tentativas (cobre falhas
// transitórias de rede/Supabase). Se todas falharem, garante uma gravação
// MÍNIMA (só os dados brutos) para nunca perder o lead por completo — mesmo
// que a gravação "rica" (merge de profile, HubSpot, PDF) não tenha rodado.
async function persistCompletionSafe({ nome, email, phone, profile, utm, analysis }, context) {
  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return await persistCompletion({ nome, email, phone, profile, utm, analysis });
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  console.error(`${context} falhou após 3 tentativas, aplicando gravação mínima:`, email, lastErr);
  try {
    const { error: recErr } = await supabase.from('leads').insert({
      nome, email, phone,
      profile: { ...(profile || {}), ai_analysis: analysis, _completo: true, _recovery: true },
      completo: true,
      completed_at: new Date().toISOString(),
      hubspot_synced: false,
    });
    if (recErr) lastErr = recErr;
  } catch (e2) {
    lastErr = e2;
  }
  await logSystemError(context, email, lastErr);
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
      await persistCompletionSafe({ nome, email, phone, profile, utm, analysis }, 'persistCompletion (sucesso IA)');
    }

    // 3. Retorna análise completa para o frontend
    return res.json(analysis);

  } catch (err) {
    console.error('Analyze error:', err);

    // IA indisponível: AINDA ASSIM persiste a conclusão com os scores locais.
    // Isso evita "leads fantasma" (jornada completa registrada como parcial).
    if (email) {
      const fallback = buildLocalFallback(localScores, vistos, visto);
      await persistCompletionSafe({ nome, email, phone, profile, utm, analysis: fallback }, 'persistCompletion (fallback IA)');
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
  const { email, nome, visto, score, aprovacao_pct, classificacao, diagnostico } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

  try {
    const { sendAnalysisReport } = require('../services/mailer');
    // Fonte única: usa o diagnóstico completo quando enviado; senão, reconstrói
    // um objeto mínimo a partir dos campos planos (compatibilidade retroativa).
    const diag = (diagnostico && typeof diagnostico === 'object')
      ? diagnostico
      : { visto, score, aprovacao_pct, classificacao };
    diag.aprovacao_pct = diag.aprovacao_pct ?? diag.score ?? aprovacao_pct ?? score ?? 0;
    diag.visto = diag.visto || visto || '—';
    diag.classificacao = diag.classificacao || classificacao || '';
    await sendAnalysisReport(email, nome || 'Usuário', diag);
    console.log('Report email sent to:', email, 'visto:', diag.visto, 'pct:', diag.aprovacao_pct);
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
