// =============================================================================
// WEB PUSH (mijoz tomoni) — Telegram'ga obuna bo'lmagan yoki telefoni
// qulflangan mijozlar ham navbat eslatmasini olishi uchun. Butunlay bepul:
// hech qanday SMS/push xizmati (Firebase va h.k.) shart emas, faqat
// brauzerning o'zining PushManager API'si + bizning VAPID kalitimiz.
//
// Foydalanish: initPushSettingsToggle() — bir marta js/main.js'da chaqiriladi,
// #settingsModal ichidagi #pushToggleBtn tugmasini yoqadi/o'chiradi va
// holatini Supabase'dagi push_subscriptions jadvaliga yozadi/o'chiradi.
// =============================================================================

import { getSupabaseClient } from './api.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { getLang, t } from './i18n.js';

// PushManager.subscribe() VAPID kalitni Uint8Array (raw) shaklida kutadi,
// biz esa uni URL-safe base64 matn sifatida saqlaymiz — shu funksiya ikkisi
// orasida standart ko'prik (MDN'dagi rasmiy namuna).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** Brauzer + sozlamalar Push xabarnomasini qo'llab-quvvatlaydimi. */
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY
  );
}

/** Hozir shu qurilmada faol obuna bormi (brauzer darajasida). */
export async function isPushSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Push xabarnomalarni yoqadi: ruxsat so'raydi, brauzerda obuna yaratadi va
 * uni Supabase push_subscriptions jadvaliga yozadi (RLS: faqat o'ziga).
 * @param {string} userId - joriy foydalanuvchi (auth.users.id)
 * @param {{ isAdmin?: boolean, client?: object }} opts - `client` berilmasa
 *   js/api.js'dagi umumiy (mijoz) supabase clientidan foydalaniladi; admin
 *   panel o'zining alohida sessiyali clientini shu yerga uzatadi.
 */
export async function subscribeToPush(userId, { isAdmin = false, client: clientArg } = {}) {
  if (!isPushSupported()) throw new Error('Push qo\u2019llab-quvvatlanmaydi');
  if (!userId) throw new Error('Avval tizimga kiring');

  const client = clientArg || getSupabaseClient();
  if (!client) throw new Error('Ulanish yo\u2019q');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const err = new Error('Bildirishnoma ruxsati berilmadi');
    err.code = 'permission-denied';
    throw err;
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const { error } = await client.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      is_admin: isAdmin,
      lang: getLang(),
      user_agent: (navigator.userAgent || '').slice(0, 300),
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;

  return sub;
}

/** Push xabarnomalarni o'chiradi (brauzer obunasi + Supabase yozuvi). */
export async function unsubscribeFromPush({ client: clientArg } = {}) {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    const client = clientArg || getSupabaseClient();
    if (client) {
      await client.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
  } catch (err) {
    console.warn('Push obunasini o\u2019chirishda xatolik:', err);
  }
}

function setToggleUi(btn, on) {
  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  btn.classList.toggle('bg-emerald-700', on);
  btn.classList.toggle('bg-emerald-950/15', !on);
  const dot = btn.querySelector('.push-toggle-dot');
  if (dot) dot.classList.toggle('translate-x-5', on);
}

/**
 * #settingsModal ichidagi #pushToggleBtn tugmasini ishga tushiradi.
 * @param {() => (string|null)} getUserId - joriy foydalanuvchi ID'sini
 *   qaytaruvchi funksiya (js/auth.js'dagi getCurrentProfile()?.id kabi).
 * @param {{ isAdmin?: boolean }} opts
 */
export function initPushSettingsToggle(getUserId, { isAdmin = false } = {}) {
  const btn = document.getElementById('pushToggleBtn');
  const row = document.getElementById('pushToggleRow');
  const statusEl = document.getElementById('pushToggleStatus');
  if (!btn) return;

  if (!isPushSupported()) {
    row?.classList.add('hidden');
    return;
  }

  async function refresh() {
    const subscribed = await isPushSubscribed();
    setToggleUi(btn, subscribed);
    if (statusEl) {
      const blocked = Notification.permission === 'denied';
      statusEl.textContent = blocked
        ? t('settings.pushBlocked')
        : subscribed
        ? t('settings.pushOn')
        : t('settings.pushHint');
    }
  }

  btn.addEventListener('click', async () => {
    if (Notification.permission === 'denied') {
      refresh();
      return;
    }
    const userId = getUserId?.();
    if (!userId) return;
    btn.disabled = true;
    try {
      const subscribed = await isPushSubscribed();
      if (subscribed) {
        await unsubscribeFromPush();
      } else {
        await subscribeToPush(userId, { isAdmin });
      }
    } catch (err) {
      console.warn('Push tugmasi xatosi:', err);
    } finally {
      btn.disabled = false;
      refresh();
    }
  });

  document.addEventListener('bilol:settingsopen', refresh);
  refresh();
}
