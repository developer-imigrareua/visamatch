const express = require('express');
const supabase = require('../lib/supabase');
const { buildHubSpotProperties, upsertContact, createNote } = require('../services/hubspot');
const router = express.Router();

const HUBSPOT_ENABLED = true;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// POST /lead/partial — salva progresso parcial (sem completar o fluxo)
router.post('/partial', async (req, res) => {
  const { nome, email, phone, etapa, visto, profile, utm } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

  try {
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
        profile: { ...profile, _etapa_abandono: etapa, _completo: false, _utm: utm || undefined }
      }).eq('id', existing.id);
      return res.json({ success: true, lead_id: existing.id, updated: true });
    }

    const { data, error } = await supabase.from('leads').insert({
      nome, email, phone,
      visto_recomendado: visto,
      score: null,
      profile: { ...profile, _etapa_abandono: etapa, _completo: false, _utm: utm || undefined },
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
  const { nome, email, phone, visto, score, profile, utm } = req.body;

  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

  // 1. Salvar no Supabase
  const { data: savedLead, error: dbError } = await supabase
    .from('leads')
    .insert({
      nome,
      email,
      phone,
      visto_recomendado: visto,
      score,
      profile: { ...profile, _utm: utm || undefined },
      hubspot_synced: false
    })
    .select()
    .single();

  if (dbError) {
    console.error('Supabase insert error:', dbError);
    return res.status(500).json({ error: 'Erro ao salvar lead.' });
  }

  // 2. Envio ao HubSpot
  let hubspotId = null;

  if (HUBSPOT_ENABLED && HUBSPOT_TOKEN) {
    try {
      const properties = buildHubSpotProperties(nome, email, phone, visto, score, profile, utm);
      const { hubspotId: hsId, error: hsErr } = await upsertContact(HUBSPOT_TOKEN, properties);

      if (hsId) {
        hubspotId = hsId;
        await supabase.from('leads')
          .update({ hubspot_synced: true, hubspot_contact_id: String(hsId), hubspot_error: null })
          .eq('id', savedLead.id);
        const noteBody = [`✅ Preencheu VisaMatch`, `Visto: ${visto || '—'}`, `Score: ${score ?? '—'}`, `Caminho: ${profile?.caminho || '—'}`].join('\n');
        await createNote(HUBSPOT_TOKEN, hsId, noteBody);
      } else {
        console.error('HubSpot sync failed:', hsErr);
        await supabase.from('leads')
          .update({ hubspot_error: hsErr, hubspot_payload: properties })
          .eq('id', savedLead.id);
      }
    } catch (err) {
      console.error('HubSpot request failed:', err);
      await supabase.from('leads').update({ hubspot_error: err.message || String(err) }).eq('id', savedLead.id);
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
