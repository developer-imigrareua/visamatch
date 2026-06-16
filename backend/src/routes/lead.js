const express = require('express');
const supabase = require('../lib/supabase');
const { buildHubSpotProperties, upsertContact, createNote } = require('../services/hubspot');
const router = express.Router();

const HUBSPOT_ENABLED = true;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const META_PIXEL_ID = '2271864576391085';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || 'EAAOsTrUDzD8BRrH0kp6BW2ydyPRVDCXmRZArpF0dz9qqsYU68jx2nJZAsVjxSmhgZC0fo6M3N6XSvzFYSf05WsvehRBMGqzYXke2EyiNfw1LHG6sHJPnsW7ACg2ajRZCLjjZCch2KtIYisRuzk4nWY8ZBiXZBGgDx5vB6BwTa8ZBlMmOxXKDGjCQ5rfmZC5c37gZDZD';

async function sendMetaCAPI(email, visto, score, eventSourceUrl) {
  const crypto = require('crypto');
  const hashedEmail = crypto.createHash('sha256').update((email || '').trim().toLowerCase()).digest('hex');
  const body = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: eventSourceUrl || 'https://match.imigrareua.com',
      action_source: 'website',
      user_data: { em: [hashedEmail] },
      custom_data: { visto, score, currency: 'BRL' }
    }]
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) console.warn('Meta CAPI error:', r.status, await r.text());
  } catch (e) {
    console.warn('Meta CAPI request failed:', e.message);
  }
}

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

    // Envia/atualiza contato no HubSpot como staged (parcial)
    if (HUBSPOT_ENABLED && HUBSPOT_TOKEN && email) {
      try {
        const partialProps = buildHubSpotProperties(nome, email, phone, null, null, profile, utm, 'staged');
        await upsertContact(HUBSPOT_TOKEN, partialProps);
      } catch (e) {
        console.warn('HubSpot partial sync error:', e.message);
      }
    }

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

  // 2. Meta Conversions API (server-side, fire-and-forget)
  sendMetaCAPI(email, visto, score, req.headers?.referer);

  // 3. Envio ao HubSpot
  let hubspotId = null;

  if (HUBSPOT_ENABLED && HUBSPOT_TOKEN) {
    try {
      const properties = buildHubSpotProperties(nome, email, phone, visto, score, profile, utm, 'completed');
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
