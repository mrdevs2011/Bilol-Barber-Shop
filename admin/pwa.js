// =============================================================================
// ADMIN PWA: Service Worker ro'yxatdan o'tkazish + o'rnatilganlik holati.
// Asosiy saytdagi js/pwa.js bilan bir xil mantiq, lekin o'zining alohida
// localStorage kaliti bilan — shunda "Bilol Barber" (mijozlar sayti) va
// "Bilol Barber Admin" alohida ilova sifatida o'rnatilgan-o'rnatilmaganligi
// bir-biriga aralashib ketmaydi.
// =============================================================================

const INSTALL_FLAG_KEY = 'bilol_pwa_admin_installed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

/** Admin ilovasi avval o'rnatilganmi — hozir standalone rejimda ishlayaptimi
 *  YOKI avval 'appinstalled' hodisasi orqali belgi qo'yilganmi. */
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

export function initAdminPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
  }
  if (isStandalone()) markInstalled();
  window.addEventListener('appinstalled', markInstalled);
}

export { isStandalone, isInstalled, markInstalled };
