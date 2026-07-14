import { useEffect, useState } from 'react';
import { inDiscord, getInstanceId, authenticateUser, type Me } from './discordSdk';
import { useGameSync, type Player, type View } from './useGameSync';
import { Pomodoro } from './Pomodoro';
import { WordBomb } from './WordBomb';
import { KyroxAvatar, KyroxCompanion } from './Kyrox';

// Per-device visual theme, cycled from the header button.
type Theme = 'midnight' | 'crimson' | 'sakura' | 'ocean';
const THEME_NEXT: Record<Theme, Theme> = {
  midnight: 'crimson',
  crimson: 'sakura',
  sakura: 'ocean',
  ocean: 'midnight',
};
const THEME_ICON: Record<Theme, string> = { midnight: '🌙', crimson: '🍷', sakura: '🌸', ocean: '🌊' };

// 3D tilt: cards lean toward the cursor, with a glare highlight following it.
function tiltMove(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width;
  const py = (e.clientY - r.top) / r.height;
  el.style.setProperty('--ry', `${((px - 0.5) * 14).toFixed(2)}deg`);
  el.style.setProperty('--rx', `${((0.5 - py) * 12).toFixed(2)}deg`);
  el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
  el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
}
function tiltReset(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.style.setProperty('--ry', '0deg');
  el.style.setProperty('--rx', '0deg');
}

function Header({ theme, onToggleTheme }: { theme?: Theme; onToggleTheme?: () => void }) {
  return (
    <header className="header">
      <img className="logo" src="/logo.png" alt="StudySouk Academy" />
      <div className="wordmark">
        <span className="wm-title">StudySouk</span>
        <span className="wm-sub">#Academy</span>
        <span className="by-kyrox">by KYROX</span>
      </div>
      {onToggleTheme && theme && (
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          title={`Theme: ${theme} — click to switch`}
          aria-label="Switch theme"
        >
          {THEME_ICON[theme]}
        </button>
      )}
    </header>
  );
}

const LOAD_MSGS = [
  'Waking up Kyrox… 🐾',
  'Brushing his fur…',
  'Lighting the lanterns…',
  'Rolling out the parchment…',
  'Sharpening pencils…',
  'Kyrox is stretching…',
  'Herding the syllables…',
];

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % LOAD_MSGS.length), 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="load-screen">
      <div className="load-cat">
        <KyroxAvatar emotion="sleepy" />
      </div>
      <div className="load-title">
        Study<span>Souk</span>
      </div>
      <div className="load-sub">#ACADEMY · BY KYROX</div>
      <div className="load-bar">
        <span />
      </div>
      <p className="load-msg">{LOAD_MSGS[i]}</p>
    </div>
  );
}

function BrowserHint() {
  return (
    <div className="app">
      <Header />
      <div className="screen center">
        <div className="panel narrow">
          <h2 className="serif">Open me in Discord</h2>
          <p className="muted">
            This app is a Discord Activity. Launch it from a voice channel (rocket button 🚀)
            to join the shared session.
          </p>
        </div>
      </div>
    </div>
  );
}

function LockedCard({
  icon,
  title,
  desc,
  tour,
}: {
  icon: string;
  title: string;
  desc: string;
  tour: string;
}) {
  return (
    <div className="game-card locked" data-tour={tour} onMouseMove={tiltMove} onMouseLeave={tiltReset}>
      <span className="gc-icon">{icon}</span>
      <span className="gc-title serif">{title}</span>
      <span className="gc-desc">{desc}</span>
      <span className="gc-lock">🔒 Not available yet</span>
    </div>
  );
}

function Dashboard({ onOpen, players }: { onOpen: (v: View) => void; players: Player[] }) {
  return (
    <div className="screen dashboard">
      <p className="present muted">
        {players.length} online&nbsp;: {players.map((p) => p.name).join(' · ') || '—'}
      </p>

      <section className="zone">
        <h3 className="zone-title serif">🎯 Focus</h3>
        <div className="menu three">
          <button
            className="game-card"
            data-tour="pomodoro"
            onClick={() => onOpen('pomodoro')}
            onMouseMove={tiltMove}
            onMouseLeave={tiltReset}
          >
            <span className="gc-icon">⏳</span>
            <span className="gc-title serif">Pomodoro</span>
            <span className="gc-desc">Synced focus timer to study together.</span>
          </button>
          <LockedCard icon="🎧" title="Ambience" desc="Lofi, rain, nature — to back your session." tour="ambience" />
          <LockedCard icon="📚" title="Sources" desc="Resource library for studying." tour="sources" />
        </div>
      </section>

      <section className="zone">
        <h3 className="zone-title serif">🎉 Relax</h3>
        <div className="menu three">
          <button
            className="game-card"
            data-tour="wordbomb"
            onClick={() => onOpen('wordbomb')}
            onMouseMove={tiltMove}
            onMouseLeave={tiltReset}
          >
            <span className="gc-icon">💣</span>
            <span className="gc-title serif">Word Bomb</span>
            <span className="gc-desc">Find a word with the syllable before it blows.</span>
          </button>
          <LockedCard icon="🃏" title="Karta Lmaghribiya" desc="Ronda and other Moroccan card games." tour="karta" />
          <LockedCard icon="🕵️" title="Mafia" desc="Social deduction with friends — bluff well." tour="mafia" />
        </div>
      </section>

      <p className="footnote muted">Games and timers are shared live — but everyone browses freely.</p>
    </div>
  );
}

export default function App() {
  // instanceId + a guest identity are available instantly — no OAuth wait.
  const [instanceId] = useState<string | null>(() => (inDiscord ? getInstanceId() : null));
  const [me, setMe] = useState<Me | null>(() =>
    inDiscord ? { id: `guest-${Math.random().toString(36).slice(2, 8)}`, name: 'Guest' } : null,
  );
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('ss-theme') as Theme) || 'midnight',
  );
  // Navigation is personal: everyone browses freely, games stay shared.
  const [view, setView] = useState<View>('menu');

  // Apply the theme to the whole document (onboarding included).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ss-theme', theme);
  }, [theme]);

  // Upgrade the guest name to the real Discord name in the background.
  useEffect(() => {
    if (!inDiscord) return;
    let alive = true;
    authenticateUser()
      .then((u) => {
        if (alive) setMe({ id: u.id, name: u.name });
      })
      .catch(() => {
        /* keep the guest identity — the app still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  const sync = useGameSync(instanceId, me);

  if (!inDiscord) return <BrowserHint />;
  if (!sync.snap) return <Loading />;

  const { snap } = sync;
  return (
    <div className={view === 'wordbomb' ? 'app app-wide' : 'app'}>
      <Header theme={theme} onToggleTheme={() => setTheme((t) => THEME_NEXT[t])} />
      {view !== 'menu' && (
        <button className="back" onClick={() => setView('menu')}>
          ‹ Menu
        </button>
      )}
      {view === 'menu' && <Dashboard onOpen={setView} players={snap.players} />}
      {view === 'pomodoro' && <Pomodoro sync={sync} />}
      {view === 'wordbomb' && <WordBomb sync={sync} me={me!} />}
      <KyroxCompanion view={view} pomo={snap.pomo} />
    </div>
  );
}
