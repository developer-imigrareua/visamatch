#!/usr/bin/env node
/**
 * Guarda de regressão do mapeamento VisaMatch → HubSpot.
 *
 * POR QUE ISSO EXISTE
 * Leads dos caminhos E-2 / L-1 / O-1 chegaram ao HubSpot sem vários campos, e
 * ninguém percebeu: o lead ficava `hubspot_synced=true` e sem erro, porque as
 * respostas simplesmente não tinham destino no payload — ou eram enviadas com
 * um valor fora das opções da propriedade, e o HubSpot as descartava.
 *
 * O QUE ELE VERIFICA
 * 1. Toda opção que o chat pode gravar produz um valor NÃO VAZIO (nenhuma
 *    resposta some no caminho).
 * 2. Esse valor é uma das opções aceitas pela propriedade no HubSpot (para as
 *    propriedades do tipo enumeração) — senão seria descartado em silêncio.
 *
 * COMO RODAR      node backend/scripts/check-hubspot-mapping.js
 *
 * COMO ATUALIZAR as opções aceitas quando uma propriedade mudar no HubSpot:
 *   GET https://api.hubapi.com/crm/v3/properties/contacts/<nome_interno>
 * e cole os `options[].value` em OPCOES_HUBSPOT abaixo.
 */
const { buildHubSpotProperties } = require('../src/services/hubspot');

// ── Opções EXATAS que o chat grava no profile (frontend/index.html) ──
const OPCOES_CHAT = {
  perfilProfissional: [
    'Através da minha profissão e/ou formação acadêmica',
    'Através de alguma empresa nos EUA (founder, sócio, empregador ou parceiro comercial) disposta a apoiar a aplicação do visto',
    'Através da abertura de uma empresa nos EUA',
  ],
  caminhoPrincipal: [
    'Através do meu perfil profissional',
    'Através de familiares que são cidadãos americanos ou têm Green Card',
    'Através de investimento nos EUA',
    'Não tenho certeza',
  ],
  numFunc: ['Menos de 5 funcionários', 'Entre 5 e 10 funcionários', 'Entre 11 e 50 funcionários', 'Mais de 50 funcionários'],
  faturamento: ['Menos de R$ 1 milhão/ano', 'Entre R$ 1 e 2 milhões/ano', 'Entre R$ 2 e 5 milhões/ano', 'Acima de R$ 5 milhões/ano'],
  posicao: ['Fundador / Empreendedor', 'Sócio / Acionista', 'Executivo / Gerente', 'Funcionário com Conhecimento Especializado'],
  investimento: ['Menos de US$ 25k', 'Entre US$ 26k e US$ 50k', 'Entre US$ 51k e US$ 100k', 'Acima de US$ 100 mil', 'Sem previsão de investimento'],
  tipoNegocio: ['Sim, já tenho negócio definido', 'Estou pesquisando opções', 'Ainda não sei'],
  l1Contexto: ['transferencia', 'expansao'],
  tratado: ['Sim', 'Não'],
  tratadoDiag: ['Sim', 'Não'],
  avaliacaoComplementarE2: ['Sim, quero avaliação completa', 'Não, apenas o E-2'],
  grauFormacao: [
    'Ensino Médio / Sem Formação Superior', 'Ensino Médio / Sem formação superior',
    'Superior incompleto', 'Tecnólogo concluído',
    'Bacharelado/Licenciatura concluído há menos de 5 anos',
    'Bacharelado/Licenciatura concluído há mais de 5 anos',
    'Mestrado', 'Doutorado',
  ],
  tempoExp: ['Menos de 3 anos (recém-formado)', 'Entre 3 e 5 anos', 'Entre 5 e 10 anos', 'Mais de 10 anos'],
  // Critérios O-1: mesmas 3 respostas possíveis em todos
  o1_lideranca: ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_salario:   ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_premios:   ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_assoc:     ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_avaliador: ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_exposicoes:['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_contrib:   ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_midia:     ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_artes:     ['Sim', 'Não', 'Não possuo, mas posso obter'],
  o1_artigos:   ['Sim', 'Não', 'Não possuo, mas posso obter'],
};

// ── Resposta do chat → propriedade de destino no HubSpot ──
const DESTINO = {
  perfilProfissional: 'first_immigration_path',
  caminhoPrincipal:   'first_immigration_path',
  numFunc:            'nonimmigrant__quantos_funcionarios_formais_tem_a_empresa_',
  faturamento:        'nonimmigrant_visas__qual_a_faixa_de_faturamento_anual_da_empresa__l_1',
  posicao:            'nonimmigrant__qual_a_sua_posicao_atual_na_empresa_',
  investimento:       'e2_investment_range',
  tipoNegocio:        'e2_business_stage',
  l1Contexto:         'l1__new_office_transfer_',
  tratado:            'nonimmigrant__voce_possui_cidadania',
  tratadoDiag:        'nonimmigrant__voce_possui_cidadania',
  avaliacaoComplementarE2: 'nonimmigrant__gostaria_de_continuar_preenchendo_',
  grauFormacao:       'nonimmigrant_visas__level_of_education',
  tempoExp:           'nonimmigrant__ha_quanto_tempo_voce_atua_na_sua_area_de_formacao_',
  o1_lideranca:  'nonimmigrant__evidencia_do_seu_desempenho_de_um_papel_importante_ou_critico_em_organizacoes_distint',
  o1_salario:    'comprovante_de_recebimento_de_salario',
  o1_premios:    'nonimmigrant__premios_ou_reconhecimentos_de_destaque',
  o1_assoc:      'nonimmigrant__participacao_em_associacoes_que_exigem_realizacoes_extraordinarias',
  o1_avaliador:  'nonimmigrant__provas_de_que_voce_foi_solicitado_para_avaliar_o_trabalho_de_outras_pessoas',
  o1_exposicoes: 'nonimmigrant__comprovacoes_de_que_seu_trabalho_foi_exibido_em_exposicoes_ou_mostras_artisticas',
  o1_contrib:    'nonimmigrant__evidencias_de_suas_contribuicoes_originais_cientificas__academicas__artisticas__atlet',
  o1_midia:      'nonimmigrant__evidencias_de_material_publicado_sobre_voce',
  o1_artes:      'nonimmigrant__provas_de_sucessos_comerciais',
  o1_artigos:    'nonimmigrant__evidencia_de_sua_autoria_de_artigos_academicos_em_publicacoes_profissionais',
};

// ── Opções aceitas pelas propriedades de ENUMERAÇÃO no HubSpot ──
// Propriedades de texto livre ficam de fora (aceitam qualquer valor).
const OPCOES_HUBSPOT = {
  first_immigration_path: ['Green Card EB', 'Green Card Family-Based', 'Work Visa', 'Investor Visa', 'Student Visa', 'None of the above'],
  nonimmigrant__quantos_funcionarios_formais_tem_a_empresa_: ['Menos que 5 funcionários', 'Entre 5 e 10 funcionários', 'Entre 11 a 20 funcionários', 'Mais do que 21 funcionários'],
  nonimmigrant_visas__qual_a_faixa_de_faturamento_anual_da_empresa__l_1: ['Menos que 1 milhão de reais/ano', 'Entre 1 milhão e 2 milhões de reais/ano', 'Entre 2 e 5 milhões de reais/ano', 'Acima de 5 milhões de reais/ano'],
  nonimmigrant__qual_a_sua_posicao_atual_na_empresa_: ['Fundador / Empreendedor', 'Sócio / Acionista', 'Executivo / Gerente', 'Funcionário com Conhecimento Especializado'],
  nonimmigrant__voce_possui_cidadania: ['Sim', 'Não'],
  l1__new_office_transfer_: ['Yes', 'No'],
  liv__e_2_treaty_country_citizenship_: ['Yes', 'No', 'Not sure - please check for me'],
  nonimmigrant__gostaria_de_continuar_preenchendo_: ['Sim, quero uma avaliação completa.', 'Não, quero encerrar por aqui.'],
  nonimmigrant_visas__level_of_education: ['PhD / Doutorado', 'Master’s degree / Mestrado', 'Bachelor’s degree / Graduação', "Associate's Degree / Tecnólogo", 'Outros', 'No degree / Não tenho graduação'],
  nonimmigrant__ha_quanto_tempo_voce_atua_na_sua_area_de_formacao_: ['Menos de 5 anos', 'Entre 5 e 15 anos', 'Entre 15 e 25 anos', 'Mais de 25 anos'],
};

// Os 10 critérios existem em duas versões no chat (eb1_* no fluxo EB-1A e
// o1_* no fluxo O-1) e compartilham as mesmas propriedades de destino.
for (const campo of Object.keys(OPCOES_CHAT).filter(k => k.startsWith('o1_'))) {
  const eb1 = campo.replace(/^o1_/, 'eb1_');
  OPCOES_CHAT[eb1] = OPCOES_CHAT[campo];
  DESTINO[eb1] = DESTINO[campo];
}

const falhas = [];
let checados = 0;

for (const [campo, opcoes] of Object.entries(OPCOES_CHAT)) {
  const prop = DESTINO[campo];
  if (!prop) { falhas.push(`${campo}: sem propriedade de destino declarada`); continue; }
  for (const opcao of opcoes) {
    checados++;
    const props = buildHubSpotProperties('Teste Silva', 't@x.com', '11999999999', 'O-1', 50, { [campo]: opcao }, {}, 'completed');
    const valor = props[prop];

    // 'Não tenho certeza' → 'None of the above' é legítimo, não é perda.
    if (valor === undefined || valor === '') {
      falhas.push(`${campo} = ${JSON.stringify(opcao)} -> ${prop} FICOU VAZIO (resposta perdida)`);
      continue;
    }
    const aceitas = OPCOES_HUBSPOT[prop];
    if (aceitas && !aceitas.includes(valor)) {
      falhas.push(`${campo} = ${JSON.stringify(opcao)} -> ${prop} = ${JSON.stringify(valor)} NÃO é opção válida no HubSpot (seria descartado)`);
    }
  }
}

// Cada critério O-1 precisa de propriedade PRÓPRIA: se dois compartilharem o
// mesmo destino, um sobrescreve o outro (foi o que aconteceu com artes/artigos).
for (const pref of ['o1_', 'eb1_']) {
  const props = Object.entries(DESTINO).filter(([k]) => k.startsWith(pref)).map(([, v]) => v);
  if (new Set(props).size !== props.length) {
    falhas.push(`dois critérios ${pref}* apontam para a MESMA propriedade — um vai sobrescrever o outro`);
  }
}

console.log(`${checados} combinações verificadas (${Object.keys(OPCOES_CHAT).length} campos)`);
if (falhas.length) {
  console.error(`\n${falhas.length} FALHA(S):`);
  falhas.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('OK — toda resposta do chat chega ao HubSpot com um valor que a propriedade aceita.');
