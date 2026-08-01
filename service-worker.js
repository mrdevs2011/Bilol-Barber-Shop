// =============================================================================
// SERVICE WORKER — PWA offlayn keshi va tezkor yuklash uchun
//
// CACHE_VERSION endi QO'LDA emas, AVTOMATIK oshiriladi: har bir
// "npm run build" (Vercel deploy) paytida scripts/generate-config.js shu
// qatorni joriy Git commit'ga mos qiymat bilan qayta yozadi. Shuning uchun
// bu yerdagi qiymatni qo'lda o'zgartirish shart emas (Vercel'da) — u
// baribir build vaqtida ustidan yoziladi. Faqat LOKAL sinov uchun qo'lda
// ishga tushirmoqchi bo'lsangiz: node scripts/generate-config.js
// =============================================================================
const CACHE_VERSION = 'v13';
const CACHE_NAME = `bilol-barber-${CACHE_VERSION}`;

// Ilova ishga tushishi uchun zarur bo'lgan asosiy fayllar (app shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/main.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/booking.js',
  '/js/config.js',
  '/js/data.js',
  '/js/home.js',
  '/js/keyboard.js',
  '/js/mybookings.js',
  '/js/state.js',
  '/js/ui.js',
  '/js/pwa.js',
  '/js/push.js',
  '/js/vendor/supabase.js',
  '/assets/logo-header.png',
  '/assets/favicon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // bitta fayl topilmasa ham o'rnatish to'xtab qolmasin
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('bilol-barber-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase kabi tashqi API so'rovlariga tegmaymiz

  // HTML sahifalar uchun: avval tarmoq, bo'lmasa keshdan (har doim eng yangi kontent)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Statik fayllar uchun: avval kesh, orqa fonda tarmoqdan yangilanadi
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// =============================================================================
// WEB PUSH — telefon yopiq/qulflangan holatda ham, Telegram'ga obuna
// bo'lmagan mijozlar uchun ham ishlaydigan bepul bildirishnoma kanali.
// Server tomon (Vercel /api/notify-admin va Supabase send-reminders
// funksiyasi) VAPID kaliti bilan shifrlangan xabar yuboradi, brauzer shu
// yerda uni ochib, tizim bildirishnomasi sifatida ko'rsatadi.
// =============================================================================
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Bilol Barber', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Bilol Barber';
  const options = {
    body: data.body || '',
    icon: data.icon || '/assets/icons/icon-maskable-192.png',
    badge: data.badge || '/assets/icons/icon-maskable-192.png',
    tag: data.tag || undefined, // bir xil tag'li eski bildirishnomani almashtiradi (spam bo'lmasin)
    renotify: !!data.tag,
    vibrate: [120, 60, 120],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Bildirishnoma bosilganda — tegishli sahifa allaqachon ochiq bo'lsa o'sha
// tabga o'tadi, aks holda yangi tab ochadi.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
