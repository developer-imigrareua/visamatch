const fetch = require('node-fetch');

function mapCaminho(v) {
  if (!v) return '';
  if (v.includes('profissão') || v.includes('formação acadêmica')) return 'Green Card EB';
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
  if (v.includes('Superior incompleto') || v.includes('incompleto')) return 'Outros';
  if (v.includes('Não tenho') || v.includes('não tenho')) return 'No degree / Não tenho graduação';
  return '';
}

function mapTempoExp(v) {
  if (!v) return '';
  // Exact frontend options: 'Menos de 3 anos (recém-formado)', 'Entre 3 e 5 anos', 'Entre 5 e 10 anos', 'Mais de 10 anos'
  if (v.includes('recém-formado') || v.includes('3 e 5') || v.includes('Menos de 3')) return 'Menos de 5 anos';
  if (v.includes('5 e 10') || v.includes('Mais de 10')) return 'Entre 5 e 15 anos';
  return '';
}

function mapPrazoGC(v) {
  if (!v) return '';
  // Exact frontend options: 'Estou disposto a aguardar o tempo necessário', 'Mais de 2 anos — mas quero planejar', 'Preciso estar nos EUA em menos de 2 anos'
  if (v.includes('aguardar o tempo') || v.includes('necessário')) return 'I can wait as long as necessary';
  if (v.includes('Mais de 2 anos')) return 'More than 2 years';
  if (v.includes('menos de 2 anos') || v.includes('Preciso estar')) return '6 months to 2 years';
  return '';
}

function mapFundos(v) {
  if (!v) return '';
  // Exact frontend options: 'Sim, tenho os fundos', 'Sim, mas prefiro parcelar', 'Talvez, preciso entender melhor', 'Não tenho disponibilidade'
  if (v.includes('tenho os fundos')) return 'Yes, I have the funds';
  if (v.includes('parcelar')) return 'Yes, but I need it to be in installments';
  if (v.includes('preciso entender') || v.includes('Talvez')) return 'Maybe, I need to understand it better.';
  if (v.includes('Não tenho disponibilidade') || v.includes('disponibilidade')) return 'No, I do not have the funds';
  return '';
}

function mapLocalMora(v) {
  if (!v) return '';
  // Exact frontend options: 'Brasil 🇧🇷', 'Estados Unidos 🇺🇸', 'Outro país 🌍'
  if (v.includes('Brasil')) return 'Brasil';
  if (v.includes('Estados Unidos') || v.includes('EUA')) return 'Estados Unidos';
  return 'Outro';
}

function mapRenda(v) {
  if (!v) return '';
  // Exact frontend options: 'Até R$ 5.000', 'R$ 5.001 a R$ 10.000', 'R$ 10.001 a R$ 20.000', 'R$ 20.001 a R$ 50.000', 'Acima de R$ 50.000'
  // NOTE: check 'Acima' BEFORE '50.000' to avoid 'Acima de R$ 50.000' matching the wrong bucket
  if (v.includes('Acima') || v.includes('acima')) return 'More than 50k';
  if (v.includes('Até') || (v.includes('5.000') && !v.includes('50.000'))) return 'Less than 5k';
  if (v.includes('10.000') && !v.includes('50.000')) return 'Between 5k and 10k';
  if (v.includes('20.000')) return 'Between 10k and 20k';
  if (v.includes('50.000')) return 'Between 20k and 50k';
  return '';
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
  // Exact frontend options: 'Sim, legalmente', 'Sim, mas fiquei fora de status...', 'Sim, entrei sem inspeção...', 'Não, nunca estive nos EUA'
  if (v.includes('legalmente')) return 'Yes, legally';
  if (v.includes('fora de status')) return 'Yes, out of status';
  if (v.includes('sem inspeção')) return 'Yes, no inspection';
  if (v.includes('nunca') || v.includes('Não,')) return 'Never';
  return '';
}

function mapAreaFormacao(v) {
  if (!v) return '';
  // Exact frontend options: 'Sim, atuo na minha área de formação', 'Não, atuo em uma área diferente', 'Parcialmente'
  if (v.includes('Parcial') || v.includes('parcial')) return 'Partial';
  if (v.includes('Sim')) return 'Yes';
  if (v.includes('Não') || v.includes('diferente')) return 'No';
  return '';
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

  const niwScore = visto === 'EB-2 NIW' ? score : null;
  const eb1Score = (visto === 'EB-1A' || visto === 'O-1') ? score : null;
  const e2Score  = visto === 'E-2' ? score : null;

  const props = {
    email,
    firstname,
    lastname,
    phone: phone || '',
    visamatch_age: p.idade ? Number(p.idade) : undefined,

    first_immigration_path: mapCaminho(p.caminhoPrincipal),

    nonimmigrant_visas__level_of_education: mapGrau(p.grauFormacao),
    nonimmigrant__ha_quanto_tempo_voce_atua_na_sua_area_de_formacao_: mapTempoExp(p.tempoExp),

    jobtitle: p.profissao || '',
    nonimmigrant__onde_voce_mora_atualmente_: mapLocalMora(p.localMora),
    monthly_income: mapRenda(p.renda),
    is_married: mapSimNao(p.casado),
    has_children: mapSimNao(p.filhos),
    dependents_applying_for_visa: mapDependentes(p.conjugeVisto),

    has_applied_for_us_visa: mapSimNao(p.solicitouVisto),
    nonimmigrant__voce_ja_teve_algum_visto_negado_: p.vistoNegado || '',
    us_presence_history: mapHistoricoEUA(p.historicoPermanenciaEUA),

    gc_eb_timing: mapPrazoGC(p.prazoGC),
    available_funds_for_green_card_: mapFundos(p.fundos),

    professional_area_matches_degree: mapAreaFormacao(p.areaAtuacaoFormacao),

    have_you_led_impactful_projects_: mapSimNaoBool(p.temProjetos),
    additional_information_about_impactful_projects: p.projetosDesc || '',

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

    nonimmigrant__evidencias_de_material_publicado_sobre_voce: p.eb1_midia || p.o1_midia || '',
    nonimmigrant__comprovacoes_de_que_seu_trabalho_foi_exibido_em_exposicoes_ou_mostras_artisticas: p.eb1_exposicoes || p.o1_exposicoes || '',
    nonimmigrant__evidencia_do_seu_desempenho_de_um_papel_importante_ou_critico_em_organizacoes_distint: p.eb1_lideranca || p.o1_lideranca || '',
    comprovante_de_recebimento_de_salario: p.eb1_salario || p.o1_salario || '',
    nonimmigrant__premios_ou_reconhecimentos_de_destaque: p.eb1_premios || p.o1_premios || '',
    nonimmigrant__participacao_em_associacoes_que_exigem_realizacoes_extraordinarias: p.eb1_assoc || p.o1_assoc || '',
    nonimmigrant__provas_de_que_voce_foi_solicitado_para_avaliar_o_trabalho_de_outras_pessoas: p.eb1_avaliador || p.o1_avaliador || '',
    nonimmigrant__evidencias_de_suas_contribuicoes_originais_cientificas__academicas__artisticas__atlet: p.eb1_contrib || p.o1_contrib || '',


    utm_source:       utm?.utm_source       || '',
    utm_medium:       utm?.utm_medium       || '',
    utm_campaign:     utm?.utm_campaign     || '',
    utm_content:      utm?.utm_content      || '',
    utm_term:         utm?.utm_term         || '',
    utm_affiliatetype: utm?.utm_affiliatetype || '',
    utm_affiliatename: utm?.utm_affiliatename || '',
  };

  return Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== undefined && v !== '')
  );
}

// Resolve ID de contato HubSpot por email (primário ou alias)
async function resolveHubSpotId(token, email) {
  const r1 = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (r1.ok) return (await r1.json()).id;

  const r2 = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: 'email', operator: 'EQ', value: email }] },
        { filters: [{ propertyName: 'hs_additional_emails', operator: 'CONTAINS_TOKEN', value: email }] }
      ],
      properties: ['email', 'hs_additional_emails'],
      limit: 1
    })
  });
  if (r2.ok) {
    const body = await r2.json();
    if (body.results?.length) return body.results[0].id;
  }
  return null;
}

async function _doRequest(token, method, url, properties) {
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties })
  });
  if (res.ok) return { ok: true, body: await res.json() };
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (_) {}
  // Strip read-only or invalid-option fields and retry once
  if (res.status === 400 && parsed?.errors?.length) {
    const badFields = parsed.errors
      .filter(e => e.code === 'INVALID_OPTION' || e.code === 'READ_ONLY_VALUE')
      .map(e => e.context?.propertyName?.[0]).filter(Boolean);
    if (badFields.length) {
      const stripped = Object.fromEntries(Object.entries(properties).filter(([k]) => !badFields.includes(k)));
      console.warn('HubSpot: retrying without invalid fields:', badFields);
      const res2 = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: stripped })
      });
      if (res2.ok) return { ok: true, body: await res2.json() };
      return { ok: false, status: res2.status, text: await res2.text() };
    }
  }
  return { ok: false, status: res.status, text };
}

// Upsert contato + retorna { hubspotId, error }
async function upsertContact(token, properties) {
  const postResult = await _doRequest(token, 'POST', 'https://api.hubapi.com/crm/v3/objects/contacts', properties);

  if (postResult.ok) return { hubspotId: postResult.body.id };

  if (postResult.status === 409) {
    let conflict = null;
    try { conflict = JSON.parse(postResult.text); } catch (_) {}
    const inlineId = conflict?.message?.match(/ID:\s*(\d+)/i)?.[1]
      || (conflict?.error === 'CONTACT_EXISTS' ? conflict?.identityProfile?.vid : null);
    const resolvedId = inlineId || await resolveHubSpotId(token, properties.email);

    if (!resolvedId) {
      return { error: `409 + contato não localizado via search. Conflict: ${postResult.text}` };
    }

    const patchResult = await _doRequest(token, 'PATCH', `https://api.hubapi.com/crm/v3/objects/contacts/${resolvedId}`, properties);
    if (patchResult.ok) return { hubspotId: resolvedId };
    return { error: `PATCH ${resolvedId} HTTP ${patchResult.status}: ${patchResult.text}` };
  }

  return { error: `HTTP ${postResult.status}: ${postResult.text}` };
}

// Cria Note associada ao contato (não lança exceção se falhar)
async function createNote(token, hubspotId, body) {
  try {
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
        associations: [{
          to: { id: String(hubspotId) },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
        }]
      })
    });
    if (!r.ok) console.error('HubSpot note HTTP:', r.status, await r.text());
  } catch (e) {
    console.error('HubSpot note error:', e.message);
  }
}

module.exports = { buildHubSpotProperties, upsertContact, createNote, resolveHubSpotId };
