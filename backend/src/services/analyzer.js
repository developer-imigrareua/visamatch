const OpenAI = require('openai');
const prompts = require('../agents/prompts');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Mapa: visto → prompt do agente
const AGENT_MAP = {
  'EB-2 NIW':     prompts.EB2_NIW,
  'EB-1A':        prompts.EB1A,
  'O-1':          prompts.O1,
  'L-1':          prompts.L1,
  'E-2':          prompts.E2,
  'Family Based': prompts.FAMILY,
  'H-1B':         null, // H-1B depende de sorteio e patrocinador — análise simplificada
};

// ── Formata o perfil como texto legível para o agente ──
function formatProfile(profile, nome, email) {
  const p = profile || {};
  return `
DADOS DO CANDIDATO:
- Nome: ${nome || p.nomeCompleto || 'Não informado'}
- E-mail: ${email || 'Não informado'}
- Profissão: ${p.profissao || 'Não informada'}
- Grau de formação: ${p.grauFormacao || p.grauFormacaoDiag || 'Não informado'}
- Tempo de experiência: ${p.tempoExp || 'Não informado'}
- Renda mensal: ${p.renda || 'Não informada'}
- Local de residência: ${p.localMora || 'Não informado'}
- Casado(a): ${p.casado || 'Não informado'}
- Filhos: ${p.filhos || 'Não informado'}

CAMINHO E OBJETIVOS:
- Caminho principal escolhido: ${p.caminhoPrincipal || 'Não informado'}
- Planos nos EUA: ${p.planosEUA || 'Não informado'}
- Prazo para Green Card: ${p.prazoGC || 'Não informado'}
- Disponibilidade financeira para o processo: ${p.fundos || 'Não informado'}
- Cidadania de país com tratado: ${p.tratadoCidadania || p.tratado || 'Não informado'}
- Tem conquistas extraordinárias: ${p.temConquistas || 'Não informado'}

FORMAÇÃO ACADÊMICA:
- Instituição 1: ${p.instAcad1 || 'Não informada'}
- Curso 1: ${p.curso1 || 'Não informado'}
- Status: ${p.acStatus1 || 'Não informado'}
- Pós-graduação: ${p.acPosgrad1 || 'Não informado'}
- Instituição 2: ${p.instAcad2 || 'Não informada'}

EXPERIÊNCIA PROFISSIONAL:
- Empresa atual/última: ${p.emp1Nome || 'Não informada'}
- Cargo: ${p.emp1Cargo || 'Não informado'}
- Período: ${p.emp1Entrada || '?'} até ${p.emp1Saida || 'atual'}
- Ramo: ${p.emp1Ramo || 'Não informado'}
- Empresa 2: ${p.emp2Nome || 'Não informada'} — ${p.emp2Cargo || ''} (${p.emp2Entrada || '?'} a ${p.emp2Saida || '?'})
- Empresa 3: ${p.emp3Nome || 'Não informada'} — ${p.emp3Info || ''}
- Projetos com impacto: ${p.temProjetos === 'Sim' ? p.projetosDesc || 'Sim, sem descrição' : 'Não'}

CRITÉRIOS EB-2 NIW (se aplicável):
- Cartas de recomendação: ${p.niw_cartas || 'Não respondido'}
- Palestras ministradas: ${p.niw_palestras || 'Não respondido'}
- Participação em bancas: ${p.niw_bancas || 'Não respondido'}
- Reportagens/entrevistas como fonte: ${p.niw_reportagens || 'Não respondido'}
- Artigos publicados: ${p.niw_artigos || 'Não respondido'}
- Projetos de pesquisa: ${p.niw_pesquisa || 'Não respondido'}
- Prêmios/reconhecimentos: ${p.niw_premios || 'Não respondido'}
- Certificados de cursos: ${p.niw_cursos || 'Não respondido'}
- Licenças/certificações: ${p.niw_licencas || 'Não respondido'}
- Diploma oficial: ${p.hab_diploma ? 'Sim' : 'Não'}
- 10+ anos comprovados: ${p.hab_10anos ? 'Sim' : 'Não'}
- Licença profissional: ${p.hab_licenca ? 'Sim' : 'Não'}
- Salário demonstrando capacidade: ${p.hab_salario ? 'Sim' : 'Não'}
- Filiação a associações: ${p.hab_associacao ? 'Sim' : 'Não'}
- Reconhecimento por contribuições: ${p.hab_reconhecimento ? 'Sim' : 'Não'}

CRITÉRIOS EB-1A (se aplicável):
- Prêmios internacionais: ${p.eb1_premios || 'Não respondido'}
- Membro de associações por mérito: ${p.eb1_assoc || 'Não respondido'}
- Mídia publicada sobre o candidato: ${p.eb1_midia || 'Não respondido'}
- Avaliador do trabalho de outros: ${p.eb1_avaliador || 'Não respondido'}
- Contribuições originais de impacto: ${p.eb1_contrib || 'Não respondido'}
- Liderança em organizações: ${p.eb1_lideranca || 'Não respondido'}
- Salário acima da média: ${p.eb1_salario || 'Não respondido'}

CRITÉRIOS O-1 (se aplicável):
- Prêmios/reconhecimentos: ${p.o1_premios || 'Não respondido'}
- Mídia sobre o candidato: ${p.o1_midia || 'Não respondido'}
- Contribuições originais: ${p.o1_contrib || 'Não respondido'}
- Liderança em organizações: ${p.o1_lideranca || 'Não respondido'}
- Remuneração acima da média: ${p.o1_salario || 'Não respondido'}

DADOS L-1 (se aplicável):
- Posição na empresa: ${p.posicao || 'Não informada'}
- Nome da empresa: ${p.nomeEmpresa || 'Não informada'}
- Número de funcionários: ${p.numFunc || 'Não informado'}
- Faturamento anual: ${p.faturamento || 'Não informado'}

DADOS E-2 (se aplicável):
- Cidadania de país com tratado: ${p.tratado || 'Não informado'}
- Faixa de investimento pretendido: ${p.investimento || 'Não informado'}
- Tipo de negócio: ${p.tipoNegocio || 'Não informado'}

DADOS FAMILY BASED (se aplicável):
- Tipo de vínculo familiar: ${p.familyTipo || 'Não informado'}
- Nome do beneficiário: ${p.nomeBeneficiario || 'Não informado'}
- Nome do aplicante principal: ${p.nomeAplicante || 'Não informado'}
- Status do aplicante: ${p.statusAplicante || 'Não informado'}
- Status imigratório do beneficiário: ${p.statusBeneficiario || 'Não informado'}

HISTÓRICO DE VIAGENS E VISTOS:
- Viagens ao exterior (5 anos): ${p.viagens || 'Não informado'}
- Países visitados: ${p.paises || 'Não informado'}
- Parentes nos EUA: ${p.parentesEUA || 'Não informado'}
- Parentes com status legal: ${p.parentesLegal || 'Não informado'}
- Visto americano anterior: ${p.vistoAnterior || 'Não informado'}
- Visto negado/cancelado: ${p.vistoNegado || 'Não informado'}
- Detalhe da negativa: ${p.vistoNegadoDetalhe || 'Não aplicável'}
  `.trim();
}

// ── Roda um agente para um visto específico ──
async function runAgent(visto, profile, nome, email) {
  const systemPrompt = AGENT_MAP[visto];

  // H-1B: análise simplificada sem agente
  if (!systemPrompt) {
    return {
      visto: 'H-1B',
      score: 50,
      classificacao: 'Moderada',
      pontos_fortes: ['Formação acadêmica relevante'],
      pontos_criticos: ['Exige patrocinador americano', 'Passa por sorteio anual em abril', 'Não garante aprovação independente do perfil'],
      criterios: [
        { nome: 'Grau acadêmico em área especializada', status: 'atendido', peso: 'crítico', observacao: 'Exigido para H-1B' },
        { nome: 'Oferta de emprego de empresa americana', status: 'ausente', peso: 'crítico', observacao: 'Não foi mencionado patrocinador' },
        { nome: 'Sorteio anual (lottery)', status: 'parcial', peso: 'alto', observacao: 'Cap de 65.000 vistos por ano — aprovação não é garantida' },
      ],
      analise: `O H-1B é um visto de trabalho temporário que exige patrocínio de empresa americana e participação no sorteio anual realizado em abril. Mesmo com perfil qualificado, a aprovação depende de sorteio — o que torna esse caminho menos previsível que outras categorias. Para ${nome || 'o candidato'}, recomendamos explorar alternativas como o EB-2 NIW, que não depende de patrocinador nem de sorteio.`,
      proximos_passos: [
        'Identificar empresas americanas na sua área dispostas a patrocinar H-1B',
        'Preparar documentação acadêmica e profissional para o pacote H-1B',
        'Considerar paralelamente o EB-2 NIW como caminho independente',
        'Consultar advogado para avaliar viabilidade do perfil para o sorteio',
      ],
      recomendacao_parceiro: 'liv',
    };
  }

  const profileText = formatProfile(profile, nome, email);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analise o seguinte perfil para o visto ${visto}:\n\n${profileText}` },
    ],
  });

  const raw = response.choices[0].message.content;
  return JSON.parse(raw);
}

// ── Orquestrador principal ──
async function analyzeProfile({ nome, email, visto, vistos, profile }) {
  const targetVistos = vistos?.length ? vistos : [visto || 'EB-2 NIW'];

  // Roda agentes em paralelo quando há múltiplos vistos
  const results = await Promise.all(
    targetVistos.map(v => runAgent(v, profile, nome, email))
  );

  // Identifica o melhor resultado
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const best = sorted[0];

  return {
    resultados: results,        // array com análise de cada visto
    melhor: best,               // visto com maior score
    isDual: results.length > 1, // flag para o frontend renderizar tabs
    gerado_em: new Date().toISOString(),
  };
}

module.exports = { analyzeProfile };
