import { Platform } from 'react-native';

import { deletePushSubscriptionByEndpoint, upsertPushSubscription } from './db';

// Veřejný VAPID klíč se do web buildu vloží přes env s prefixem EXPO_PUBLIC_.
const VAPID_PUBLIC = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'default';

/** Web push je jen na webu s podporou SW + PushManager + Notification + VAPID. */
export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC !== ''
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'default';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Vyžádá povolení, vytvoří odběr a uloží ho. Vrací true při úspěchu. */
export async function subscribeWebPush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys) return false;
  await upsertPushSubscription(userId, {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  });
  return true;
}

/** Zruší odběr v prohlížeči i v DB. */
export async function unsubscribeWebPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { endpoint } = sub;
  await sub.unsubscribe();
  await deletePushSubscriptionByEndpoint(endpoint);
}
