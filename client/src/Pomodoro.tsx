import { useState } from 'react';
import type { Sync } from './useGameSync';

const PHASE_LABEL: Record<string, string> = {
  focus: 'Concentration',
  short: 'Pause courte',
  long: 'Pause longue',
};

function fmt(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Pomodoro({ sync }: { sync: Sync }) {
  const p = sync.snap!.pomo;
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(Math.round(p.durations.focus / 60));
  const [short, setShort] = useState(Math.round(p.durations.short / 60));
  const [long, setLong] = useState(Math.round(p.durations.long / 60));
  const [longEvery, setLongEvery] = useState(p.longEvery);

  const full = p.durations[p.mode];
  const frac = full > 0 ? p.secondsLeft / full : 0;
  const R = 130;
  const C = 2 * Math.PI * R;

  const save = () => {
    sync.pomo.config(
      { focus: Math.max(1, focus), short: Math.max(1, short), long: Math.max(1, long) },
      Math.max(1, longEvery),
    );
    setOpen(false);
  };

  return (
    <div className={`screen pomo phase-${p.mode}`}>
      <div className="phase-name serif">{PHASE_LABEL[p.mode]}</div>

      <div className="ring-wrap">
        <svg viewBox="0 0 300 300" className="ring">
          <circle className="ring-track" cx="150" cy="150" r={R} />
          <circle
            className="ring-fill"
            cx="150"
            cy="150"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 150 150)"
          />
        </svg>
        <div className="ring-center">
          <div className="time serif">{fmt(p.secondsLeft)}</div>
          <div className="cycles muted">Cycles : {p.completedFocus}</div>
        </div>
      </div>

      <div className="controls">
        {p.running ? (
          <button className="btn btn-primary" onClick={sync.pomo.pause}>
            Pause
          </button>
        ) : (
          <button className="btn btn-primary" onClick={sync.pomo.start}>
            Démarrer
          </button>
        )}
        <button className="btn btn-ghost" onClick={sync.pomo.reset}>
          Réinitialiser
        </button>
        <button className="btn btn-ghost" onClick={sync.pomo.skip}>
          Passer ›
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)}>
          ⚙ Réglages
        </button>
      </div>

      {open && (
        <div className="panel settings">
          <h3 className="serif">Durées (minutes)</h3>
          <div className="grid">
            <label>
              Concentration
              <input type="number" min={1} max={180} value={focus} onChange={(e) => setFocus(+e.target.value)} />
            </label>
            <label>
              Pause courte
              <input type="number" min={1} max={60} value={short} onChange={(e) => setShort(+e.target.value)} />
            </label>
            <label>
              Pause longue
              <input type="number" min={1} max={120} value={long} onChange={(e) => setLong(+e.target.value)} />
            </label>
            <label>
              Pause longue toutes les
              <input
                type="number"
                min={1}
                max={12}
                value={longEvery}
                onChange={(e) => setLongEvery(+e.target.value)}
              />
            </label>
          </div>
          <button className="btn btn-primary" onClick={save}>
            Appliquer
          </button>
          <p className="muted small">S'applique pour tout le salon.</p>
        </div>
      )}
    </div>
  );
}
