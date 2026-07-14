import { useState } from 'react';
import type { PomoMode, Sync } from './useGameSync';

// Immersive lofi-style Pomodoro: a real photo backdrop (theme-tinted), a
// translucent timer widget with phase tabs, one-click duration presets, a
// tomato goal bar, and generative rain ambience (WebAudio — CSP-safe).

const TABS: { id: PomoMode; label: string }[] = [
  { id: 'focus', label: 'Pomodoro' },
  { id: 'short', label: 'Short Break' },
  { id: 'long', label: 'Long Break' },
];
const GOAL = 10;

// One-click presets: focus · short break · long break (minutes).
const PRESETS = [
  { label: 'Classic', detail: '25 · 5 · 15', f: 25, s: 5, l: 15 },
  { label: 'Deep work', detail: '50 · 10 · 20', f: 50, s: 10, l: 20 },
  { label: 'Quick', detail: '15 · 3 · 9', f: 15, s: 3, l: 9 },
];

function fmt(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Real photo backdrop (client/public/scene.jpg — Märt Kose, CC BY-SA,
// via Wikimedia Commons), tinted to follow the active theme.
function Scene() {
  return (
    <div className="pomo-scene" aria-hidden>
      <img src="/scene.jpg" alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <div className="sc-tint" />
      {/* drifting forest spirits */}
      <div className="fireflies">
        {Array.from({ length: 9 }).map((_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 13 + 7) % 92}%`,
              top: `${((i * 29 + 15) % 60) + 12}%`,
              animationDelay: `${(i * 0.9) % 5}s`,
              animationDuration: `${6 + (i % 4) * 2.2}s`,
            }}
          />
        ))}
      </div>
      <div className="sc-vignette" />
    </div>
  );
}

export function Pomodoro({ sync }: { sync: Sync }) {
  const p = sync.snap!.pomo;
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [focus, setFocus] = useState(Math.round(p.durations.focus / 60));
  const [short, setShort] = useState(Math.round(p.durations.short / 60));
  const [long, setLong] = useState(Math.round(p.durations.long / 60));
  const [longEvery, setLongEvery] = useState(p.longEvery);

  const full = p.durations[p.mode];
  const startLabel = p.secondsLeft < full ? 'Resume' : 'Start';

  const isPreset = (pr: (typeof PRESETS)[number]) =>
    p.durations.focus === pr.f * 60 &&
    p.durations.short === pr.s * 60 &&
    p.durations.long === pr.l * 60;

  const applyPreset = (pr: (typeof PRESETS)[number]) => {
    sync.pomo.config({ focus: pr.f, short: pr.s, long: pr.l }, p.longEvery);
    setFocus(pr.f);
    setShort(pr.s);
    setLong(pr.l);
  };

  const save = () => {
    sync.pomo.config(
      { focus: Math.max(1, focus), short: Math.max(1, short), long: Math.max(1, long) },
      Math.max(1, longEvery),
    );
    setOpen(false);
  };

  return (
    <div className={`screen pomo phase-${p.mode}`}>
      <Scene />

      <div className="pomo-ui">
        {/* tomato goal */}
        <div className="goal-bar">
          {Array.from({ length: GOAL }).map((_, i) => (
            <span key={i} className={`goal-dot ${i < p.completedFocus ? 'done' : ''}`}>
              🪶
            </span>
          ))}
          <span className="goal-label">
            {Math.min(p.completedFocus, GOAL)} / {GOAL} GOAL
          </span>
        </div>

        <div className="timer-card">
          <div className="mode-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`mode-tab ${p.mode === t.id ? 'active' : ''}`}
                onClick={() => sync.pomo.setMode(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="big-time">{fmt(p.secondsLeft)}</div>

          <div className="controls">
            {p.running ? (
              <button className="btn btn-primary big" onClick={sync.pomo.pause}>
                Pause
              </button>
            ) : (
              <button className="btn btn-primary big" onClick={sync.pomo.start}>
                {startLabel}
              </button>
            )}
            <button className="btn btn-ghost" onClick={sync.pomo.reset}>
              Reset
            </button>
            <button className="btn btn-ghost" onClick={sync.pomo.skip}>
              Skip ›
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-label="Settings">
              ⚙
            </button>
          </div>

          {open && (
            <div className="settings-grid">
              <span className="opt-label">Presets · focus / short / long</span>
              <div className="opt-row preset-row">
                {PRESETS.map((pr) => (
                  <button
                    key={pr.label}
                    className={`opt-pill ${isPreset(pr) ? 'active' : ''}`}
                    onClick={() => applyPreset(pr)}
                  >
                    <strong>{pr.label}</strong>
                    <span className="preset-detail">{pr.detail}</span>
                  </button>
                ))}
              </div>
              <button className="btn btn-ghost btn-mini" onClick={() => setCustom((c) => !c)}>
                {custom ? 'Hide custom' : 'Custom…'}
              </button>
              {custom && (
                <>
                  <div className="grid">
                    <label>
                      Focus
                      <input type="number" min={1} max={180} value={focus} onChange={(e) => setFocus(+e.target.value)} />
                    </label>
                    <label>
                      Short break
                      <input type="number" min={1} max={60} value={short} onChange={(e) => setShort(+e.target.value)} />
                    </label>
                    <label>
                      Long break
                      <input type="number" min={1} max={120} value={long} onChange={(e) => setLong(+e.target.value)} />
                    </label>
                    <label>
                      Long break every
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
                    Apply
                  </button>
                </>
              )}
              <p className="muted small">Applies to the whole room.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
