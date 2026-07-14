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

const GRAB_LINES = ['Hey!! Put me down! 🙀', 'Meooow! I have paws, you know!', 'Whoa whoa whoa—', 'Kidnapping! This is kidnapping!'];
const DROP_SOFT = ['Hmph. 😾', 'A little warning next time?', '*licks paw with dignity*'];
const DROP_HARD = ['WHEEE! Do it again! 😆', 'My dignity… 😵', 'I meant to land like that.', '9 lives, minus one.'];

// ---- Living dialogue: context-aware pools ----------------------------------
const timeOfDay = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  if (h < 23) return 'evening';
  return 'night';
};

const GREETINGS: Record<string, { text: string; emotion: Emotion }[]> = {
  morning: [
    { text: '*(stretches)* The morning mist is clearing. Let’s conquer today! 🐾', emotion: 'excited' },
    { text: 'Mrrp… morning, traveler. The lanterns are still warm.', emotion: 'happy' },
  ],
  afternoon: [
    { text: 'Welcome back! The forest is lively this afternoon. 🐾', emotion: 'excited' },
    { text: '*(his bell tinkles)* Perfect time for a focus round, no?', emotion: 'happy' },
  ],
  evening: [
    { text: 'Evening, traveler. The fireflies are out — good company for studying. ✨', emotion: 'happy' },
    { text: '*(curls tail neatly)* A calm evening. Let’s make it count.', emotion: 'focused' },
  ],
  night: [
    { text: 'Still working, traveler? The forest is quiet at this hour… 🌙', emotion: 'thinking' },
    { text: '*(yawns quietly)* Night owls, the both of us.', emotion: 'sleepy' },
  ],
};

const FOCUS_START: { text: string; emotion: Emotion }[] = [
  { text: '*(whispers)* Focus time. I’ll keep the fireflies quiet. 🤫', emotion: 'focused' },
  { text: 'Deep breath… and in we go. I believe in you.', emotion: 'focused' },
  { text: '*(settles down beside you)* Go on — I’m watching over the timer.', emotion: 'happy' },
];
const FOCUS_DONE: { text: string; emotion: Emotion }[] = [
  { text: '*(leaps up)* You DID it! One more feather for the wing! 🪶', emotion: 'excited' },
  { text: 'Session complete! *(proud purring)* Treat yourself, traveler.', emotion: 'excited' },
  { text: 'Another one down. The forest spirits are impressed. ✨', emotion: 'laughing' },
];
const BREAK_LINES: { text: string; emotion: Emotion }[] = [
  { text: 'Break time! Stretch those paws. And hydrate — humans forget that. 💧', emotion: 'laughing' },
  { text: '*(rolls onto his back)* Rest is part of the work. Enjoy it.', emotion: 'happy' },
];
const PAUSE_LINES: { text: string; emotion: Emotion }[] = [
  { text: 'Paused? That’s alright. *(gently pats his paws)* Whenever you’re ready.', emotion: 'happy' },
  { text: 'No judgment here. The timer will wait for you.', emotion: 'thinking' },
];
const BOND_UP: { text: string; emotion: Emotion }[] = [
  { text: '*(his bell tinkles softly)* Our bond grows, traveler. ✨', emotion: 'excited' },
  { text: 'You and me — a good team. *(happy tail flick)*', emotion: 'happy' },
];

const pick = <T,>(arr: T[]): T => arr[(Math.random() * arr.length) | 0];

// Micro-actions written *like this* render in italics.
function richText(s: string) {
  return s.split('*').map((part, i) => (i % 2 ? <em key={i}>{part}</em> : <span key={i}>{part}</span>));
}

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
        <ellipse cx="74" cy="104" rx="10.5" ry="12.5" fill="url(#kEye)" stroke="#120d14" strokeWidth="1.4" />
        <ellipse cx={74 + px} cy={104 + py} rx="3.2" ry="9.5" fill="#17121a" />
        <circle cx="77.5" cy="99" r="3" fill="#fff" />
        <ellipse cx="70.5" cy="110" rx="3.6" ry="2" fill="rgba(255,255,255,0.3)" />
        <ellipse cx="126" cy="104" rx="10.5" ry="12.5" fill="url(#kEye)" stroke="#120d14" strokeWidth="1.4" />
        <ellipse cx={126 + px} cy={104 + py} rx="3.2" ry="9.5" fill="#17121a" />
        <circle cx="129.5" cy="99" r="3" fill="#fff" />
        <ellipse cx="122.5" cy="110" rx="3.6" ry="2" fill="rgba(255,255,255,0.3)" />
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
          <circle cx="74" cy="104" r="11.5" fill="url(#kEye)" />
          <circle cx={74 + gaze.dx} cy={104 + gaze.dy} r="2.6" fill="#17121a" />
          <circle cx="78" cy="99" r="2.6" fill="#fff" />
          <circle cx="126" cy="104" r="11.5" fill="url(#kEye)" />
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

export function KyroxAvatar({
  emotion,
  gaze = NO_GAZE,
  hat = false,
}: {
  emotion: Emotion;
  gaze?: Gaze;
  hat?: boolean;
}) {
  return (
    <svg viewBox="0 0 200 210" className="k-svg" aria-hidden>
      <defs>
        <radialGradient id="kFur" cx="42%" cy="32%" r="80%">
          <stop offset="0" stopColor="#2c2135" />
          <stop offset="1" stopColor="#150f1b" />
        </radialGradient>
        <radialGradient id="kEar" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#a3556b" />
          <stop offset="1" stopColor="#6e3040" />
        </radialGradient>
        <radialGradient id="kEye" cx="40%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="1" stopColor="#d3922b" />
        </radialGradient>
        <radialGradient id="kBell" cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#c99b3a" />
        </radialGradient>
      </defs>
      {/* soft ground shadow */}
      <ellipse cx="100" cy="205" rx="46" ry="5.5" fill="rgba(0,0,0,0.35)" />
      <g className="k-tail">
        <path
          d="M150,180 C185,175 192,140 178,118"
          stroke="#1d1526"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="178" cy="118" r="8" fill="#2c2135" />
      </g>
      <ellipse cx="100" cy="172" rx="50" ry="36" fill="url(#kFur)" />
      {/* chest fluff */}
      <path d="M100,146 C88,158 88,176 100,186 C112,176 112,158 100,146 Z" fill="#241b2e" />
      {/* front paws with toe beans */}
      <ellipse cx="82" cy="201" rx="14" ry="8" fill="#2a2033" />
      <ellipse cx="118" cy="201" rx="14" ry="8" fill="#2a2033" />
      <path d="M76,201 L76,206 M82,202 L82,207 M88,201 L88,206" stroke="#171019" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M112,201 L112,206 M118,202 L118,207 M124,201 L124,206" stroke="#171019" strokeWidth="1.6" strokeLinecap="round" />
      <g className="k-ear-l">
        <path d="M52,62 L44,14 L90,38 Z" fill="url(#kFur)" />
        <path d="M56,54 L51,26 L79,40 Z" fill="url(#kEar)" />
      </g>
      <g className="k-ear-r">
        <path d="M148,62 L156,14 L110,38 Z" fill="url(#kFur)" />
        <path d="M144,54 L149,26 L121,40 Z" fill="url(#kEar)" />
      </g>
      <ellipse cx="100" cy="94" rx="54" ry="50" fill="url(#kFur)" />
      {/* cheek fluff */}
      <path d="M46,100 L36,96 L46,108 L38,108 L48,116 Z" fill="#1d1526" />
      <path d="M154,100 L164,96 L154,108 L162,108 L152,116 Z" fill="#1d1526" />
      {/* forehead tuft */}
      <path d="M92,46 Q100,38 108,46 Q104,40 100,52 Q96,40 92,46 Z" fill="#241b2e" />
      <Face emotion={emotion} gaze={gaze} />
      <path d="M95,124 L105,124 L100,131 Z" fill="#e09aa6" />
      <g stroke="rgba(220,222,235,0.5)" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M60,122 Q44,120 28,114" />
        <path d="M62,130 Q46,132 30,134" />
        <path d="M140,122 Q156,120 172,114" />
        <path d="M138,130 Q154,132 170,134" />
      </g>
      <path
        d="M62,138 C80,150 120,150 138,138 L136,149 C118,159 82,159 64,149 Z"
        style={{ fill: 'var(--collar)', stroke: 'var(--collar-stroke)' }}
        strokeWidth="1"
      />
      {/* golden bell — swings with his movement */}
      <g className="k-bell">
        <line x1="100" y1="148" x2="100" y2="153" stroke="#8a6d2f" strokeWidth="2" />
        <circle cx="100" cy="159" r="7" fill="url(#kBell)" stroke="#8a6d2f" strokeWidth="1.2" />
        <path d="M94,159 L106,159" stroke="#8a6d2f" strokeWidth="1.2" />
        <circle cx="100" cy="164" r="2" fill="#7a5c22" />
        <circle cx="97" cy="156" r="1.8" fill="#fff7dd" />
      </g>
      {/* wizard hat — unlocked when your bond grows */}
      {hat && (
        <g className="k-hat">
          <path d="M58,50 Q98,36 134,48 L126,58 Q98,66 66,58 Z" fill="#4a3a8f" />
          <path d="M76,50 C82,26 104,16 110,4 C116,20 110,38 118,48 Q96,57 76,50 Z" fill="#5a48b0" />
          <path d="M78,44 Q98,50 114,44 L116,48 Q98,55 77,48 Z" fill="#ffd27a" />
          <circle cx="110" cy="6" r="4" fill="#ffd27a" />
          <path d="M88,32 L93,29 L91,35 Z" fill="#ffe9a8" />
        </g>
      )}
      <g className={`k-arm ${emotion === 'excited' ? 'wave' : ''}`}>
        <path
          d="M138,168 C152,164 158,150 158,138"
          stroke="#1d1526"
          strokeWidth="13"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="158" cy="134" rx="8" ry="7" fill="#2a2033" />
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

interface Ball {
  x: number;
  vx: number;
  hits: number;
  leaving: boolean;
}

interface PomoInfo {
  mode: 'focus' | 'short' | 'long';
  running: boolean;
  completedFocus: number;
}

export function KyroxCompanion({ view, pomo }: { view: View; pomo: PomoInfo }) {
  const [mode, setMode] = useState<'roam' | 'tour'>('roam');
  const [tourStep, setTourStep] = useState(0);
  const [line, setLine] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<Emotion>('happy');
  const [pokeN, setPokeN] = useState(0);
  const [sleeping, setSleeping] = useState(false);
  const [pos, setPos] = useState(roamPos);
  const [run, setRun] = useState<{ dur: number; dir: 1 | -1 } | null>(null);
  const [ball, setBall] = useState<{ x: number } | null>(null);
  const [swipe, setSwipe] = useState(false);
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);
  const [held, setHeld] = useState(false);
  const [falling, setFalling] = useState(false);
  const [landing, setLanding] = useState(0);
  const [anim, setAnim] = useState<'tilt' | 'groom' | null>(null);
  // Bond: grows with completed sessions (and the odd pet). Level 2+ = wizard hat.
  const bondRef = useRef(Number(localStorage.getItem('kyrox-bond') || 0));
  const [hat, setHat] = useState(Math.floor(bondRef.current / 6) >= 2);
  const lastBondPet = useRef(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const gaze = useMouseGaze(wrapRef);

  const hideTimer = useRef<Timer | null>(null);
  const runTimer = useRef<Timer | null>(null);
  const lastPoke = useRef(Date.now());
  const pokeTimes = useRef<number[]>([]);
  const glowEl = useRef<HTMLElement | null>(null);
  const ballRef = useRef<Ball | null>(null);
  const physRef = useRef({ vx: 0, vy: 0, impact: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    offX: number;
    offY: number;
    trail: { x: number; y: number; t: number }[];
  } | null>(null);
  const stateRef = useRef({ mode, sleeping, running: !!run, held, falling, x: pos.x, y: pos.y });
  stateRef.current = { mode, sleeping, running: !!run, held, falling, x: pos.x, y: pos.y };

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

  // ---- Yarn ball play ------------------------------------------------------
  const spawnBall = () => {
    const fromLeft = Math.random() < 0.5;
    ballRef.current = {
      x: fromLeft ? -24 : window.innerWidth + 24,
      vx: fromLeft ? 5 + Math.random() * 2 : -(5 + Math.random() * 2),
      hits: 0,
      leaving: false,
    };
    setBall({ x: ballRef.current.x });
    say('Ooh! A ball! 🧶', 'excited', 2200);
  };

  const kickBall = () => {
    const b = ballRef.current;
    if (!b) return;
    b.vx += (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
  };

  // Ball physics + chase-and-swipe behaviour, one persistent rAF loop.
  useEffect(() => {
    let raf = 0;
    let chasing = false;
    const tick = () => {
      // Thrown / dropped: gravity, wall bounces, ground landing.
      const st = stateRef.current;
      if (st.falling && !st.held) {
        const ph = physRef.current;
        ph.vy += 1.15;
        let x = st.x + ph.vx;
        let y = st.y + ph.vy;
        const ground = window.innerHeight - 110;
        if (x < 2) {
          x = 2;
          ph.vx = Math.abs(ph.vx) * 0.6;
        }
        if (x > window.innerWidth - 96) {
          x = window.innerWidth - 96;
          ph.vx = -Math.abs(ph.vx) * 0.6;
        }
        if (y >= ground) {
          y = ground;
          ph.impact = Math.max(ph.impact, Math.abs(ph.vy));
          if (Math.abs(ph.vy) > 10) {
            ph.vy = -Math.abs(ph.vy) * 0.38;
            ph.vx *= 0.7;
          } else {
            setFalling(false);
            setLanding((n) => n + 1);
            const hard = ph.impact > 16;
            const pool = hard ? DROP_HARD : DROP_SOFT;
            say(pool[(Math.random() * pool.length) | 0], hard ? 'surprised' : 'focused', 2600);
            ph.vx = 0;
            ph.vy = 0;
            ph.impact = 0;
          }
        }
        setPos({ x, y });
      }

      const b = ballRef.current;
      if (b) {
        if (stateRef.current.mode === 'tour') {
          // Tour takes priority — the ball quietly disappears.
          ballRef.current = null;
          setBall(null);
          chasing = false;
        } else {
          b.x += b.vx;
          b.vx *= 0.986;
          const W = window.innerWidth;
          if (!b.leaving) {
            if (b.x < 8) {
              b.x = 8;
              b.vx = Math.abs(b.vx) * 0.75;
            }
            if (b.x > W - 38) {
              b.x = W - 38;
              b.vx = -Math.abs(b.vx) * 0.75;
            }
          } else if (b.x < -50 || b.x > W + 50) {
            ballRef.current = null;
            setBall(null);
            chasing = false;
            moveTo(roamPos());
            say('Phew! Good game. 🐾', 'happy', 2400);
            raf = requestAnimationFrame(tick);
            return;
          }
          setBall({ x: b.x });

          // Ball settled → run to it, then swipe it with a paw.
          if (Math.abs(b.vx) < 0.2 && !chasing && !b.leaving && !st.held && !st.falling) {
            chasing = true;
            const st = stateRef.current;
            const side: 1 | -1 = b.x > st.x ? -1 : 1;
            const target = {
              x: clamp(b.x + side * 58 - 8, 8, window.innerWidth - 100),
              y: roamPos().y,
            };
            const dist = Math.abs(target.x - st.x);
            const dur = Math.min(1.6, Math.max(0.5, dist / 320));
            moveTo(target, dur);
            setTimeout(() => {
              const bb = ballRef.current;
              if (!bb) {
                chasing = false;
                return;
              }
              const dir: 1 | -1 = bb.x >= stateRef.current.x + 46 ? 1 : -1;
              setSwipeDir(dir);
              setSwipe(true);
              setTimeout(() => setSwipe(false), 460);
              bb.hits += 1;
              if (bb.hits >= 4) {
                bb.leaving = true;
                bb.vx = dir * 14;
              } else {
                bb.vx = dir * (6 + Math.random() * 3);
              }
              setTimeout(() => {
                chasing = false;
              }, 520);
            }, dur * 1000 + 80);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ball shows up now and then while he's roaming awake.
  useEffect(() => {
    let t: Timer;
    const schedule = (d: number) => {
      t = setTimeout(() => {
        const st = stateRef.current;
        if (st.mode === 'roam' && !st.sleeping && !ballRef.current && !st.held && !st.falling) spawnBall();
        schedule(50000 + Math.random() * 40000);
      }, d);
    };
    schedule(20000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First visit on the menu → start the guided tour. Returning users get a hello.
  useEffect(() => {
    if (view !== 'menu') return;
    const done = localStorage.getItem(TOUR_KEY) === '1';
    const t = setTimeout(() => {
      if (stateRef.current.mode === 'tour') return;
      if (!done) startTour();
      else {
        const g = pick(GREETINGS[timeOfDay()]);
        say(g.text, g.emotion, 3600);
      }
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

  const addBond = (n: number) => {
    const before = Math.floor(bondRef.current / 6);
    bondRef.current += n;
    localStorage.setItem('kyrox-bond', String(bondRef.current));
    const after = Math.floor(bondRef.current / 6);
    if (after > before) {
      if (after >= 2) setHat(true);
      const b = pick(BOND_UP);
      setTimeout(() => say(b.text, b.emotion, 3400), 2800);
    }
  };

  // React to the shared Pomodoro: encourage, celebrate, nap during focus.
  const prevPomo = useRef(pomo);
  useEffect(() => {
    const prev = prevPomo.current;
    prevPomo.current = pomo;
    const st = stateRef.current;
    if (st.mode === 'tour' || st.held || st.falling) return;
    if (pomo.completedFocus > prev.completedFocus) {
      setSleeping(false);
      const l = pick(FOCUS_DONE);
      say(l.text, l.emotion, 4200);
      addBond(2);
    } else if (!prev.running && pomo.running && pomo.mode === 'focus') {
      setSleeping(false);
      const l = pick(FOCUS_START);
      say(l.text, l.emotion, 3600);
    } else if (pomo.running && pomo.mode !== 'focus' && prev.mode === 'focus') {
      setSleeping(false);
      const l = pick(BREAK_LINES);
      say(l.text, l.emotion, 3800);
    } else if (prev.running && !pomo.running && pomo.mode === 'focus') {
      const l = pick(PAUSE_LINES);
      say(l.text, l.emotion, 3400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.running, pomo.mode, pomo.completedFocus]);

  // During a long focus he curls up and guards your session in his sleep.
  useEffect(() => {
    if (!(pomo.running && pomo.mode === 'focus')) return;
    const t = setTimeout(() => {
      const st = stateRef.current;
      if (st.mode === 'roam' && !st.held && !st.falling && !ballRef.current && !st.sleeping) {
        say('*(curls up beside you)* I’ll guard your focus… *(yawns)*', 'sleepy', 3200);
        setTimeout(() => setSleeping(true), 3200);
      }
    }, 35000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.running, pomo.mode]);

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
        if (st.mode === 'roam' && !st.sleeping && !st.running && !ballRef.current && !st.held && !st.falling) {
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
        if (st.mode === 'roam' && !st.sleeping && !ballRef.current && !st.held && !st.falling) {
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
      if (st.mode === 'roam' && !st.sleeping && !st.running && !ballRef.current && !st.held && !st.falling && Date.now() - lastPoke.current > 80000) {
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

  // ---- Pick up, carry & throw ------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (mode === 'tour') {
      poke();
      return;
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      offX: e.clientX - stateRef.current.x,
      offY: e.clientY - stateRef.current.y,
      trail: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 7) return;
      d.moved = true;
      setHeld(true);
      setFalling(false);
      setSleeping(false);
      lastPoke.current = Date.now();
      ballRef.current = null;
      setBall(null);
      say(GRAB_LINES[(Math.random() * GRAB_LINES.length) | 0], 'surprised', 2200);
    }
    const x = clamp(e.clientX - d.offX, -10, window.innerWidth - 80);
    const y = clamp(e.clientY - d.offY, -10, window.innerHeight - 70);
    setPos({ x, y });
    d.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (d.trail.length > 8) d.trail.shift();
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      poke();
      return;
    }
    setHeld(false);
    // launch velocity from the last ~120ms of pointer movement
    const now = performance.now();
    const trail = d.trail;
    const old = trail.find((p) => now - p.t < 120) ?? trail[0];
    const last = trail[trail.length - 1];
    const dt = Math.max(16, last.t - old.t);
    physRef.current = {
      vx: ((last.x - old.x) / dt) * 16,
      vy: ((last.y - old.y) / dt) * 16,
      impact: 0,
    };
    setFalling(true);
  };

  const playAnim = (a: 'tilt' | 'groom', ms: number) => {
    setAnim(a);
    setTimeout(() => setAnim(null), ms);
  };

  const poke = () => {
    lastPoke.current = Date.now();
    setPokeN((n) => n + 1);
    if (Date.now() - lastBondPet.current > 60000) {
      lastBondPet.current = Date.now();
      addBond(1);
    }
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
    const roll = Math.random();
    if (roll < 0.3) {
      playAnim('tilt', 1400);
      say('*(tilts his head, curious)*', 'thinking', 1600);
    } else if (roll < 0.55) {
      playAnim('groom', 1700);
      say('*(cleans his paw, nonchalant)*', 'focused', 1900);
    } else {
      const r = REACTIONS[(Math.random() * REACTIONS.length) | 0];
      say(r.text, r.emotion, 2200);
    }
  };

  // Squash animation right after a landing.
  const [justLanded, setJustLanded] = useState(false);
  useEffect(() => {
    if (!landing) return;
    setJustLanded(true);
    const t = setTimeout(() => setJustLanded(false), 500);
    return () => clearTimeout(t);
  }, [landing]);

  const step = mode === 'tour' ? TOUR[tourStep] : null;
  const displayLine = step ? step.text : sleeping ? null : line;
  const typed = useTyped(displayLine);
  const emo: Emotion = step
    ? step.emotion
    : held || falling
      ? 'surprised'
      : sleeping
        ? 'sleepy'
        : ball
          ? 'excited'
          : emotion;

  // While a ball is in play, his eyes lock onto it instead of the cursor.
  const ballGaze: Gaze | null = ball
    ? { dx: clamp((ball.x - (pos.x + 46)) / 60, -3.5, 3.5), dy: 2.5 }
    : null;

  return (
    <>
      <div
        ref={wrapRef}
        className={`companion ${pos.x < 290 ? 'flip' : ''} ${held || falling ? 'no-trans' : ''}`}
        style={{
          left: pos.x,
          top: pos.y,
          transition:
            held || falling
              ? 'none'
              : run
                ? `left ${run.dur}s cubic-bezier(0.45, 0.05, 0.55, 0.95), top ${run.dur}s cubic-bezier(0.45, 0.05, 0.55, 0.95)`
                : undefined,
        }}
      >
        {displayLine && (
          <div className="bubble">
            {richText(typed)}
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
          style={{ '--dir': run ? run.dir : swipeDir } as React.CSSProperties}
        >
          <button
            key={pokeN}
            className={`kyrox ${pokeN > 0 ? 'poked' : ''} ${run ? 'run' : ''} ${
              swipe ? 'swipe' : ''
            } ${held ? 'held' : ''} ${falling ? 'flying' : ''} ${justLanded ? 'land' : ''} ${
              anim ?? ''
            } ${displayLine ? 'talk' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={view === 'menu' && mode === 'roam' ? startTour : undefined}
            aria-label="Kyrox"
          >
            <KyroxAvatar emotion={emo} gaze={sleeping ? NO_GAZE : ballGaze ?? gaze} hat={hat} />
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
      {ball && (
        <button
          className="yarn"
          style={{ left: ball.x, transform: `rotate(${ball.x * 2.2}deg)` }}
          onClick={kickBall}
          aria-label="Yarn ball"
        >
          <svg viewBox="0 0 30 30">
            <defs>
              <radialGradient id="yarnG" cx="35%" cy="30%" r="80%">
                <stop offset="0" stopColor="#a78bff" />
                <stop offset="1" stopColor="#6a48e8" />
              </radialGradient>
            </defs>
            <circle cx="15" cy="15" r="13" fill="url(#yarnG)" />
            <path
              d="M3,12 Q15,4 27,12 M3,18 Q15,26 27,18 M9,3.5 Q4,15 9,26.5 M21,3.5 Q26,15 21,26.5"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.4"
              fill="none"
            />
          </svg>
        </button>
      )}
    </>
  );
}
