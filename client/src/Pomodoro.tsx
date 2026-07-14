import { useEffect, useRef, useState } from 'react';
import type { PomoMode, Sync } from './useGameSync';

// Immersive lofi-style Pomodoro: a full-screen illustrated rainy-cabin scene
// (theme-aware), a translucent timer widget with phase tabs, a tomato goal
// bar, and a generative rain ambience (WebAudio — no external assets, CSP-safe).

const TABS: { id: PomoMode; label: string }[] = [
  { id: 'focus', label: 'Pomodoro' },
  { id: 'short', label: 'Short Break' },
  { id: 'long', label: 'Long Break' },
];
const GOAL = 10;

function fmt(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Generative rain: looping brown-ish noise through a lowpass filter.
function useRain() {
  const nodes = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);
  const [on, setOn] = useState(false);
  const [vol, setVol] = useState(0.5);

  const toggle = () => {
    if (nodes.current) {
      nodes.current.ctx.close();
      nodes.current = null;
      setOn(false);
      return;
    }
    const ctx = new AudioContext();
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2 + w * 0.14;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1100;
    const gain = ctx.createGain();
    gain.gain.value = vol * 0.55;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    nodes.current = { ctx, gain };
    setOn(true);
  };

  useEffect(() => {
    if (nodes.current) nodes.current.gain.gain.value = vol * 0.55;
  }, [vol]);
  useEffect(
    () => () => {
      nodes.current?.ctx.close();
    },
    [],
  );

  return { on, vol, setVol, toggle };
}

function Rain() {
  const drops = Array.from({ length: 44 }, (_, i) => ({
    x: 40 + ((i * 173) % 1520),
    dur: 0.9 + (i % 5) * 0.14,
    delay: (i * 0.31) % 1.4,
  }));
  return (
    <g className="sc-rain">
      {drops.map((d, i) => (
        <line
          key={i}
          x1={d.x}
          y1={-40}
          x2={d.x - 10}
          y2={-6}
          style={{ animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}
        />
      ))}
    </g>
  );
}

// The illustrated scene — flat vector, colours driven by CSS variables so the
// cabin follows the active theme (midnight / crimson / sakura).
function Scene() {
  return (
    <div className="pomo-scene" aria-hidden>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="scSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="sc-sky1" />
            <stop offset="1" className="sc-sky2" />
          </linearGradient>
          <radialGradient id="scSun" cx="50%" cy="50%" r="50%">
            <stop offset="0" className="sc-sun1" />
            <stop offset="1" className="sc-sun2" />
          </radialGradient>
          <radialGradient id="scFire" cx="50%" cy="60%" r="60%">
            <stop offset="0" stopColor="#ffd9a0" />
            <stop offset="1" stopColor="#ff7a2e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="scLamp" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffcf8a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffb663" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* sky, sun, mountains, forest */}
        <rect width="1600" height="640" fill="url(#scSky)" />
        <circle cx="640" cy="210" r="150" fill="url(#scSun)" opacity="0.8" />
        <circle cx="640" cy="210" r="72" className="sc-sunCore" />
        <path d="M0,430 L190,300 L360,420 L520,320 L700,440 L900,340 L1080,450 L1280,330 L1450,430 L1600,370 L1600,640 L0,640 Z" className="sc-mount1" />
        <path d="M0,520 L220,420 L420,520 L640,430 L860,530 L1100,440 L1320,530 L1600,450 L1600,640 L0,640 Z" className="sc-mount2" />
        <path d="M0,640 L0,560 Q120,520 240,560 T480,560 T720,560 T960,560 T1200,560 T1440,560 L1600,560 L1600,640 Z" className="sc-forest" />
        <Rain />

        {/* interior: floor + walls + A-frame beams */}
        <rect y="620" width="1600" height="280" className="sc-floor" />
        <rect y="614" width="1600" height="10" className="sc-floorEdge" />
        <path d="M0,0 L0,900 L70,900 L70,120 L800,28 L1530,120 L1530,900 L1600,900 L1600,0 Z" className="sc-frame" />
        <path d="M60,140 L800,44 L1540,140 L1540,120 L800,24 L60,120 Z" className="sc-frame" />
        <rect x="795" y="26" width="12" height="592" className="sc-frame" />
        <rect x="420" y="80" width="10" height="538" className="sc-frame" />
        <rect x="1170" y="80" width="10" height="538" className="sc-frame" />

        {/* hanging lanterns */}
        <g className="sc-lantern">
          <line x1="330" y1="60" x2="330" y2="150" />
          <circle cx="330" cy="176" r="26" className="sc-lampBody" />
          <circle cx="330" cy="176" r="60" fill="url(#scLamp)" className="sc-lampGlow" />
        </g>
        <g className="sc-lantern l2">
          <line x1="1240" y1="66" x2="1240" y2="130" />
          <circle cx="1240" cy="156" r="22" className="sc-lampBody" />
          <circle cx="1240" cy="156" r="52" fill="url(#scLamp)" className="sc-lampGlow" />
        </g>

        {/* desk + turntable + speaker (left) */}
        <rect x="60" y="600" width="330" height="18" rx="4" className="sc-wood" />
        <rect x="90" y="618" width="16" height="120" className="sc-woodDark" />
        <rect x="330" y="618" width="16" height="120" className="sc-woodDark" />
        <rect x="130" y="560" width="120" height="40" rx="6" className="sc-woodDark" />
        <circle cx="176" cy="580" r="14" className="sc-vinyl" />
        <rect x="270" y="520" width="70" height="80" rx="6" className="sc-woodDark" />
        <circle cx="305" cy="548" r="14" className="sc-speaker" />
        <circle cx="305" cy="580" r="8" className="sc-speaker" />

        {/* sleeping cat on the desk (far left) */}
        <g className="sc-cat">
          <ellipse cx="105" cy="590" rx="34" ry="14" />
          <circle cx="132" cy="582" r="12" />
          <path d="M124,573 L128,563 L133,572 Z" />
          <path d="M136,572 L141,562 L144,572 Z" />
          <path d="M72,590 Q60,578 72,570" strokeWidth="6" fill="none" className="sc-catTail" />
        </g>

        {/* low table (center) */}
        <rect x="700" y="660" width="220" height="14" rx="5" className="sc-wood" />
        <rect x="720" y="674" width="12" height="52" className="sc-woodDark" />
        <rect x="888" y="674" width="12" height="52" className="sc-woodDark" />
        <rect x="760" y="646" width="70" height="14" rx="3" className="sc-woodDark" />

        {/* monstera plants */}
        <g className="sc-plant">
          <rect x="1290" y="640" width="70" height="60" rx="8" className="sc-pot" />
          <path d="M1325,640 C1300,590 1265,585 1250,600 C1280,606 1295,620 1310,640 Z" />
          <path d="M1325,640 C1345,580 1390,570 1408,588 C1375,595 1355,615 1338,640 Z" />
          <path d="M1325,640 C1322,585 1330,555 1355,540 C1348,575 1342,605 1333,640 Z" />
        </g>
        <g className="sc-plant">
          <rect x="120" y="700" width="60" height="52" rx="8" className="sc-pot" />
          <path d="M150,700 C130,660 100,655 88,668 C112,674 128,684 142,700 Z" />
          <path d="M150,700 C165,652 200,645 214,660 C188,668 170,682 158,700 Z" />
        </g>

        {/* fireplace stove (right) */}
        <g>
          <rect x="1400" y="560" width="120" height="150" rx="12" className="sc-stove" />
          <rect x="1444" y="490" width="30" height="76" className="sc-stove" />
          <rect x="1418" y="596" width="84" height="72" rx="8" className="sc-stoveIn" />
          <circle cx="1460" cy="632" r="70" fill="url(#scFire)" className="sc-fireGlow" />
          <path className="sc-flame" d="M1445,660 C1440,636 1452,626 1456,610 C1462,626 1476,632 1472,650 C1480,644 1483,638 1485,630 C1492,648 1484,664 1460,668 Z" />
        </g>
      </svg>
      <div className="sc-vignette" />
    </div>
  );
}

export function Pomodoro({ sync }: { sync: Sync }) {
  const p = sync.snap!.pomo;
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(Math.round(p.durations.focus / 60));
  const [short, setShort] = useState(Math.round(p.durations.short / 60));
  const [long, setLong] = useState(Math.round(p.durations.long / 60));
  const [longEvery, setLongEvery] = useState(p.longEvery);
  const rain = useRain();

  const full = p.durations[p.mode];
  const startLabel = p.secondsLeft < full ? 'Resume' : 'Start';

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
              🍅
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
              <p className="muted small">Applies to the whole room.</p>
            </div>
          )}
        </div>
      </div>

      {/* ambience bar */}
      <div className="amb-bar">
        <span className="amb-tag">Lofi</span>
        <div className="amb-info">
          <span className="amb-title">Rainy Cabin</span>
          <span className="amb-artist muted">Generative ambience</span>
        </div>
        <button className="amb-play" onClick={rain.toggle} aria-label="Toggle rain sound">
          {rain.on ? '⏸' : '▶'}
        </button>
        <input
          className="amb-vol"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={rain.vol}
          onChange={(e) => rain.setVol(+e.target.value)}
          aria-label="Volume"
        />
        <span className="amb-icon">{rain.on ? '🌧' : '🔇'}</span>
      </div>
    </div>
  );
}
