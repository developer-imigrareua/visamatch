const express = require('express');
const fetch = require('node-fetch');
const supabase = require('../lib/supabase');
const router = express.Router();

const HUBSPOT_ENABLED = true;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// ── Mapeamento de valores PT → HubSpot ──────────────────────────────────────

function mapCaminho(v) {
  if (!v) return '';
  if (v.includes('profissão')) return 'Green Card EB';
  if (v.includes('familiares')) return 'Green Card Family-Based';
  if (v.includes('empresa que atua')) return 'Work Visa';
  if (v.includes('investimento')) return 'Investor Visa';
  return 'None of the above';
}

function mapGrau(v) {
  if (!v) return '';
  if (v.includes('Doutorado')) return 'PhD / Doutorado';
  if (v.includes('Mestrado')) return "Master's degree / Mestrado";
  if (v.includes('Bacharelado') || v.includes('Licenciatura')) return "Bachelor's degree / Graduação";
  if (v.includes('Tecnólogo')) return "Associate's Degree / Tecnólogo";
  if (v.includes('Superior incompleto')) return 'Outros';
  return 'No degree / Não tenho graduação';
}

function mapTempoExp(v) {
  if (!v) return '';
  if (v.includes('recém-formado') || v.includes('3 e 5')) return 'Menos de 5 anos';
  if (v.includes('5 e 10')) return 'Entre 5 e 15 anos';
  if (v.includes('Mais de 10')) return 'Entre 5 e 15 anos';
  return 'Menos de 5 anos';
}

function mapPrazoGC(v) {
  if (!v) return '';
  if (v.includes('aguardar o tempo')) return 'I can wait as long as necessary';
  if (v.includes('Mais de 2 anos')) return 'More than 2 years';
  return '6 months to 2 years';
}

function mapFundos(v) {
  if (!v) return '';
  if (v.includes('tenho os fundos')) return 'Yes, I have the funds';
  if (v.includes('parcelar')) return 'Yes, but I need it to be in installments';
  if (v.includes('preciso entender')) return 'Maybe, I need to understand it better.';
  return 'No, I do not have the funds';
}

function mapLocalMora(v) {
  if (!v) return '';
  if (v.toLowerCase().includes('brasil')) return 'true';
  if (v.toLowerCase().includes('estados unidos') || v.toLowerCase().includes('eua')) return 'false';
  return 'Outro';
}

function mapRenda(v) {
  if (!v) return '';
  if (v.includes('5.000') || v.includes('Até')) return 'Less than 5k';
  if (v.includes('10.000')) return 'Between 5k and 10k';
  if (v.includes('20.000')) return 'Between 10k and 20k';
  if (v.includes('50.000')) return 'Between 20k and 50k';
  return 'More than 50k';
}

function mapSimNao(v) {
  if (!v) return '';
  return v === 'Sim' ? 'Yes' : 'No';
}

function mapSimNaoBool(v) {
  if (!v) return '';
  return v === 'Sim' ? 'true' : 'false';
}

function mapDependentes(v) {
  if (!v) return '';
  if (v === 'Sim') return 'Yes';
  if (v === 'Não se aplica') return 'Not Applicable';
  return 'No';
}

function mapHistoricoEUA(v) {
  if (!v) return '';
  if (v.includes('legalmente')) return 'Yes, legally';
  if (v.includes('fora de status')) return 'Yes, out of status';
  if (v.includes('sem inspeção')) return 'Yes, no inspection';
  return 'Never';
}

function mapAreaFormacao(v) {
  if (!v) return '';
  if (v.includes('Sim')) return 'Yes';
  if (v.includes('Parcial')) return 'Partial';
  return 'No';
}

function mapScoreThreshold(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

function mapHabCriteria(p) {
  const criMap = {
    hab_diploma: 'You have an official academic record showing that you have a diploma, certificate, or similar award from a college, university, school, or other educational institution related to your area of exceptional ability.',
    hab_10anos: 'You can provide letters documenting at least 10 years of full-time experience in your occupation.',
    hab_licenca: 'You have a license to practice your profession or a certification for your profession or occupation.',
    hab_salario: 'You have evidence that you have received a salary or other remuneration for services that demonstrate your exceptional ability.',
    hab_associacao: 'You have membership in professional associations.',
    hab_reconhecimento: 'You have received recognition for your achievements and significant contributions to your industry or field by your peers, governmental entities, professional or business organizations.',
  };
  return Object.entries(criMap)
    .filter(([k]) => p[k])
    .map(([, v]) => v)
    .join(';');
}

function buildHubSpotProperties(nome, email, phone, visto, score, profile, utm) {
  const p = profile || {};
  const nameParts = (nome || '').trim().split(' ');
  const firstname = nameParts[0] || '';
  const lastname = nameParts.slice(1).join(' ') || '';

  // Scores por visto
  const niwScore  = visto === 'EB-2 NIW' ? score : null;
  const eb1Score  = (visto === 'EB-1A' || visto === 'O-1') ? score : null;
  const e2Score   = visto === 'E-2' ? score : null;

  const props = {
    // ── Contato ──────────────────────────────────────────────────────────────
    email,
    firstname,
    lastname,
    phone: phone || '',
    date_of_birth: p.dataNasc || '',
    visamatch_age: p.idade ? Number(p.idade) : undefined,

    // ── Triagem ───────────────────────────────────────────────────────────────
    first_immigration_path: mapCaminho(p.caminhoPrincipal),

    // ── Formação ──────────────────────────────────────────────────────────────
    nonimmigrant_visas__level_of_education: mapGrau(p.grauFormacao),
    nonimmigrant__ha_quanto_tempo_voce_atua_na_sua_area_de_formacao_: mapTempoExp(p.tempoExp),

    // ── Perfil pessoal ────────────────────────────────────────────────────────
    jobtitle: p.profissao || '',
    nonimmigrant__onde_voce_mora_atualmente_: mapLocalMora(p.localMora),
    monthly_income: mapRenda(p.renda),
    is_married: mapSimNao(p.casado),
    has_children: mapSimNao(p.filhos),
    dependents_applying_for_visa: mapDependentes(p.conjugeVisto),

    // ── Histórico imigratório ─────────────────────────────────────────────────
    has_applied_for_us_visa: mapSimNao(p.solicitouVisto),
    nonimmigrant__voce_ja_teve_algum_visto_negado_: p.vistoNegado || '',
    us_presence_history: mapHistoricoEUA(p.historicoPermanenciaEUA),

    // ── Timing / financeiro ───────────────────────────────────────────────────
    gc_eb_timing: mapPrazoGC(p.prazoGC),
    available_funds_for_green_card_: mapFundos(p.fundos),

    // ── Área de formação ──────────────────────────────────────────────────────
    professional_area_matches_degree: mapAreaFormacao(p.areaAtuacaoFormacao),

    // ── Projetos impactantes ──────────────────────────────────────────────────
    have_you_led_impactful_projects_: mapSimNaoBool(p.temProjetos),
    additional_information_about_impactful_projects: p.projetosDesc || '',

    // ── NIW: 9 critérios ──────────────────────────────────────────────────────
    has_rec_letters_from_relevant_people_in_the_industry_: mapSimNaoBool(p.niw_cartas),
    has_certificates_for_giving_lectures_or_organizing_events_in_their_field_: mapSimNaoBool(p.niw_palestras),
    has_proof_of_participation_on_thesis_defense_panels_for_undergraduate__master_s__or_doctoral_progra: mapSimNaoBool(p.niw_bancas),
    has_proof_of_being_a_source_for_news_reports_: mapSimNaoBool(p.niw_reportagens),
    has_authored_articles_published_in_general_media_or_scientific_journals_: mapSimNaoBool(p.niw_artigos),
    has_participated_in_research_projects_in_their_field_: mapSimNaoBool(p.niw_pesquisa),
    has_any_proof_of_awards_and_recognitions_received_for_their_work_: mapSimNaoBool(p.niw_premios),
    has_certificates_from_courses_and_other_training_in_their_field_: mapSimNaoBool(p.niw_cursos),
    has_a_license_from_a_professional_council_or_certification_from_certifying_organizations_to_work_in: mapSimNaoBool(p.niw_licencas),
    which_criteria_do_they_think_they_meet_: mapHabCriteria(p),

    // ── EB-1A / O-1 critérios (string 'Sim'/'Não') ───────────────────────────
    nonimmigrant__evidencias_de_material_publicado_sobre_voce: p.eb1_midia || p.o1_midia || '',
    nonimmigrant__comprovacoes_de_que_seu_trabalho_foi_exibido_em_exposicoes_ou_mostras_artisticas: p.eb1_exposicoes || p.o1_exposicoes || '',
    nonimmigrant__evidencia_do_seu_desempenho_de_um_papel_importante_ou_critico_em_organizacoes_distint: p.eb1_lideranca || p.o1_lideranca || '',
    comprovante_de_recebimento_de_salario: p.eb1_salario || p.o1_salario || '',
    nonimmigrant__premios_ou_reconhecimentos_de_destaque: p.eb1_premios || p.o1_premios || '',
    nonimmigrant__participacao_em_associacoes_que_exigem_realizacoes_extraordinarias: p.eb1_assoc || p.o1_assoc || '',
    nonimmigrant__provas_de_que_voce_foi_solicitado_para_avaliar_o_trabalho_de_outras_pessoas: p.eb1_avaliador || p.o1_avaliador || '',
    nonimmigrant__evidencias_de_suas_contribuicoes_originais_cientificas__academicas__artisticas__atlet: p.eb1_contrib || p.o1_contrib || '',

    // ── Scores ────────────────────────────────────────────────────────────────
    ...(niwScore !== null ? {
      eb_2_niw_score: niwScore,
      eb_2_niw_score_threshold: mapScoreThreshold(niwScore),
    } : {}),
    ...(eb1Score !== null ? {
      eb_1_o_1_score: eb1Score,
      eb_1_o_1_score_threshold: mapScoreThreshold(eb1Score),
    } : {}),
    ...(e2Score !== null ? {
      e_2_score: e2Score,
      e_2_score_threshold: mapScoreThreshold(e2Score),
    } : {}),

    // ── UTMs ──────────────────────────────────────────────────────────────────
    utm_source: utm?.utm_source || '',
    utm_medium: utm?.utm_medium || '',
    utm_campaign: utm?.utm_campaign || '',
    utm_content: utm?.utm_content || '',
    utm_term: utm?.utm_term || '',
    utm_affiliatetype: utm?.utm_affiliatetype || '',
    utm_affiliatename: utm?.utm_affiliatename || '',
  };

  // Remove campos undefined ou string vazia para não sobrescrever dados existentes
  return Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== undefined && v !== '')
  );
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

      // Tenta criar contato; se já existe, atualiza por email
      const hsRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      if (hsRes.ok) {
        const hsData = await hsRes.json();
        hubspotId = hsData.id;
      } else if (hsRes.status === 409) {
        // Contato já existe — busca ID e atualiza
        const conflict = await hsRes.json();
        const existingId = conflict?.message?.match(/ID: (\d+)/)?.[1]
          || conflict?.error === 'CONTACT_EXISTS' && conflict?.identityProfile?.vid;

        if (existingId) {
          const upRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ properties })
          });
          if (upRes.ok) hubspotId = existingId;
          else console.error('HubSpot update error:', await upRes.text());
        } else {
          // Fallback: busca por email e atualiza
          const searchRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, {
            headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` }
          });
          if (searchRes.ok) {
            const found = await searchRes.json();
            hubspotId = found.id;
            await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${found.id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ properties })
            });
          }
        }
      } else {
        console.error('HubSpot error:', hsRes.status, await hsRes.text());
      }

      if (hubspotId) {
        await supabase
          .from('leads')
          .update({ hubspot_synced: true, hubspot_contact_id: String(hubspotId), hubspot_error: null })
          .eq('id', savedLead.id);

        // Cria atividade "Preencheu VisaMatch" no contato
        try {
          const noteBody = [
            `✅ Preencheu VisaMatch`,
            `Visto recomendado: ${visto || '—'}`,
            `Score: ${score != null ? score : '—'}`,
            `Caminho: ${profile?.caminho || '—'}`,
          ].join('\n');
          await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              properties: {
                hs_note_body: noteBody,
                hs_timestamp: new Date().toISOString()
              },
              associations: [{
                to: { id: String(hubspotId) },
                types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
              }]
            })
          });
        } catch (noteErr) {
          console.error('HubSpot note error:', noteErr.message);
        }
      } else {
        await supabase
          .from('leads')
          .update({ hubspot_error: 'Contato não criado/encontrado no HubSpot após tentativas' })
          .eq('id', savedLead.id);
      }
    } catch (err) {
      console.error('HubSpot request failed:', err);
      await supabase
        .from('leads')
        .update({ hubspot_error: err.message || String(err) })
        .eq('id', savedLead.id);
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
