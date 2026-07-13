import { useEffect, useRef, useState } from 'react';
import type { BombDifficulty, BombLang, BombState, Sync } from './useGameSync';
import type { Me } from './discordSdk';

const LANGS: { id: BombLang; flag: string; label: string }[] = [
  { id: 'en', flag: '🇬🇧', label: 'English' },
  { id: 'fr', flag: '🇫🇷', label: 'Français' },
  { id: 'ar', flag: '🇲🇦', label: 'العربية' },
];
const DIFFS: { id: BombDifficulty; label: string; hint: string }[] = [
  { id: 'easy', label: '😌 Easy', hint: 'common syllables' },
  { id: 'normal', label: '🙂 Normal', hint: 'trickier mix' },
  { id: 'hard', label: '🔥 Hard', hint: 'rare syllables' },
];
const LEVEL_LABEL = ['😌 Easy', '🙂 Medium', '🔥 Hard'];

const hueOf = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

function Avatar({ id, name }: { id: string; name: string }) {
  return (
    <span className="pav" style={{ background: `hsl(${hueOf(id)} 55% 38%)` }}>
      {initials(name)}
    </span>
  );
}

function Hearts({ lives, alive }: { lives: number; alive: boolean }) {
  if (!alive) return <span className="hearts dead">✖</span>;
  return (
    <span className="hearts">
      {Array.from({ length: lives }).map((_, i) => (
        <span key={i}>❤</span>
      ))}
    </span>
  );
}

// The current player's keystrokes, mirrored live to everyone as letter chips
// with the required syllable highlighted (BombParty style).
function TypingStrip({ text, syllable }: { text: string; syllable: string }) {
  const lower = text.toLowerCase();
  const at = syllable ? lower.indexOf(syllable.toLowerCase()) : -1;
  return (
    <div className="type-strip" dir="auto">
      {[...text].map((c, i) => (
        <span
          key={i}
          className={`chip ${at >= 0 && i >= at && i < at + syllable.length ? 'hit' : ''}`}
        >
          {c.toUpperCase()}
        </span>
      ))}
      {text.length === 0 && <span className="type-hint muted">…</span>}
    </div>
  );
}

// Players in a circle around the bomb; the arrow points at whoever must play.
function Arena({ b, me }: { b: BombState & { secondsLeft: number }; me: Me }) {
  const seats = b.seats;
  const n = Math.max(seats.length, 1);
  const curIdx = Math.max(
    0,
    seats.findIndex((s) => s.id === b.currentId),
  );
  const angleDeg = (i: number) => (i / n) * 360 - 90;
  const danger = b.secondsLeft <= 3;

  return (
    <div className={`arena ${danger ? 'danger' : ''}`}>
      <div className="arrow-wrap" style={{ transform: `rotate(${angleDeg(curIdx) + 90}deg)` }}>
        <svg viewBox="0 0 34 40" aria-hidden>
          <path d="M17,0 L34,26 L23,26 L23,40 L11,40 L11,26 L0,26 Z" />
        </svg>
      </div>
      <div className="arena-center">
        <div className="syllable serif" dir="auto">
          {b.syllable.toUpperCase()}
        </div>
        <div className="bomb-timer">{b.secondsLeft.toFixed(1)}s</div>
      </div>
      {seats.map((s, i) => {
        const rad = (angleDeg(i) * Math.PI) / 180;
        const x = 50 + 41 * Math.cos(rad);
        const y = 50 + 41 * Math.sin(rad);
        return (
          <div
            key={s.id}
            className={`pseat ${s.id === b.currentId ? 'current' : ''} ${s.alive ? '' : 'dead'} ${
              s.id === me.id ? 'is-me' : ''
            }`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="pseat-name">{s.name}</span>
            <Avatar id={s.id} name={s.name} />
            <Hearts lives={s.lives} alive={s.alive} />
          </div>
        );
      })}
    </div>
  );
}

function Chat({ sync, me }: { sync: Sync; me: Me }) {
  const [text, setText] = useState('');
  const chat = sync.snap!.chat;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    sync.chat.send(t);
    setText('');
  };

  return (
    <aside className="chat-panel">
      <div className="chat-title">💬 Chat</div>
      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && <p className="muted small">Say hi to the room…</p>}
        {chat.map((m, i) => (
          <div key={`${m.t}-${i}`} className="chat-msg">
            <span
              className="chat-name"
              style={{ color: `hsl(${hueOf(m.id)} 70% 72%)` }}
            >
              {m.id === me.id ? 'You' : m.name}
            </span>
            <span className="chat-text" dir="auto">
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <div className="chat-row">
        <input
          className="chat-input"
          value={text}
          maxLength={200}
          placeholder="Type here to chat…"
          dir="auto"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
        />
        <button className="btn btn-mini" onClick={send}>
          Send
        </button>
      </div>
    </aside>
  );
}

export function WordBomb({ sync, me, onLeave }: { sync: Sync; me: Me; onLeave: () => void }) {
  const b = sync.snap!.bomb;
  const [word, setWord] = useState('');
  const [turnSeconds, setTurnSeconds] = useState(Math.round(b.turnMs / 1000));
  const [lives, setLives] = useState(b.startLives);
  const [lang, setLang] = useState<BombLang>(b.lang || 'en');
  const [difficulty, setDifficulty] = useState<BombDifficulty>(b.difficulty || 'easy');
  const inputRef = useRef<HTMLInputElement>(null);

  const startOpts = { turnSeconds, lives, lang, difficulty };
  const myTurn = b.phase === 'playing' && b.currentId === me.id;

  // Focus the field when it becomes my turn; clear leftovers when it isn't.
  useEffect(() => {
    if (myTurn) inputRef.current?.focus();
    else setWord('');
  }, [myTurn, b.currentId]);

  const submit = () => {
    const w = word.trim();
    if (!w) return;
    sync.bomb.submit(w);
    setWord('');
  };

  const leaveGame = () => {
    sync.bomb.leave();
    onLeave();
  };

  const langInfo = LANGS.find((l) => l.id === b.lang);

  let main;
  if (b.phase === 'idle') {
    // ---- Lobby -------------------------------------------------------------
    main = (
      <>
        <h2 className="serif title">Word Bomb</h2>
        <p className="muted">
          Find a word containing the syllable before the bomb explodes. Last one standing wins.
        </p>

        <div className="panel">
          <div className="seats">
            {b.seats.length === 0 && <p className="muted">Waiting for players…</p>}
            {b.seats.map((s) => (
              <div key={s.id} className="seat">
                <span className="seat-name">{s.name}</span>
              </div>
            ))}
          </div>

          <div className="opt-group">
            <span className="opt-label">Language</span>
            <div className="opt-row">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  className={`opt-pill ${lang === l.id ? 'active' : ''}`}
                  onClick={() => setLang(l.id)}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="opt-group">
            <span className="opt-label">Difficulty · gets harder as you play</span>
            <div className="opt-row">
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  className={`opt-pill ${difficulty === d.id ? 'active' : ''}`}
                  title={d.hint}
                  onClick={() => setDifficulty(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid two">
            <label>
              Seconds per turn
              <input
                type="number"
                min={5}
                max={40}
                value={turnSeconds}
                onChange={(e) => setTurnSeconds(+e.target.value)}
              />
            </label>
            <label>
              Lives per player
              <input type="number" min={1} max={5} value={lives} onChange={(e) => setLives(+e.target.value)} />
            </label>
          </div>
          <button className="btn btn-primary big" onClick={() => sync.bomb.start(startOpts)}>
            💣 Start game
          </button>
          <p className="muted small">2+ players recommended · solo is practice mode.</p>
        </div>
      </>
    );
  } else if (b.phase === 'over') {
    // ---- Game over ----------------------------------------------------------
    const winner = b.seats.find((s) => s.id === b.winnerId);
    main = (
      <div className="panel narrow trophy">
        <div className="big-emoji">🏆</div>
        <h2 className="serif">{winner ? `${winner.name} wins the game!` : 'Game over'}</h2>
        <div className="controls">
          <button className="btn btn-primary" onClick={() => sync.bomb.start(startOpts)}>
            Play again
          </button>
          <button className="btn btn-ghost" onClick={sync.bomb.reset}>
            Back to lobby
          </button>
        </div>
      </div>
    );
  } else {
    // ---- Playing ------------------------------------------------------------
    const current = b.seats.find((s) => s.id === b.currentId);
    main = (
      <>
        <div className="bomb-top">
          <div className="bomb-badges">
            <span className="badge">
              {langInfo?.flag} {langInfo?.label}
            </span>
            <span className="badge">{LEVEL_LABEL[b.level] ?? LEVEL_LABEL[0]}</span>
          </div>
          <button className="btn btn-mini leave-btn" onClick={leaveGame}>
            🚪 Leave
          </button>
        </div>

        <TypingStrip text={myTurn ? word : b.typing} syllable={b.syllable} />
        <Arena b={b} me={me} />

        <div className="turn-line">
          {myTurn ? (
            <strong className="your-turn">Your turn!</strong>
          ) : (
            <span className="muted">{current?.name ?? '…'}'s turn</span>
          )}
        </div>

        <div className="word-row">
          <input
            ref={inputRef}
            className="word-input"
            dir="auto"
            value={word}
            disabled={!myTurn}
            placeholder={myTurn ? `a word with “${b.syllable}”` : 'wait…'}
            onChange={(e) => {
              setWord(e.target.value);
              if (myTurn) sync.bomb.typing(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <button className="btn btn-primary" disabled={!myTurn} onClick={submit}>
            Submit
          </button>
        </div>

        <div className={`msg ${b.message ? 'show' : ''}`}>{b.message ?? ' '}</div>
        {b.lastWord && (
          <div className="last-word muted">
            Last accepted word: <em dir="auto">{b.lastWord}</em>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="screen bomb">
      <div className="bomb-layout">
        <div className="bomb-main">{main}</div>
        <Chat sync={sync} me={me} />
      </div>
    </div>
  );
}
