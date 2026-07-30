// =============================================================================
// PWA: Service Worker ro'yxatdan o'tkazish.
// Ilovani o'rnatish taklifi endi suzuvchi (floating) tugma sifatida emas,
// balki faqat Kirish/Ro'yxatdan o'tish (auth) modalida ko'rsatiladi
// (index.html'dagi #authInstallBtn, ulash logikasi auth.js'da).
//
// "O'rnatilgan" holatini faqat matchMedia(display-mode: standalone) orqali
// aniqlash yetarli emas — bu faqat ilova hozir standalone rejimda ishlab
// turgandagina true qaytaradi. Agar mijoz ilovani avval o'rnatgan bo'lsa-yu,
// hozir oddiy brauzer tabida yurgan bo'lsa (masalan /install yoki login
// sahifasini qayta ochsa), standalone tekshiruvi false qaytaradi va tugma
// yana "o'rnatilmagan"dek ko'rinib qoladi. Shu sabab o'rnatilganlik holati
// localStorage'da ham saqlanadi (bir marta o'rnatilgach, doim eslab qolinadi).
// =============================================================================

const INSTALL_FLAG_KEY = 'bilol_pwa_installed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

/** Ilova avval o'rnatilganmi — hozir standalone rejimda ishlayaptimi
 *  YOKI avval 'appinstalled' hodisasi/standalone holati orqali belgi
 *  qo'yilganmi, shularning birortasi true bo'lsa, o'rnatilgan hisoblanadi. */
function isInstalled() {
  if (isStandalone()) return true;
  try {
    return localStorage.getItem(INSTALL_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function markInstalled() {
  try {
    localStorage.setItem(INSTALL_FLAG_KEY, '1');
  } catch {
    /* localStorage yo'q yoki bloklangan — jimgina o'tkazib yuboramiz */
  }
}

export function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
  }
  // Agar ilova hozir standalone rejimda ochilgan bo'lsa — bu o'rnatilganlik
  // belgisini keyingi (brauzerdagi) tashriflar uchun ham saqlab qo'yamiz.
  if (isStandalone()) markInstalled();
  window.addEventListener('appinstalled', markInstalled);
}

export { isStandalone, isInstalled, markInstalled };
