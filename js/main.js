// =============================================================================
// MAIN: loyihaning kirish nuqtasi — barcha modullarni ishga tushiradi
// =============================================================================
import { initSupabase, getSupabaseClient } from './api.js';
import { renderServices, renderMasters, renderServicesSkeleton, renderMastersSkeleton } from './home.js';
import { initBookingModal, openBooking } from './booking.js';
import { initHeaderScroll, initMobileMenu, initRevealAnimations, initHeaderLangDropdown } from './ui.js';
import { initAuth } from './auth.js';
import { initMyBookings } from './mybookings.js';
import { initReviews } from './reviews.js';
import { initKeyboardAvoidance } from './keyboard.js';
import { initPWA } from './pwa.js';
import { loadCatalogSmart, hydrateCatalogFromCache } from './data.js';
import { initLangSwitchers } from './i18n.js';
import { initOfflineBanner, isOnline } from './offline.js';
import { initPushSettingsToggle } from './push.js';
import { getCurrentProfile } from './auth.js';

// Til almashganda xizmat kartochkalaridagi "daqiqa/мин" kabi dinamik
// matnlarni ham yangilash uchun — servicesGrid/mastersGrid data-i18n orqali
// emas, JS orqali chiziladi, shu sabab alohida qayta chizamiz.
document.addEventListener('bilol:langchange', () => {
  renderServices();
  renderMasters();
});

// =============================================================================
// SPLASH EKRANI: index.html'dagi #app-splash katalog (kesh yoki Supabase'dan)
// tayyor bo'lguncha ekranni yopib turadi — foydalanuvchi hech qachon bo'sh
// yoki yarim yuklangan sahifani ko'rmaydi. hideSplash() bir marta ishlaydi
// (ikkinchi chaqiruv jimgina e'tiborsiz qoldiriladi) va yumshoq fade bilan
// yashirib, animatsiya tugagach DOM'dan butunlay olib tashlaydi.
// XAVFSIZLIK TARMOG'I: agar biror sabab bilan (masalan juda sekin/uzilgan
// internet) katalog yuklanishi kutilganidan uzoq davom etsa, splash ekrani
// abadiy ochiq qolib ketmasligi uchun 6 soniyadan keyin baribir yashiriladi
// — bu vaqtga kelib skeleton yoki standart (fallback) ro'yxat allaqachon
// ko'rsatilgan bo'ladi.
let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('app-splash--hide');
  setTimeout(() => splash.remove(), 550);
}
setTimeout(hideSplash, 6000);

// OFFLINE HOLATI: agar kesh (localStorage) umuman topilmasa VA foydalanuvchi
// hozir offline bo'lsa — 6 soniyalik spinner kutish ma'nosiz (baribir hech
// narsa yuklanmaydi). Shu holatda splash darhol "spinner"dan "internet
// aloqasi yo'q + Qayta urinish" ko'rinishiga o'tadi. "Qayta urinish" bosilsa
// sahifa qaytadan yuklanadi — bu eng ishonchli yo'l, chunki qayta urinishda
// katalog so'rovidan tashqari boshqa ko'p narsa (auth, sozlamalar) ham
// qaytadan to'g'ri ishga tushishi kerak.
function showSplashOffline() {
  const splash = document.getElementById('app-splash');
  if (!splash || splashHidden) return;
  splash.classList.add('app-splash--offline');
}
document.getElementById('splashRetryBtn')?.addEventListener('click', () => {
  window.location.reload();
});

document.addEventListener('DOMContentLoaded', async () => {
  initLangSwitchers();      // saqlangan tilni DOM'ga qo'llaydi, til tugmalarini ulaydi
  initKeyboardAvoidance(); // eng boshida — barcha modallar uchun amal qiladi
  initPWA();                // service worker ro'yxatdan o'tkazish
  initSupabase();
  initAuth();               // supabase client tayyor bo'lgandan keyin
  initPushSettingsToggle(() => getCurrentProfile()?.id); // Sozlamalar -> Push tugmasi
  initMyBookings();         // "Mening bronlarim" — faqat login qilgan mijoz uchun
  initReviews();             // "Sharhlar": ommaviy ro'yxat + login qilgan mijoz uchun sharh qoldirish

  // OFFLINE: doimiy banner + aloqa qaytganda katalogni avtomatik qayta
  // yuklash (mijoz Wi-Fi'ni tiklab, sahifani o'zi yangilamasa ham).
  initOfflineBanner(async () => {
    const splash = document.getElementById('app-splash');
    const splashWasOffline = splash?.classList.contains('app-splash--offline');
    try {
      // splashWasOffline bo'lsa, birinchi safar hech qanday kesh bilan
      // yuklanmagan edi — shu sabab "hadFreshCache=false" bilan TO'LIQ
      // so'rov yuboramiz, aks holda "imzo" so'rovi (smart/hadFreshCache=true)
      // yetarli.
      const changed = await loadCatalogSmart(getSupabaseClient(), !splashWasOffline);
      if (splashWasOffline || changed) {
        renderServices();
        renderMasters();
      }
    } catch (e) {
      console.warn('[offline] aloqa qaytgandan keyin katalogni qayta yuklashda xatolik:', e);
    } finally {
      if (splashWasOffline) {
        splash.classList.remove('app-splash--offline');
        hideSplash();
      }
    }
  });

  // KESHLASH (localStorage, stale-while-revalidate): oldin bu yerda har
  // safar sahifa ochilganda avval skeleton chiqib, keyin Supabase javobini
  // kutish shart edi — hatto ma'lumot bir kun oldingi bilan bir xil bo'lsa
  // ham. Endi avval oxirgi saqlangan katalog localStorage'dan SINXRON
  // o'qiladi: agar topilsa, haqiqiy kartochkalar DARHOL (tarmoqsiz)
  // chiziladi va foydalanuvchi umuman skeleton ko'rmaydi. Kesh topilmasa
  // (birinchi tashrif / brauzer keshi tozalangan) — skeleton ko'rsatiladi.
  initRevealAnimations();   // kartochkalar chizilishidan OLDIN observer tayyor bo'lishi kerak
  const hadFreshCache = hydrateCatalogFromCache();
  if (hadFreshCache) {
    renderServices();
    renderMasters();
  } else {
    renderServicesSkeleton();
    renderMastersSkeleton();
  }

  // Kesh yo'q va hozir internet ham yo'q — Supabase'dan javob kutishning
  // hojati yo'q, baribir kelmaydi. Foydalanuvchini 6 soniya spinnerga
  // qaratib qo'yish o'rniga darhol aniq "aloqa yo'q" holatiga o'tamiz va
  // Supabase so'rovini butunlay o'tkazib yuboramiz (qolgan sahifa —
  // menyu, bron oynasi va h.k. — baribir odatdagidek ishga tushishi kerak).
  const offlineNoCache = !hadFreshCache && !isOnline();
  if (offlineNoCache) {
    showSplashOffline();
  }

  // MUHIM (round-11): xizmatlar/xodimlar endi admin panelda ("Tahrirlash")
  // boshqariladi va Supabase'da saqlanadi. Endi TO'LIQ ma'lumot har safar
  // qayta so'ralmaydi — avval juda yengil "imzo" so'rovi bilan hech narsa
  // o'zgarmaganligi tekshiriladi (js/data.js: loadCatalogSmart). Faqat
  // haqiqatan ham o'zgarish bo'lsa (yoki kesh umuman yo'q bo'lsa) to'liq
  // ma'lumot yuklanadi — bu Supabase'ga borib-kelishni va trafikni
  // sezilarli tejaydi.
  // Kesh yo'q + offline holatida bu so'rov butunlay o'tkazib yuboriladi —
  // baribir muvaffaqiyatsiz bo'ladi; splash "aloqa yo'q" holatida qoladi
  // va aloqa qaytganda initOfflineBanner'dagi onReconnect callback orqali
  // avtomatik qayta urinadi (pastga qarang).
  if (!offlineNoCache) {
    const changed = await loadCatalogSmart(getSupabaseClient(), hadFreshCache);

    if (!hadFreshCache || changed) {
      renderServices();         // ...faqat kerak bo'lganda qayta chiziladi
      renderMasters();
    }

    // Ma'lumot (keshdan darhol yoki Supabase'dan kutib) tayyor — splash
    // ekranini endi yashirsak bo'ladi.
    hideSplash();
  }

  // MUHIM: admin panelda xodim/xizmat qo'shilsa, o'chirilsa yoki
  // faol/nofaol qilinsa — bu sahifada ham DARHOL (sahifani yangilash — F5
  // shart emas) ko'rinishi uchun Supabase Realtime orqali kuzatiladi.
  // Ishlashi uchun Supabase loyihasida "masters" va "services" jadvallari
  // uchun Realtime yoqilgan bo'lishi kerak (bu sql/PATCH_round13_realtime_catalog.sql
  // faylida ko'rsatilgan).
  subscribeCatalogRealtime(getSupabaseClient());

  initBookingModal();
  initHeaderScroll();
  initMobileMenu();
  initHeaderLangDropdown();

  // MUHIM: agar sahifaga to'g'ridan-to'g'ri /bron/ manzili bilan kirilsa
  // (masalan bilolbarber.vercel.app/bron/ havolasi orqali — Telegram bot,
  // reklama yoki boshqa joydan yuborilgan bo'lishi mumkin), bron oynasi
  // avtomatik ochiladi. openBooking() ichida requireAuth() bor — login
  // qilinmagan bo'lsa, avval kirish/ro'yxatdan o'tish oynasi chiqadi,
  // muvaffaqiyatli kirgandan so'ng bron oynasi o'zi ochiladi.
  // Eski #bron hash havolalari (avvalgi kampaniyalar/xabarlarda qolib
  // ketgan bo'lishi mumkin) ham orqaga moslik uchun hali ishlaydi.
  handleBookingDeepLink();
});

function handleBookingDeepLink() {
  const path = window.location.pathname.replace(/\/+$/, ''); // oxiridagi "/" olib tashlanadi
  const isBookingPath = path === '/booking' || path === '/bron'; // /bron — eski havolalar uchun orqaga moslik
  const isBookingHash = window.location.hash === '#booking' || window.location.hash === '#bron';
  if (!isBookingPath && !isBookingHash) return;
  // MUHIM: manzil (/booking yoki #booking) URL'da ATAYLAB tozalanmaydi — u
  // doim shu ko'rinishda qoladi (modal ochilganda ham, yopilganda ham,
  // refresh qilinganda ham). Shu sababli /booking havolasi doim ishlaydigan,
  // barqaror manzil bo'lib qoladi.
  openBooking();
}

// Sahifa allaqachon ochiq turgan holda kimdir #booking'ga o'tsa (masalan sayt
// ichidagi biror havola orqali) ham xuddi shunday ishlaydi.
window.addEventListener('hashchange', handleBookingDeepLink);

// Xodimlar/xizmatlar jadvalidagi har qanday o'zgarish (qo'shildi, tahrirlandi,
// o'chirildi, faol/nofaol bo'ldi) bilanoq katalogni qayta yuklab, "Xizmatlar"
// va "Ustalar" bo'limlarini qayta chizadi — mijoz sahifani yangilamasa ham.
function subscribeCatalogRealtime(supabase) {
  if (!supabase) return;

  supabase
    .channel('public-catalog-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'masters' }, async () => {
      await loadCatalog(supabase);
      renderMasters();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, async () => {
      await loadCatalog(supabase);
      renderServices();
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime] katalog kanaliga ulanishda xatolik, holat:', status);
      }
    });
}
