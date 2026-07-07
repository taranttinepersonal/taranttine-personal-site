import { supabase } from './supabaseClient.js';

// TODO: replace with real values from Firebase Console > Project settings >
// General > Your apps > Web app (SDK setup and configuration).
// These values are safe to expose client-side (same trust model as the
// Supabase anon key) — access is restricted by Firebase project rules, not secrecy.
export const firebaseConfig = {
  apiKey: 'AIzaSyC9uCOxGzu0NnKKsnpzDCeM1neIw7MLWFY',
  authDomain: 'taranttine-personal.firebaseapp.com',
  projectId: 'taranttine-personal',
  storageBucket: 'taranttine-personal.firebasestorage.app',
  messagingSenderId: '870292754316',
  appId: '1:870292754316:web:ea1e56d4da822404d5d0a9',
};

// TODO: replace with the real value from Firebase Console > Project settings >
// Cloud Messaging > Web configuration > Web Push certificates.
export const VAPID_KEY = 'BPfsxArMMTFaCXnviUFEmPLMeT2OiHmjwBgYmzeJuNx0lTt5_1e0QeRW3HNdjyx1UdaMy3iHpHTSmaORZJo55QU';

const FIREBASE_SDK_VERSION = '10.12.2';

let messagingPromise = null;

async function getMessagingInstance() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
      const { getMessaging, getToken } = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging.js`);
      const app = initializeApp(firebaseConfig);
      return { messaging: getMessaging(app), getToken };
    })();
  }
  return messagingPromise;
}

export function isPushConfigured() {
  return firebaseConfig.apiKey !== 'TODO' && VAPID_KEY !== 'TODO';
}

export async function enablePushNotifications(clientId) {
  if (!isPushConfigured()) return { ok: false, reason: 'not-configured' };
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const registration = await navigator.serviceWorker.ready;
    const { messaging, getToken } = await getMessagingInstance();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: 'no-token' };

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { client_id: clientId, fcm_token: token, device_label: navigator.userAgent.slice(0, 120) },
        { onConflict: 'fcm_token' },
      );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    console.error('enablePushNotifications failed', err);
    return { ok: false, reason: err.message };
  }
}

export function getNotificationPermission() {
  return ('Notification' in window) ? Notification.permission : 'unsupported';
}
