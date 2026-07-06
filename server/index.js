import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import express from 'express';
import { WebSocketServer } from 'ws';
import {
  buildIndex,
  freshBomb,
  startBomb,
  submitWord,
  timeoutTick,
  handleLeave,
  resetBomb,
} from './game.js';

const require = createRequire(import.meta.url);
const frenchWords = require('an-array-of-french-words');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const PORT = Number(process.env.PORT) || 3001;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('[warn] VITE_DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET manquants — l’échange de token échouera.');
}

// Build the Word Bomb dictionary + playable syllables once at startup.
console.log('[bomb] indexation du dictionnaire…');
const t0 = Date.now();
const { dict: DICT, syllables: SYLLABLES } = buildIndex(frenchWords);
console.log(`[bomb] ${DICT.size} mots, ${SYLLABLES.length} syllabes jouables (${Date.now() - t0}ms)`);

// ===========================================================================
// Express: OAuth token exchange + serve the built client
// ===========================================================================
const app = express();
app.use(express.json());

app.post('/api/token', async (req, res) => {
  try {
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: 'missing code' });
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error('token exchange failed', err);
    res.status(500).json({ error: 'token exchange failed' });
  }
});

const clientDist = path.resolve(__dirname, '../client/dist');
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.warn('[warn] client/dist introuvable — lance `npm run build` avant `npm start`.');
}
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

// ===========================================================================
// Shared per-instance state: menu + Pomodoro + Word Bomb per Activity
// ===========================================================================
const POMO_DEFAULTS = { durations: { focus: 25 * 60, short: 5 * 60, long: 15 * 60 }, longEvery: 4 };

/** @type {Map<string, any>} */
const instances = new Map();

function freshInstance() {
  return {
    view: 'menu', // 'menu' | 'pomodoro' | 'wordbomb'
    pomo: {
      mode: 'focus',
      running: false,
      endsAt: null,
      remaining: POMO_DEFAULTS.durations.focus,
      completedFocus: 0,
      durations: { ...POMO_DEFAULTS.durations },
      longEvery: POMO_DEFAULTS.longEvery,
    },
    bomb: freshBomb(),
    sockets: new Map(), // ws -> { id, name }
  };
}

function getInstance(id) {
  let inst = instances.get(id);
  if (!inst) {
    inst = freshInstance();
    instances.set(id, inst);
  }
  return inst;
}

const players = (inst) => [...inst.sockets.values()].filter((p) => p && p.id);
const nameOf = (inst, id) => players(inst).find((p) => p.id === id)?.name ?? 'Joueur';

function bombView(inst) {
  const b = inst.bomb;
  const seatIds = b.phase === 'idle' ? players(inst).map((p) => p.id) : b.order;
  const seats = seatIds.map((id) => ({
    id,
    name: nameOf(inst, id),
    lives: b.lives[id] ?? b.startLives,
    alive: b.alive[id] ?? true,
  }));
  return {
    phase: b.phase,
    syllable: b.syllable,
    turnEndsAt: b.turnEndsAt,
    turnMs: b.turnMs,
    startLives: b.startLives,
    solo: b.solo,
    message: b.message,
    lastWord: b.lastWord,
    winnerId: b.winnerId,
    currentId: b.phase === 'playing' ? b.order[b.turnIdx] : null,
    seats,
  };
}

function broadcast(id) {
  const inst = instances.get(id);
  if (!inst) return;
  const msg = JSON.stringify({
    type: 'state',
    serverTime: Date.now(),
    view: inst.view,
    players: players(inst).map((p) => ({ id: p.id, name: p.name })),
    pomo: inst.pomo,
    bomb: bombView(inst),
  });
  for (const ws of inst.sockets.keys()) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// ---- Pomodoro logic (small enough to keep inline) -------------------------
function pomoAdvance(s) {
  const finishing = s.mode;
  if (finishing === 'focus') s.completedFocus += 1;
  let upcoming;
  if (finishing === 'focus') {
    upcoming = s.completedFocus % s.longEvery === 0 ? 'long' : 'short';
  } else {
    upcoming = 'focus';
    if (finishing === 'long') s.completedFocus = 0;
  }
  s.mode = upcoming;
  s.remaining = s.durations[upcoming];
  s.endsAt = Date.now() + s.remaining * 1000;
  s.running = true;
}

function pomoCommand(inst, cmd) {
  const s = inst.pomo;
  switch (cmd.action) {
    case 'start':
      if (!s.running) {
        s.endsAt = Date.now() + s.remaining * 1000;
        s.running = true;
      }
      break;
    case 'pause':
      if (s.running && s.endsAt) {
        s.remaining = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
        s.running = false;
        s.endsAt = null;
      }
      break;
    case 'reset':
      s.running = false;
      s.endsAt = null;
      s.remaining = s.durations[s.mode];
      break;
    case 'skip':
      pomoAdvance(s);
      break;
    case 'config': {
      if (cmd.durations) {
        for (const k of ['focus', 'short', 'long']) {
          const m = Number(cmd.durations[k]);
          if (Number.isFinite(m) && m > 0) s.durations[k] = Math.round(m * 60);
        }
      }
      const every = Number(cmd.longEvery);
      if (Number.isFinite(every) && every > 0) s.longEvery = Math.round(every);
      if (!s.running) s.remaining = s.durations[s.mode];
      break;
    }
    default:
      break;
  }
}

// ---- Command router -------------------------------------------------------
function applyCommand(inst, ws, cmd) {
  switch (cmd.type) {
    case 'hello':
      inst.sockets.set(ws, {
        id: String(cmd.id ?? `guest-${Math.random().toString(36).slice(2, 8)}`),
        name: String(cmd.name ?? 'Joueur').slice(0, 32),
      });
      break;
    case 'view':
      if (['menu', 'pomodoro', 'wordbomb'].includes(cmd.view)) inst.view = cmd.view;
      break;
    case 'pomo':
      pomoCommand(inst, cmd);
      break;
    case 'bomb':
      if (cmd.action === 'start') {
        startBomb(inst.bomb, players(inst).map((p) => p.id), SYLLABLES, cmd);
      } else if (cmd.action === 'submit') {
        const me = inst.sockets.get(ws);
        if (me) submitWord(inst.bomb, DICT, SYLLABLES, me.id, cmd.word);
      } else if (cmd.action === 'reset') {
        resetBomb(inst.bomb);
      }
      break;
    default:
      break;
  }
}

// One global tick drives Pomodoro phase changes + Word Bomb turn timeouts.
setInterval(() => {
  for (const [id, inst] of instances) {
    let changed = false;
    const s = inst.pomo;
    if (s.running && s.endsAt && Date.now() >= s.endsAt) {
      pomoAdvance(s);
      changed = true;
    }
    if (timeoutTick(inst.bomb, SYLLABLES, (pid) => nameOf(inst, pid))) changed = true;
    if (changed) broadcast(id);
  }
}, 500);

// ===========================================================================
// WebSocket server
// ===========================================================================
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const instanceId = url.searchParams.get('instance') || 'default';
  const inst = getInstance(instanceId);
  inst.sockets.set(ws, null); // identity arrives via 'hello'
  broadcast(instanceId);

  ws.on('message', (raw) => {
    let cmd;
    try {
      cmd = JSON.parse(raw.toString());
    } catch {
      return;
    }
    applyCommand(inst, ws, cmd);
    broadcast(instanceId);
  });

  ws.on('close', () => {
    const me = inst.sockets.get(ws);
    inst.sockets.delete(ws);
    if (me) handleLeave(inst.bomb, SYLLABLES, me.id);
    if (inst.sockets.size === 0) {
      setTimeout(() => {
        if (inst.sockets.size === 0) instances.delete(instanceId);
      }, 5 * 60 * 1000);
    } else {
      broadcast(instanceId);
    }
  });
});

server.listen(PORT, () => console.log(`pomodoro+wordbomb server on :${PORT}`));
