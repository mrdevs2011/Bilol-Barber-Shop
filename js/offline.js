// =============================================================================
// OFFLINE: internet aloqasi holatini butun sayt bo'ylab boshqaradigan yagona
// joy. Uchta narsani qiladi:
//   1) navigator.onLine + 'online'/'offline' hodisalarini kuzatadi;
//   2) sahifa tepasidagi "aloqa yo'q" bannerini avtomatik ko'rsatadi/yashiradi;
//   3) aloqa qaytganda tashqi kodga (main.js) xabar beradi, shunda katalog
//      qayta yuklanishi mumkin.
// Eslatma: `navigator.onLine` faqat qurilmaning tarmoq adapteri yo'qligini
// (masalan "parvoz rejimi") ishonchli aniqlaydi — Wi-Fi ulangan-u internet
// ishlamayotgan holatlarni har doim ham to'g'ri ko'rsatavermaydi. Shu sabab
// bron yuborish kabi muhim so'rovlarda baribir haqiqiy tarmoq xatosi (fetch
// muvaffaqiyatsiz) ham alohida ushlanadi (qarang: js/booking.js, js/api.js).
// =============================================================================

export function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

let reconnectCallbacks = [];
let bannerEl = null;
let bannerShownAt = 0;

// Banner darhol chiqmasligi uchun kichik kechikish qo'yamiz — aks holda juda
// qisqa (bir necha soniyalik) tarmoq uzilishlarida ham banner "chaqnab"
// ko'rinib ketaveradi, bu esa foydalanuvchini bezovta qiladi.
const SHOW_DELAY_MS = 800;
let showTimer = null;
let hideTimer = null;

function updateBanner(online) {
  if (!bannerEl) return;
  clearTimeout(showTimer);
  clearTimeout(hideTimer);

  if (online) {
    bannerEl.classList.remove('offline-banner--show');
  } else {
    showTimer = setTimeout(() => {
      bannerEl.classList.add('offline-banner--show');
      bannerShownAt = Date.now();
    }, SHOW_DELAY_MS);
  }
}

/**
 * Offline banner va global online/offline kuzatuvchilarni ishga tushiradi.
 * @param {Function} [onReconnect] - aloqa QAYTGANDA (offline holatidan keyin) chaqiriladi. Splash/boot ekrani birinchi yuklanishida emas, faqat haqiqiy uzilishdan keyin tiklanganda ishlaydi.
 */
export function initOfflineBanner(onReconnect) {
  bannerEl = document.getElementById('offline-banner');
  if (onReconnect) reconnectCallbacks.push(onReconnect);

  const wasOfflineRef = { value: !isOnline() };
  updateBanner(isOnline());

  window.addEventListener('online', () => {
    updateBanner(true);
    if (wasOfflineRef.value) {
      wasOfflineRef.value = false;
      reconnectCallbacks.forEach((cb) => {
        try { cb(); } catch (e) { console.warn('[offline] reconnect callback xatosi:', e); }
      });
    }
  });

  window.addEventListener('offline', () => {
    wasOfflineRef.value = true;
    updateBanner(false);
  });
}

/** Boshqa modullar (masalan admin panel) qo'shimcha ravishda aloqa qaytganda ishlaydigan callback qo'shishi mumkin. */
export function onReconnect(callback) {
  reconnectCallbacks.push(callback);
}
