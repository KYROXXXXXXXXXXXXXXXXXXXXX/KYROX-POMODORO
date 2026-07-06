import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string;

// The SDK constructor throws outside Discord (no frame_id). Guard it so a plain
// browser shows a hint instead of crashing.
let _sdk: DiscordSDK | null = null;
try {
  _sdk = new DiscordSDK(CLIENT_ID);
} catch {
  _sdk = null;
}

export const discordSdk = _sdk;
export const inDiscord = _sdk !== null;

export interface Me {
  id: string;
  name: string;
}

// Available synchronously (parsed from the launch URL) — no OAuth needed.
export function getInstanceId(): string {
  return (_sdk as any)?.instanceId ?? 'default';
}

// Runs in the background. We never block the UI on this; it only upgrades the
// player's guest name to their real Discord display name once it resolves.
export async function authenticateUser(): Promise<Me> {
  const sdk = discordSdk;
  if (!sdk) throw new Error('not-in-discord');

  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('token-exchange-failed');
  const { access_token } = await res.json();

  const auth: any = await sdk.commands.authenticate({ access_token });
  const u = auth?.user ?? {};
  return {
    id: String(u.id ?? getInstanceId()),
    name: String(u.global_name || u.username || 'Invité'),
  };
}
