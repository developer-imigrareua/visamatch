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

const FROM = process.env.SMTP_FROM || 'Visa Match <contato@imigrareua.com>';
const APP_URL = process.env.APP_URL || 'https://visamatch.imigrareua.com';

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
    subject: '✅ Conta criada — Visa Match ImigrarEUA',
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f8faff">
        <div style="background:linear-gradient(135deg,#1A72F6,#002b70);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
          <h1 style="font-size:24px;color:#fff;margin:0 0 8px;font-weight:700">Visa Match</h1>
          <p style="color:rgba(255,255,255,.7);font-size:13px;margin:0">ImigrarEUA</p>
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
          ImigrarEUA · Visa Match · <a href="${APP_URL}" style="color:#0053d0">visamatch.imigrareua.com</a>
        </p>
      </div>
    `
  });
}

// ── Relatório de análise ──
async function sendAnalysisReport(email, nome, visto, score, classificacao) {
  return transporter.sendMail({
    from: FROM,
    to: email,
    subject: `📊 Sua análise de elegibilidade — ${visto}`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f8faff">
        <div style="background:linear-gradient(135deg,#1A72F6,#002b70);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
          <h1 style="font-size:24px;color:#fff;margin:0 0 4px;font-weight:700">Análise de Critérios</h1>
          <p style="color:rgba(255,255,255,.7);font-size:14px;margin:0">${visto}</p>
        </div>
        <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid rgba(194,198,216,.4)">
          <p style="color:#424655;font-size:15px;margin:0 0 20px">Olá, <strong>${nome || ''}</strong>! Aqui está o resumo da sua análise:</p>
          <div style="background:#f0f4ff;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
            <div style="font-size:48px;font-weight:800;color:#0053d0;line-height:1">${score}%</div>
            <div style="font-size:13px;color:#737687;margin-top:6px">Score de Elegibilidade</div>
            <div style="display:inline-block;margin-top:10px;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;background:${score>=70?'rgba(29,158,112,.1)':score>=40?'rgba(217,119,6,.1)':'rgba(220,38,38,.07)'};color:${score>=70?'#065f46':score>=40?'#78350f':'#7f1d1d'}">
              ${classificacao || ''}
            </div>
          </div>
          <a href="${APP_URL}/portal/" style="display:inline-block;background:linear-gradient(135deg,#1A72F6,#ff4b82);color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;width:100%;text-align:center;box-sizing:border-box">
            Ver relatório completo no portal →
          </a>
          <p style="color:#737687;font-size:11.5px;margin:16px 0 0;line-height:1.65">
            ⚖️ Esta análise tem caráter informativo e conecta você a especialistas da ImigrarEUA. Não constitui aconselhamento jurídico.
          </p>
        </div>
        <p style="color:#737687;font-size:11px;text-align:center;margin:16px 0 0">
          ImigrarEUA · <a href="${APP_URL}" style="color:#0053d0">visamatch.imigrareua.com</a>
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
    subject: '🔐 Redefinir senha — Visa Match',
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f8faff">
        <div style="background:linear-gradient(135deg,#1A72F6,#002b70);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px">
          <h1 style="font-size:22px;color:#fff;margin:0;font-weight:700">Visa Match</h1>
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
