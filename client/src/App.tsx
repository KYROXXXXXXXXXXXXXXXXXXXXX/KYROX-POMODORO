import { useEffect, useState } from 'react';
import { inDiscord, getInstanceId, authenticateUser, type Me } from './discordSdk';
import { useGameSync, type Sync, type Player } from './useGameSync';
import { Pomodoro } from './Pomodoro';
import { WordBomb } from './WordBomb';
import { IntroCinematic } from './IntroCinematic';
import { Kyrox, KyroxCompanion } from './Kyrox';

// The intro plays on every launch (skippable). Kyrox's guided tour plays once
// per device, then he stays around as the corner companion. Both are overlays:
// the WebSocket connects underneath while they play.
type Phase = 'intro' | 'onboarding' | 'main';

function Header() {
  return (
    <header className="header">
      <img className="logo" src="/logo.png" alt="StudySouk Academy" />
      <div className="wordmark">
        <span className="wm-title">StudySouk</span>
        <span className="wm-sub">#Academy</span>
      </div>
    </header>
  );
}

function Loading() {
  return (
    <div className="app">
      <Header />
      <div className="screen center">
        <div className="spinner" />
        <p className="muted">Joining the session…</p>
      </div>
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

function LockedCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="game-card locked">
      <span className="gc-icon">{icon}</span>
      <span className="gc-title serif">{title}</span>
      <span className="gc-desc">{desc}</span>
      <span className="gc-lock">🔒 Not available yet</span>
    </div>
  );
}

function Dashboard({ sync, players }: { sync: Sync; players: Player[] }) {
  return (
    <div className="screen dashboard">
      <p className="present muted">
        {players.length} online&nbsp;: {players.map((p) => p.name).join(' · ') || '—'}
      </p>

      <section className="zone">
        <h3 className="zone-title serif">🎯 Focus</h3>
        <div className="menu three">
          <button className="game-card" onClick={() => sync.setView('pomodoro')}>
            <span className="gc-icon">⏳</span>
            <span className="gc-title serif">Pomodoro</span>
            <span className="gc-desc">Synced focus timer to study together.</span>
          </button>
          <LockedCard icon="🎧" title="Ambience" desc="Lofi, rain, nature — to back your session." />
          <LockedCard icon="📚" title="Sources" desc="Resource library for studying." />
        </div>
      </section>

      <section className="zone">
        <h3 className="zone-title serif">🎉 Relax</h3>
        <div className="menu three">
          <button className="game-card" onClick={() => sync.setView('wordbomb')}>
            <span className="gc-icon">💣</span>
            <span className="gc-title serif">Word Bomb</span>
            <span className="gc-desc">Find a word with the syllable before it blows.</span>
          </button>
          <LockedCard icon="🃏" title="Karta Lmaghribiya" desc="Ronda and other Moroccan card games." />
          <LockedCard icon="🕵️" title="Mafia" desc="Social deduction with friends — bluff well." />
        </div>
      </section>

      <p className="footnote muted">Everyone in the voice channel sees the same screen, in real time.</p>
    </div>
  );
}

export default function App() {
  // instanceId + a guest identity are available instantly — no OAuth wait.
  const [instanceId] = useState<string | null>(() => (inDiscord ? getInstanceId() : null));
  const [me, setMe] = useState<Me | null>(() =>
    inDiscord ? { id: `guest-${Math.random().toString(36).slice(2, 8)}`, name: 'Guest' } : null,
  );
  const [phase, setPhase] = useState<Phase>('intro');

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

  if (phase === 'intro') {
    return (
      <IntroCinematic
        onDone={() =>
          setPhase(localStorage.getItem('kyrox-onboard-v3') === '1' ? 'main' : 'onboarding')
        }
      />
    );
  }
  if (phase === 'onboarding') {
    return (
      <Kyrox
        onDone={() => {
          localStorage.setItem('kyrox-onboard-v3', '1');
          setPhase('main');
        }}
      />
    );
  }

  if (!sync.snap) return <Loading />;

  const { snap } = sync;
  return (
    <div className="app">
      <Header />
      {snap.view !== 'menu' && (
        <button className="back" onClick={() => sync.setView('menu')}>
          ‹ Menu
        </button>
      )}
      {snap.view === 'menu' && <Dashboard sync={sync} players={snap.players} />}
      {snap.view === 'pomodoro' && <Pomodoro sync={sync} />}
      {snap.view === 'wordbomb' && <WordBomb sync={sync} me={me!} />}
      <KyroxCompanion />
    </div>
  );
}
