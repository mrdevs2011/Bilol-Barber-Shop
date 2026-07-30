// =============================================================================
// FULLSCREEN: mobil qurilmalarda bron/kirish jarayonida ekranni to'liq
// ekranga (fullscreen) o'tkazish, jarayon tugagach oddiy holatga qaytarish.
//
// Nega kerak: mobilda brauzer manzil paneli va navigatsiya paneli joy
// egallaydi, bron formasi torroq ko'rinadi. Fullscreen API orqali bu
// panellarni vaqtincha yashirib, forma butun ekranni egallashi ta'minlanadi.
//
// Eslatma: Fullscreen API faqat foydalanuvchi harakati (click/tap) natijasida
// chaqirilgan funksiya ichida ishlaydi va ba'zi brauzerlar (masalan iOS
// Safari'da versiyaga qarab) uni umuman qo'llab-quvvatlamasligi mumkin —
// shuning uchun har doim try/catch bilan "jim" muvaffaqiyatsizlikka yo'l
// qo'yamiz: fullscreen ishlamasa ham, sayt oddiy holatda ishlashda davom etadi.
// =============================================================================

const MOBILE_BREAKPOINT_PX = 768;

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
}

function isFullscreenSupported() {
  const el = document.documentElement;
  return !!(
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen
  );
}

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

/** Mobil ekranda bo'lsa, sahifani fullscreen holatiga o'tkazadi.
 *  Faqat foydalanuvchi tap/click qilgan hodisa ichidan chaqirilishi shart. */
export async function enterFullscreenIfMobile() {
  if (!isMobileViewport() || !isFullscreenSupported() || isFullscreenActive()) return;

  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
    }
  } catch (err) {
    // Fullscreen rad etilishi yoki qo'llab-quvvatlanmasligi mumkin —
    // bu kritik xatolik emas, shunchaki oddiy rejimda davom etamiz.
    console.warn('Fullscreen rejimga o\'tib bo\'lmadi:', err);
  }
}

/** Fullscreen rejimidan oddiy holatga qaytaradi (agar hozir faol bo'lsa). */
export async function exitFullscreenIfActive() {
  if (!isFullscreenActive()) return;

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      await document.msExitFullscreen();
    }
  } catch (err) {
    console.warn('Fullscreen rejimidan chiqib bo\'lmadi:', err);
  }
}
