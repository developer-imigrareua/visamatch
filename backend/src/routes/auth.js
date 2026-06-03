const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const supabase = require('../lib/supabase');
const { sendWelcome, sendPasswordReset } = require('../services/mailer');
const router  = express.Router();

const JWT_SECRET = process.env.USER_JWT_SECRET || 'user_jwt_fallback';

// ── POST /auth/register ──
router.post('/register', async (req, res) => {
  const { email, password, nome } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });

  try {
    // Verifica se já existe
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Este e-mail já possui cadastro. Faça login.' });

    const password_hash = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase.from('users')
      .insert({ email, nome, password_hash })
      .select('id,email,nome,created_at').single();

    if (error) throw error;

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    // Boas-vindas por e-mail (não bloqueia resposta)
    sendWelcome(email, nome).catch(e => console.error('Welcome email failed:', e.message));

    res.json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch(err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

// ── POST /auth/login ──
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios.' });

  try {
    const { data: user } = await supabase.from('users')
      .select('id,email,nome,password_hash').eq('email', email).single();

    if (!user) return res.status(401).json({ error: 'E-mail não encontrado.' });

    // Debug: verifica se hash existe
    if (!user.password_hash) {
      console.error('Login: password_hash vazio para', email);
      return res.status(401).json({ error: 'Conta sem senha configurada. Use "Esqueci a senha" para definir.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.warn('Login: senha incorreta para', email, '| hash length:', user.password_hash?.length);
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch(err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

// ── POST /auth/forgot ──
router.post('/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

  try {
    const { data: user } = await supabase.from('users')
      .select('id,email,nome').eq('email', email).single();

    // Sempre responde 200 para não revelar se e-mail existe
    if (!user) return res.json({ message: 'Se este e-mail estiver cadastrado, você receberá as instruções.' });

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 hora

    await supabase.from('users').update({
      reset_token: token,
      reset_token_expires: expiry
    }).eq('id', user.id);

    sendPasswordReset(email, user.nome, token).catch(e => console.error('Reset email failed:', e.message));

    res.json({ message: 'Se este e-mail estiver cadastrado, você receberá as instruções.' });
  } catch(err) {
    console.error('Forgot error:', err);
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
});

// ── POST /auth/reset ──
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token e senha obrigatórios.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });

  try {
    const { data: user } = await supabase.from('users')
      .select('id,email,nome,reset_token_expires')
      .eq('reset_token', token).single();

    if (!user) return res.status(400).json({ error: 'Token inválido ou expirado.' });
    if (new Date(user.reset_token_expires) < new Date())
      return res.status(400).json({ error: 'Token expirado. Solicite um novo.' });

    const password_hash = await bcrypt.hash(password, 10);
    await supabase.from('users').update({
      password_hash,
      reset_token: null,
      reset_token_expires: null
    }).eq('id', user.id);

    const jwtToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ message: 'Senha redefinida com sucesso!', token: jwtToken });
  } catch(err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

// ── POST /auth/check-email ── verifica se e-mail tem conta ou lead anterior
router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });
  try {
    const { data: user } = await supabase.from('users').select('id,nome').eq('email', email).single();
    const { count: leadCount } = await supabase.from('leads').select('*', { count:'exact', head:true }).eq('email', email);
    res.json({
      hasAccount: !!user,
      hasLead: (leadCount || 0) > 0,
      nome: user?.nome || null
    });
  } catch(err) {
    res.json({ hasAccount: false, hasLead: false, nome: null });
  }
});

// ── POST /auth/send-code ── envia código de 6 dígitos por e-mail (reset no chat)
router.post('/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });
  try {
    const { data: user } = await supabase.from('users').select('id,nome').eq('email', email).single();
    if (!user) return res.status(404).json({ error: 'E-mail não encontrado.' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    await supabase.from('users').update({
      reset_token: code,
      reset_token_expires: expires
    }).eq('id', user.id);

    // Envia e-mail com código
    const { sendPasswordReset: _pr, ...mailer } = require('../services/mailer');
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { ciphers:'SSLv3', rejectUnauthorized:false }
    });
    const FROM = process.env.SMTP_FROM || 'Visa Match <contato@imigrareua.com>';
    await transporter.sendMail({
      from: FROM, to: email,
      subject: `${code} é seu código de verificação — Visa Match`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8faff">
        <div style="background:linear-gradient(135deg,#1A72F6,#002b70);border-radius:14px;padding:28px;text-align:center;margin-bottom:20px">
          <h2 style="color:#fff;margin:0;font-size:20px">Código de Verificação</h2>
          <p style="color:rgba(255,255,255,.7);margin:6px 0 0;font-size:13px">Visa Match · ImigrarEUA</p>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;border:1px solid rgba(194,198,216,.4)">
          <p style="color:#424655;font-size:14px;margin:0 0 16px">Olá${user.nome ? ', <strong>' + user.nome + '</strong>' : ''}! Seu código de verificação é:</p>
          <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0053d0;padding:16px 0">${code}</div>
          <p style="color:#737687;font-size:12px;margin:12px 0 0">Válido por <strong>10 minutos</strong>. Não compartilhe com ninguém.</p>
        </div>
      </div>`
    });

    res.json({ message: 'Código enviado.' });
  } catch(err) {
    console.error('Send code error:', err);
    res.status(500).json({ error: 'Erro ao enviar código.' });
  }
});

// ── POST /auth/verify-code ── verifica código e faz login
router.post('/verify-code', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email e código obrigatórios.' });
  try {
    const { data: user } = await supabase.from('users')
      .select('id,email,nome,reset_token,reset_token_expires')
      .eq('email', email).single();

    if (!user || user.reset_token !== code)
      return res.status(400).json({ error: 'Código incorreto.' });
    if (new Date(user.reset_token_expires) < new Date())
      return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });

    await supabase.from('users').update({ reset_token: null, reset_token_expires: null }).eq('id', user.id);

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch(err) {
    console.error('Verify code error:', err);
    res.status(500).json({ error: 'Erro ao verificar código.' });
  }
});

module.exports = router;
