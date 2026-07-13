import { useEffect, useRef, useState } from 'react';
import type { View } from './useGameSync';

// Kyrox: a black anime cat living INSIDE the app. He greets you, walks from
// card to card on the main menu to explain each one (the card lights up),
// comments when you change screens, wanders around, yawns, sleeps when
// ignored, and reacts when poked. Double-click him on the menu to replay
// the tour.

type Emotion = 'happy' | 'excited' | 'thinking' | 'laughing' | 'surprised' | 'focused' | 'sleepy';
type Gaze = { dx: number; dy: number };
type Timer = ReturnType<typeof setTimeout>;

const NO_GAZE: Gaze = { dx: 0, dy: 0 };
const TOUR_KEY = 'kyrox-tour-v1';

interface TourStep {
  target: string | null; // matches data-tour="..." on a dashboard card
  text: string;
  emotion: Emotion;
}

const TOUR: TourStep[] = [
  {
    target: null,
    text: "Hey! I'm Kyrox 🐾 New here? Follow me, I'll show you around!",
    emotion: 'excited',
  },
  {
    target: 'pomodoro',
    text: 'The Pomodoro — one shared timer for the whole room. When it runs, everyone focuses together.',
    emotion: 'focused',
  },
  {
    target: 'ambience',
    text: 'Ambience — lofi, rain and nature sounds to back your sessions. Coming soon!',
    emotion: 'happy',
  },
  {
    target: 'sources',
    text: 'Sources — a library of study resources. Also on the way.',
    emotion: 'thinking',
  },
  {
    target: 'wordbomb',
    text: 'Word Bomb! Find a word containing the syllable before it blows. Last one standing wins.',
    emotion: 'excited',
  },
  {
    target: 'karta',
    text: 'Karta Lmaghribiya — Ronda and other Moroccan card games. Soon!',
    emotion: 'laughing',
  },
  {
    target: 'mafia',
    text: 'And Mafia — social deduction with friends. Trust no one. Especially me.',
    emotion: 'surprised',
  },
  {
    target: null,
    text: "That's the tour! I'll be wandering around — poke me anytime, or double-click me to replay this.",
    emotion: 'happy',
  },
];

const REACTIONS: { text: string; emotion: Emotion }[] = [
  { text: 'Hey! That tickles 😆', emotion: 'laughing' },
  { text: 'Meow?!', emotion: 'surprised' },
  { text: "You just can't help yourself, huh?", emotion: 'laughing' },
  { text: "I'm purring… okay, maybe not.", emotion: 'happy' },
  { text: 'Careful with the fur!', emotion: 'focused' },
];

const IDLE_TIPS: { text: string; emotion: Emotion }[] = [
  { text: 'Tip: start a Pomodoro and the whole room follows the same timer.', emotion: 'thinking' },
  { text: 'Stuck on a syllable? Think plurals and long words.', emotion: 'thinking' },
  { text: 'Stretch your paws between focus rounds 🐾', emotion: 'happy' },
  { text: 'I knocked nothing off the table. Promise.', emotion: 'laughing' },
  { text: 'Focus now, brag later.', emotion: 'focused' },
  { text: 'Invite a friend — everything here is better in a group.', emotion: 'excited' },
];

const VIEW_LINES: Partial<Record<View, { text: string; emotion: Emotion }>> = {
  pomodoro: { text: "Focus mode! I'll keep quiet… mostly. 😌", emotion: 'focused' },
  wordbomb: { text: 'Game time! Show them your vocabulary, human.', emotion: 'excited' },
};

// Pupils track the cursor, scaled by distance to the cat.
function useMouseGaze(ref: React.RefObject<HTMLElement | null>): Gaze {
  const [gaze, setGaze] = useState<Gaze>(NO_GAZE);
  useEffect(() => {
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.4;
        const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
        const dist = Math.min(1, Math.hypot(e.clientX - cx, e.clientY - cy) / 260);
        setGaze({ dx: Math.cos(ang) * 3.5 * dist, dy: Math.sin(ang) * 3 * dist });
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
  return gaze;
}

function useTyped(line: string | null): string {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    setTyped('');
    if (!line) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(line.slice(0, i));
      if (i >= line.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [line]);
  return typed;
}

function Face({ emotion, gaze }: { emotion: Emotion; gaze: Gaze }) {
  const amberEyes = (dx = 0, dy = 0) => {
    const px = dx + gaze.dx;
    const py = dy + gaze.dy;
    return (
      <g className="k-blink">
        <ellipse cx="74" cy="104" rx="10.5" ry="12.5" fill="#eab54e" />
        <ellipse cx={74 + px} cy={104 + py} rx="3.2" ry="9.5" fill="#17121a" />
        <circle cx="77.5" cy="99" r="3" fill="#fff" />
        <ellipse cx="126" cy="104" rx="10.5" ry="12.5" fill="#eab54e" />
        <ellipse cx={126 + px} cy={104 + py} rx="3.2" ry="9.5" fill="#17121a" />
        <circle cx="129.5" cy="99" r="3" fill="#fff" />
      </g>
    );
  };
  const blush = (
    <g opacity="0.7">
      <ellipse cx="58" cy="118" rx="8" ry="4" fill="#c46a78" />
      <ellipse cx="142" cy="118" rx="8" ry="4" fill="#c46a78" />
    </g>
  );
  const catMouth = (
    <g>
      <path d="M100,131 Q94,140 86,136" className="k-mouth" />
      <path d="M100,131 Q106,140 114,136" className="k-mouth" />
    </g>
  );

  switch (emotion) {
    case 'excited':
      return (
        <g>
          {amberEyes()}
          {blush}
          <path d="M90,130 Q100,142 110,130 Q100,136 90,130 Z" fill="#7e3a4a" />
          <ellipse cx="100" cy="135" rx="4" ry="2.5" fill="#d98a96" />
        </g>
      );
    case 'happy':
      return (
        <g>
          <path d="M62,104 Q74,94 86,104" className="k-eye-closed" />
          <path d="M114,104 Q126,94 138,104" className="k-eye-closed" />
          {blush}
          {catMouth}
        </g>
      );
    case 'laughing':
      return (
        <g>
          <path d="M64,98 L80,104 L64,110" className="k-eye-closed" fill="none" />
          <path d="M136,98 L120,104 L136,110" className="k-eye-closed" fill="none" />
          {blush}
          <path d="M86,128 Q100,148 114,128 Q100,134 86,128 Z" fill="#7e3a4a" />
          <ellipse cx="100" cy="137" rx="5" ry="3" fill="#d98a96" />
        </g>
      );
    case 'surprised':
      return (
        <g>
          <circle cx="74" cy="104" r="11.5" fill="#eab54e" />
          <circle cx={74 + gaze.dx} cy={104 + gaze.dy} r="2.6" fill="#17121a" />
          <circle cx="78" cy="99" r="2.6" fill="#fff" />
          <circle cx="126" cy="104" r="11.5" fill="#eab54e" />
          <circle cx={126 + gaze.dx} cy={104 + gaze.dy} r="2.6" fill="#17121a" />
          <circle cx="130" cy="99" r="2.6" fill="#fff" />
          <ellipse cx="100" cy="133" rx="4.5" ry="6" fill="#7e3a4a" />
        </g>
      );
    case 'thinking':
      return (
        <g>
          {amberEyes(2, -3.5)}
          <path d="M93,133 Q100,130 107,134" className="k-mouth" />
        </g>
      );
    case 'focused':
      return (
        <g>
          {amberEyes()}
          <rect x="62" y="91" width="24" height="9" fill="#1a1420" />
          <rect x="114" y="91" width="24" height="9" fill="#1a1420" />
          <path d="M63,100 L85,100" className="k-eye-closed" />
          <path d="M115,100 L137,100" className="k-eye-closed" />
          {catMouth}
        </g>
      );
    case 'sleepy':
      return (
        <g>
          <path d="M62,106 Q74,112 86,106" className="k-eye-closed" />
          <path d="M114,106 Q126,112 138,106" className="k-eye-closed" />
          <path d="M94,133 Q100,136 106,133" className="k-mouth" />
        </g>
      );
  }
}

export function KyroxAvatar({ emotion, gaze = NO_GAZE }: { emotion: Emotion; gaze?: Gaze }) {
  return (
    <svg viewBox="0 0 200 210" className="k-svg" aria-hidden>
      <g className="k-tail">
        <path
          d="M150,180 C185,175 192,140 178,118"
          stroke="#1a1420"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <ellipse cx="100" cy="172" rx="50" ry="36" fill="#1a1420" />
      <ellipse cx="82" cy="201" rx="14" ry="8" fill="#241c2b" />
      <ellipse cx="118" cy="201" rx="14" ry="8" fill="#241c2b" />
      <g className="k-ear-l">
        <path d="M52,62 L44,14 L90,38 Z" fill="#1a1420" />
        <path d="M56,54 L51,26 L79,40 Z" fill="#7e3a4a" />
      </g>
      <g className="k-ear-r">
        <path d="M148,62 L156,14 L110,38 Z" fill="#1a1420" />
        <path d="M144,54 L149,26 L121,40 Z" fill="#7e3a4a" />
      </g>
      <ellipse cx="100" cy="94" rx="54" ry="50" fill="#1a1420" />
      <Face emotion={emotion} gaze={gaze} />
      <path d="M95,124 L105,124 L100,131 Z" fill="#d98a96" />
      <g stroke="rgba(216,216,222,0.5)" strokeWidth="1.5" strokeLinecap="round">
        <line x1="60" y1="122" x2="28" y2="116" />
        <line x1="62" y1="130" x2="30" y2="132" />
        <line x1="140" y1="122" x2="172" y2="116" />
        <line x1="138" y1="130" x2="170" y2="132" />
      </g>
      <path
        d="M62,138 C80,150 120,150 138,138 L136,149 C118,159 82,159 64,149 Z"
        style={{ fill: 'var(--collar)', stroke: 'var(--collar-stroke)' }}
        strokeWidth="1"
      />
      <circle cx="100" cy="154" r="6" fill="#d8d8de" stroke="#8b8b96" strokeWidth="1.5" />
      <g className={`k-arm ${emotion === 'excited' ? 'wave' : ''}`}>
        <path
          d="M138,168 C152,164 158,150 158,138"
          stroke="#1a1420"
          strokeWidth="13"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="158" cy="134" rx="8" ry="7" fill="#241c2b" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
const roamPos = () => ({
  x: Math.max(16, window.innerWidth - 140),
  y: window.innerHeight - 110,
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function targetPos(name: string): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: clamp(r.right - 78, 8, window.innerWidth - 100),
    y: clamp(r.bottom - 58, 8, window.innerHeight - 106),
  };
}

const centerStage = () => ({
  x: window.innerWidth / 2 - 46,
  y: window.innerHeight * 0.42,
});

export function KyroxCompanion({ view }: { view: View }) {
  const [mode, setMode] = useState<'roam' | 'tour'>('roam');
  const [tourStep, setTourStep] = useState(0);
  const [line, setLine] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<Emotion>('happy');
  const [pokeN, setPokeN] = useState(0);
  const [sleeping, setSleeping] = useState(false);
  const [pos, setPos] = useState(roamPos);
  const [run, setRun] = useState<{ dur: number; dir: 1 | -1 } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const gaze = useMouseGaze(wrapRef);

  const hideTimer = useRef<Timer | null>(null);
  const runTimer = useRef<Timer | null>(null);
  const lastPoke = useRef(Date.now());
  const pokeTimes = useRef<number[]>([]);
  const glowEl = useRef<HTMLElement | null>(null);
  const stateRef = useRef({ mode, sleeping, running: !!run, x: pos.x });
  stateRef.current = { mode, sleeping, running: !!run, x: pos.x };

  const clearGlow = () => {
    glowEl.current?.classList.remove('tour-glow');
    glowEl.current = null;
  };

  const say = (text: string, emo: Emotion, ms: number) => {
    setLine(text);
    setEmotion(emo);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setLine(null);
      setEmotion('happy');
    }, ms);
  };

  const moveTo = (p: { x: number; y: number }, dur = 0.9) => {
    setRun({ dur, dir: p.x >= stateRef.current.x ? 1 : -1 });
    setPos(p);
    if (runTimer.current) clearTimeout(runTimer.current);
    runTimer.current = setTimeout(() => setRun(null), dur * 1000 + 80);
  };

  const startTour = () => {
    setSleeping(false);
    setLine(null);
    setMode('tour');
    setTourStep(0);
  };

  const finishTour = () => {
    clearGlow();
    localStorage.setItem(TOUR_KEY, '1');
    setMode('roam');
    moveTo(roamPos());
  };

  const nextStep = () =>
    tourStep + 1 < TOUR.length ? setTourStep(tourStep + 1) : finishTour();

  // First visit on the menu → start the guided tour. Returning users get a hello.
  useEffect(() => {
    if (view !== 'menu') return;
    const done = localStorage.getItem(TOUR_KEY) === '1';
    const t = setTimeout(() => {
      if (stateRef.current.mode === 'tour') return;
      if (!done) startTour();
      else say('Hey, welcome back! 🐾', 'excited', 2600);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position + card highlight for the current tour step.
  useEffect(() => {
    if (mode !== 'tour') return;
    const step = TOUR[tourStep];
    clearGlow();
    if (step.target) {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        el.classList.add('tour-glow');
        glowEl.current = el;
      }
    }
    const place = () => {
      const p = step.target ? targetPos(step.target) : centerStage();
      if (p) moveTo(p);
    };
    place();
    const t = setTimeout(place, 450); // re-measure once scrolling settles
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tourStep]);

  // React to screen changes; abort the tour if the user navigates away.
  const prevView = useRef(view);
  useEffect(() => {
    if (prevView.current === view) return;
    prevView.current = view;
    lastPoke.current = Date.now();
    setSleeping(false);
    if (stateRef.current.mode === 'tour') {
      finishTour();
      return;
    }
    const l = VIEW_LINES[view];
    if (l) say(l.text, l.emotion, 3500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Wander along the bottom every 9–22s (roam mode, awake).
  useEffect(() => {
    let t: Timer;
    const schedule = () => {
      t = setTimeout(() => {
        const st = stateRef.current;
        if (st.mode === 'roam' && !st.sleeping && !st.running) {
          const margin = 18;
          const max = Math.max(margin, window.innerWidth - 150);
          let target = margin + Math.random() * (max - margin);
          if (Math.abs(target - st.x) < 130) target = st.x > max / 2 ? margin : max;
          const dur = Math.min(3, Math.max(0.8, Math.abs(target - st.x) / 240));
          moveTo({ x: target, y: roamPos().y }, dur);
        }
        schedule();
      }, 9000 + Math.random() * 13000);
    };
    schedule();
    return () => {
      clearTimeout(t);
      if (runTimer.current) clearTimeout(runTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Random tips while roaming awake.
  useEffect(() => {
    let t: Timer;
    const schedule = (d: number) => {
      t = setTimeout(() => {
        const st = stateRef.current;
        if (st.mode === 'roam' && !st.sleeping) {
          const tip = IDLE_TIPS[(Math.random() * IDLE_TIPS.length) | 0];
          say(tip.text, tip.emotion, 6000);
        }
        schedule(35000 + Math.random() * 25000);
      }, d);
    };
    schedule(18000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yawn, then doze off when ignored for a while.
  useEffect(() => {
    const id = setInterval(() => {
      const st = stateRef.current;
      if (st.mode === 'roam' && !st.sleeping && !st.running && Date.now() - lastPoke.current > 80000) {
        say('*yawn*… nap time 🥱', 'sleepy', 2400);
        setTimeout(() => {
          if (Date.now() - lastPoke.current > 80000) setSleeping(true);
        }, 2400);
      }
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep him on screen when the window resizes.
  useEffect(() => {
    const onResize = () => {
      const st = stateRef.current;
      if (st.mode === 'tour') {
        const step = TOUR[tourStep];
        const p = step.target ? targetPos(step.target) : centerStage();
        if (p) setPos(p);
      } else {
        setPos(roamPos());
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [tourStep]);

  const poke = () => {
    lastPoke.current = Date.now();
    setPokeN((n) => n + 1);
    if (mode === 'tour') return; // just bounce, keep explaining
    if (sleeping) {
      setSleeping(false);
      say('Mrrp?! I was napping! 😾', 'surprised', 2400);
      return;
    }
    const now = Date.now();
    pokeTimes.current = [...pokeTimes.current.filter((t) => now - t < 4000), now];
    if (pokeTimes.current.length >= 4) {
      pokeTimes.current = [];
      say('OKAY okay, I get it! 😾', 'surprised', 2400);
      return;
    }
    const r = REACTIONS[(Math.random() * REACTIONS.length) | 0];
    say(r.text, r.emotion, 2200);
  };

  const step = mode === 'tour' ? TOUR[tourStep] : null;
  const displayLine = step ? step.text : sleeping ? null : line;
  const typed = useTyped(displayLine);
  const emo: Emotion = step ? step.emotion : sleeping ? 'sleepy' : emotion;

  return (
    <div
      ref={wrapRef}
      className={`companion ${pos.x < 290 ? 'flip' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        transition: run
          ? `left ${run.dur}s cubic-bezier(0.45, 0.05, 0.55, 0.95), top ${run.dur}s cubic-bezier(0.45, 0.05, 0.55, 0.95)`
          : undefined,
      }}
    >
      {displayLine && (
        <div className="bubble">
          {typed}
          {typed.length < displayLine.length && <span className="caret">▌</span>}
          {step && (
            <div className="bubble-actions">
              <button className="btn btn-mini" onClick={finishTour}>
                Skip
              </button>
              <button className="btn btn-primary btn-mini" onClick={nextStep}>
                {tourStep + 1 < TOUR.length ? 'Next ›' : 'Done'}
              </button>
            </div>
          )}
        </div>
      )}
      {sleeping && (
        <span className="zzz" aria-hidden>
          <i>z</i>
          <i>z</i>
          <i>z</i>
        </span>
      )}
      <div
        className="k-stage mini"
        style={run ? ({ '--dir': run.dir } as React.CSSProperties) : undefined}
      >
        <button
          key={pokeN}
          className={`kyrox ${pokeN > 0 ? 'poked' : ''} ${run ? 'run' : ''} ${
            displayLine ? 'talk' : ''
          }`}
          onClick={poke}
          onDoubleClick={view === 'menu' && mode === 'roam' ? startTour : undefined}
          aria-label="Kyrox"
        >
          <KyroxAvatar emotion={emo} gaze={sleeping ? NO_GAZE : gaze} />
        </button>
        {pokeN > 0 && !run && (
          <span key={`st-${pokeN}`} className="poke-stars">
            <i>✦</i>
            <i>✧</i>
            <i>✦</i>
          </span>
        )}
      </div>
    </div>
  );
}
