require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Google OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI || 'http://localhost:3001/auth/callback'
);

// Se já tem refresh token, seta
if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
}

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// ─── AUTH ────────────────────────────────────────────────
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar']
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  console.log('\n✅ REFRESH TOKEN — cole no .env:\nGOOGLE_REFRESH_TOKEN=' + tokens.refresh_token + '\n');
  res.send('<h2 style="font-family:sans-serif;text-align:center;margin-top:80px">✅ Autorizado! Copie o refresh token do terminal e cole no .env</h2>');
});

// ─── HORÁRIOS DISPONÍVEIS ────────────────────────────────
app.get('/api/horarios', async (req, res) => {
  try {
    const { data } = req.query; // "2026-06-10"

    const inicio = new Date(data + 'T08:00:00-03:00');
    const fim    = new Date(data + 'T20:00:00-03:00');

    // Pega eventos já marcados no dia
    const eventos = await calendar.events.list({
      calendarId: 'primary',
      timeMin: inicio.toISOString(),
      timeMax: fim.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const ocupados = (eventos.data.items || []).map(e => ({
      inicio: new Date(e.start.dateTime || e.start.date),
      fim:    new Date(e.end.dateTime   || e.end.date)
    }));

    // Gera slots de 60 min entre 08h e 19h
    const slots = [];
    let hora = new Date(inicio);
    while (hora < fim) {
      const proxima = new Date(hora.getTime() + 60 * 60 * 1000);
      const livre = !ocupados.some(o =>
        hora < o.fim && proxima > o.inicio
      );
      if (livre) {
        slots.push({
          hora: hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
          iso:  hora.toISOString()
        });
      }
      hora = proxima;
    }

    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar horários' });
  }
});

// ─── AGENDAR ────────────────────────────────────────────
app.post('/api/agendar', async (req, res) => {
  try {
    const { nome, empresa, whatsapp, faturamento, dor, horarioISO } = req.body;

    const inicio = new Date(horarioISO);
    const fim    = new Date(inicio.getTime() + 60 * 60 * 1000);

    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `🤖 Reunião — ${nome} (${empresa})`,
        description:
          `Nome: ${nome}\nEmpresa: ${empresa}\nWhatsApp: ${whatsapp}\nFaturamento: ${faturamento}\nDor principal: ${dor}`,
        start: { dateTime: inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
        end:   { dateTime: fim.toISOString(),    timeZone: 'America/Sao_Paulo' },
        attendees: [{ email: 'jefersonberchiorrodrigues@gmail.com' }],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email',  minutes: 60 },
            { method: 'popup',  minutes: 30 }
          ]
        }
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar evento' });
  }
});

// ─── FRONTEND ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Servidor rodando em http://localhost:${PORT}`));
