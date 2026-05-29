const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const router = express.Router();

// Store audio in memory (no disk needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo de áudio recebido.' });

  try {
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: 'audio.webm', contentType: req.file.mimetype });
    form.append('model', 'whisper-1');
    form.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Whisper error:', err);
      return res.status(502).json({ error: 'Erro na transcrição.' });
    }

    const { text } = await response.json();
    res.json({ text });

  } catch (err) {
    console.error('Transcribe route error:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
