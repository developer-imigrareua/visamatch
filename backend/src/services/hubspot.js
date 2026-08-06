const fetch = require('node-fetch');

// Normaliza para comparação: minúsculas e sem acentos. Evita que uma
// diferença de caixa/acento derrube o campo silenciosamente (era o caso de
// 'Sem Formação Superior' vs a checagem por 'Sem formação').
function norm(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// → first_immigration_path ([LIV] Declared Immigration Path).
// Recebe o caminho MAIS ESPECÍFICO que a pessoa declarou: `perfilProfissional`
// (2º nível) quando existe, senão `caminhoPrincipal` (1º nível).
// Antes esta função recebia só o 1º nível, cujos valores ('Através do meu
// perfil profissional', 'Não tenho certeza') não casavam com nenhuma regra —
// então TODO lead de work visa era gravado como 'None of the above'.
function mapCaminho(v) {
  const s = norm(v);
  if (!s) return '';
  // 2º nível (perfilProfissional)
  if (s.includes('abertura de uma empresa')) return 'Investor Visa';
  if (s.includes('alguma empresa nos eua') || s.includes('empresa que atua')) return 'Work Visa';
  if (s.includes('profissao') || s.includes('formacao academica')) return 'Green Card EB';
  // 1º nível (caminhoPrincipal)
  if (s.includes('familiares')) return 'Green Card Family-Based';
  if (s.includes('investimento')) return 'Investor Visa';
  return 'None of the above';
}

function mapGrau(v) {
  const s = norm(v);
  if (!s) return '';
  // Valores EXATOS das opções do select nonimmigrant_visas__level_of_education
  if (s.includes('doutorado')) return 'PhD / Doutorado';
  if (s.includes('mestrado')) return 'Master’s degree / Mestrado';
  if (s.includes('bacharelado') || s.includes('licenciatura')) return 'Bachelor’s degree / Graduação';
  if (s.includes('tecnologo')) return "Associate's Degree / Tecnólogo";
  if (s.includes('incompleto')) return 'Outros';
  if (s.includes('nao tenho') || s.includes('sem formacao') || s.includes('ensino medio')) return 'No degree / Não tenho graduação';
  return '';
}

// ── Bloco EMPRESA / INVESTIMENTO (caminhos E-2 / L-1 / O-1) ──
// Estes campos existiam no VisaMatch mas NÃO tinham mapeamento nenhum aqui,
// então nunca chegavam ao HubSpot. As opções de destino foram conferidas
// contra as enumerações reais das propriedades.

// numFunc → nonimmigrant__quantos_funcionarios_formais_tem_a_empresa_
// Opções no HubSpot: 'Menos que 5' / 'Entre 5 e 10' / 'Entre 11 a 20' / 'Mais do que 21'
function mapNumFunc(v) {
  const s = norm(v);
  if (!s) return '';
  if (s.includes('menos de 5')) return 'Menos que 5 funcionários';
  if (s.includes('5 e 10')) return 'Entre 5 e 10 funcionários';
  if (s.includes('11 e 50')) return 'Entre 11 a 20 funcionários';  // faixa do chat é mais larga
  if (s.includes('mais de 50')) return 'Mais do que 21 funcionários';
  return '';
}

// faturamento → nonimmigrant_visas__qual_a_faixa_de_faturamento_anual_da_empresa__l_1
// As 4 faixas do chat correspondem 1:1 às 4 opções do HubSpot.
function mapFaturamento(v) {
  const s = norm(v);
  if (!s) return '';
  if (s.includes('menos de r$ 1') || s.includes('menos de 1')) return 'Menos que 1 milhão de reais/ano';
  if (s.includes('1 e 2')) return 'Entre 1 milhão e 2 milhões de reais/ano';
  if (s.includes('2 e 5')) return 'Entre 2 e 5 milhões de reais/ano';
  if (s.includes('acima de r$ 5') || s.includes('acima de 5')) return 'Acima de 5 milhões de reais/ano';
  return '';
}

// posicao → nonimmigrant__qual_a_sua_posicao_atual_na_empresa_
// As 4 opções do chat são idênticas às do HubSpot; valida antes de enviar
// para nunca mandar uma opção inexistente (seria descartada em silêncio).
const POSICOES_HS = ['Fundador / Empreendedor', 'Sócio / Acionista', 'Executivo / Gerente', 'Funcionário com Conhecimento Especializado'];
function mapPosicao(v) {
  return POSICOES_HS.includes(v) ? v : '';
}

// avaliacaoComplementarE2 → nonimmigrant__gostaria_de_continuar_preenchendo_
// Opções no HubSpot (com ponto final): 'Sim, quero uma avaliação completa.' /
// 'Não, quero encerrar por aqui.'
function mapGateComplementar(v) {
  const s = norm(v);
  if (!s) return '';
  return s.startsWith('sim') ? 'Sim, quero uma avaliação completa.' : 'Não, quero encerrar por aqui.';
}

// l1Contexto → l1__new_office_transfer_ (Yes/No)
// 'expansao' = abrir nova operação nos EUA; 'transferencia' = mover-se dentro
// de uma estrutura que já existe.
function mapL1Contexto(v) {
  if (v === 'expansao') return 'Yes';
  if (v === 'transferencia') return 'No';
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
  // Opções EXATAS do checkbox nonimmigrant__onde_voce_mora_atualmente_:
  // value "true"=Brasil, "false"=Estados Unidos, "Outro"=outro país.
  if (v.includes('Brasil')) return 'true';
  if (v.includes('Estados Unidos') || v.includes('EUA')) return 'false';
  return 'Outro';
}

// when_do_you_plan_to_start... (checkbox): Immediately / In the next 6 months /
// In the next 12 months / Not sure yet. As opções do chat são por semestre,
// então o encaixe é aproximado (2+ anos cai em "Not sure yet").
function mapPrazoMudanca(v) {
  if (!v) return '';
  if (/n[ãa]o sei/i.test(v)) return 'Not sure yet';
  const ano = new Date().getFullYear();
  if (v.includes(String(ano)))     return 'In the next 6 months';   // "ainda este ano"
  if (v.includes(String(ano + 1))) return 'In the next 12 months';  // próximo ano
  return 'Not sure yet';                                            // 2+ anos: sem bucket exato
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

// Datas são propriedades de texto no HubSpot → envia a string como está.
// "atual"/"current" (emprego em andamento) → sem data de saída.
function mapData(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/atual|current|presente|em andamento/i.test(s)) return '';
  return s;
}

// Data de saída da empresa: se o emprego é o atual ("atual"), envia "Present"
// em vez de deixar o campo vazio no HubSpot.
function mapLeaveDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/atual|current|presente|em andamento/i.test(s)) return 'Present';
  return s;
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

// Status do funil aceitos (fonte única). Nunca enviar vazio/nulo/ausente.
const RESPONSE_TYPES = ['staged', 'completed'];

function buildHubSpotProperties(nome, email, phone, visto, score, profile, utm, responseType) {
  // Interrompe o envio quando o status não é determinável — não usa fallback vazio
  // nem default 'completed'. O chamador deve registrar o erro e reprocessar.
  if (!RESPONSE_TYPES.includes(responseType)) {
    throw new Error(`visamatch_response_type inválido: "${responseType}" (esperado: staged | completed)`);
  }
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

    // Usa o caminho MAIS ESPECÍFICO: perfilProfissional é a resposta de 2º
    // nível (profissão / empresa nos EUA / abertura de empresa) e é a que
    // distingue Work Visa de Investor Visa. caminhoPrincipal é o fallback.
    first_immigration_path: mapCaminho(p.perfilProfissional) || mapCaminho(p.caminhoPrincipal),

    nonimmigrant_visas__level_of_education: mapGrau(p.grauFormacao || p.grauFormacaoDiag),
    nonimmigrant__ha_quanto_tempo_voce_atua_na_sua_area_de_formacao_: mapTempoExp(p.tempoExp),

    nonimmigrant__onde_voce_mora_atualmente_: mapLocalMora(p.localMora),
    monthly_income: mapRenda(p.renda),

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

    nonimmigrant__evidencia_do_seu_desempenho_de_um_papel_importante_ou_critico_em_organizacoes_distint: p.eb1_lideranca || p.o1_lideranca || '',
    comprovante_de_recebimento_de_salario: p.eb1_salario || p.o1_salario || '',
    nonimmigrant__premios_ou_reconhecimentos_de_destaque: p.eb1_premios || p.o1_premios || '',
    nonimmigrant__participacao_em_associacoes_que_exigem_realizacoes_extraordinarias: p.eb1_assoc || p.o1_assoc || '',
    nonimmigrant__provas_de_que_voce_foi_solicitado_para_avaliar_o_trabalho_de_outras_pessoas: p.eb1_avaliador || p.o1_avaliador || '',


    // Data de nascimento (idade já vai em visamatch_age)
    date_of_birth: p.dataNasc || '',

    // Cidadania de país com tratado. A chave real gravada pelo chat é
    // `tratado` (ou `tratadoDiag` no fluxo de diagnóstico) — antes lia-se
    // `tratadoCidadania`, que não existe no profile, então nunca era enviado.
    liv__e_2_treaty_country_citizenship_: mapSimNao(p.tratado || p.tratadoDiag || p.tratadoCidadania),
    nonimmigrant__voce_possui_cidadania: (p.tratado || p.tratadoDiag || '') === 'Sim' ? 'Sim'
                                       : (p.tratado || p.tratadoDiag) ? 'Não' : '',

    // ── Bloco EMPRESA / INVESTIMENTO (E-2 / L-1 / O-1) ──
    // Respostas que o chat já coletava e que não tinham destino nenhum aqui.
    nonimmigrant__quantos_funcionarios_formais_tem_a_empresa_: mapNumFunc(p.numFunc),
    nonimmigrant_visas__qual_a_faixa_de_faturamento_anual_da_empresa__l_1: mapFaturamento(p.faturamento),
    nonimmigrant__qual_a_sua_posicao_atual_na_empresa_: mapPosicao(p.posicao),
    l1__new_office_transfer_: mapL1Contexto(p.l1Contexto),
    // Propriedades de texto livre no HubSpot: envia a resposta literal, sem
    // encaixar em faixas que não correspondem às do chat (evita perda).
    e2_investment_range: p.investimento || '',
    e2_business_stage:   p.tipoNegocio  || '',

    // Gate de avaliação complementar (quem já respondeu E-2 e aceitou seguir
    // para L-1/O-1). Texto livre + a versão enumerada, que é filtrável.
    nonimmigrant__want_to_follow_other_visas: p.avaliacaoComplementarE2 || '',
    nonimmigrant__gostaria_de_continuar_preenchendo_: mapGateComplementar(p.avaliacaoComplementarE2),

    // Experiência profissional — empresa atual (1ª).
    // Nos caminhos de work visa a empresa vem em `nomeEmpresa` (a própria
    // empresa da pessoa), não em `emp1Nome` (histórico profissional).
    company:  p.emp1Nome  || p.nomeEmpresa || '',
    industry: p.emp1Ramo  || '',
    jobtitle: p.emp1Cargo || p.profissao || '',
    company_start_date: mapData(p.emp1Entrada),
    company_leave_date: mapLeaveDate(p.emp1Saida),

    // 2ª empresa (Previous Company #1)
    previous_company__1:                p.emp2Nome  || '',
    previous_company_industry:          p.emp2Ramo  || '',
    job_title_at_previous_company:      p.emp2Cargo || '',
    start_date__previous_company__1:    mapData(p.emp2Entrada),
    leave_date__previous_company__1:    mapData(p.emp2Saida),

    // 3ª empresa (Previous Company #2)
    previous_company__2:                p.emp3Nome  || '',
    job_title__previous_company__2:     p.emp3Cargo || p.emp3Info || '',
    previous_company__2_industry:       p.emp3Ramo  || '',
    start_date__previous_company__2:    mapData(p.emp3Entrada),
    previous_company__2__leave_date:    mapData(p.emp3Saida),

    // Experiência adicional / texto livre
    nonimmigrant__descricao_da_formacao_academica_e_profissional: p.expNaoListada || '',

    // Formação acadêmica (1ª)
    degree:          p.grauFormacao || p.grauFormacaoDiag || '',
    school:          p.instAcad1 || '',
    field_of_study:  p.curso1    || '',
    graduation_status: p.acStatus1   ? (p.acStatus1.includes('conclu') ? 'Completed' : p.acStatus1) : '',
    graduation_date: p.acConclusao1  || '',
    education_start_date: mapData(p.acInicio1),

    // Formação acadêmica (2ª)
    school_2:           p.instAcad2 || '',
    field_of_study_2:   p.curso2    || '',
    graduation_2_status: p.acStatus2 ? (p.acStatus2.includes('conclu') ? 'Completed' : p.acStatus2) : '',
    graduation_date_2:  p.acConclusao2 || '',
    school_2_start_date: mapData(p.acInicio2),
    postgraduate_type_2: p.nivelAcad2 || '',

    // Prazo de mudança
    when_do_you_plan_to_start_your_immigration_process_: mapPrazoMudanca(p.prazoMudanca),

    // EB-1A / O-1 critérios adicionais — cada critério tem a SUA propriedade
    // "- Detailed". Antes, `o1_artes` e `o1_artigos` ficavam de fora das
    // cadeias (nunca chegavam) e `o1_midia` era gravado na propriedade
    // "- Resumed", que é preenchida por outro processo com S/N.
    nonimmigrant__comprovacoes_de_que_seu_trabalho_foi_exibido_em_exposicoes_ou_mostras_artisticas: p.eb1_exposicoes || p.o1_exposicoes || '',
    nonimmigrant__evidencias_de_suas_contribuicoes_originais_cientificas__academicas__artisticas__atlet: p.eb1_contrib || p.o1_contrib || '',
    nonimmigrant__evidencias_de_material_publicado_sobre_voce: p.eb1_midia || p.o1_midia || '',
    nonimmigrant__provas_de_sucessos_comerciais: p.eb1_artes || p.o1_artes || '',
    nonimmigrant__evidencia_de_sua_autoria_de_artigos_academicos_em_publicacoes_profissionais: p.eb1_artigos || p.o1_artigos || '',

    utm_source:       utm?.utm_source       || '',
    utm_medium:       utm?.utm_medium       || '',
    utm_campaign:     utm?.utm_campaign     || '',
    utm_content:      utm?.utm_content      || '',
    utm_term:         utm?.utm_term         || '',
    utm_affiliatetype: utm?.utm_affiliatetype || '',
    utm_affiliatename: utm?.utm_affiliatename || '',

    // Propriedade ÚNICA e OFICIAL do funil VisaMatch no HubSpot (staged|completed).
    // A antiga typeform_response_type NÃO é mais escrita pelo VisaMatch (pode ser
    // usada por outros fluxos — não a tocamos, apenas deixamos de participar dela).
    visamatch_response_type: responseType,
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
    // NUNCA remove silenciosamente a propriedade de status: se o HubSpot rejeitar
    // visamatch_response_type, isso é falha real (deixaria o funil em branco).
    // Retorna erro para registro e reprocessamento.
    const STATUS_PROPS = ['visamatch_response_type'];
    if (badFields.some(f => STATUS_PROPS.includes(f))) {
      return { ok: false, status: res.status, text, statusRejected: true };
    }
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

// Lê o status atual do funil VisaMatch do contato (para impedir regressões de estado).
// Considera EXCLUSIVAMENTE visamatch_response_type. A antiga typeform_response_type
// NÃO é consultada nem usada como fallback (pode conter valor legado de outro fluxo).
async function getContactResponseType(token, email) {
  try {
    const id = await resolveHubSpotId(token, email);
    if (!id) return { id: null, status: null };
    const r = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${id}?properties=visamatch_response_type`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!r.ok) return { id, status: null };
    const b = await r.json();
    const status = b.properties?.visamatch_response_type || null;
    return { id, status };
  } catch (e) {
    return { id: null, status: null };
  }
}

// Upsert idempotente COM regra de transição (sem status → staged → completed).
// Um evento 'staged' nunca rebaixa um contato já 'completed'.
// Obs.: o "Marketing contact status" NÃO é definível via API (hs_marketable_status
// é read-only e não há endpoint REST). A conversão em Marketing contact é feita
// pelo padrão por integração (Settings do Private App) e por workflow/import.
// Retorna { hubspotId, error, skipped }.
async function upsertContactStatus(token, properties, status) {
  if (!RESPONSE_TYPES.includes(status)) {
    return { error: `status inválido: "${status}"` };
  }
  if (status === 'staged') {
    const cur = await getContactResponseType(token, properties.email);
    if (cur.status === 'completed') {
      // Não regride: mantém o estado mais avançado.
      return { hubspotId: cur.id, skipped: true };
    }
  }
  return upsertContact(token, properties);
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

// Upload de arquivo para o HubSpot Files API → retorna fileId
async function uploadFile(token, buffer, filename) {
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: 'application/pdf' });
    form.append('folderPath', '/visamatch-relatorios');
    form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: true }));
    const r = await fetch('https://api.hubapi.com/files/v3/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, ...form.getHeaders() },
      body: form
    });
    if (!r.ok) { console.error('HubSpot file upload HTTP:', r.status, await r.text()); return null; }
    const data = await r.json();
    return data.id || null;
  } catch (e) {
    console.error('HubSpot file upload error:', e.message);
    return null;
  }
}

// Cria nota com anexo (hs_attachment_ids) associada ao contato
async function createNoteWithAttachment(token, hubspotId, body, fileId) {
  try {
    const props = { hs_note_body: body, hs_timestamp: new Date().toISOString() };
    if (fileId) props.hs_attachment_ids = String(fileId);
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: props,
        associations: [{
          to: { id: String(hubspotId) },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
        }]
      })
    });
    if (!r.ok) { console.error('HubSpot note+attachment HTTP:', r.status, await r.text()); return false; }
    return true;
  } catch (e) {
    console.error('HubSpot note+attachment error:', e.message);
    return false;
  }
}

module.exports = { buildHubSpotProperties, upsertContact, upsertContactStatus, getContactResponseType, createNote, resolveHubSpotId, uploadFile, createNoteWithAttachment, RESPONSE_TYPES };
