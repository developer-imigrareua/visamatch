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

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta.' });

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

module.exports = router;
