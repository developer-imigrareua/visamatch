require('dotenv').config();
const express = require('express');
const cors = require('cors');

const transcribeRoute = require('./routes/transcribe');
const leadRoute = require('./routes/lead');
const sessionRoute = require('./routes/session');
const adminRoute = require('./routes/admin');
const analyzeRoute = require('./routes/analyze');
const authRoute = require('./routes/auth');
const userRoute = require('./routes/user');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.use('/transcribe', transcribeRoute);
app.use('/lead', leadRoute);
app.use('/session', sessionRoute);
app.use('/admin', adminRoute);
app.use('/analyze', analyzeRoute);
app.use('/auth', authRoute);
app.use('/user', userRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Visa Match API running on port ${PORT}`));
