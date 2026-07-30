// =============================================================================
// /install sahifasi: PWA'ni o'rnatish oqimi (Android/Chrome native prompt,
// iOS Safari uchun qo'lda yo'riqnoma, yoki allaqachon o'rnatilgan holat)
// =============================================================================
import { isStandalone, isInstalled, markInstalled } from './pwa.js';

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isSafari() {
  const ua = window.navigator.userAgent;
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
}

function showOnly(id) {
  ['alreadyInstalled', 'androidInstall', 'iosInstall', 'unsupportedInstall', 'retryInstall'].forEach((elId) => {
    const el = document.getElementById(elId);
    if (el) el.classList.toggle('hidden', elId !== id);
  });
}

/** Tugmani "tayyor" (to'liq oltin rang, bosish mumkin) yoki "kutilmoqda"
 *  (kulrang, bosib bo'lmaydi) holatiga o'tkazadi. Brauzer "beforeinstallprompt"
 *  hodisasini yubormaguncha o'rnatish hali mumkin emas — shu sabab tugma
 *  boshida kulrang va disabled bo'ladi. */
function setInstallBtnReady(btn, ready) {
  if (!btn) return;
  btn.disabled = !ready;
  btn.setAttribute('aria-disabled', String(!ready));
  btn.classList.toggle('bg-gold-500', ready);
  btn.classList.toggle('hover:bg-gold-600', ready);
  btn.classList.toggle('text-emerald-950', ready);
  btn.classList.toggle('cursor-pointer', ready);
  btn.classList.toggle('bg-emerald-950/10', !ready);
  btn.classList.toggle('text-emerald-950/30', !ready);
  btn.classList.toggle('cursor-not-allowed', !ready);
}

(function init() {
  // Ilova avval o'rnatilgan bo'lsa (hozir standalone rejimda ishlayaptimi
  // yoki ilgari o'rnatilganligi haqida belgi saqlangan bo'lsa) — o'rnatish
  // tugmasi umuman ko'rsatilmaydi, "allaqachon o'rnatilgan" holati chiqadi.
  if (isInstalled()) {
    showOnly('alreadyInstalled');
    return;
  }

  const iosMode = isIOS() && isSafari() && !('onbeforeinstallprompt' in window);

  if (iosMode) {
    showOnly('iosInstall');
    return;
  }

  // Bu sahifaga index.html'dan o'tmasdan to'g'ridan-to'g'ri kirilgan bo'lishi
  // mumkin — u holda Service Worker hali ro'yxatdan o'tmagan bo'ladi va Chrome
  // "beforeinstallprompt"ni chiqarmaydi. Shu sabab uni shu yerda ham ro'yxatdan
  // o'tkazamiz (agar allaqachon qilingan bo'lsa, bu xavfsiz — qayta ishlamaydi).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }

  // Android / Chrome / Edge — "beforeinstallprompt" hodisasini kutamiz.
  // Hodisa kelmaguncha tugma kulrang va bosib bo'lmaydigan holatda turadi.
  showOnly('androidInstall');
  const waitMsg = document.getElementById('androidWaitMsg');
  const installBtn = document.getElementById('androidInstallBtn');
  setInstallBtnReady(installBtn, false);
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setInstallBtnReady(installBtn, true);
    if (waitMsg) waitMsg.classList.add('hidden');
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      markInstalled();
      showOnly('alreadyInstalled');
    }
  });

  window.addEventListener('appinstalled', () => {
    markInstalled();
    showOnly('alreadyInstalled');
  });

  // Agar hodisa bir necha soniyada kelmasa, sababini aniqlaymiz:
  // 1) Bu sahifa hali Service Worker tomonidan boshqarilmayapti (birinchi marta
  //    to'g'ridan-to'g'ri shu sahifaga kirilgan) — bu holda sahifani qayta
  //    yuklashni taklif qilamiz, chunki keyingi yuklanishda SW allaqachon faol
  //    bo'ladi va o'rnatish tugmasi ishlaydi.
  // 2) Sahifa SW tomonidan boshqarilyapti, lekin baribir hodisa kelmadi —
  //    demak bu haqiqatan ham brauzer qo'llab-quvvatlamaydi (yoki allaqachon
  //    yaqinda rad etilgan/o'rnatilgan).
  setTimeout(() => {
    if (deferredPrompt || isStandalone()) return;
    if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
      showOnly('retryInstall');
    } else {
      showOnly('unsupportedInstall');
    }
  }, 4000);
})();
