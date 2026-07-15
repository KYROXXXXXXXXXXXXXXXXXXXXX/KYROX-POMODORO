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

// Build one Word Bomb index per language once at startup.
const englishWords = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/english.json'), 'utf8'));
const arabicWords = fs
  .readFileSync(path.join(__dirname, 'data/arabic.txt'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean);

const INDEXES = {};
for (const [lang, words] of [
  ['fr', frenchWords],
  ['en', englishWords],
  ['ar', arabicWords],
]) {
  const t0 = Date.now();
  INDEXES[lang] = buildIndex(words, lang);
  console.log(
    `[bomb] ${lang}: ${INDEXES[lang].dict.size} words, tiers ${INDEXES[lang].tiers
      .map((t) => t.length)
      .join('/')} (${Date.now() - t0}ms)`,
  );
}
const indexFor = (b) => INDEXES[b.lang] ?? INDEXES.en;

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
// Clean legal-page URLs (required for Discord app verification).
app.get('/terms', (_req, res) => res.sendFile(path.join(clientDist, 'terms.html')));
app.get('/privacy', (_req, res) => res.sendFile(path.join(clientDist, 'privacy.html')));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

// ===========================================================================
// Shared per-instance state: Pomodoro (whole channel) + Word Bomb rooms
// ===========================================================================
const POMO_DEFAULTS = { durations: { focus: 25 * 60, short: 5 * 60, long: 15 * 60 }, longEvery: 4 };
const CHAT_MAX = 60;
const ROOM_MAX_PLAYERS = 16;
const ROOMS_MAX = 20;

/** @type {Map<string, any>} */
const instances = new Map();

// Word Bomb rooms are GLOBAL: players from different voice channels or even
// different Discord servers meet in the same room list. (The Pomodoro stays
// per voice channel.)
/** @type {Map<string, any>} */
const ROOMS = new Map(); // roomId -> { id, name, hostId, bomb, chat }

function freshInstance() {
  return {
    pomo: {
      mode: 'focus',
      running: false,
      endsAt: null,
      remaining: POMO_DEFAULTS.durations.focus,
      completedFocus: 0,
      durations: { ...POMO_DEFAULTS.durations },
      longEvery: POMO_DEFAULTS.longEvery,
    },
    sockets: new Map(), // ws -> { id, name, roomId } | null until 'hello'
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

function allPlayers() {
  const out = [];
  for (const inst of instances.values()) {
    for (const p of inst.sockets.values()) if (p && p.id) out.push(p);
  }
  return out;
}
const nameOf = (id) => allPlayers().find((p) => p.id === id)?.name ?? 'Player';

// Room members across every instance, deduped by player id.
function membersOf(roomId) {
  const seen = new Map();
  for (const p of allPlayers()) {
    if (p.roomId === roomId && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name });
  }
  return [...seen.values()];
}

function deleteRoomIfEmpty(roomId) {
  if (roomId && ROOMS.has(roomId) && membersOf(roomId).length === 0) {
    ROOMS.delete(roomId);
  }
}

function leaveRoom(p) {
  if (!p?.roomId) return;
  const room = ROOMS.get(p.roomId);
  if (room) handleLeave(room.bomb, indexFor(room.bomb), p.id);
  const oldId = p.roomId;
  p.roomId = null;
  deleteRoomIfEmpty(oldId);
}

function bombView(room) {
  const b = room.bomb;
  const seatIds = b.phase === 'idle' ? membersOf(room.id).map((m) => m.id) : b.order;
  const seats = seatIds.map((id) => ({
    id,
    name: nameOf(id),
    lives: b.lives[id] ?? b.startLives,
    alive: b.alive[id] ?? true,
  }));
  return {
    phase: b.phase,
    countdownEndsAt: b.countdownEndsAt,
    lang: b.lang,
    difficulty: b.difficulty,
    level: b.level,
    syllable: b.syllable,
    typing: b.typing ?? '',
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

const roomsList = () =>
  [...ROOMS.values()].map((r) => ({
    id: r.id,
    name: r.name,
    players: membersOf(r.id).length,
    phase: r.bomb.phase,
    lang: r.bomb.lang,
  }));

// Each socket gets the shared state + the detail of its own room (if any).
function broadcast(id) {
  const inst = instances.get(id);
  if (!inst) return;
  const base = {
    type: 'state',
    serverTime: Date.now(),
    players: players(inst).map((p) => ({ id: p.id, name: p.name })),
    pomo: inst.pomo,
    rooms: roomsList(),
  };
  for (const [ws, p] of inst.sockets) {
    if (ws.readyState !== ws.OPEN) continue;
    let room = null;
    if (p?.roomId) {
      const r = ROOMS.get(p.roomId);
      if (r) {
        room = {
          id: r.id,
          name: r.name,
          hostId: r.hostId,
          members: membersOf(r.id),
          bomb: bombView(r),
          chat: r.chat,
        };
      }
    }
    ws.send(JSON.stringify({ ...base, room }));
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
    case 'mode':
      // Tab click: jump straight to a phase, paused at its full duration.
      if (['focus', 'short', 'long'].includes(cmd.mode)) {
        s.mode = cmd.mode;
        s.running = false;
        s.endsAt = null;
        s.remaining = s.durations[cmd.mode];
      }
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
  const me = inst.sockets.get(ws);
  switch (cmd.type) {
    case 'hello': {
      const prev = me ?? {};
      inst.sockets.set(ws, {
        id: String(cmd.id ?? prev.id ?? `guest-${Math.random().toString(36).slice(2, 8)}`),
        name: String(cmd.name ?? prev.name ?? 'Player').slice(0, 32),
        roomId: prev.roomId ?? null,
      });
      break;
    }
    case 'pomo':
      pomoCommand(inst, cmd);
      break;
    case 'room': {
      if (!me) break;
      if (cmd.action === 'create') {
        if (ROOMS.size >= ROOMS_MAX) break;
        leaveRoom(me);
        const id = Math.random().toString(36).slice(2, 8);
        const name = String(cmd.name ?? '').trim().slice(0, 24) || `${me.name}'s room`;
        ROOMS.set(id, { id, name, hostId: me.id, bomb: freshBomb(), chat: [] });
        me.roomId = id;
      } else if (cmd.action === 'join') {
        const room = ROOMS.get(String(cmd.id ?? ''));
        if (room && membersOf(room.id).length < ROOM_MAX_PLAYERS) {
          leaveRoom(me);
          me.roomId = room.id;
        }
      } else if (cmd.action === 'leave') {
        leaveRoom(me);
      }
      break;
    }
    case 'bomb': {
      if (!me?.roomId) break;
      const room = ROOMS.get(me.roomId);
      if (!room) break;
      const b = room.bomb;
      if (cmd.action === 'start') {
        const lang = ['en', 'fr', 'ar'].includes(cmd.lang) ? cmd.lang : 'en';
        const ids = membersOf(room.id).map((m) => m.id);
        startBomb(b, ids, INDEXES[lang], { ...cmd, lang });
        console.log(
          `[game ${room.id}] start by ${me.name} · ${lang}/${b.difficulty} · players: ${ids
            .map((i) => nameOf(i))
            .join(', ')} · solo=${b.solo}`,
        );
      } else if (cmd.action === 'submit') {
        const ok = submitWord(b, indexFor(b), me.id, cmd.word);
        console.log(
          `[game ${room.id}] ${me.name} submit "${cmd.word}" → ${
            ok ? 'accepted' : `refused (${b.message})`
          } · lives: ${b.order.map((i) => `${nameOf(i)}=${b.lives[i]}`).join(' ')} · next: ${
            b.phase === 'playing' ? nameOf(b.order[b.turnIdx]) : b.phase
          }`,
        );
      } else if (cmd.action === 'typing') {
        // Mirror the current player's keystrokes to the whole room.
        if (b.phase === 'playing' && b.order[b.turnIdx] === me.id) {
          b.typing = String(cmd.text ?? '').slice(0, 40);
        }
      } else if (cmd.action === 'reset') {
        resetBomb(b);
      }
      break;
    }
    case 'chat': {
      if (!me?.roomId) break;
      const room = ROOMS.get(me.roomId);
      const text = String(cmd.text ?? '').trim().slice(0, 200);
      if (room && text) {
        room.chat.push({ id: me.id, name: me.name, text, t: Date.now() });
        if (room.chat.length > CHAT_MAX) room.chat.splice(0, room.chat.length - CHAT_MAX);
      }
      break;
    }
    default:
      break;
  }
}

// Rooms span instances, so any change fans out to every connected client.
function broadcastAll() {
  for (const id of instances.keys()) broadcast(id);
}

// One global tick drives Pomodoro phase changes + every room's bomb timer.
setInterval(() => {
  let roomsChanged = false;
  for (const room of ROOMS.values()) {
    if (timeoutTick(room.bomb, indexFor(room.bomb), (pid) => nameOf(pid))) roomsChanged = true;
  }
  for (const [id, inst] of instances) {
    let changed = roomsChanged;
    const s = inst.pomo;
    if (s.running && s.endsAt && Date.now() >= s.endsAt) {
      pomoAdvance(s);
      changed = true;
    }
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
    // Rooms are global: room-mates may live in other instances.
    broadcastAll();
  });

  ws.on('close', () => {
    const me = inst.sockets.get(ws);
    inst.sockets.delete(ws);
    if (me?.roomId) {
      const room = ROOMS.get(me.roomId);
      if (room) handleLeave(room.bomb, indexFor(room.bomb), me.id);
      deleteRoomIfEmpty(me.roomId);
    }
    if (inst.sockets.size === 0) {
      setTimeout(() => {
        if (inst.sockets.size === 0) instances.delete(instanceId);
      }, 5 * 60 * 1000);
    }
    broadcastAll();
  });
});

server.listen(PORT, () => console.log(`pomodoro+wordbomb server on :${PORT}`));
