"use strict";

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = path.join(__dirname, 'leaderboard.json');

// ── Ensure DB file exists ──────────────────────────────────────────────────────
if (!fs.existsSync(DB)) fs.writeFileSync(DB, '[]');

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch { return []; }
}
function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve the game frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── Leaderboard API ───────────────────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  const data = readDB().sort((a, b) => b.score - a.score);
  res.json(data);
});

app.post('/api/leaderboard', (req, res) => {
  const { name, score } = req.body;

  if (typeof name !== 'string' || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const safeName  = name.trim().slice(0, 20) || 'Anonymous';
  const safeScore = Math.max(0, Math.floor(score));

  const data = readDB();
  data.push({ name: safeName, score: safeScore, date: new Date().toISOString() });

  // Keep top 100 only
  data.sort((a, b) => b.score - a.score);
  if (data.length > 100) data.splice(100);
  writeDB(data);

  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Aero server running → http://localhost:${PORT}`);
});
