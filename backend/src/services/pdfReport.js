const PDFDocument = require('pdfkit');

// ─── Paleta (mesma identidade do Visa Match) ───
const NAVY = '#0b1c30';
const ORANGE = '#d98c3f';
const TXT = '#2b2f38';
const MUTED = '#737687';
const LINE = '#e3e6ee';

const M = 48;              // margem
const PAGE_W = 595.28;     // A4 width (pt)
const CONTENT_W = PAGE_W - M * 2;
const LABEL_W = 190;       // largura da coluna de rótulo

// ─── Helpers de valor ───
const NI = 'Não informado';
const val = v => (v === undefined || v === null || v === '' ? NI : String(v));
const simNao = v => (v === undefined || v === null || v === '' ? NI : v);

function fmtIdadeNasc(p) {
  if (!p.dataNasc) return p.idade ? `${p.idade} anos` : NI;
  return p.idade ? `${p.dataNasc} (${p.idade} anos)` : p.dataNasc;
}

function fmtCurso(nome, inst, ini, fim, status) {
  if (!nome && !inst) return null;
  let s = nome || '';
  if (inst) s += (s ? ' — ' : '') + inst;
  const periodo = [ini, fim].filter(Boolean).join(' – ');
  const extra = [periodo, status && /conclu/i.test(status) ? 'concluído' : (status || '')].filter(Boolean).join(', ');
  if (extra) s += ` (${extra})`;
  return s || null;
}

function fmtEmpregoAtual(p) {
  if (!p.emp1Cargo && !p.emp1Entrada) return null;
  let s = p.emp1Cargo || '';
  const fim = /atual|current|presente/i.test(String(p.emp1Saida || '')) ? 'atual' : (p.emp1Saida || '');
  const per = [p.emp1Entrada && `desde ${p.emp1Entrada}`, fim].filter(Boolean).join(' — ');
  if (per) s += (s ? ' — ' : '') + per;
  return s || null;
}

// ─── Desenho ───
function sectionHeader(doc, title) {
  if (doc.y + 40 > doc.page.height - M) doc.addPage();
  const y = doc.y + 6;
  doc.rect(M, y, CONTENT_W, 30).fill(NAVY);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
     .text(title.toUpperCase(), M + 14, y + 9, { width: CONTENT_W - 28 });
  doc.y = y + 30 + 10;
  doc.fillColor(TXT);
}

function subHeader(doc, title) {
  if (doc.y + 30 > doc.page.height - M) doc.addPage();
  doc.moveDown(0.4);
  doc.fillColor(NAVY).font('Helvetica').fontSize(12.5).text(title, M, doc.y);
  doc.moveDown(0.3);
  doc.fillColor(TXT);
}

function row(doc, label, value) {
  const v = value === null || value === undefined || value === '' ? NI : String(value);
  doc.font('Helvetica').fontSize(9.5);
  const labelH = doc.heightOfString(label, { width: LABEL_W - 10 });
  const valueH = doc.heightOfString(v, { width: CONTENT_W - LABEL_W });
  const h = Math.max(labelH, valueH) + 12;
  if (doc.y + h > doc.page.height - M) doc.addPage();
  const y = doc.y;
  doc.fillColor(MUTED).text(label, M, y + 6, { width: LABEL_W - 10 });
  doc.fillColor(TXT).text(v, M + LABEL_W, y + 6, { width: CONTENT_W - LABEL_W });
  const rowH = Math.max(doc.y - y, h);
  doc.y = y + rowH;
  doc.strokeColor(LINE).lineWidth(0.5).moveTo(M, doc.y + 1).lineTo(M + CONTENT_W, doc.y + 1).stroke();
  doc.y += 3;
}

// Renderiza um bloco de critérios apenas se houver ao menos 1 resposta
function criteriaBlock(doc, title, pairs) {
  const filled = pairs.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!filled.length) return;
  subHeader(doc, title);
  filled.forEach(([label, v]) => row(doc, label, simNao(v)));
}

/**
 * Gera o PDF do relatório VisaMatch e resolve com um Buffer.
 * @param {object} opts { nome, email, phone, visto, vistos, score, profile }
 */
function generateReportPdf({ nome, visto, vistos, score, profile }) {
  return new Promise((resolve, reject) => {
    try {
      const p = profile || {};
      const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Cabeçalho ──
      doc.fillColor(NAVY).font('Helvetica').fontSize(24).text('Relatório Visa Match', M, M);
      doc.fillColor(MUTED).font('Helvetica').fontSize(10)
         .text('Resultado da avaliação preliminar de perfil  |  Imigrar EUA / LIV Immigration Law', M, doc.y + 2);
      doc.moveTo(M, doc.y + 8).lineTo(M + CONTENT_W, doc.y + 8).lineWidth(2).strokeColor(ORANGE).stroke();
      doc.y += 16;

      const vistoLista = (vistos && vistos.length ? vistos : [visto]).filter(Boolean);

      // ── Dados do cliente ──
      sectionHeader(doc, 'Dados do Cliente');
      row(doc, 'Nome completo', nome);
      row(doc, 'Data de nascimento', fmtIdadeNasc(p));
      row(doc, 'Reside atualmente em', p.localMora);
      row(doc, 'Já esteve nos EUA', p.historicoPermanenciaEUA);
      row(doc, 'Já solicitou visto americano', p.solicitouVisto);
      row(doc, 'Visto já negado anteriormente', p.vistoNegado);
      row(doc, 'Cidadania de país com tratado', p.tratadoCidadania || p.tratado);
      row(doc, 'Prazo desejado para mudança', p.prazoMudanca);
      row(doc, 'Prazo para o Green Card', p.prazoGC);
      row(doc, 'Disponibilidade de fundos', p.fundos);
      row(doc, 'Caminho principal considerado', p.caminhoPrincipal);
      if (p.perfilProfissional) row(doc, 'Perfil profissional', p.perfilProfissional);

      // ── Formação acadêmica e profissão ──
      sectionHeader(doc, 'Formação Acadêmica e Profissão');
      row(doc, 'Profissão', p.profissao);
      const c1 = fmtCurso(p.curso1, p.instAcad1, p.acInicio1, p.acConclusao1, p.acStatus1);
      if (c1) row(doc, 'Curso 1', c1);
      const c2 = fmtCurso(p.curso2, p.instAcad2, p.acInicio2, p.acConclusao2, p.acStatus2);
      if (c2) row(doc, 'Curso 2', c2);
      row(doc, 'Nível de formação', p.grauFormacao || p.grauFormacaoDiag);
      if (p.areaAtuacaoFormacao) row(doc, 'Atua na área de formação', p.areaAtuacaoFormacao);
      if (p.hab_diploma !== undefined) row(doc, 'Possui diploma', p.hab_diploma ? 'Sim' : 'Não');
      if (p.hab_licenca !== undefined || p.niw_licencas) row(doc, 'Possui licença profissional', p.hab_licenca ? 'Sim' : simNao(p.niw_licencas));
      if (p.hab_associacao !== undefined) row(doc, 'Possui associação profissional', p.hab_associacao ? 'Sim' : 'Não');
      if (p.hab_salario !== undefined) row(doc, 'Salário/remuneração acima da média', p.hab_salario ? 'Sim' : 'Não');
      if (p.hab_10anos !== undefined) row(doc, 'Habilidade com 10+ anos (critério extra)', p.hab_10anos ? 'Sim' : 'Não');

      // ── Histórico profissional ──
      const temExp = p.emp1Nome || p.emp2Nome || p.emp3Nome;
      if (temExp) {
        subHeader(doc, 'Histórico profissional');
        if (p.emp1Nome) row(doc, 'Empresa atual', p.emp1Ramo ? `${p.emp1Nome} (${p.emp1Ramo})` : p.emp1Nome);
        const ca = fmtEmpregoAtual(p);
        if (ca) row(doc, 'Cargo atual', ca);
        if (p.emp2Nome) row(doc, 'Empresa anterior 1', p.emp2Nome);
        if (p.emp2Cargo) row(doc, 'Cargo', p.emp2Saida ? `${p.emp2Cargo} — até ${p.emp2Saida}` : p.emp2Cargo);
        if (p.emp3Nome) row(doc, 'Empresa anterior 2', p.emp3Nome);
        if (p.emp3Cargo || p.emp3Info) row(doc, 'Cargo', p.emp3Cargo || p.emp3Info);
        if (p.expNaoListada) row(doc, 'Experiências adicionais', p.expNaoListada);
      }
      if (p.temProjetos) {
        row(doc, 'Projetos relevantes', p.projetosDesc ? `${p.temProjetos} — ${p.projetosDesc}` : p.temProjetos);
      }

      // ── Empresa (L-1) ──
      criteriaBlock(doc, 'Dados da empresa (L-1)', [
        ['Posição na empresa', p.posicao],
        ['Nome da empresa', p.nomeEmpresa],
        ['Nº de funcionários', p.numFunc],
        ['Faturamento anual', p.faturamento],
      ]);

      // ── Investimento (E-2) ──
      criteriaBlock(doc, 'Dados de investimento (E-2)', [
        ['Cidadania de país com tratado', p.tratado],
        ['Faixa de investimento', p.investimento],
        ['Tipo de negócio', p.tipoNegocio],
      ]);

      // ── Critérios EB-1A ──
      criteriaBlock(doc, 'Critérios avaliados para EB-1A (habilidade extraordinária)', [
        ['Prêmios de excelência', p.eb1_premios],
        ['Associações que exigem realizações extraordinárias', p.eb1_assoc],
        ['Cobertura na mídia', p.eb1_midia],
        ['Atuação como avaliador de terceiros (júri/banca)', p.eb1_avaliador],
        ['Contribuições originais de grande impacto', p.eb1_contrib],
        ['Artigos publicados', p.eb1_artigos],
        ['Liderança em papel crítico', p.eb1_lideranca],
        ['Salário/remuneração acima da média', p.eb1_salario],
        ['Exposições/mostras do trabalho', p.eb1_exposicoes],
        ['Trabalho em artes', p.eb1_artes],
      ]);

      // ── Critérios EB-2 NIW ──
      criteriaBlock(doc, 'Critérios avaliados para EB-2 NIW (interesse nacional)', [
        ['Cartas de recomendação', p.niw_cartas],
        ['Cursos/certificações complementares', p.niw_cursos],
        ['Licenças profissionais', p.niw_licencas],
        ['Participação em bancas/comitês', p.niw_bancas],
        ['Pesquisa acadêmica', p.niw_pesquisa],
        ['Artigos publicados', p.niw_artigos],
        ['Palestras/apresentações', p.niw_palestras],
        ['Reportagens/cobertura de mídia', p.niw_reportagens],
        ['Prêmios', p.niw_premios],
      ]);

      // ── Critérios O-1 ──
      criteriaBlock(doc, 'Critérios avaliados para O-1 (habilidade extraordinária)', [
        ['Prêmios/reconhecimentos', p.o1_premios],
        ['Publicações em mídia relevante', p.o1_midia],
        ['Contribuições originais reconhecidas', p.o1_contrib],
        ['Papel de liderança em organizações de destaque', p.o1_lideranca],
        ['Remuneração acima da média', p.o1_salario],
        ['Associações de destaque', p.o1_assoc],
        ['Atuação como avaliador', p.o1_avaliador],
        ['Sucesso em artes performáticas', p.o1_artes],
        ['Exposições/mostras', p.o1_exposicoes],
        ['Artigos acadêmicos', p.o1_artigos],
      ]);

      // ── Rodapé ── (documento interno de respostas — sem score/diagnóstico)
      doc.moveDown(0.8);
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
         .text('Documento interno com as respostas informadas pelo lead no VisaMatch. ' +
               'Registro fiel de perguntas e respostas — não constitui aconselhamento jurídico.',
               M, doc.y, { width: CONTENT_W });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateReportPdf };
