import { useEffect, useState } from 'react';
import { inDiscord, getInstanceId, authenticateUser, type Me } from './discordSdk';
import { useGameSync, type Sync, type Player } from './useGameSync';
import { Pomodoro } from './Pomodoro';
import { WordBomb } from './WordBomb';

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
        <p className="muted">Connexion à la séance…</p>
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
          <h2 className="serif">Ouvre-moi dans Discord</h2>
          <p className="muted">
            Cette application est une activité Discord. Lance-la depuis un salon vocal
            (bouton fusée 🚀) pour rejoindre la séance partagée.
          </p>
        </div>
      </div>
    </div>
  );
}

function Menu({ sync, players }: { sync: Sync; players: Player[] }) {
  return (
    <div className="screen">
      <p className="present muted">
        {players.length} en ligne&nbsp;: {players.map((p) => p.name).join(' · ') || '—'}
      </p>
      <div className="menu">
        <button className="game-card" onClick={() => sync.setView('pomodoro')}>
          <span className="gc-icon">⏳</span>
          <span className="gc-title serif">Pomodoro</span>
          <span className="gc-desc">Minuteur de concentration synchronisé pour réviser ensemble.</span>
        </button>
        <button className="game-card" onClick={() => sync.setView('wordbomb')}>
          <span className="gc-icon">💣</span>
          <span className="gc-title serif">Word Bomb</span>
          <span className="gc-desc">Trouve un mot avec la syllabe avant que la bombe n'explose.</span>
        </button>
      </div>
      <p className="footnote muted">Tout le monde dans le salon voit le même écran, en temps réel.</p>
    </div>
  );
}

export default function App() {
  // instanceId + a guest identity are available instantly — no OAuth wait.
  const [instanceId] = useState<string | null>(() => (inDiscord ? getInstanceId() : null));
  const [me, setMe] = useState<Me | null>(() =>
    inDiscord ? { id: `guest-${Math.random().toString(36).slice(2, 8)}`, name: 'Invité' } : null,
  );

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
    <div className="app">
      <Header />
      {snap.view !== 'menu' && (
        <button className="back" onClick={() => sync.setView('menu')}>
          ‹ Menu
        </button>
      )}
      {snap.view === 'menu' && <Menu sync={sync} players={snap.players} />}
      {snap.view === 'pomodoro' && <Pomodoro sync={sync} />}
      {snap.view === 'wordbomb' && <WordBomb sync={sync} me={me!} />}
    </div>
  );
}
