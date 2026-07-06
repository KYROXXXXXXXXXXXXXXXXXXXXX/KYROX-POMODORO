// Pure Word Bomb logic — no server, no timers, no I/O. Fully unit-testable.

export const SYL_MIN = 500;
export const SYL_MAX = 9000;

export const normWord = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build the normalized dictionary Set + list of medium-frequency syllables. */
export function buildIndex(words) {
  const dict = new Set();
  for (const w of words) {
    const n = normWord(w);
    if (n.length >= 3) dict.add(n);
  }
  const counts = new Map();
  for (const word of dict) {
    const seen = new Set();
    for (let len = 2; len <= 3; len++) {
      for (let i = 0; i + len <= word.length; i++) {
        const sub = word.slice(i, i + len);
        if (!seen.has(sub)) {
          seen.add(sub);
          counts.set(sub, (counts.get(sub) || 0) + 1);
        }
      }
    }
  }
  const syllables = [...counts.entries()]
    .filter(([, c]) => c >= SYL_MIN && c <= SYL_MAX)
    .map(([s]) => s);
  return { dict, syllables };
}

export const pickSyllable = (syllables) =>
  syllables.length ? syllables[(Math.random() * syllables.length) | 0] : 'es';

export function freshBomb() {
  return {
    phase: 'idle', // 'idle' | 'playing' | 'over'
    order: [],
    lives: {},
    alive: {},
    turnIdx: 0,
    syllable: '',
    used: new Set(),
    turnEndsAt: null,
    turnMs: 12000,
    startLives: 2,
    solo: false,
    winnerId: null,
    lastWord: null,
    message: null,
  };
}

export function startBomb(b, ids, syllables, opts = {}) {
  if (ids.length < 1) return;
  if (Number.isFinite(Number(opts.turnSeconds))) {
    b.turnMs = Math.min(40, Math.max(5, Math.round(Number(opts.turnSeconds)))) * 1000;
  }
  if (Number.isFinite(Number(opts.lives))) {
    b.startLives = Math.min(5, Math.max(1, Math.round(Number(opts.lives))));
  }
  b.order = shuffle([...ids]);
  b.lives = {};
  b.alive = {};
  for (const id of b.order) {
    b.lives[id] = b.startLives;
    b.alive[id] = true;
  }
  b.solo = b.order.length === 1;
  b.turnIdx = 0;
  b.syllable = pickSyllable(syllables);
  b.used = new Set();
  b.turnEndsAt = Date.now() + b.turnMs;
  b.winnerId = null;
  b.lastWord = null;
  b.message = null;
  b.phase = 'playing';
}

export function advanceTurn(b) {
  const n = b.order.length;
  for (let k = 1; k <= n; k++) {
    const idx = (b.turnIdx + k) % n;
    if (b.alive[b.order[idx]]) {
      b.turnIdx = idx;
      return;
    }
  }
}

/** Returns true if the word was accepted. Otherwise sets b.message and returns false. */
export function submitWord(b, dict, syllables, playerId, raw, now = Date.now()) {
  if (b.phase !== 'playing') return false;
  if (b.order[b.turnIdx] !== playerId) return false;
  const word = normWord(raw || '');
  if (!word) return false;
  if (!word.includes(b.syllable)) {
    b.message = `Le mot doit contenir « ${b.syllable} »`;
    return false;
  }
  if (b.used.has(word)) {
    b.message = 'Mot déjà utilisé !';
    return false;
  }
  if (!dict.has(word)) {
    b.message = `« ${String(raw).trim()} » n'est pas dans le dictionnaire`;
    return false;
  }
  b.used.add(word);
  b.lastWord = word;
  b.message = null;
  b.syllable = pickSyllable(syllables);
  advanceTurn(b);
  b.turnEndsAt = now + b.turnMs;
  return true;
}

/** Drives the bomb timer. nameOf(id)->string for messages. Returns true if state changed. */
export function timeoutTick(b, syllables, nameOf, now = Date.now()) {
  if (b.phase !== 'playing' || !b.turnEndsAt || now < b.turnEndsAt) return false;
  const cur = b.order[b.turnIdx];
  if (b.solo) {
    b.message = '💥 Raté !';
    b.syllable = pickSyllable(syllables);
    b.turnEndsAt = now + b.turnMs;
    return true;
  }
  b.lives[cur] = Math.max(0, (b.lives[cur] || 0) - 1);
  b.message = `💥 Temps écoulé pour ${nameOf(cur)}`;
  if (b.lives[cur] <= 0) b.alive[cur] = false;
  const remaining = b.order.filter((id) => b.alive[id]);
  if (remaining.length <= 1) {
    b.phase = 'over';
    b.winnerId = remaining[0] || null;
    b.turnEndsAt = null;
    return true;
  }
  advanceTurn(b);
  b.syllable = pickSyllable(syllables);
  b.turnEndsAt = now + b.turnMs;
  return true;
}

export function handleLeave(b, syllables, id, now = Date.now()) {
  if (b.phase !== 'playing' || !(id in b.alive)) return false;
  const wasCurrent = b.order[b.turnIdx] === id;
  b.alive[id] = false;
  const remaining = b.order.filter((x) => b.alive[x]);
  if (remaining.length <= 1 && !b.solo) {
    b.phase = 'over';
    b.winnerId = remaining[0] || null;
    b.turnEndsAt = null;
    return true;
  }
  if (wasCurrent) {
    advanceTurn(b);
    b.syllable = pickSyllable(syllables);
    b.turnEndsAt = now + b.turnMs;
    return true;
  }
  return false;
}

export function resetBomb(b) {
  b.phase = 'idle';
  b.order = [];
  b.lives = {};
  b.alive = {};
  b.used = new Set();
  b.turnEndsAt = null;
  b.winnerId = null;
  b.lastWord = null;
  b.message = null;
}
