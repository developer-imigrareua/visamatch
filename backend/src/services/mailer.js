const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
});

const FROM = process.env.SMTP_FROM || 'Imigrar Visa Match <contato@imigrareua.com>';
const APP_URL = process.env.APP_URL || 'https://visamatch.imigrareua.com';

// Assets oficiais reutilizados (mesmos da plataforma) — logo da sidebar e banner LIV.
const LOGO_URL   = 'https://lp.imigrareua.com/wp-content/uploads/2026/07/VISA-MATCH-LOGO-HORIZONTAL-SIMBOLO-AZUL@2x.png';
const LIV_BANNER = 'https://liv.law/wp-content/uploads/2026/05/LIV-Advogados-Licenciados-scaled.webp';

// ── Verificar conexão SMTP ──
async function verifyConnection() {
  try { await transporter.verify(); return true; }
  catch(e) { console.error('SMTP connection failed:', e.message); return false; }
}

// ── Boas-vindas após cadastro ──
async function sendWelcome(email, nome) {
  return transporter.sendMail({
    from: FROM,
    to: email,
    subject: '✅ Conta criada · Visa Match Imigrar EUA',
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f8faff">
        <div style="background:linear-gradient(135deg,#1A72F6,#002b70);border-radius:16px;padding:30px 28px;text-align:center;margin-bottom:24px">
          <img src="${LOGO_URL}" alt="Visa Match · Imigrar EUA" height="32" style="height:32px;width:auto;max-width:72%;display:block;margin:0 auto"/>
          <p style="color:rgba(255,255,255,.7);font-size:12px;margin:11px 0 0;letter-spacing:.06em;text-transform:uppercase">Imigrar EUA</p>
        </div>
        <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid rgba(194,198,216,.4)">
          <h2 style="font-size:20px;color:#0b1c30;margin:0 0 16px">Olá, ${nome || 'bem-vindo(a)'}! 👋</h2>
          <p style="color:#424655;font-size:15px;line-height:1.7;margin:0 0 20px">
            Sua conta no <strong>Visa Match</strong> foi criada com sucesso. Agora você pode acessar seu histórico de análises a qualquer momento.
          </p>
          <a href="${APP_URL}/portal/" style="display:inline-block;background:linear-gradient(135deg,#1A72F6,#ff4b82);color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700">
            Acessar meu portal →
          </a>
          <p style="color:#737687;font-size:12px;margin:20px 0 0;line-height:1.6">
            Se você não criou essa conta, ignore este e-mail.
          </p>
        </div>
        <p style="color:#737687;font-size:11px;text-align:center;margin:16px 0 0">
          Imigrar EUA · Visa Match · <a href="${APP_URL}" style="color:#0053d0">visamatch.imigrareua.com</a>
        </p>
      </div>
    `
  });
}

// ── Relatório de análise (diagnóstico completo · mesma fonte da plataforma) ──
// Consome o objeto de diagnóstico unificado (o "melhor" do visamatch_report) e
// renderiza as MESMAS seções do chat/relatório/PDF, adaptadas a clientes de
// e-mail (HTML tabular, estilos inline, identidade visual Visa Match). Os textos,
// termos, cores e classificações são os mesmos do diagnóstico completo.
function sendAnalysisReport(email, nome, diag) {
  // Compat: assinatura antiga (email, nome, visto, score, classificacao)
  if (typeof diag !== 'object' || diag === null) {
    diag = { visto: arguments[2], score: arguments[3], aprovacao_pct: arguments[3], classificacao: arguments[4] };
  }
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const visto = diag.visto || '-';
  const pct = Math.max(0, Math.min(100, Number(diag.aprovacao_pct ?? diag.score ?? 0)));
  const classificacao = diag.classificacao || '';
  const tier = pct >= 70 ? 'alta' : pct >= 40 ? 'mod' : 'dev';
  const tierBg = tier === 'alta' ? 'rgba(29,158,112,.12)' : tier === 'mod' ? 'rgba(217,119,6,.12)' : 'rgba(11,25,41,.06)';
  const tierFg = tier === 'alta' ? '#0f6f4c' : tier === 'mod' ? '#8a5200' : '#334155';

  const H = '#0b1c30', TXT = '#424655', MUT = '#737687', LINE = 'rgba(194,198,216,.45)';
  const sectionTitle = t =>
    `<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0053d0;margin:22px 0 10px">${esc(t)}</div>`;
  const paragraph = t => t
    ? `<p style="font-size:14.5px;line-height:1.7;color:${TXT};margin:0 0 6px">${esc(t)}</p>` : '';
  const bulletList = (arr, color) => (Array.isArray(arr) && arr.length)
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${
        arr.map(item => `<tr><td valign="top" style="width:18px;color:${color};font-size:14px;line-height:1.6;padding:3px 0">•</td>`
          + `<td style="font-size:14px;line-height:1.6;color:${TXT};padding:3px 0">${esc(item)}</td></tr>`).join('')
      }</table>` : '';
  const numberedList = arr => (Array.isArray(arr) && arr.length)
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${
        arr.map((item, i) => `<tr><td valign="top" style="width:26px;padding:4px 0"><span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:#1A72F6;color:#fff;font-size:11px;font-weight:700">${i + 1}</span></td>`
          + `<td style="font-size:14px;line-height:1.55;color:${TXT};padding:4px 0 4px 4px">${esc(item)}</td></tr>`).join('')
      }</table>` : '';

  // Badge de status e força — MESMOS termos/cores do relatório completo.
  const stMap = {
    atendido:   { txt: 'Atendido',   fg: '#065f46', bg: 'rgba(29,158,112,.12)', bd: 'rgba(29,158,112,.30)', ico: '✓' },
    fortalecer: { txt: 'Fortalecer', fg: '#78350f', bg: 'rgba(217,119,6,.12)',  bd: 'rgba(217,119,6,.30)',  ico: '⚡' },
    construir:  { txt: 'Construir',  fg: '#7f1d1d', bg: 'rgba(220,38,38,.10)',  bd: 'rgba(220,38,38,.28)',  ico: '◯' },
  };
  const statusBadge = st => {
    const s = stMap[st] || stMap.construir;
    return `<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;background:${s.bg};color:${s.fg};border:1px solid ${s.bd};white-space:nowrap">${s.ico} ${s.txt}</span>`;
  };
  const forcaStars = n => {
    n = Math.max(0, Math.min(5, Number(n) || 0));
    let o = '';
    for (let i = 0; i < 5; i++) o += `<span style="color:${i < n ? '#ff4b82' : 'rgba(11,25,41,.15)'};font-size:12px">★</span>`;
    return o;
  };

  // Tabela de critérios com badge de status e força (destaques visuais).
  const criteriosRows = (Array.isArray(diag.criterios) ? diag.criterios : []).map(c => `
    <tr>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(11,25,41,.06);vertical-align:top">
        <div style="font-size:13px;font-weight:700;color:${H}">${esc(c.nome || '')}</div>
        ${c.observacao ? `<div style="font-size:12px;color:${MUT};line-height:1.5;margin-top:2px">${esc(c.observacao)}</div>` : ''}
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(11,25,41,.06);text-align:center;vertical-align:top">${statusBadge(c.status)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(11,25,41,.06);text-align:center;vertical-align:top;white-space:nowrap">${forcaStars(c.estrelas)}</td>
    </tr>`).join('');
  const criteriosTable = criteriosRows ? `
    ${sectionTitle('Critérios USCIS · Status e Força')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        <th style="text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUT};padding:0 8px 6px;border-bottom:2px solid rgba(11,25,41,.08)">Critério</th>
        <th style="text-align:center;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUT};padding:0 8px 6px;border-bottom:2px solid rgba(11,25,41,.08)">Status</th>
        <th style="text-align:center;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUT};padding:0 8px 6px;border-bottom:2px solid rgba(11,25,41,.08)">Força</th>
      </tr>
      ${criteriosRows}
    </table>` : '';

  // Scorecard: score/percentual, classificação, visto e contagem de critérios.
  let atendidos = null, total = null, minimo = null;
  if (diag.scorecard) { atendidos = diag.scorecard.atendidos; total = diag.scorecard.total; minimo = diag.scorecard.minimo_exigido; }
  else if (Array.isArray(diag.criterios) && diag.criterios.length) {
    atendidos = diag.criterios.filter(c => c && c.status === 'atendido').length; total = diag.criterios.length;
  }
  const criteriosLinha = (atendidos != null && total != null)
    ? `<div style="font-size:12.5px;color:${TXT};margin-top:10px"><strong style="color:${H}">${atendidos} de ${total}</strong> critérios atendidos${minimo != null ? ` · mínimo exigido: <strong style="color:${H}">${minimo}</strong>` : ''}</div>` : '';
  const scorecard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f0f4ff;border-radius:12px;margin:18px 0">
      <tr>
        <td style="padding:20px 22px" align="center">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0053d0">Análise de Probabilidade · ${esc(visto)}</div>
          <div style="font-family:Arial,sans-serif;font-size:46px;font-weight:800;color:#0053d0;line-height:1.1;margin-top:6px">${pct}%</div>
          <div style="display:inline-block;margin-top:8px;padding:5px 16px;border-radius:20px;font-size:12.5px;font-weight:700;background:${tierBg};color:${tierFg}">${esc(classificacao)}</div>
          ${criteriosLinha}
        </td>
      </tr>
    </table>`;

  // Pontos de melhoria: pontos_criticos + critérios a fortalecer/construir.
  const melhorias = [];
  if (Array.isArray(diag.pontos_criticos)) melhorias.push(...diag.pontos_criticos);
  if (Array.isArray(diag.criterios)) {
    diag.criterios
      .filter(c => c && (c.status === 'fortalecer' || c.status === 'construir'))
      .forEach(c => melhorias.push(c.observacao ? `${c.nome}: ${c.observacao}` : c.nome));
  }

  // Parceiro recomendado. Banner LIV apenas quando o parceiro é a LIV (Phoenix
  // não usa banner, como no diagnóstico da plataforma).
  const isLiv = diag.recomendacao_parceiro === 'liv';
  const parceiroNome = isLiv ? 'LIV Immigration Law' : 'Phoenix · Fortalecimento de Perfil';
  const parceiroDesc = isLiv
    ? 'Escritório de advocacia licenciado nos EUA, parceiro oficial da Imigrar EUA para o seu caso.'
    : 'Especialista em melhoria de perfil para construir as bases necessárias antes do processo.';
  const parceiroUrl = isLiv ? 'https://wa.link/pxtk7k' : 'https://lp.imigrareua.com/novos-caminhos-imigrareua/';
  const livBanner = isLiv ? `
      <div style="line-height:0">
        <img src="${LIV_BANNER}" width="100%" alt="Equipe LIV Immigration Law · Advogados licenciados nos EUA" style="display:block;width:100%;max-width:100%;height:auto;max-height:150px;object-fit:cover"/>
      </div>` : '';

  // ── Corpo ──
  const body = `
    ${paragraph(`Olá, ${nome || ''}! Aqui está o seu diagnóstico completo do Visa Match, o mesmo apresentado na plataforma.`)}
    ${scorecard}
    ${diag.veredicto ? sectionTitle('Resultado Final') + paragraph(diag.veredicto) : ''}
    ${criteriosTable}
    ${(Array.isArray(diag.pontos_fortes) && diag.pontos_fortes.length) ? sectionTitle('Justificativas · Pontos Fortes') + bulletList(diag.pontos_fortes, '#1d9e70') : ''}
    ${melhorias.length ? sectionTitle('Pontos de Melhoria · Fortalecimento do Perfil') + bulletList(melhorias, '#d97706') : ''}
    ${(Array.isArray(diag.plano_acao) && diag.plano_acao.length) ? sectionTitle('Recomendações · Próximos Passos') + numberedList(diag.plano_acao) : ''}
    ${diag.analise ? sectionTitle('Análise do Perfil') + String(diag.analise).split(/\n+/).map(paragraph).join('') : ''}

    <div style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;margin:22px 0 6px">
      ${livBanner}
      <div style="padding:16px 18px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${MUT};margin-bottom:4px">Parceiro Recomendado</div>
        <div style="font-size:15px;font-weight:700;color:${H};margin-bottom:4px">${esc(parceiroNome)}</div>
        <div style="font-size:13px;line-height:1.6;color:${TXT};margin-bottom:12px">${esc(parceiroDesc)}</div>
        <a href="${parceiroUrl}" style="display:inline-block;background:linear-gradient(135deg,#1A72F6,#003fa3);color:#fff;text-decoration:none;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:700">Falar com o parceiro →</a>
      </div>
    </div>
  `;

  return transporter.sendMail({
    from: FROM,
    to: email,
    subject: `📊 Seu diagnóstico Visa Match · ${visto} · ${pct}%`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px 18px;background:#f8faff">
        <div style="background:linear-gradient(135deg,#1A72F6,#002b70);border-radius:16px;padding:26px 28px;text-align:center;margin-bottom:20px">
          <img src="${LOGO_URL}" alt="Visa Match · Imigrar EUA" height="34" style="height:34px;width:auto;max-width:78%;display:block;margin:0 auto"/>
          <p style="color:rgba(255,255,255,.7);font-size:12px;margin:12px 0 0;letter-spacing:.06em;text-transform:uppercase">Imigrar EUA · Diagnóstico de Perfil</p>
        </div>
        <div style="background:#fff;border-radius:14px;padding:26px 24px;border:1px solid rgba(194,198,216,.4)">
          ${body}
          <p style="color:${MUT};font-size:11px;line-height:1.65;margin:18px 0 0;border-top:1px solid ${LINE};padding-top:14px">
            ⚖️ <strong style="color:${TXT}">AVISO LEGAL:</strong> Este relatório foi gerado com o auxílio de inteligência artificial (IA), com base nas informações fornecidas. Os resultados podem conter imprecisões e devem ser verificados de forma independente. Tem caráter exclusivamente informativo, não constitui aconselhamento jurídico, não substitui uma análise jurídica individualizada por advogado licenciado nos EUA e não estabelece uma relação advogado-cliente.
          </p>
        </div>
        <p style="color:${MUT};font-size:11px;text-align:center;margin:16px 0 0">
          Imigrar EUA · Visa Match · <a href="${APP_URL}" style="color:#0053d0;text-decoration:none">visamatch.imigrareua.com</a>
        </p>
      </div>
    `
  });
}

// ── Reset de senha ──
async function sendPasswordReset(email, nome, token) {
  const resetUrl = `${APP_URL}/portal/?reset=${token}`;
  return transporter.sendMail({
    from: FROM,
    to: email,
    subject: '🔐 Redefinir senha · Visa Match',
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f8faff">
        <div style="background:linear-gradient(135deg,#1A72F6,#002b70);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px">
          <img src="${LOGO_URL}" alt="Visa Match · Imigrar EUA" height="30" style="height:30px;width:auto;max-width:70%;display:block;margin:0 auto"/>
        </div>
        <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid rgba(194,198,216,.4)">
          <h2 style="font-size:18px;color:#0b1c30;margin:0 0 12px">Redefinir sua senha</h2>
          <p style="color:#424655;font-size:14px;line-height:1.7;margin:0 0 20px">
            Olá${nome ? `, <strong>${nome}</strong>` : ''}! Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo:
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#1A72F6,#ff4b82);color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700">
            Redefinir senha →
          </a>
          <p style="color:#737687;font-size:12px;margin:16px 0 0;line-height:1.6">
            Este link expira em <strong>1 hora</strong>. Se você não solicitou, ignore este e-mail.
          </p>
        </div>
      </div>
    `
  });
}

module.exports = { verifyConnection, sendWelcome, sendAnalysisReport, sendPasswordReset };
