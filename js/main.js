// =============================================================================
// MAIN: loyihaning kirish nuqtasi — barcha modullarni ishga tushiradi
// =============================================================================
import { initSupabase, getSupabaseClient } from './api.js';
import { renderServices, renderMasters } from './home.js';
import { initBookingModal, openBooking } from './booking.js';
import { initHeaderScroll, initMobileMenu, initRevealAnimations } from './ui.js';
import { initAuth } from './auth.js';
import { initMyBookings } from './mybookings.js';
import { initReviews } from './reviews.js';
import { initKeyboardAvoidance } from './keyboard.js';
import { initPWA } from './pwa.js';
import { loadCatalog } from './data.js';
import { initLangSwitchers } from './i18n.js';

// Til almashganda xizmat kartochkalaridagi "daqiqa/мин" kabi dinamik
// matnlarni ham yangilash uchun — servicesGrid/mastersGrid data-i18n orqali
// emas, JS orqali chiziladi, shu sabab alohida qayta chizamiz.
document.addEventListener('bilol:langchange', () => {
  renderServices();
  renderMasters();
});

document.addEventListener('DOMContentLoaded', async () => {
  initLangSwitchers();      // saqlangan tilni DOM'ga qo'llaydi, til tugmalarini ulaydi
  initKeyboardAvoidance(); // eng boshida — barcha modallar uchun amal qiladi
  initPWA();                // service worker ro'yxatdan o'tkazish
  initSupabase();
  initAuth();               // supabase client tayyor bo'lgandan keyin
  initMyBookings();         // "Mening bronlarim" — faqat login qilgan mijoz uchun
  initReviews();             // "Sharhlar": ommaviy ro'yxat + login qilgan mijoz uchun sharh qoldirish

  // MUHIM (round-11): xizmatlar/xodimlar endi admin panelda ("Tahrirlash")
  // boshqariladi va Supabase'da saqlanadi — shu sabab kartochkalarni
  // chizishdan OLDIN eng so'nggi ro'yxatni kutib olamiz. Agar so'rov
  // sekinlashib ketsa yoki xato bersa, data.js ichidagi standart ro'yxat
  // baribir ishlatiladi (sayt bo'sh qolib ketmaydi).
  await loadCatalog(getSupabaseClient());

  initRevealAnimations();   // avval observer tayyorlanadi
  renderServices();         // ...keyin dinamik kartochkalar qo'shiladi
  renderMasters();

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
  const isBronPath = path === '/bron';
  const isBronHash = window.location.hash === '#bron';
  if (!isBronPath && !isBronHash) return;
  // MUHIM: manzil (/bron yoki #bron) URL'da ATAYLAB tozalanmaydi — u
  // doim shu ko'rinishda qoladi (modal ochilganda ham, yopilganda ham,
  // refresh qilinganda ham). Shu sababli /bron havolasi doim ishlaydigan,
  // barqaror manzil bo'lib qoladi.
  openBooking();
}

// Sahifa allaqachon ochiq turgan holda kimdir #bron'ga o'tsa (masalan sayt
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
