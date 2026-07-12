import { useEffect, useRef, useState } from 'react';
import type { Sync } from './useGameSync';
import type { Me } from './discordSdk';

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

export function WordBomb({ sync, me }: { sync: Sync; me: Me }) {
  const b = sync.snap!.bomb;
  const [word, setWord] = useState('');
  const [turnSeconds, setTurnSeconds] = useState(Math.round(b.turnMs / 1000));
  const [lives, setLives] = useState(b.startLives);
  const inputRef = useRef<HTMLInputElement>(null);

  const myTurn = b.phase === 'playing' && b.currentId === me.id;

  // Focus the field when it becomes my turn.
  useEffect(() => {
    if (myTurn) inputRef.current?.focus();
  }, [myTurn, b.currentId]);

  const submit = () => {
    const w = word.trim();
    if (!w) return;
    sync.bomb.submit(w);
    setWord('');
  };

  // ---- Lobby --------------------------------------------------------------
  if (b.phase === 'idle') {
    return (
      <div className="screen bomb">
        <h2 className="serif title">Word Bomb</h2>
        <p className="muted">Find a word containing the syllable before the bomb explodes. Last one standing wins.</p>

        <div className="panel">
          <div className="seats">
            {b.seats.length === 0 && <p className="muted">Waiting for players…</p>}
            {b.seats.map((s) => (
              <div key={s.id} className="seat">
                <span className="seat-name">{s.name}</span>
              </div>
            ))}
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
          <button
            className="btn btn-primary big"
            onClick={() => sync.bomb.start({ turnSeconds, lives })}
          >
            💣 Start game
          </button>
          <p className="muted small">2+ players recommended · solo is practice mode.</p>
        </div>
      </div>
    );
  }

  // ---- Game over ----------------------------------------------------------
  if (b.phase === 'over') {
    const winner = b.seats.find((s) => s.id === b.winnerId);
    return (
      <div className="screen bomb center">
        <div className="panel narrow trophy">
          <div className="big-emoji">🏆</div>
          <h2 className="serif">{winner ? `${winner.name} wins the game!` : 'Game over'}</h2>
          <div className="controls">
            <button className="btn btn-primary" onClick={() => sync.bomb.start({ turnSeconds, lives })}>
              Play again
            </button>
            <button className="btn btn-ghost" onClick={sync.bomb.reset}>
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Playing ------------------------------------------------------------
  const left = b.secondsLeft;
  const frac = b.turnMs > 0 ? Math.max(0, Math.min(1, (left * 1000) / b.turnMs)) : 0;
  const danger = left <= 3;
  const R = 96;
  const C = 2 * Math.PI * R;
  const current = b.seats.find((s) => s.id === b.currentId);

  return (
    <div className="screen bomb">
      <div className={`bomb-stage ${danger ? 'danger' : ''}`}>
        <svg viewBox="0 0 220 220" className="bomb-ring">
          <circle className="ring-track" cx="110" cy="110" r={R} />
          <circle
            className="ring-fill"
            cx="110"
            cy="110"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 110 110)"
          />
        </svg>
        <div className="bomb-center">
          <div className="syllable serif">{b.syllable.toUpperCase()}</div>
          <div className="bomb-timer">{left.toFixed(1)}s</div>
        </div>
      </div>

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
          value={word}
          disabled={!myTurn}
          placeholder={myTurn ? `a word with “${b.syllable}”` : 'wait…'}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button className="btn btn-primary" disabled={!myTurn} onClick={submit}>
          Submit
        </button>
      </div>

      <div className={`msg ${b.message ? 'show' : ''}`}>{b.message ?? '\u00a0'}</div>
      {b.lastWord && (
        <div className="last-word muted">
          Last accepted word: <em>{b.lastWord}</em>
        </div>
      )}

      <div className="seats playing">
        {b.seats.map((s) => (
          <div key={s.id} className={`seat ${s.id === b.currentId ? 'current' : ''} ${s.alive ? '' : 'dead'}`}>
            <span className="seat-name">{s.name}</span>
            <Hearts lives={s.lives} alive={s.alive} />
          </div>
        ))}
      </div>
    </div>
  );
}
