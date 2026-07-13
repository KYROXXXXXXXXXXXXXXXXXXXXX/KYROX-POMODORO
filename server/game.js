// Pure Word Bomb logic — no server, no timers, no I/O. Fully unit-testable.
//
// Multi-language: each language gets its own dictionary index built once at
// startup ({ dict, tiers, norm }). Syllables are bucketed into 3 rarity tiers
// (easy / medium / hard); the game starts at the chosen difficulty and climbs
// one tier every LEVEL_EVERY accepted words.

export const LEVEL_EVERY = 6; // accepted words before the syllables get rarer
const MIN_PLAYABLE = 60; // a syllable must appear in at least this many words

// Latin languages: lowercase, strip accents, keep a-z.
export const normLatin = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

// Arabic: strip tashkeel/tatweel, unify alef/yaa/hamza/taa-marbuta variants,
// keep Arabic letters only.
export const normArabic = (s) =>
  String(s)
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي]/g, '');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a language index: normalized dictionary Set + syllables bucketed into
 * 3 rarity tiers (tiers[0] = common/easy … tiers[2] = rare/hard).
 */
export function buildIndex(words, lang = 'en') {
  const norm = lang === 'ar' ? normArabic : normLatin;
  const dict = new Set();
  for (const w of words) {
    const n = norm(w);
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
  const playable = [...counts.entries()]
    .filter(([, c]) => c >= MIN_PLAYABLE)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  const a = Math.floor(playable.length * 0.35);
  const b = Math.floor(playable.length * 0.7);
  const tiers = [playable.slice(0, a), playable.slice(a, b), playable.slice(b)];
  // Never leave a tier empty on small dictionaries.
  for (let i = 0; i < 3; i++) if (tiers[i].length === 0) tiers[i] = playable;
  return { dict, tiers, norm };
}

export const pickSyllable = (tiers, level) => {
  const pool = tiers[Math.max(0, Math.min(2, level))] ?? [];
  return pool.length ? pool[(Math.random() * pool.length) | 0] : 'es';
};

const DIFF_LEVEL = { easy: 0, normal: 1, hard: 2 };

export function freshBomb() {
  return {
    phase: 'idle', // 'idle' | 'playing' | 'over'
    lang: 'en', // 'en' | 'fr' | 'ar'
    difficulty: 'easy',
    level: 0,
    solved: 0,
    order: [],
    lives: {},
    alive: {},
    turnIdx: 0,
    syllable: '',
    typing: '', // live text of the current player, mirrored to everyone
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

export function startBomb(b, ids, index, opts = {}) {
  if (ids.length < 1) return;
  if (Number.isFinite(Number(opts.turnSeconds))) {
    b.turnMs = Math.min(40, Math.max(5, Math.round(Number(opts.turnSeconds)))) * 1000;
  }
  if (Number.isFinite(Number(opts.lives))) {
    b.startLives = Math.min(5, Math.max(1, Math.round(Number(opts.lives))));
  }
  b.lang = opts.lang ?? b.lang;
  b.difficulty = opts.difficulty in DIFF_LEVEL ? opts.difficulty : 'easy';
  b.level = DIFF_LEVEL[b.difficulty];
  b.solved = 0;
  b.order = shuffle([...ids]);
  b.lives = {};
  b.alive = {};
  for (const id of b.order) {
    b.lives[id] = b.startLives;
    b.alive[id] = true;
  }
  b.solo = b.order.length === 1;
  b.turnIdx = 0;
  b.syllable = pickSyllable(index.tiers, b.level);
  b.typing = '';
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
export function submitWord(b, index, playerId, raw, now = Date.now()) {
  if (b.phase !== 'playing') return false;
  if (b.order[b.turnIdx] !== playerId) return false;
  const word = index.norm(raw || '');
  if (!word) return false;
  if (!word.includes(b.syllable)) {
    b.message = `The word must contain “${b.syllable}”`;
    return false;
  }
  if (b.used.has(word)) {
    b.message = 'Word already used!';
    return false;
  }
  if (!index.dict.has(word)) {
    b.message = `“${String(raw).trim()}” isn't in the dictionary`;
    return false;
  }
  b.used.add(word);
  b.lastWord = word;
  b.message = null;
  b.typing = '';
  b.solved += 1;
  if (b.solved % LEVEL_EVERY === 0 && b.level < 2) b.level += 1;
  b.syllable = pickSyllable(index.tiers, b.level);
  advanceTurn(b);
  b.turnEndsAt = now + b.turnMs;
  return true;
}

/** Drives the bomb timer. nameOf(id)->string for messages. Returns true if state changed. */
export function timeoutTick(b, index, nameOf, now = Date.now()) {
  if (b.phase !== 'playing' || !b.turnEndsAt || now < b.turnEndsAt) return false;
  const cur = b.order[b.turnIdx];
  b.typing = '';
  if (b.solo) {
    b.message = '💥 Missed!';
    b.syllable = pickSyllable(index.tiers, b.level);
    b.turnEndsAt = now + b.turnMs;
    return true;
  }
  b.lives[cur] = Math.max(0, (b.lives[cur] || 0) - 1);
  b.message = `💥 Time's up for ${nameOf(cur)}`;
  if (b.lives[cur] <= 0) b.alive[cur] = false;
  const remaining = b.order.filter((id) => b.alive[id]);
  if (remaining.length <= 1) {
    b.phase = 'over';
    b.winnerId = remaining[0] || null;
    b.turnEndsAt = null;
    return true;
  }
  advanceTurn(b);
  b.syllable = pickSyllable(index.tiers, b.level);
  b.turnEndsAt = now + b.turnMs;
  return true;
}

export function handleLeave(b, index, id, now = Date.now()) {
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
    b.syllable = pickSyllable(index.tiers, b.level);
    b.typing = '';
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
  b.typing = '';
  b.used = new Set();
  b.turnEndsAt = null;
  b.winnerId = null;
  b.lastWord = null;
  b.message = null;
  b.level = DIFF_LEVEL[b.difficulty] ?? 0;
  b.solved = 0;
}
