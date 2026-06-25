require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const transcribeRoute = require('./routes/transcribe');
const leadRoute = require('./routes/lead');
const sessionRoute = require('./routes/session');
const adminRoute = require('./routes/admin');
const analyzeRoute = require('./routes/analyze');
const authRoute = require('./routes/auth');
const userRoute = require('./routes/user');
const eventsRoute = require('./routes/events');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// Rewrite /api/* → /* (frontend chama /api/, backend tem rotas em /)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  next();
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.use('/transcribe', transcribeRoute);
app.use('/lead', leadRoute);
app.use('/session', sessionRoute);
app.use('/admin', adminRoute);
app.use('/analyze', analyzeRoute);
app.use('/auth', authRoute);
app.use('/user', userRoute);
app.use('/events', eventsRoute);

// Arquivos estáticos — depois de todas as rotas de API
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Visa Match API running on port ${PORT}`));
