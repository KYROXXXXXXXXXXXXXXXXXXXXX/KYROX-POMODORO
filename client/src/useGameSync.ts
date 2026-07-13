import { useEffect, useRef, useState } from 'react';
import type { Me } from './discordSdk';

// Navigation is per-user (local state in App); only the games themselves and
// the room chat are shared through the server.
export type View = 'menu' | 'pomodoro' | 'wordbomb';
export type PomoMode = 'focus' | 'short' | 'long';
export type BombLang = 'en' | 'fr' | 'ar';
export type BombDifficulty = 'easy' | 'normal' | 'hard';

export interface Player {
  id: string;
  name: string;
}
export interface ChatMsg {
  id: string;
  name: string;
  text: string;
  t: number;
}
export interface PomoState {
  mode: PomoMode;
  running: boolean;
  endsAt: number | null;
  remaining: number;
  completedFocus: number;
  durations: { focus: number; short: number; long: number };
  longEvery: number;
}
export interface Seat {
  id: string;
  name: string;
  lives: number;
  alive: boolean;
}
export interface BombState {
  phase: 'idle' | 'playing' | 'over';
  lang: BombLang;
  difficulty: BombDifficulty;
  level: number;
  syllable: string;
  typing: string;
  turnEndsAt: number | null;
  turnMs: number;
  startLives: number;
  solo: boolean;
  message: string | null;
  lastWord: string | null;
  winnerId: string | null;
  currentId: string | null;
  seats: Seat[];
}
interface Msg {
  type: 'state';
  serverTime: number;
  players: Player[];
  pomo: PomoState;
  bomb: BombState;
  chat: ChatMsg[];
}

export interface Snapshot {
  players: Player[];
  pomo: PomoState & { secondsLeft: number };
  bomb: BombState & { secondsLeft: number };
  chat: ChatMsg[];
}

export interface Sync {
  snap: Snapshot | null;
  connected: boolean;
  pomo: {
    start: () => void;
    pause: () => void;
    reset: () => void;
    skip: () => void;
    config: (d: { focus: number; short: number; long: number }, longEvery: number) => void;
  };
  bomb: {
    start: (opts: {
      turnSeconds: number;
      lives: number;
      lang: BombLang;
      difficulty: BombDifficulty;
    }) => void;
    submit: (word: string) => void;
    typing: (text: string) => void;
    leave: () => void;
    reset: () => void;
  };
  chat: {
    send: (text: string) => void;
  };
}

export function useGameSync(instanceId: string | null, me: Me | null): Sync {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const lastRef = useRef<Msg | null>(null);
  const offsetRef = useRef(0); // serverTime - clientTime
  const meRef = useRef<Me | null>(me);
  meRef.current = me;

  // Connect as soon as we know the instance — does NOT wait for OAuth.
  useEffect(() => {
    if (!instanceId) return;
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(
        `${proto}://${location.host}/api/ws?instance=${encodeURIComponent(instanceId)}`,
      );
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        const m = meRef.current;
        if (m) ws.send(JSON.stringify({ type: 'hello', id: m.id, name: m.name }));
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) retry = setTimeout(connect, 1500); // auto-reconnect on tunnel hiccups
      };
      ws.onmessage = (e) => {
        try {
          const msg: Msg = JSON.parse(e.data);
          if (msg.type === 'state') {
            lastRef.current = msg;
            offsetRef.current = msg.serverTime - Date.now();
          }
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      closedByUs = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [instanceId]);

  // When the real Discord name arrives, tell the server (no reconnect needed).
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN && me) {
      ws.send(JSON.stringify({ type: 'hello', id: me.id, name: me.name }));
    }
  }, [me?.id, me?.name]);

  // Recompute countdowns a few times a second from the authoritative end times.
  useEffect(() => {
    const tick = () => {
      const m = lastRef.current;
      if (!m) return;
      const nowServer = Date.now() + offsetRef.current;
      const pomoLeft =
        m.pomo.running && m.pomo.endsAt
          ? Math.max(0, Math.round((m.pomo.endsAt - nowServer) / 1000))
          : m.pomo.remaining;
      const bombLeft =
        m.bomb.phase === 'playing' && m.bomb.turnEndsAt
          ? Math.max(0, (m.bomb.turnEndsAt - nowServer) / 1000)
          : 0;
      setSnap({
        players: m.players,
        pomo: { ...m.pomo, secondsLeft: pomoLeft },
        bomb: { ...m.bomb, secondsLeft: bombLeft },
        chat: m.chat,
      });
    };
    const id = setInterval(tick, 100);
    tick();
    return () => clearInterval(id);
  }, []);

  const send = (o: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(o));
  };

  return {
    snap,
    connected,
    pomo: {
      start: () => send({ type: 'pomo', action: 'start' }),
      pause: () => send({ type: 'pomo', action: 'pause' }),
      reset: () => send({ type: 'pomo', action: 'reset' }),
      skip: () => send({ type: 'pomo', action: 'skip' }),
      config: (durations, longEvery) => send({ type: 'pomo', action: 'config', durations, longEvery }),
    },
    bomb: {
      start: (opts) => send({ type: 'bomb', action: 'start', ...opts }),
      submit: (word) => send({ type: 'bomb', action: 'submit', word }),
      typing: (text) => send({ type: 'bomb', action: 'typing', text }),
      leave: () => send({ type: 'bomb', action: 'leave' }),
      reset: () => send({ type: 'bomb', action: 'reset' }),
    },
    chat: {
      send: (text) => send({ type: 'chat', text }),
    },
  };
}
