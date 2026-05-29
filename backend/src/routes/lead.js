const express = require('express');
const fetch = require('node-fetch');
const supabase = require('../lib/supabase');
const router = express.Router();

// POST /lead/partial — salva progresso parcial (sem completar o fluxo)
router.post('/partial', async (req, res) => {
  const { nome, email, phone, etapa, visto, profile } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

  try {
    // Upsert por email — atualiza se já existe parcial
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('email', email)
      .eq('hubspot_synced', false)
      .is('score', null)
      .single();

    if (existing) {
      await supabase.from('leads').update({
        nome, phone,
        visto_recomendado: visto,
        profile: { ...profile, _etapa_abandono: etapa, _completo: false }
      }).eq('id', existing.id);
      return res.json({ success: true, lead_id: existing.id, updated: true });
    }

    const { data, error } = await supabase.from('leads').insert({
      nome, email, phone,
      visto_recomendado: visto,
      score: null,
      profile: { ...profile, _etapa_abandono: etapa, _completo: false },
      hubspot_synced: false
    }).select().single();

    if (error) throw error;
    res.json({ success: true, lead_id: data.id, updated: false });
  } catch (err) {
    console.error('Partial lead error:', err);
    res.status(500).json({ error: 'Erro ao salvar lead parcial.' });
  }
});

// POST /lead — salva lead completo
router.post('/', async (req, res) => {
  const { nome, email, phone, visto, score, profile } = req.body;

  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

  // 1. Salvar no Supabase primeiro (backup garantido)
  const { data: savedLead, error: dbError } = await supabase
    .from('leads')
    .insert({
      nome,
      email,
      phone,
      visto_recomendado: visto,
      score,
      profile,
      hubspot_synced: false
    })
    .select()
    .single();

  if (dbError) {
    console.error('Supabase insert error:', dbError);
    return res.status(500).json({ error: 'Erro ao salvar lead.' });
  }

  // 2. Envio ao HubSpot (desativado — ativar quando campos customizados estiverem criados)
  let hubspotId = null;
  const HUBSPOT_ENABLED = false;

  if (HUBSPOT_ENABLED) {
    try {
      const hsRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            email,
            firstname: nome?.split(' ')[0] || '',
            lastname: nome?.split(' ').slice(1).join(' ') || '',
            phone,
            visamatch_visto_recomendado: visto,
            visamatch_score: String(score),
            visamatch_grau_formacao: profile?.grauFormacao || '',
            visamatch_profissao: profile?.profissao || '',
            visamatch_caminho: profile?.caminhoPrincipal || '',
            visamatch_fundos: profile?.fundos || '',
            visamatch_planos_eua: profile?.planosEUA || '',
          }
        })
      });

      if (hsRes.ok) {
        const hsData = await hsRes.json();
        hubspotId = hsData.id;
        await supabase
          .from('leads')
          .update({ hubspot_synced: true, hubspot_contact_id: hubspotId })
          .eq('id', savedLead.id);
      } else {
        console.error('HubSpot error:', await hsRes.text());
      }
    } catch (err) {
      console.error('HubSpot request failed:', err);
    }
  }

  res.json({
    success: true,
    lead_id: savedLead.id,
    hubspot_synced: !!hubspotId,
    hubspot_contact_id: hubspotId
  });
});

module.exports = router;
