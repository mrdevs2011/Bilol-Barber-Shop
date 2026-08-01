// =============================================================================
// ADMIN PANEL: Supabase Auth orqali kirish + bookings ro'yxatini boshqarish
// =============================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL } from '../js/config.js';
import { MASTERS, SERVICES, generateDaySlots, loadCatalog, loadCatalogSmart, hydrateCatalogFromCache } from '../js/data.js';
import { initAdminPWA } from './pwa.js';
import { uzLatinToCyrillic } from './translit.js';
import { initOfflineBanner, isOnline } from '../js/offline.js';
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '../js/push.js';
import { renderStatsPanel, initStatsView } from './stats.js';

// Admin panelni PWA sifatida o'rnatish uchun Service Worker'ni ro'yxatdan
// o'tkazadi (mijozlar saytidagidan alohida o'rnatilganlik belgisi bilan —
// batafsili uchun admin/pwa.js va admin/install/index.html'ga qarang).
initAdminPWA();

// ---------------------------------------------------------------------------
// Tavsif (description) matnlarini o'zbekchadan ruschaga avtomatik tarjima
// qilish uchun /api/translate serverless funksiyasiga murojaat qiladi
// (haqiqiy ma'no tarjimasi kerak — shuning uchun translit.js emas, bu
// ishlatiladi). Xatolik bo'lsa (masalan API kalit sozlanmagan yoki tarmoq
// muammosi) null qaytaradi — bu holda saqlashda description_ru bo'sh
// qoladi va sayt avtomatik o'zbekcha matnga qaytadi (js/data.js -> pickLang()),
// ya'ni saqlash jarayoni hech qachon bloklanmaydi.
// ---------------------------------------------------------------------------
async function autoTranslateTo(text, target) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed, target }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok || !data.translated) {
      console.warn(`Avtomatik tarjima (${target}) muvaffaqiyatsiz:`, data?.error || res.status);
      return null;
    }
    return data.translated;
  } catch (err) {
    console.warn(`Avtomatik tarjima (${target}) xatolik:`, err);
    return null;
  }
}
async function autoTranslateToRu(text) { return autoTranslateTo(text, 'ru'); }
// EN qo'shildi: ism uchun translit.js kabi harf almashtirish EN'ga mos
// kelmaydi (inglizcha yozuv lotin alifbosida, o'zbekcha lotin nomlar bilan
// deyarli bir xil ko'rinadi) — shu sababli nom uchun ham xuddi tavsif kabi
// /api/translate orqali haqiqiy tarjima qilinadi (masalan xizmat nomlari
// uchun kerak: "Soqol shakllantirish" -> "Beard shaping").
async function autoTranslateToEn(text) { return autoTranslateTo(text, 'en'); }

let supabaseClient = null;
let currentBookings = [];
let profilesMap = {}; // user_id -> { no_show_count, blocked }
let activeTab = 'today';
let searchQuery = '';
let tickTimer = null;
let clockTimer = null;
let moodTimer = null;
let realtimeChannel = null;
let wakeLock = null;
let manualLogout = false; // "Chiqish" tugmasi bosilganda true bo'ladi — shunda avtomatik qayta kirish ishlamaydi
let currentStatsRange = 'today'; // Statistika bo'limidagi tanlangan sana oralig'i ('today', 'week', 'month', 'custom' va h.k.)

// ---------------------------------------------------------------------------
// "Bu qurilmani eslab qol" — do'konda doimiy turadigan tablet uchun.
// Parol qurilmaning o'zida (localStorage) saqlanadi va sessiya kutilmaganda
// uzilib qolsa (masalan tablet qayta yoqilganda yoki token yangilanmasa),
// xodim parolni qayta kiritmasdan avtomatik tizimga kiritiladi.
// MUHIM: bu faqat orqa xonadagi, mijozlar ko'rmaydigan qurilma uchun
// mo'ljallangan — parol ochiq ko'rinishda shu brauzerda saqlanadi.
// ---------------------------------------------------------------------------
const REMEMBER_KEY = 'bilolbarber-admin-remember';

function saveRememberedPassword(password) {
  try { localStorage.setItem(REMEMBER_KEY, password); } catch (e) { /* xotira to'lgan/yopiq bo'lishi mumkin */ }
}
function clearRememberedPassword() {
  try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
}
function getRememberedPassword() {
  try { return localStorage.getItem(REMEMBER_KEY); } catch (e) { return null; }
}

function initSupabase() {
  try {
    if (window.supabase && SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
      // MUHIM: Admin panel sessiyasi asosiy sayt (js/api.js) bilan bir xil
      // localStorage kalitini ISHLATMASLIGI kerak — aks holda admin login
      // qilgach, oddiy mijozlar sahifasidagi so'rovlar ham "authenticated"
      // sifatida ketib, RLS policy'larni chalkashtirib yuboradi. Shuning
      // uchun bu yerga alohida, o'ziga xos storageKey beriladi.
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storageKey: 'bilolbarber-admin-auth',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });

      // Kutilmagan sessiya uzilishi (masalan token yangilanmadi, tablet
      // uzoq vaqt uxlab yotgandan keyin uyg'onganda) — agar bu xodimning
      // o'zi "Chiqish" bosishi bilan bo'lmagan bo'lsa, eslab qolingan
      // parol bilan jimgina qayta kirishga urinamiz, aks holda login
      // ekrani bo'sh holda qotib qolib, ma'lumot yangilanmay qoladi.
      supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          if (manualLogout) { manualLogout = false; return; }
          tryAutoLogin();
        }
      });
    }
  } catch (e) {
    console.warn('Supabase init xatosi:', e);
  }
  return supabaseClient;
}

const bootView      = document.getElementById('bootView');
const loginView     = document.getElementById('loginView');
const dashView      = document.getElementById('dashView');
const loginForm     = document.getElementById('loginForm');
const loginError    = document.getElementById('loginError');
const loginErrorText= document.getElementById('loginErrorText');
const logoutBtn     = document.getElementById('logoutBtn');
const refreshBtn    = document.getElementById('refreshBtn');
const bookingsBody  = document.getElementById('bookingsBody');
const emptyState    = document.getElementById('emptyState');
const statusFilter  = document.getElementById('statusFilter');
const timeTabs      = document.getElementById('timeTabs');
const searchInput   = document.getElementById('searchInput');
const colCountdownLabel = document.getElementById('colCountdownLabel');
const liveClock     = document.getElementById('liveClock');
const toastHost     = document.getElementById('toastHost');

const stTimeOffSection = document.getElementById('stTimeOffSection');
const stToDate         = document.getElementById('stToDate');
const stToFullDay      = document.getElementById('stToFullDay');
const stToRangeFields  = document.getElementById('stToRangeFields');
const stToStart        = document.getElementById('stToStart');
const stToEnd          = document.getElementById('stToEnd');
const stToReason       = document.getElementById('stToReason');
const stToError        = document.getElementById('stToError');
const stToAddBtn       = document.getElementById('stToAddBtn');
const stToListBody     = document.getElementById('stToListBody');

const newBookingBtn   = document.getElementById('newBookingBtn');
const newBookingModal = document.getElementById('newBookingModal');
const nbCloseBtn      = document.getElementById('nbCloseBtn');
const newBookingForm  = document.getElementById('newBookingForm');
const nbName          = document.getElementById('nbName');
const nbPhone         = document.getElementById('nbPhone');
const nbService       = document.getElementById('nbService');
const nbMaster        = document.getElementById('nbMaster');
const nbDate          = document.getElementById('nbDate');
const nbSlots         = document.getElementById('nbSlots');
const nbError         = document.getElementById('nbError');
const nbSubmitBtn     = document.getElementById('nbSubmitBtn');
let nbSelectedTime    = null;
let nbEditingId       = null; // null = yangi bron qo'shish, aks holda shu ID'dagi bronni tahrirlash

// ---------------------------------------------------------------------------
// Chap sidebar (desktop, #viewSwitch) sticky holatda header'dan pastroqda
// turishi kerak — CSS'da bu masofa --admin-header-h o'zgaruvchisidan
// olinadi (qarang: admin/index.html, #viewSwitch.view-switch{top:...}).
// Header balandligi doim bir xil emas (masalan "Yangi bron"/"Chiqish"
// tugmalari sig'may qolganda .header-row ikkinchi qatorga tushib ketadi),
// shuning uchun qattiq raqam o'rniga haqiqiy balandlikni ResizeObserver
// bilan doim kuzatib, CSS o'zgaruvchisini yangilab turamiz — aks holda
// sidebar eski (kichikroq) masofada "yopishib" qolib, header'ning
// ustiga chiqib ketardi.
const adminHeaderEl = document.getElementById('adminHeader');
if (adminHeaderEl) {
  let syncAdminHeaderHeightQueued = false;
  const syncAdminHeaderHeight = () => {
    syncAdminHeaderHeightQueued = false;
    // Math.ceil: butun piksel qiymat — kasr piksel (masalan 87.6px) sticky
    // "top" sifatida ishlatilganda ba'zi brauzerlarda 1px atrofida
    // "titrash" (jitter)ga sabab bo'lishi mumkin edi.
    const h = Math.ceil(adminHeaderEl.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--admin-header-h', `${h}px`);
  };
  // requestAnimationFrame bilan navbatga qo'yamiz — ResizeObserver bir
  // zumda bir necha marta chaqirilib qolsa ham, CSS o'zgaruvchisi faqat
  // keyingi render freym'da, bittagina marta yangilanadi (repaint'larni
  // qisqartirib, scroll paytidagi "sal qimirlash"ni yo'qotadi).
  const queueSyncAdminHeaderHeight = () => {
    if (syncAdminHeaderHeightQueued) return;
    syncAdminHeaderHeightQueued = true;
    requestAnimationFrame(syncAdminHeaderHeight);
  };
  syncAdminHeaderHeight();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(queueSyncAdminHeaderHeight).observe(adminHeaderEl);
  } else {
    window.addEventListener('resize', queueSyncAdminHeaderHeight);
  }
}

const moodBanner = document.getElementById('moodBanner');
const moodLine1  = document.getElementById('moodLine1');
const moodLine2  = document.getElementById('moodLine2');

// ---------------------------------------------------------------------------
// "Bronlar" / "Tahrirlash" (xodimlar + xizmatlar) almashtirgichi
// ---------------------------------------------------------------------------
const viewSwitch    = document.getElementById('viewSwitch');
const viewDash       = document.getElementById('viewDash');
const viewBookings  = document.getElementById('viewBookings');
const viewStaff     = document.getElementById('viewStaff');
const viewBlocked   = document.getElementById('viewBlocked');
const viewComments  = document.getElementById('viewComments');
const viewStats     = document.getElementById('viewStats');
const moreMenuBtn      = document.getElementById('moreMenuBtn');
const moreMenuModal     = document.getElementById('moreMenuModal');
const moreMenuCloseBtn  = document.getElementById('moreMenuCloseBtn');

// ---------------------------------------------------------------------------
// "Dashboard" — hozirgi holat: zalda nechta mijoz, qaysi usta band/bo'sh,
// navbatda kim kutmoqda. Default ochiladigan bo'lim shu (index.html'da
// birinchi view-switch tugmasi va default ko'rinadigan <main> shu).
// ---------------------------------------------------------------------------
const dashInShop    = document.getElementById('dashInShop');
const dashFreeCount = document.getElementById('dashFreeCount');
const dashTodayTotal= document.getElementById('dashTodayTotal');
const dashTodaySub  = document.getElementById('dashTodaySub');
const dashNext      = document.getElementById('dashNext');
const dashNextSub   = document.getElementById('dashNextSub');
const msGrid        = document.getElementById('msGrid');
const msUpdatedAt   = document.getElementById('msUpdatedAt');
const queueList      = document.getElementById('queueList');
const queueCount     = document.getElementById('queueCount');
const dashEmpty      = document.getElementById('dashEmpty');

// ---------------------------------------------------------------------------
// "Statistika" — tanlangan davr (bugun/hafta/oy) bo'yicha tushum dinamikasi,
// ustalar reytingi, mashhur xizmatlar va kelmagan mijozlar foizi.
// Dashboard'dan farqli o'laroq bu yerdagi ma'lumot currentBookings'ga
// (500 tagacha cheklangan, faqat oldinga qarab tartiblangan) tayanmaydi —
// har safar davr uchun to'g'ridan-to'g'ri Supabase'dan so'raladi, shunda
// bronlar soni ko'p bo'lgan taqdirda ham statistikaga ta'sir qilmaydi.
// ---------------------------------------------------------------------------
const statsPeriodTabs   = document.getElementById('statsPeriodTabs');
const statsRevenue      = document.getElementById('statsRevenue');
const statsClients      = document.getElementById('statsClients');
const statsClientsSub   = document.getElementById('statsClientsSub');
const statsAvgCheck     = document.getElementById('statsAvgCheck');
const statsNoShowPct    = document.getElementById('statsNoShowPct');
const statsNoShowSub    = document.getElementById('statsNoShowSub');
const statsChartWrap    = document.getElementById('statsChartWrap');
const statsChartSub     = document.getElementById('statsChartSub');
const statsMastersList  = document.getElementById('statsMastersList');
const statsServicesList = document.getElementById('statsServicesList');
let statsPeriod = 'today';

const addStaffBtn     = document.getElementById('addStaffBtn');
const staffGrid        = document.getElementById('staffGrid');
const staffModal       = document.getElementById('staffModal');
const staffCloseBtn    = document.getElementById('staffCloseBtn');
const staffForm         = document.getElementById('staffForm');
const stName            = document.getElementById('stName');
const stDesc            = document.getElementById('stDesc');
const stPhoto           = document.getElementById('stPhoto');
const stPhotoDropzone   = document.getElementById('stPhotoDropzone');
const stPhotoEmpty      = document.getElementById('stPhotoEmpty');
const stPhotoPreviewWrap= document.getElementById('stPhotoPreviewWrap');
const stPhotoPreview    = document.getElementById('stPhotoPreview');
const stPhotoRemoveBtn  = document.getElementById('stPhotoRemoveBtn');
const stActive          = document.getElementById('stActive');
const stError           = document.getElementById('stError');
const stSubmitBtn       = document.getElementById('stSubmitBtn');
let stEditingId = null; // null = yangi xodim, aks holda shu ID tahrirlanadi
let stPhotoFile = null;

const addServiceBtn   = document.getElementById('addServiceBtn');
const serviceList      = document.getElementById('serviceList');
const serviceModal     = document.getElementById('serviceModal');
const serviceCloseBtn  = document.getElementById('serviceCloseBtn');
const serviceForm       = document.getElementById('serviceForm');
const svName             = document.getElementById('svName');
const svPrice            = document.getElementById('svPrice');
const svDuration         = document.getElementById('svDuration');
const svActive           = document.getElementById('svActive');
const svError            = document.getElementById('svError');
const svSubmitBtn        = document.getElementById('svSubmitBtn');
let svEditingId = null; // null = yangi xizmat, aks holda shu ID tahrirlanadi

let allStaffRows = [];
let allServiceRows = [];

const MOOD_STORAGE_KEY = 'bilolbarber-admin-last-mood';

// Vaqtni "13:23" ko'rinishida chiqarish
function fmtClock(now) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Kayfiyat banneri: bugungi haqiqiy bron sonidan kelib chiqib
// xotirjamlantiruvchi yoki tabriklovchi xabar tanlaydi. Bir xil xabar
// ketma-ket ikki marta chiqmasligi uchun oxirgisi localStorage'da saqlanadi.
// ---------------------------------------------------------------------------

// Bron yo'q (yoki hali kam) holatlar uchun — kunning birinchi yarmi
const ZERO_MESSAGES_DAY = [
  t => `Bugun hozircha bron tushmadi. Tushkunlikka tushmang, hali soat ${t}, oldinda vaqt ko'p!`,
  t => `Hozircha jimjit... lekin bu hali hech narsani anglatmaydi. Soat ${t} — kun hali davom etmoqda.`,
  t => `Bugun bron kam ekan. Xotirjam bo'ling, soat ${t}da mijozlar ko'pincha keyinroq bron qiladi.`,
  t => `Sukunat — bu ham bir holat, xolos. Soat ${t}, hali ancha vaqt bor, ishonch bilan kuting.`,
  t => `Telefon jim... lekin bu vaqtinchalik. Hozir soat ${t}, sabr qiling, mijozlar albatta keladi.`,
  t => `Har bir kun bir xil bo'lavermaydi. Soat ${t}, hali erta xulosa chiqarmang.`,
  t => `Hozircha bron yo'q, lekin kun hali tugagani yo'q — soat atigi ${t}. Chuqur nafas oling.`,
  t => `Bugungi kun sekin boshlandi, xolos. Soat ${t}, ko'pincha eng yaxshi bronlar keyinroq tushadi.`,
  t => `Bir oz sabr! Soat ${t}, hali kunning katta qismi oldinda.`,
  t => `Tinchlik saqlang — bu shunchaki sokin bir payt. Soat ${t}, hammasi yaxshi bo'ladi.`,
  t => `Statistika bilan tinchlaning: kam kunlar ham bo'lib turadi. Soat ${t}, umid qilishda davom eting.`,
  t => `Hozir jimlik bor, lekin bu ish sifatingizga bog'liq emas. Soat ${t}, davom eting.`,
];

// Bron yo'q holat, lekin kun kechga og'gan (soat 19dan keyin)
const ZERO_MESSAGES_EVENING = [
  t => `Bugun bron kam bo'ldi, soat ${t} bo'lyapti. Xafa bo'lmang — ertaga yangi imkoniyat kutmoqda.`,
  t => `Har bir kun ham gavjum bo'lavermaydi. Soat ${t}, bugungisini xotirjam yakunlang.`,
  t => `Kun tinch o'tdi, soat ${t}. Bu vaqtincha holat, ertaga albatta yaxshiroq bo'ladi.`,
  t => `Bugun tinchroq kun bo'ldi. Soat ${t}, dam oling — ertaga yangi mijozlar kutmoqda.`,
  t => `Soat ${t} bo'ldi, bugun sokin o'tdi. Bunday kunlar ham bo'lib turadi, tushkunlikka o'rin yo'q.`,
  t => `Bugun kam bron bo'ldi, lekin bu sizning mahoratingizga bog'liq emas. Soat ${t}, ertaga davom etamiz.`,
  t => `Kun yakunlanmoqda, soat ${t}. Xotirjam bo'ling — ertangi kun boshqacha bo'lishi mumkin.`,
  t => `Bugungisi sokin o'tdi. Soat ${t}, yaxshi dam oling, ertaga yangidan boshlaymiz.`,
];

// Bugun bron(lar) tushgan holatlar uchun (mijozlar soni bilan)
const SOME_MESSAGES = [
  (n) => `Bugun ${n} ta mijoz bron qildi. OMAD!`,
  (n) => `Zo'r! Bugun ${n} ta bron tushdi. Ishlar yaxshi ketyapti!`,
  (n) => `${n} ta mijoz bugun sizni tanladi. Ajoyib natija!`,
  (n) => `Bugun ${n} ta bron — davom eting shunday!`,
  (n) => `Yashang! Bugungi kunda ${n} ta mijoz keldi.`,
  (n) => `${n} ta bron — bu ajoyib ko'rsatkich. Rahmat, mehnatingiz o'z samarasini bermoqda!`,
  (n) => `Bugun ${n} ta mijoz sizga ishonib keldi. Zo'r ish!`,
  (n) => `Kun yaxshi ketyapti: ${n} ta bron allaqachon tushdi.`,
  (n) => `${n} ta mijoz — bugungi kun samarali o'tyapti. Davom eting!`,
  (n) => `Bugungi natija: ${n} ta bron. Mehnatingiz uchun rahmat!`,
];

// Bron ko'p bo'lgan (5 va undan ortiq) holat uchun alohida quvonchli xabarlar
const SOME_MESSAGES_HIGH = [
  (n) => `Ajoyib kun! Bugun ${n} ta mijoz bron qildi. Zo'rsiz!`,
  (n) => `${n} ta bron bir kunda — bu haqiqiy muvaffaqiyat!`,
  (n) => `Bugun juda gavjum: ${n} ta mijoz keldi. Tabriklaymiz!`,
  (n) => `${n} ta bron! Bunday kunlar ko'proq bo'lsin.`,
  (n) => `Zo'r natija — ${n} ta mijoz bugun sizni tanladi. Davom eting!`,
];

function pickMoodMessage(now, todaysCount) {
  let pool;
  let mood;

  if (todaysCount <= 0) {
    pool = now.getHours() >= 19 ? ZERO_MESSAGES_EVENING : ZERO_MESSAGES_DAY;
    mood = 'calm';
  } else if (todaysCount >= 5) {
    pool = SOME_MESSAGES_HIGH;
    mood = 'happy';
  } else {
    pool = SOME_MESSAGES;
    mood = 'happy';
  }

  let lastKey = null;
  try { lastKey = localStorage.getItem(MOOD_STORAGE_KEY); } catch (e) { /* ignore */ }

  let candidates = pool.map((fn, i) => `${mood}-${pool === ZERO_MESSAGES_EVENING ? 'eve' : pool === ZERO_MESSAGES_DAY ? 'day' : pool === SOME_MESSAGES_HIGH ? 'hi' : 'some'}-${i}`);
  let idx = Math.floor(Math.random() * pool.length);
  let key = candidates[idx];

  if (pool.length > 1 && key === lastKey) {
    idx = (idx + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
    key = candidates[idx];
  }

  try { localStorage.setItem(MOOD_STORAGE_KEY, key); } catch (e) { /* ignore */ }

  const arg = todaysCount <= 0 ? fmtClock(now) : todaysCount;
  const line1 = pool[idx](arg);
  return { line1, mood };
}

function updateMoodBanner() {
  if (!moodBanner) return;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todaysCount = currentBookings.filter(b => b.booking_date === todayStr && b.status !== 'cancelled').length;

  const { line1, mood } = pickMoodMessage(now, todaysCount);
  moodBanner.classList.remove('hidden', 'mood-calm', 'mood-happy');
  moodBanner.classList.add(mood === 'calm' ? 'mood-calm' : 'mood-happy');
  const icon = moodBanner.querySelector('.mood-icon i');
  if (icon) icon.className = mood === 'calm' ? 'fa-solid fa-mug-hot' : 'fa-solid fa-champagne-glasses';
  moodLine1.textContent = line1;
  moodLine2.textContent = mood === 'calm'
    ? "Hammasi nazoratda — kun hali davom etmoqda."
    : "Shunday davom eting, ish yaxshi ketyapti!";
}

const statToday    = document.getElementById('statToday');
const statTodaySub = document.getElementById('statTodaySub');
const statNext     = document.getElementById('statNext');
const statNextSub  = document.getElementById('statNextSub');
const statNew      = document.getElementById('statNew');
const statRevenue  = document.getElementById('statRevenue');

function money(n) {
  return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ') + " so'm";
}

const STATUS_LABEL = { new: "Yangi", confirmed: "Tasdiqlangan", done: "Bajarilgan", no_show: "Kelmadi", cancelled: "Bekor qilingan" };
const STATUS_CLASS = { new: "st-new", confirmed: "st-confirmed", done: "st-done", no_show: "st-noshow", cancelled: "st-cancelled" };

// ---------------------------------------------------------------------------
// Toast xabarlar (alert() o'rniga)
// ---------------------------------------------------------------------------
function toast(msg, type = 'ok') {
  // Xatolik turidagi toastlarni konsolga ham chiqaramiz — shu orqali
  // mobil debug panelida (admin/index.html) ko'rinadi, hatto toast
  // ekranda tez g'oyib bo'lib ketsa ham.
  if (type === 'err') console.error('[toast]', msg);
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : 'ok'}`;
  el.innerHTML = `<i class="fa-solid ${type === 'err' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${escapeHtml(msg)}</span>`;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s ease';
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

function showError(msg) {
  loginErrorText.textContent = msg;
  loginError.classList.remove('hidden');
}

function showLogin() {
  hideBootView(); // login formasi uchun kutiladigan ma'lumot yo'q — darhol yashiramiz
  dashView.classList.add('hidden');
  loginView.classList.remove('hidden');
  if (tickTimer) clearInterval(tickTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (moodTimer) clearInterval(moodTimer);
  unsubscribeRealtime();
  releaseWakeLock();
}

// #bootView (branderlangan yuklanish ekrani) sessiya tekshirilayotganda VA
// (login qilingan bo'lsa) birinchi bronlar/katalog ro'yxati Supabase'dan
// kelguncha ekranni yopib turadi. hideBootView() bir marta ishlaydi, yumshoq
// fade bilan yashiradi. XAVFSIZLIK TARMOG'I: internet juda sekin/uzilgan
// bo'lsa ham admin abadiy bo'sh ekranda qolib ketmasligi uchun 6 soniyadan
// keyin baribir yashiriladi.
let bootViewHidden = false;
function hideBootView() {
  if (bootViewHidden) return;
  bootViewHidden = true;
  bootView?.classList.add('hidden');
}
setTimeout(hideBootView, 6000);

// Ekran doim yonib turishi uchun (do'kondagi doimiy tablet uxlab qolib,
// ma'lumot ko'rinmay qolmasligi kerak). Barcha brauzerlar/qurilmalar
// qo'llab-quvvatlamaydi — shunda jimgina e'tiborsiz qoldiriladi.
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) {
    console.warn('Wake Lock so\'ralmadi:', e);
  }
}
function releaseWakeLock() {
  try { wakeLock?.release(); } catch (e) {}
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !dashView.classList.contains('hidden') && !wakeLock) {
    requestWakeLock();
  }
});

function showDashboard() {
  loginView.classList.add('hidden');
  dashView.classList.remove('hidden');
  activateViewFromLocation();
  // Statistika bo'limining filter tugmalarini initsializatsiya qilish
  initStatsView();
  // Splash ekrani (#bootView) shu ikkala so'rov (bugungi bronlar +
  // xizmat/xodim katalogi) haqiqatan tugaguncha ochiq turadi — shunda
  // admin panelni ochgan xodim bo'sh/yarim yuklangan jadvalni ko'rmaydi.
  const bookingsReady = loadBookings();
  // UI TUZATISH (keshlash): panel har ochilganda (login/sessiya tiklanganda)
  // xizmat/xodim ro'yxati TO'LIQ qayta so'ralar edi. Endi avval kesh
  // (localStorage — mijoz sayti bilan BIR XIL, chunki bir domen) darhol
  // qo'llanadi, so'ng juda yengil "imzo" so'rovi bilan haqiqatan
  // o'zgarishmi tekshiriladi — o'zgarish bo'lmasa to'liq so'rov yuborilmaydi.
  const catalogReady = (async () => {
    const hadCache = hydrateCatalogFromCache();
    await loadCatalogSmart(supabaseClient, hadCache);
    populateNbMasterSelect();
    renderDashboard();
  })();
  Promise.allSettled([bookingsReady, catalogReady]).then(hideBootView);
  refreshCommentsBadge();
  updateClock();
  if (tickTimer) clearInterval(tickTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (moodTimer) clearInterval(moodTimer);
  // Countdownlarni jonli tutish uchun har 30 sekundda qayta chizamiz (yangi so'rovsiz)
  tickTimer = setInterval(renderBookings, 30000);
  clockTimer = setInterval(updateClock, 1000);
  // Pastdagi kayfiyat xabarini har 4 daqiqada birma-bir yangilab turamiz
  moodTimer = setInterval(updateMoodBanner, 4 * 60 * 1000);
  subscribeRealtime();
  requestWakeLock();
  initAdminPushToggle();
}

// ---------------------------------------------------------------------------
// PUSH XABARNOMALAR (admin): yangi bron tushganda, sayt yopiq bo'lsa ham,
// tizim bildirishnomasi sifatida keladi. Holat qo'ng'iroq belgisi (bell)
// tugmasida ko'rsatiladi — yoqilgan bo'lsa oltin fon bilan ajralib turadi.
// ---------------------------------------------------------------------------
let adminPushWired = false;

function setAdminPushBtnUi(btn, on) {
  btn.classList.toggle('is-on', on);
  btn.title = on
    ? "Push xabarnomalar yoqilgan (o'chirish uchun bosing)"
    : 'Push xabarnomalar (yangi bron kelganda)';
}

async function refreshAdminPushBtn() {
  const btn = document.getElementById('adminPushToggleBtn');
  if (!btn) return;
  if (!isPushSupported()) {
    btn.classList.add('is-hidden');
    return;
  }
  const subscribed = await isPushSubscribed();
  setAdminPushBtnUi(btn, subscribed);
}

function initAdminPushToggle() {
  const btn = document.getElementById('adminPushToggleBtn');
  if (!btn || adminPushWired) return;
  adminPushWired = true;

  if (!isPushSupported()) {
    btn.classList.add('is-hidden');
    return;
  }

  btn.addEventListener('click', async () => {
    if (Notification.permission === 'denied') {
      toast("Bildirishnomalar brauzer sozlamalarida bloklangan.");
      return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    btn.disabled = true;
    try {
      const subscribed = await isPushSubscribed();
      if (subscribed) {
        await unsubscribeFromPush({ client: supabaseClient });
        toast('Push xabarnomalar o\u2019chirildi.');
      } else {
        await subscribeToPush(userId, { isAdmin: true, client: supabaseClient });
        toast('Push xabarnomalar yoqildi \u2014 yangi bron kelganda xabar olasiz.');
      }
    } catch (err) {
      console.warn('Admin push xatosi:', err);
      toast('Push xabarnomani yoqib bo\u2019lmadi.');
    } finally {
      btn.disabled = false;
      refreshAdminPushBtn();
    }
  });

  refreshAdminPushBtn();
}


// (boshqa qurilma/mijoz tomonidan bo'lsa ham) admin panel avtomatik
// yangilanadi — qo'lda "Yangilash" bosish shart emas.
// MUHIM: Supabase loyihasida bu jadval uchun Realtime yoqilgan bo'lishi kerak
// (Database -> Replication -> "bookings" ni yoqing, yoki SQL Editor'da:
//   alter publication supabase_realtime add table bookings;
// ) aks holda hech qanday hodisa kelmaydi.
// ---------------------------------------------------------------------------
function subscribeRealtime() {
  if (!supabaseClient || realtimeChannel) return;

  realtimeChannel = supabaseClient
    .channel('admin-bookings-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, (payload) => {
      const row = payload.new;
      toast(`Yangi bron: ${row.client_name} — ${row.service_name}`, 'ok');
      playPingSound();
      loadBookings();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, () => {
      loadBookings();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bookings' }, () => {
      loadBookings();
    })
    // Xodim yoki xizmat boshqa joyda (masalan boshqa administrator tomonidan,
    // yoki boshqa oynada) qo'shilsa, tahrirlansa, o'chirilsa yoki
    // faol/nofaol qilinsa — "Tahrirlash" bo'limi va "Yangi bron" oynasidagi
    // barber tanlash ro'yxati DARHOL yangilanadi, sahifani yangilash shart emas.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'masters' }, () => {
      loadStaffList();
      loadCatalog(supabaseClient).then(populateNbMasterSelect);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
      loadServiceList();
      loadCatalog(supabaseClient);
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime] ulanishda xatolik, holat:', status);
      }
    });
}

function unsubscribeRealtime() {
  if (realtimeChannel && supabaseClient) {
    supabaseClient.removeChannel(realtimeChannel);
  }
  realtimeChannel = null;
}

// Yangi bron kelganda eshitiladigan qisqa signal (tashqi fayl kerak emas)
function playPingSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* ovoz ixtiyoriy, xato bo'lsa e'tiborsiz qoldiramiz */ }
}

function updateClock() {
  const now = new Date();
  const weekdays = ['yakshanba','dushanba','seshanba','chorshanba','payshanba','juma','shanba'];
  const months = ['yan','fev','mar','apr','may','iyun','iyul','avg','sen','okt','noy','dek'];
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  liveClock.textContent = `${weekdays[now.getDay()]}, ${now.getDate()}-${months[now.getMonth()]} · ${hh}:${mm}:${ss}`;
}

async function loadBookings() {
  if (!supabaseClient) return;
  bookingsBody.innerHTML = skeletonHtml();
  emptyState.classList.add('hidden');
  refreshBtn.classList.add('spinning');

  const filter = statusFilter.value;
  let query = supabaseClient
    .from('bookings')
    .select('*')
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true })
    .limit(500);

  if (filter !== 'all') query = query.eq('status', filter);

  const { data, error } = await query;
  refreshBtn.classList.remove('spinning');

  if (error) {
    bookingsBody.innerHTML = `<div style="padding:30px; text-align:center; color:var(--red);">Xatolik: ${escapeHtml(error.message)}</div>`;
    return;
  }

  currentBookings = data || [];

  const userIds = [...new Set(currentBookings.map(b => b.user_id).filter(Boolean))];
  profilesMap = {};
  if (userIds.length) {
    const { data: profs } = await supabaseClient
      .from('profiles')
      .select('id, no_show_count, blocked')
      .in('id', userIds);
    (profs || []).forEach(p => { profilesMap[p.id] = p; });
  }

  renderBookings();
  updateMoodBanner();
}

function skeletonHtml() {
  const row = `<div class="skel-row"><div class="skel-bar" style="width:35%"></div><div class="skel-bar" style="width:65%"></div></div>`;
  return row.repeat(4);
}

// booking_date (YYYY-MM-DD) + booking_time (HH:MM) -> Date obyekti
function bookingDateTime(b) {
  const timeStr = (b.booking_time || '00:00').slice(0, 5);
  return new Date(`${b.booking_date}T${timeStr}:00`);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDateLabel(dateStr, now) {
  const d = startOfDay(new Date(dateStr + 'T00:00:00'));
  const today = startOfDay(now);
  const diffDays = Math.round((d - today) / 86400000);
  const weekdays = ['yakshanba','dushanba','seshanba','chorshanba','payshanba','juma','shanba'];
  const months = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  const humanDate = `${d.getDate()}-${months[d.getMonth()]}, ${weekdays[d.getDay()]}`;
  if (diffDays === 0) return `Bugun · ${humanDate}`;
  if (diffDays === 1) return `Ertaga · ${humanDate}`;
  if (diffDays === -1) return `Kecha · ${humanDate}`;
  if (diffDays < 0) return `O'tgan · ${humanDate}`;
  return humanDate;
}

// Necha vaqtdan keyin ekanini inson tiliga o'giradi + shoshilinchlik darajasi
// Vaqti 2 soatdan ortiq o'tib ketgan bronni "tarix"ga tegishli deb hisoblaymiz
// (admin uchun "Bajarilgan" deb belgilash uchun yetarli vaqt qoldirish maqsadida)
const HISTORY_THRESHOLD_MIN = 120;
function isPastBooking(b, now) {
  // "Keldi" (done) yoki "Kelmadi" (no_show) deb belgilangan bronlar —
  // vaqtidan qat'iy nazar darhol tarixga o'tadi (ro'yxatning eng
  // pastiga tushib, keyin Tarix bo'limiga ko'chadi).
  if (b.status === 'done' || b.status === 'no_show') return true;
  return (bookingDateTime(b) - now) < -HISTORY_THRESHOLD_MIN * 60000;
}

// Tarix ro'yxati uchun "necha vaqt oldin bo'lgan" ko'rinishi
function agoLabel(dt, now) {
  const diffMin = Math.round((now - dt) / 60000);
  if (diffMin < 60) return `${diffMin} daqiqa oldin`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} soat oldin`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Kecha';
  if (diffDays < 30) return `${diffDays} kun oldin`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} oy oldin`;
}

function countdownInfo(dt, now) {
  const diffMs = dt - now;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < -15) return { text: "O'tib ketgan", cls: 'cd-past', urgency: 'past' };
  if (diffMin <= 0) return { text: "Hozir", cls: 'cd-urgent', urgency: 'urgent' };
  if (diffMin < 60) return { text: `${diffMin} daqiqadan keyin`, cls: 'cd-urgent', urgency: 'urgent' };

  const sameDay = startOfDay(dt).getTime() === startOfDay(now).getTime();
  if (diffMin < 180 || sameDay) {
    const h = Math.floor(diffMin / 60), m = diffMin % 60;
    return { text: m ? `${h} soat ${m} daqiqadan keyin` : `${h} soatdan keyin`, cls: diffMin < 180 ? 'cd-soon' : 'cd-normal', urgency: diffMin < 180 ? 'soon' : 'normal' };
  }
  const diffDays = Math.round((startOfDay(dt) - startOfDay(now)) / 86400000);
  if (diffDays === 1) return { text: 'Ertaga', cls: 'cd-normal', urgency: 'normal' };
  return { text: `${diffDays} kundan keyin`, cls: 'cd-normal', urgency: 'normal' };
}

// Bron vaqti kelganda (yoki o'tib ketganda) "Keldi" / "Kelmadi" tugmalarini
// ko'rsatadi. "Keldi" bron vaqti yetgan zahoti chiqadi; "Kelmadi" esa faqat
// 10 daqiqadan keyin qo'shimcha chiqadi (mijozga biroz kechikish uchun
// imkoniyat berish). Agar admin biror narsa bosmasa, 1 soatdan keyin server
// tarafda (pg_cron, sql/PATCH_round15_auto_arrival_noshow.sql) avtomatik
// "Kelmadi" deb belgilanadi.
function statusCellHtml(b, dt, now) {
  const stCls = STATUS_CLASS[b.status] || '';
  if (b.status !== 'new' && b.status !== 'confirmed') {
    return `<span class="status-pill status-pill-readonly ${stCls}">${STATUS_LABEL[b.status]}</span>`;
  }

  const diffMin = (now - dt) / 60000;
  if (diffMin < 0) {
    // Bron vaqti hali kelmagan — oddiy holat yorlig'i ko'rsatiladi.
    return `<span class="status-pill status-pill-readonly ${stCls}">${STATUS_LABEL[b.status]}</span>`;
  }

  const showKelmadi = diffMin >= 10;
  return `
    <div class="arrival-btns">
      <button type="button" class="arrival-btn btn-keldi" data-id="${b.id}" title="Mijoz keldi">
        <i class="fa-solid fa-check"></i> Keldi
      </button>
      ${showKelmadi ? `
      <button type="button" class="arrival-btn btn-kelmadi" data-id="${b.id}" title="Mijoz kelmadi">
        <i class="fa-solid fa-xmark"></i> Kelmadi
      </button>` : ''}
    </div>`;
}

function applyTabFilter(list, tab, now) {
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  switch (tab) {
    case 'today':
      return list.filter(b => b.booking_date === todayStr && !isPastBooking(b, now));
    case 'tomorrow':
      return list.filter(b => b.booking_date === tomorrowStr);
    case 'new':
      return list.filter(b => b.status === 'new' && !isPastBooking(b, now));
    case 'upcoming':
      return list.filter(b => {
        const dt = bookingDateTime(b);
        return (dt - now) > -15 * 60000 && b.status !== 'cancelled' && b.status !== 'done';
      });
    case 'tarix':
      return list.filter(b => isPastBooking(b, now));
    case 'all':
      return list.filter(b => !isPastBooking(b, now));
    default:
      return list;
  }
}

function applySearch(list, q) {
  if (!q) return list;
  const needle = q.trim().toLowerCase();
  if (!needle) return list;
  return list.filter(b =>
    (b.client_name || '').toLowerCase().includes(needle) ||
    (b.client_phone || '').toLowerCase().includes(needle) ||
    (b.service_name || '').toLowerCase().includes(needle) ||
    (b.master_name || '').toLowerCase().includes(needle)
  );
}

function updateTabCounts(now) {
  timeTabs.querySelectorAll('.tab').forEach(btn => {
    const tab = btn.dataset.tab;
    const count = applyTabFilter(currentBookings, tab, now).length;
    let countSpan = btn.querySelector('.tab-count');
    if (!countSpan) {
      countSpan = document.createElement('span');
      countSpan.className = 'tab-count';
      btn.appendChild(countSpan);
    }
    countSpan.textContent = `(${count})`;
  });
}

function updateStats(now) {
  const todayStr = now.toISOString().slice(0, 10);
  const todays = currentBookings.filter(b => b.booking_date === todayStr && b.status !== 'cancelled');
  statToday.textContent = todays.length;
  statTodaySub.textContent = todays.length ? `${todays.filter(b => b.status === 'done').length} bajarilgan` : "bron yo'q";

  const upcoming = currentBookings
    .filter(b => b.status !== 'cancelled' && b.status !== 'done')
    .map(b => ({ b, dt: bookingDateTime(b) }))
    .filter(x => x.dt >= new Date(now.getTime() - 15 * 60000))
    .sort((a, c) => a.dt - c.dt);

  if (upcoming.length) {
    const { b, dt } = upcoming[0];
    const info = countdownInfo(dt, now);
    statNext.textContent = b.client_name;
    statNextSub.textContent = `${info.text} · ${b.master_name} · ${b.service_name}`;
  } else {
    statNext.textContent = '—';
    statNextSub.textContent = "Kelayotgan bron yo'q";
  }

  statNew.textContent = currentBookings.filter(b => b.status === 'new').length;

  // Tushum faqat haqiqatan ham bajarilgan (status: done) bronlar bo'yicha
  // hisoblanadi — hali tasdiqlanmagan yoki kelmagan mijozning puli
  // "tushum"ga qo'shilmasligi kerak.
  const revenue = todays
    .filter(b => b.status === 'done')
    .reduce((sum, b) => sum + Number(b.price || 0), 0);
  statRevenue.textContent = money(revenue);
}

// ---------------------------------------------------------------------------
// DASHBOARD: "Bronlar" tabidan oldingi, default ochiladigan bo'lim.
// Hozirgi holatni ko'rsatadi — zalda nechta mijoz bor, qaysi usta hozir
// band (qaysi mijoz bilan, qachon bo'shaydi), qaysi usta bo'sh (shunchaki
// eshikdan kirib kelgan/offline mijozni darrov qabul qilsa bo'ladi) va
// bugun navbatda kim kutmoqda. Faqat mavjud `bookings` va `masters`
// ma'lumotlaridan hisoblanadi — alohida jadval kerak emas.
// ---------------------------------------------------------------------------
function renderDashboard(now = new Date()) {
  if (!dashInShop || !msGrid) return; // Dashboard DOM hali render bo'lmagan bo'lishi mumkin

  const todayStr = now.toISOString().slice(0, 10);
  const todays = currentBookings.filter(b => b.booking_date === todayStr && b.status !== 'cancelled');

  // Ustalar ro'yxati: "Tahrirlash"dan yuklangan allStaffRows (faol) bo'lsa
  // undan, aks holda saytdagi MASTERS (data.js, loadCatalog orqali) fallback.
  const staffSource = allStaffRows.length
    ? allStaffRows.filter(m => m.active).map(m => ({ id: m.id, name: m.name, photo: m.photo_url || '/assets/masters/barber.jpg' }))
    : MASTERS.map(m => ({ id: m.id, name: m.name, photo: (!m.img || /^https?:\/\//.test(m.img)) ? (m.img || '/assets/masters/barber.jpg') : `/${m.img}` }));

  if (!staffSource.length) {
    msGrid.innerHTML = `<p style="color:var(--ink-3); font-size:13px;">Hozircha faol usta yo'q.</p>`;
    dashInShop.textContent = '0';
    dashFreeCount.textContent = '0';
  } else {
    let busyCount = 0;
    msGrid.innerHTML = staffSource.map(m => {
      const activeBooking = todays.find(b => {
        if (String(b.master_id) !== String(m.id)) return false;
        if (b.status !== 'new' && b.status !== 'confirmed') return false;
        const start = bookingDateTime(b);
        const end = new Date(start.getTime() + (Number(b.duration) || 30) * 60000);
        return start <= now && now < end;
      });

      if (activeBooking) {
        busyCount++;
        const end = new Date(bookingDateTime(activeBooking).getTime() + (Number(activeBooking.duration) || 30) * 60000);
        const minsLeft = Math.max(0, Math.round((end - now) / 60000));
        return `
        <div class="ms-card busy">
          <div class="ms-top">
            <img class="ms-avatar" src="${escapeHtml(m.photo)}" alt="" loading="lazy">
            <div><div class="ms-name">${escapeHtml(m.name)}</div><span class="ms-badge">Band</span></div>
          </div>
          <div class="ms-detail"><b>${escapeHtml(activeBooking.client_name)}</b> — ${escapeHtml(activeBooking.service_name)}<br>~${minsLeft} daqiqadan keyin bo'shaydi</div>
        </div>`;
      }

      return `
      <div class="ms-card free">
        <div class="ms-top">
          <img class="ms-avatar" src="${escapeHtml(m.photo)}" alt="" loading="lazy">
          <div><div class="ms-name">${escapeHtml(m.name)}</div><span class="ms-badge">Bo'sh</span></div>
        </div>
        <div class="ms-detail">Hozircha bron yo'q — mijoz qabul qilishga tayyor.</div>
        <button type="button" class="ms-walkin-btn" data-master-id="${escapeHtml(String(m.id))}">
          <i class="fa-solid fa-door-open"></i> Mijoz keldi (offline)
        </button>
      </div>`;
    }).join('');

    dashInShop.textContent = busyCount;
    dashFreeCount.textContent = staffSource.length - busyCount;
  }
  if (msUpdatedAt) msUpdatedAt.textContent = `yangilandi: ${fmtClock(now)}`;

  if (dashTodayTotal) {
    dashTodayTotal.textContent = todays.length;
    dashTodaySub.textContent = todays.length ? `${todays.filter(b => b.status === 'done').length} bajarilgan` : "bron yo'q";
  }

  // Navbatdagi eng yaqin mijoz (statNext bilan bir xil mantiq)
  if (dashNext) {
    const upcoming = currentBookings
      .filter(b => b.status !== 'cancelled' && b.status !== 'done')
      .map(b => ({ b, dt: bookingDateTime(b) }))
      .filter(x => x.dt >= new Date(now.getTime() - 15 * 60000))
      .sort((a, c) => a.dt - c.dt);

    if (upcoming.length) {
      const { b, dt } = upcoming[0];
      const info = countdownInfo(dt, now);
      dashNext.textContent = b.client_name;
      dashNextSub.textContent = `${info.text} · ${b.master_name} · ${b.service_name}`;
    } else {
      dashNext.textContent = '—';
      dashNextSub.textContent = "Kelayotgan bron yo'q";
    }
  }

  // Bugungi navbat: hali tugamagan (davom etayotgan yoki keyinroq
  // boshlanadigan), bajarilmagan/bekor qilinmagan bronlar ro'yxati.
  if (queueList) {
    const queue = todays
      .filter(b => b.status !== 'done')
      .map(b => ({ b, dt: bookingDateTime(b) }))
      .filter(x => {
        const end = new Date(x.dt.getTime() + (Number(x.b.duration) || 30) * 60000);
        return end > now;
      })
      .sort((a, c) => a.dt - c.dt)
      .slice(0, 8);

    if (!queue.length) {
      queueList.innerHTML = '';
      queueList.classList.add('hidden');
      dashEmpty?.classList.remove('hidden');
    } else {
      queueList.classList.remove('hidden');
      dashEmpty?.classList.add('hidden');
      queueList.innerHTML = queue.map(({ b, dt }) => {
        const inProgress = dt <= now;
        return `
        <div class="queue-row">
          <div class="queue-time">${(b.booking_time || '').slice(0, 5)}</div>
          <div class="queue-main">
            <div class="queue-name">${escapeHtml(b.client_name)}</div>
            <div class="queue-meta">${escapeHtml(b.service_name)} · ${escapeHtml(b.master_name)}${inProgress ? ' · hozir xizmatda' : ''}</div>
          </div>
          <span class="countdown ${inProgress ? 'cd-urgent' : 'cd-normal'}">${inProgress ? 'Hozir' : countdownInfo(dt, now).text}</span>
        </div>`;
      }).join('');
    }
    if (queueCount) queueCount.textContent = queue.length ? `${queue.length} ta` : '';
  }
}

// Bo'sh usta kartochkasidagi "Mijoz keldi (offline)" tugmasi — eshikdan
// kirib kelgan (oldindan bron qilmagan) mijoz uchun shu ustani oldindan
// tanlangan holda "Yangi bron" oynasini ochadi (sana = bugun).
msGrid?.addEventListener('click', (e) => {
  const btn = e.target.closest('.ms-walkin-btn');
  if (!btn) return;
  openNewBookingModal(btn.dataset.masterId);
});

// ---------------------------------------------------------------------------
// STATISTIKA
// ---------------------------------------------------------------------------
statsPeriodTabs?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  statsPeriodTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  statsPeriod = btn.dataset.period;
  loadStatsData(statsPeriod);
});

const WEEKDAY_LABELS = ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'];

// Tanlangan davr uchun [start, end) sana oralig'ini (YYYY-MM-DD, end -
// bundan tashqari) qaytaradi. Qolgan admin.js bo'yicha qabul qilingan
// "now.toISOString().slice(0,10)" konvensiyasiga mos qilib hisoblanadi.
function getPeriodRange(period, now = new Date()) {
  if (period === 'week') {
    const day = now.getDay(); // 0=Yak ... 6=Shan
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const monday = new Date(now); monday.setDate(now.getDate() + diffToMonday); monday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
    return { start: monday.toISOString().slice(0, 10), end: nextMonday.toISOString().slice(0, 10), monday };
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: first.toISOString().slice(0, 10), end: nextFirst.toISOString().slice(0, 10) };
  }
  // 'today'
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  return { start: todayStr, end: tomorrow.toISOString().slice(0, 10) };
}

async function loadStatsData(period) {
  if (!supabaseClient || !statsChartWrap) return;
  statsChartWrap.innerHTML = `<div class="skel-row"><div class="skel-bar" style="width:60%"></div></div>`;
  statsMastersList.innerHTML = `<div class="skel-row"><div class="skel-bar" style="width:50%"></div></div>`;
  statsServicesList.innerHTML = `<div class="skel-row"><div class="skel-bar" style="width:50%"></div></div>`;

  const range = getPeriodRange(period);
  const { data, error } = await supabaseClient
    .from('bookings')
    .select('booking_date, booking_time, status, price, master_id, master_name, service_id, service_name')
    .gte('booking_date', range.start)
    .lt('booking_date', range.end);

  if (error) {
    statsChartWrap.innerHTML = `<div class="chart-empty">Xatolik: ${escapeHtml(error.message)}</div>`;
    statsMastersList.innerHTML = '';
    statsServicesList.innerHTML = '';
    return;
  }

  renderStats(period, range, data || []);
}

function rankBy(rows, idField, nameField) {
  const map = new Map();
  rows.forEach(r => {
    const id = r[idField];
    if (!id) return;
    if (!map.has(id)) map.set(id, { name: r[nameField] || '—', count: 0, revenue: 0 });
    const entry = map.get(id);
    entry.count += 1;
    entry.revenue += Number(r.price || 0);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function renderRankList(el, ranked, unit) {
  if (!el) return;
  if (!ranked.length) {
    el.innerHTML = `<div class="rank-empty">Bu davr uchun ma'lumot yo'q.</div>`;
    return;
  }
  const max = ranked[0].count || 1;
  el.innerHTML = ranked.slice(0, 6).map((r, i) => `
    <div class="rank-row">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-main">
        <div class="rank-name">${escapeHtml(r.name)}</div>
        <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${Math.max(4, Math.round(r.count / max * 100))}%"></div></div>
      </div>
      <div class="rank-value">${r.count} ${unit}</div>
    </div>`).join('');
}

// Oddiy, tashqi kutubxonasiz SVG ustunli diagramma (loyihada boshqa chart
// kutubxonasi ulanmagan, shuning uchun brend ranglariga mos, yengil
// o'ziga xos grafik chizamiz).
function buildBarChartSvg(labels, values) {
  const w = Math.max(340, labels.length * 46);
  const h = 170;
  const padBottom = 26, padTop = 14, padSide = 8;
  const max = Math.max(1, ...values);
  const barW = (w - padSide * 2) / labels.length;
  const barGap = Math.min(10, barW * 0.28);

  let bars = '';
  labels.forEach((label, i) => {
    const val = values[i] || 0;
    const barH = max > 0 ? (val / max) * (h - padTop - padBottom) : 0;
    const x = padSide + i * barW + barGap / 2;
    const y = h - padBottom - barH;
    const bw = barW - barGap;
    bars += `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, barH).toFixed(1)}" rx="3"></rect>`;
    if (val > 0) {
      bars += `<text class="chart-value-label" x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" font-size="9.5" text-anchor="middle">${val >= 1000 ? Math.round(val / 1000) + 'k' : val}</text>`;
    }
    bars += `<text class="chart-axis-label" x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle">${escapeHtml(label)}</text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function renderStats(period, range, rows) {
  const doneRows = rows.filter(r => r.status === 'done');
  const noShowRows = rows.filter(r => r.status === 'no_show');
  const demandRows = rows.filter(r => r.status !== 'cancelled'); // "buyurtma qilingan" — bekor qilinmagan barcha bronlar

  const totalRevenue = doneRows.reduce((sum, r) => sum + Number(r.price || 0), 0);
  const totalClients = doneRows.length;
  const avgCheck = totalClients ? Math.round(totalRevenue / totalClients) : 0;
  const noShowDenom = doneRows.length + noShowRows.length;
  const noShowPct = noShowDenom ? Math.round((noShowRows.length / noShowDenom) * 100) : null;

  statsRevenue.textContent = money(totalRevenue);
  statsClients.textContent = totalClients;
  statsClientsSub.textContent = totalClients ? "bajarilgan xizmatlar" : "hali bajarilgan xizmat yo'q";
  statsAvgCheck.textContent = totalClients ? money(avgCheck) : '—';
  statsNoShowPct.textContent = noShowPct === null ? '—' : `${noShowPct}%`;
  statsNoShowSub.textContent = noShowDenom ? `${noShowRows.length} ta / ${noShowDenom} ta bo'lib o'tishi kerak edi` : "ma'lumot yo'q";

  // ---- Tushum grafigi: davrga qarab granularlik farq qiladi ----
  let labels = [], values = [], chartSub = '';
  if (period === 'today') {
    for (let hh = 9; hh <= 19; hh++) labels.push(String(hh).padStart(2, '0'));
    values = labels.map(() => 0);
    doneRows.forEach(r => {
      const hh = parseInt((r.booking_time || '0:0').slice(0, 2), 10);
      const idx = hh - 9;
      if (idx >= 0 && idx < values.length) values[idx] += Number(r.price || 0);
    });
    chartSub = 'soatlar bo\'yicha';
  } else if (period === 'week') {
    labels = WEEKDAY_LABELS.slice();
    values = labels.map(() => 0);
    const monday = range.monday;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const dStr = d.toISOString().slice(0, 10);
      values[i] = doneRows.filter(r => r.booking_date === dStr).reduce((s, r) => s + Number(r.price || 0), 0);
    }
    chartSub = 'kunlar bo\'yicha';
  } else {
    const first = new Date(range.start + 'T00:00:00');
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) labels.push(String(d));
    values = labels.map(() => 0);
    doneRows.forEach(r => {
      const d = parseInt(r.booking_date.slice(8, 10), 10);
      if (d >= 1 && d <= daysInMonth) values[d - 1] += Number(r.price || 0);
    });
    chartSub = 'kunlar bo\'yicha';
  }

  statsChartSub.textContent = chartSub;
  statsChartWrap.innerHTML = totalRevenue > 0 || doneRows.length
    ? buildBarChartSvg(labels, values)
    : `<div class="chart-empty">Bu davr uchun bajarilgan bron yo'q.</div>`;

  renderRankList(statsMastersList, rankBy(doneRows, 'master_id', 'master_name'), 'mijoz');
  renderRankList(statsServicesList, rankBy(demandRows, 'service_id', 'service_name'), 'marta');
}

function renderBookings() {
  const now = new Date();
  renderDashboard(now);

  if (!currentBookings.length) {
    bookingsBody.innerHTML = '';
    emptyState.classList.remove('hidden');
    statToday.textContent = '0'; statTodaySub.textContent = "bron yo'q";
    statNext.textContent = '—'; statNextSub.textContent = "Kelayotgan bron yo'q";
    statNew.textContent = '0'; statRevenue.textContent = money(0);
    updateTabCounts(now);
    return;
  }

  updateStats(now);
  updateTabCounts(now);

  let filtered = applyTabFilter(currentBookings, activeTab, now);
  filtered = applySearch(filtered, searchQuery);
  const isHistory = activeTab === 'tarix';
  filtered = filtered.slice().sort((a, b) => isHistory
    ? bookingDateTime(b) - bookingDateTime(a)
    : bookingDateTime(a) - bookingDateTime(b));

  if (colCountdownLabel) {
    colCountdownLabel.textContent = isHistory ? 'Qancha vaqt oldin' : 'Necha vaqtdan keyin';
  }

  if (filtered.length === 0) {
    bookingsBody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  let html = '';
  let lastDate = null;
  for (const b of filtered) {
    if (b.booking_date !== lastDate) {
      lastDate = b.booking_date;
      const dayCount = filtered.filter(x => x.booking_date === lastDate).length;
      html += `<div class="day-group"><span class="dg-bar"></span><span class="dg-label">${fmtDateLabel(lastDate, now)}</span><span class="dg-count">— ${dayCount} ta</span></div>`;
    }

    const dt = bookingDateTime(b);
    const info = isHistory ? { text: agoLabel(dt, now), cls: 'cd-ago' } : countdownInfo(dt, now);
    let urgencyCls = '';
    if (!isHistory && b.status !== 'cancelled' && b.status !== 'done') {
      if (info.urgency === 'urgent') urgencyCls = 'urgency-urgent';
      else if (info.urgency === 'soon') urgencyCls = 'urgency-soon';
      else if (info.urgency === 'past') urgencyCls = 'urgency-past';
    }
    if (isHistory) urgencyCls = 'history-row';
    const stCls = STATUS_CLASS[b.status] || '';

    html += `
    <div class="booking-row ${urgencyCls}">      <div class="cell-time"><span class="d">${b.booking_date}</span><br>${b.booking_time}</div>
      <div class="cell-countdown"><span class="countdown ${info.cls}">${info.text}</span></div>
      <div class="cell-client">
        <div class="name">${escapeHtml(b.client_name)}${(() => {
          const prof = profilesMap[b.user_id];
          if (!prof) return '';
          if (prof.blocked) return ` <span style="color:var(--red); font-weight:700; font-size:11px;" title="${prof.no_show_count} marta kelmagan">🚫 bloklangan</span>`;
          if (prof.no_show_count > 0) return ` <span style="color:var(--amber); font-weight:700; font-size:11px;">⚠ ${prof.no_show_count}x kelmagan</span>`;
          return '';
        })()}</div>
        <a href="tel:${escapeHtml(b.client_phone)}"><i class="fa-solid fa-phone" style="font-size:10px;"></i>${escapeHtml(b.client_phone)}</a>
      </div>
      <div class="cell-service">
        <div class="svc">${escapeHtml(b.service_name)}</div>
        <div class="who"><i class="fa-solid fa-arrow-right"></i>${escapeHtml(b.master_name)}</div>
      </div>
      <div class="cell-price mono">${money(b.price)}</div>
      <div class="status-wrap">
        ${isHistory ? `
        <button type="button" class="delete-btn" data-id="${b.id}" title="Tarixdan butunlay o'chirish" aria-label="${escapeHtml(b.client_name || 'Bron')}ni tarixdan butunlay o'chirish">
          <i class="fa-solid fa-trash" aria-hidden="true"></i><span class="del-label">O'chirish</span>
        </button>` : statusCellHtml(b, dt, now)}
      </div>
      ${!isHistory ? `
      <button type="button" class="card-delete-fab" data-id="${b.id}" title="Bronni o'chirish" aria-label="${escapeHtml(b.client_name || 'Bron')}ni o'chirish">
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>` : ''}
      ${(!isHistory && b.status === 'confirmed') ? `
      <button type="button" class="card-edit-fab" data-id="${b.id}" title="Bronni tahrirlash" aria-label="${escapeHtml(b.client_name || 'Bron')}ni tahrirlash">
        <i class="fa-solid fa-pen" aria-hidden="true"></i>
      </button>` : ''}
    </div>`;
  }

  bookingsBody.innerHTML = html;

  bookingsBody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget;
      const id = target.dataset.id;

      // Birinchi bosishda tasdiqlash holatiga o'tadi, 3 soniyadan so'ng avtomatik bekor bo'ladi
      if (!target.classList.contains('confirming')) {
        target.classList.add('confirming');
        const label = target.querySelector('.del-label');
        if (label) label.textContent = 'Ishonchingiz komilmi?';
        clearTimeout(target._confirmTimeout);
        target._confirmTimeout = setTimeout(() => {
          target.classList.remove('confirming');
          if (label) label.textContent = "O'chirish";
        }, 3000);
        return;
      }

      // Ikkinchi bosish — butunlay o'chirish
      console.log('[delete-btn] o\'chirish so\'rovi yuborilmoqda, id=' + id);
      clearTimeout(target._confirmTimeout);
      target.disabled = true;
      const { data: deletedRows, error } = await supabaseClient.from('bookings').delete().eq('id', id).select();
      target.disabled = false;

      if (error) {
        toast('Xatolik: ' + error.message, 'err');
        target.classList.remove('confirming');
        const label = target.querySelector('.del-label');
        if (label) label.textContent = "O'chirish";
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        toast("O'chirilmadi — Supabase'da DELETE ruxsatnomasi (RLS policy) yo'q yoki mos kelmayapti", 'err');
        target.classList.remove('confirming');
        const label = target.querySelector('.del-label');
        if (label) label.textContent = "O'chirish";
        return;
      }

      toast("Bron tarixdan butunlay o'chirildi", 'ok');
      loadBookings();
    });
  });

  // "Keldi" tugmasi: mijoz keldi -> bron "Bajarilgan" (done) deb belgilanadi,
  // shu zahoti faol ro'yxatdan chiqib Tarix bo'limiga tushadi.
  bookingsBody.querySelectorAll('.btn-keldi').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      const otherBtn = btn.parentElement?.querySelector('.btn-kelmadi');
      if (otherBtn) otherBtn.disabled = true;
      const { error } = await supabaseClient.from('bookings').update({ status: 'done' }).eq('id', id);
      if (error) {
        toast('Xatolik: ' + error.message, 'err');
        btn.disabled = false;
        if (otherBtn) otherBtn.disabled = false;
        return;
      }
      toast('Mijoz kelgani belgilandi ✅', 'ok');
      loadBookings();
    });
  });

  // "Kelmadi" tugmasi: bron "no_show" deb belgilanadi. sql/auth_and_noshow.sql
  // ichidagi handle_no_show() trigger'i avtomatik shu mijozning
  // no_show_count'ini +1 qiladi va 3 taga yetganda bloklaydi.
  bookingsBody.querySelectorAll('.btn-kelmadi').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      const otherBtn = btn.parentElement?.querySelector('.btn-keldi');
      if (otherBtn) otherBtn.disabled = true;
      const { error } = await supabaseClient.from('bookings').update({ status: 'no_show' }).eq('id', id);
      if (error) {
        toast('Xatolik: ' + error.message, 'err');
        btn.disabled = false;
        if (otherBtn) otherBtn.disabled = false;
        return;
      }
      toast('Mijoz kelmagani qayd etildi', 'err');
      loadBookings();
    });
  });

  // Oddiy (tarix bo'lmagan) bron kartochkasi: kartaga bosilganda o'ng-pastki
  // burchakda o'chirish tugmasi (fab) paydo bo'ladi. Status select yoki
  // telefon havolasi ustiga bosilganda esa fab ochilmaydi — bu holatlar
  // o'z vazifasini bajarishda davom etadi.
  bookingsBody.querySelectorAll('.booking-row').forEach(row => {
    if (!row.querySelector('.card-delete-fab')) return;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.card-delete-fab, .card-edit-fab, .status-pill, .arrival-btn, select, a')) return;
      const wasOpen = row.classList.contains('show-fab');
      bookingsBody.querySelectorAll('.booking-row.show-fab').forEach(r => {
        if (r !== row) r.classList.remove('show-fab');
      });
      row.classList.toggle('show-fab', !wasOpen);
    });
  });

  bookingsBody.querySelectorAll('.card-edit-fab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      const booking = currentBookings.find(x => String(x.id) === String(id));
      if (booking) openEditBookingModal(booking);
    });
  });

  bookingsBody.querySelectorAll('.card-delete-fab').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const target = e.currentTarget;
      const id = target.dataset.id;

      // Birinchi bosishda tasdiqlash holatiga o'tadi, 3 soniyadan so'ng avtomatik bekor bo'ladi
      if (!target.classList.contains('confirming')) {
        target.classList.add('confirming');
        target.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        target.title = "Ishonchingiz komilmi?";
        target.setAttribute('aria-label', "Ishonchingiz komilmi? Tasdiqlash uchun yana bir marta bosing");
        clearTimeout(target._confirmTimeout);
        target._confirmTimeout = setTimeout(() => {
          target.classList.remove('confirming');
          target.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
          target.title = "Bronni o'chirish";
          target.setAttribute('aria-label', "Bronni o'chirish");
        }, 3000);
        return;
      }

      // Ikkinchi bosish — butunlay o'chirish
      console.log('[card-delete-fab] o\'chirish so\'rovi yuborilmoqda, id=' + id);
      clearTimeout(target._confirmTimeout);
      target.disabled = true;
      // .select() qo'shilgan — nechta qator haqiqatan o'chganini bilish
      // uchun (RLS policy mos kelmasa, "xatosiz" 0 qator o'chishi mumkin).
      const { data: deletedRows, error } = await supabaseClient.from('bookings').delete().eq('id', id).select();
      target.disabled = false;

      if (error) {
        toast('Xatolik: ' + error.message, 'err');
        target.classList.remove('confirming');
        target.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
        target.title = "Bronni o'chirish";
        target.setAttribute('aria-label', "Bronni o'chirish");
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        toast("O'chirilmadi — Supabase'da DELETE ruxsatnomasi (RLS policy) yo'q yoki mos kelmayapti", 'err');
        target.classList.remove('confirming');
        target.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
        target.title = "Bronni o'chirish";
        target.setAttribute('aria-label', "Bronni o'chirish");
        return;
      }

      toast('Bron butunlay o\'chirildi', 'ok');
      loadBookings();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Bandlik / dam olish (master_time_off) — sql/PATCH_round7_master_time_off.sql
// Admin bir ustaning kunini (yoki soat oralig'ini) "band" deb belgilaydi —
// sayt (js/booking.js) shu vaqtni mijozga umuman ko'rsatmaydi, server
// tomonda ham trigger orqali qat'iy taqiqlanadi. Endi bu bo'lim alohida
// "Bandlik" oynasida emas, balki xodimni tahrirlash oynasi ichida, aynan
// o'sha xodimga tegishli holda ko'rsatiladi (openStaffModal() ichida).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// "Bronlar" / "Tahrirlash" almashtirgichi
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// URL marshrutlash — har bir bo'lim (tab) o'zining manzili bilan ochiladi
// (masalan /admin/bookings/), shunda sahifa yangilanganda (F5 / refresh)
// foydalanuvchi o'sha bo'limda qolaveradi. Manzillar inglizcha, chunki
// URL'lar odatda lotincha/inglizcha bo'lishi kutiladi.
// ---------------------------------------------------------------------------
const VIEW_SLUGS = { dash: 'today', bookings: 'bookings', stats: 'stats', staff: 'staff', blocked: 'blocked', comments: 'reviews' };
const SLUG_VIEWS = Object.fromEntries(Object.entries(VIEW_SLUGS).map(([view, slug]) => [slug, view]));
const VIEW_TITLES = { dash: 'Bugun', bookings: 'Bronlar', stats: 'Statistika', staff: 'Tahrirlash', blocked: 'Bloklanganlar', comments: 'Sharhlar' };

// Admin panel qaysi bazaviy yo'lda joylashgan bo'lsa ham (masalan "/admin/"
// yoki lokal ishlab chiqishda boshqa prefiks bilan) to'g'ri ishlashi uchun,
// joriy manzildagi "/admin/" segmentidan foydalanamiz.
function getAdminBasePath() {
  const path = window.location.pathname;
  const marker = '/admin/';
  const idx = path.indexOf(marker);
  if (idx !== -1) return path.slice(0, idx + marker.length);
  return '/admin/';
}

function slugFromLocation() {
  const base = getAdminBasePath();
  const path = window.location.pathname;
  let rest = path.startsWith(base) ? path.slice(base.length) : '';
  rest = rest.replace(/index\.html$/, '').replace(/^\/+|\/+$/g, '');
  return rest;
}

// Bo'limlarni ko'rsatish/yashirish va tegishli ma'lumotni yuklash — bitta
// joyda, shunda tugma bosilganda ham, sahifa ochilganda/yangilanganda ham,
// brauzerning orqaga/oldinga tugmalari bosilganda ham bir xil ishlaydi.
function activateView(view, { pushUrl = true } = {}) {
  if (!VIEW_SLUGS[view]) view = 'dash';

  viewSwitch?.querySelectorAll('.view-switch-btn').forEach(b => {
    const isActive = b.dataset.view === view;
    b.classList.toggle('active', isActive);
    if (isActive) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  viewDash?.classList.toggle('hidden', view !== 'dash');
  viewBookings?.classList.toggle('hidden', view !== 'bookings');
  viewStats?.classList.toggle('hidden', view !== 'stats');
  viewStaff?.classList.toggle('hidden', view !== 'staff');
  viewBlocked?.classList.toggle('hidden', view !== 'blocked');
  viewComments?.classList.toggle('hidden', view !== 'comments');
  // Qo'shimcha xavfsizlik: CSS keshi eskirgan/mos kelmagan holatda ham
  // bo'limlar bir-birining ustiga chiqib ketmasligi uchun to'g'ridan-to'g'ri
  // inline style bilan ham majburlaymiz.
  if (viewDash) viewDash.style.display = view === 'dash' ? '' : 'none';
  if (viewBookings) viewBookings.style.display = view === 'bookings' ? '' : 'none';
  if (viewStats) viewStats.style.display = view === 'stats' ? '' : 'none';
  if (viewStaff) viewStaff.style.display = view === 'staff' ? '' : 'none';
  if (viewBlocked) viewBlocked.style.display = view === 'blocked' ? '' : 'none';
  if (viewComments) viewComments.style.display = view === 'comments' ? '' : 'none';

  if (view === 'staff') {
    loadStaffAndServices();
  }
  if (view === 'blocked') {
    loadBlockedUsers();
  }
  if (view === 'comments') {
    loadComments();
  }
  if (view === 'stats') {
    // Statistika bo'limi: sana oralig'ini belgilab, ma'lumot yuklash va tahlilni boshlash
    renderStatsPanel(currentStatsRange);
  }
  if (view === 'dash') {
    // Bugungi ustalar holati va navbat — darhol yangilab ko'rsatamiz
    // (currentBookings allaqachon fon rejimida yuklangan bo'ladi).
    renderDashboard();
  }

  const slug = VIEW_SLUGS[view];
  const url = getAdminBasePath() + slug + '/';
  document.title = `${VIEW_TITLES[view]} — Admin · BILOL BARBER`;
  if (pushUrl) {
    if (window.location.pathname !== url) history.pushState({ view }, '', url);
  } else {
    if (window.location.pathname !== url) history.replaceState({ view }, '', url);
  }
}

// Sahifa birinchi ochilganda (yoki refresh qilinganda) joriy URL'dagi
// bo'limni ochadi; noma'lum/bo'sh manzil bo'lsa "Bugun"ga tushadi.
function activateViewFromLocation() {
  const slug = slugFromLocation();
  const view = SLUG_VIEWS[slug] || 'dash';
  activateView(view, { pushUrl: false });
}

viewSwitch?.addEventListener('click', (e) => {
  const btn = e.target.closest('.view-switch-btn');
  if (!btn) return;
  activateView(btn.dataset.view);
});

// "Boshqa bo'limlar" — har kuni ishlatilmaydigan bo'limlar (Tahrirlash,
// Bloklanganlar, Sharhlar) pastki tab-bardan olib tashlanib, shu kichik
// modalga ko'chirildi. Header'dagi "..." tugmasi ochadi.
function openMoreMenu() { moreMenuModal?.classList.remove('hidden'); }
function closeMoreMenu() { moreMenuModal?.classList.add('hidden'); }

moreMenuBtn?.addEventListener('click', openMoreMenu);
moreMenuCloseBtn?.addEventListener('click', closeMoreMenu);
moreMenuModal?.addEventListener('click', (e) => { if (e.target === moreMenuModal) closeMoreMenu(); });
moreMenuModal?.addEventListener('click', (e) => {
  const item = e.target.closest('.more-menu-item');
  if (!item) return;
  activateView(item.dataset.view);
  closeMoreMenu();
});

// Brauzerning orqaga/oldinga tugmalari bosilganda ham to'g'ri bo'limni ochamiz
window.addEventListener('popstate', () => {
  activateViewFromLocation();
});

// Lotin/kirill harflarni ID (slug) ga aylantiradi — yangi xodim/xizmat
// qo'shilganda masters.id / services.id (text primary key) uchun ishlatiladi.
function slugify(str) {
  const map = { 'ў':'u', 'қ':'q', 'ғ':'g', 'ҳ':'h', 'ш':'sh', 'ч':'ch' };
  const replaced = str.toString().toLowerCase().split('').map(ch => map[ch] || ch).join('');
  return replaced
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'item';
}

async function loadStaffAndServices() {
  await Promise.all([loadStaffList(), loadServiceList()]);
}

// ---------------------------------------------------------------------------
// BLOKLANGANLAR — 3+ marta "Kelmadi" bo'lgani uchun avtomatik bloklangan
// mijozlar (sql/auth_and_noshow.sql'dagi handle_no_show() trigger'i orqali
// profiles.blocked=true qilinadi). Bu yerda faqat ro'yxat va "Blokdan
// chiqarish" (blocked=false, no_show_count=0) imkoniyati beriladi.
// ---------------------------------------------------------------------------
let allBlockedRows = [];

async function loadBlockedUsers() {
  const blockedList = document.getElementById('blockedList');
  const blockedEmpty = document.getElementById('blockedEmpty');
  const blockedCount = document.getElementById('blockedCount');
  if (!supabaseClient || !blockedList) return;

  blockedList.innerHTML = skeletonHtml();
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name, phone, no_show_count, blocked')
    .eq('blocked', true)
    .order('no_show_count', { ascending: false });

  if (error) {
    blockedList.innerHTML = `<div style="padding:30px; text-align:center; color:var(--red);">Xatolik: ${escapeHtml(error.message)}</div>`;
    return;
  }

  allBlockedRows = data || [];
  if (blockedCount) blockedCount.textContent = allBlockedRows.length ? `${allBlockedRows.length} ta` : '';
  renderBlockedList();
}

function renderBlockedList() {
  const blockedList = document.getElementById('blockedList');
  const blockedEmpty = document.getElementById('blockedEmpty');
  if (!blockedList) return;

  if (!allBlockedRows.length) {
    blockedList.innerHTML = '';
    blockedEmpty?.classList.remove('hidden');
    return;
  }
  blockedEmpty?.classList.add('hidden');

  blockedList.innerHTML = allBlockedRows.map(p => `
    <div class="staff-card" data-id="${escapeHtml(String(p.id))}">
      <div class="staff-card-name">${escapeHtml(p.full_name || 'Ism kiritilmagan')}</div>
      <div class="staff-card-desc"><i class="fa-solid fa-phone" style="font-size:10px;"></i> ${escapeHtml(p.phone || '—')}</div>
      <span class="badge" style="background:var(--red); color:#fff;">${p.no_show_count}x kelmagan</span>
      <div class="staff-card-actions">
        <button type="button" class="icon-btn" data-action="unblock" title="Blokdan chiqarish" aria-label="${escapeHtml(p.full_name || 'Mijoz')}ni blokdan chiqarish">
          <i class="fa-solid fa-unlock" aria-hidden="true"></i> <span style="font-size:12px; margin-left:4px;">Blokdan chiqarish</span>
        </button>
      </div>
    </div>
  `).join('');
}

document.getElementById('blockedList')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="unblock"]');
  if (!btn) return;
  const card = e.target.closest('.staff-card');
  const row = allBlockedRows.find(p => String(p.id) === card?.dataset.id);
  if (!row) return;

  btn.disabled = true;
  const { error } = await supabaseClient
    .from('profiles')
    .update({ blocked: false, no_show_count: 0 })
    .eq('id', row.id);
  btn.disabled = false;

  if (error) {
    toast('Xatolik: ' + error.message, 'err');
    return;
  }
  toast(`${row.full_name || 'Mijoz'} blokdan chiqarildi`, 'ok');
  loadBlockedUsers();
});

// ---------------------------------------------------------------------------
// SHARHLAR (comments) — saytdagi "Sharhlar" bo'limiga mijozlar (login qilib,
// o'z qurilmasidan) yozgan sharhlarni moderatsiya qilish. Ism va
// "doimiy/yangi mijoz" belgisi bu yerda TAHRIRLANMAYDI — ular
// sql/PATCH_round14_comments.sql'dagi trigger orqali serverda avtomatik
// belgilangan. Admin faqat: tasdiqlaydi (ommaviy sahifada chiqadi), rad
// etadi (yashirilgan holda qoladi) yoki butunlay o'chiradi.
// ---------------------------------------------------------------------------
let allCommentsRows = [];
let activeCommentsTab = 'pending';

async function loadComments() {
  const list = document.getElementById('commentsList');
  const empty = document.getElementById('commentsEmpty');
  const countEl = document.getElementById('commentsCount');
  if (!supabaseClient || !list) return;

  list.innerHTML = skeletonHtml();
  empty?.classList.add('hidden');

  let query = supabaseClient
    .from('comments')
    .select('id, client_name, rating, comment_text, customer_type, status, created_at')
    .order('created_at', { ascending: false });

  if (activeCommentsTab !== 'all') {
    query = query.eq('status', activeCommentsTab);
  }

  const { data, error } = await query;

  if (error) {
    list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--red);">Xatolik: ${escapeHtml(error.message)}</div>`;
    return;
  }

  allCommentsRows = data || [];
  if (countEl) countEl.textContent = allCommentsRows.length ? `${allCommentsRows.length} ta` : '';
  renderCommentsList();
  refreshCommentsBadge();
}

function commentStarsHtml(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<i class="fa-solid fa-star"${i <= rating ? '' : ' style="opacity:.25"'}></i>`;
  }
  return html;
}

function commentDateFmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderCommentsList() {
  const list = document.getElementById('commentsList');
  const empty = document.getElementById('commentsEmpty');
  if (!list) return;

  if (!allCommentsRows.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  list.innerHTML = allCommentsRows.map((c) => {
    const statusBadge = c.status === 'approved'
      ? `<span class="badge badge-active">Tasdiqlangan</span>`
      : c.status === 'rejected'
        ? `<span class="badge badge-rejected">Rad etilgan</span>`
        : `<span class="badge badge-pending">Kutilmoqda</span>`;
    const typeBadge = c.customer_type === 'doimiy'
      ? `<span class="badge" style="background:var(--brass-soft); color:var(--brass-deep);">Doimiy mijoz</span>`
      : `<span class="badge" style="background:var(--ink-4); color:var(--ink-2);">Yangi mijoz</span>`;

    return `
    <div class="comment-card" data-id="${escapeHtml(String(c.id))}">
      <div class="comment-card-top">
        <div class="comment-card-who">
          <span class="comment-card-name">${escapeHtml(c.client_name || 'Mijoz')}</span>
          <span class="comment-card-stars">${commentStarsHtml(c.rating)}</span>
          ${typeBadge}
          ${statusBadge}
        </div>
        <span class="comment-card-date">${commentDateFmt(c.created_at)}</span>
      </div>
      <p class="comment-card-text">"${escapeHtml(c.comment_text)}"</p>
      <div class="comment-card-actions">
        ${c.status !== 'approved' ? `<button type="button" class="comment-pill-btn approve" data-action="approve"><i class="fa-solid fa-check"></i> Tasdiqlash</button>` : ''}
        ${c.status !== 'rejected' ? `<button type="button" class="comment-pill-btn reject" data-action="reject"><i class="fa-solid fa-xmark"></i> Rad etish</button>` : ''}
        <button type="button" class="comment-pill-btn delete" data-action="delete"><i class="fa-solid fa-trash"></i> O'chirish</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('commentsTabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.getElementById('commentsTabs').querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  activeCommentsTab = btn.dataset.ctab;
  loadComments();
});

document.getElementById('commentsList')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const card = e.target.closest('.comment-card');
  const row = allCommentsRows.find((c) => String(c.id) === card?.dataset.id);
  if (!row) return;
  const action = btn.dataset.action;

  if (action === 'delete' && !btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.innerHTML = `<i class="fa-solid fa-trash"></i> Tasdiqlaysizmi?`;
    setTimeout(() => {
      btn.classList.remove('confirming');
      btn.innerHTML = `<i class="fa-solid fa-trash"></i> O'chirish`;
    }, 3000);
    return;
  }

  btn.disabled = true;
  let error;
  if (action === 'approve') {
    ({ error } = await supabaseClient.from('comments').update({ status: 'approved' }).eq('id', row.id));
  } else if (action === 'reject') {
    ({ error } = await supabaseClient.from('comments').update({ status: 'rejected' }).eq('id', row.id));
  } else if (action === 'delete') {
    ({ error } = await supabaseClient.from('comments').delete().eq('id', row.id));
  }
  btn.disabled = false;

  if (error) {
    toast('Xatolik: ' + error.message, 'err');
    return;
  }

  const msg = action === 'approve' ? 'Sharh tasdiqlandi va saytda chiqdi'
    : action === 'reject' ? 'Sharh rad etildi'
    : 'Sharh o\'chirildi';
  toast(msg, 'ok');
  loadComments();
});

// Nav tugmasidagi qizil raqamli belgi — nechta sharh moderatsiya kutayotganini
// ko'rsatadi (admin "Sharhlar" bo'limini ochmasdan ham darhol bilishi uchun).
async function refreshCommentsBadge() {
  const badges = document.querySelectorAll('.comments-pending-badge');
  if (!badges.length || !supabaseClient) return;
  const { count, error } = await supabaseClient
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return;
  const dot = document.getElementById('moreMenuDot');
  badges.forEach(badge => {
    if (count > 0) {
      badge.textContent = String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
  if (count > 0) dot?.classList.remove('hidden');
  else dot?.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// XODIMLAR (masters) — ro'yxat, qo'shish, tahrirlash, faol/nofaol qilish
// ---------------------------------------------------------------------------
async function loadStaffList() {
  if (!supabaseClient || !staffGrid) return;
  const { data, error } = await supabaseClient.from('masters').select('*').order('name', { ascending: true });
  if (error) { toast('Xodimlarni yuklashda xatolik: ' + error.message, 'err'); return; }
  allStaffRows = data || [];
  renderStaffGrid();
}

function renderStaffGrid() {
  if (!staffGrid) return;
  if (!allStaffRows.length) {
    staffGrid.innerHTML = `<p style="color:var(--ink-3); font-size:13px;">Hozircha xodimlar yo'q.</p>`;
    return;
  }
  staffGrid.innerHTML = allStaffRows.map(m => `
    <div class="staff-card${m.active ? '' : ' inactive'}" data-id="${escapeHtml(String(m.id))}">
      <img class="staff-card-img" src="${m.photo_url ? escapeHtml(m.photo_url) : '/assets/masters/barber.jpg'}" alt="" loading="lazy">
      <div class="staff-card-name">${escapeHtml(m.name)}</div>
      <div class="staff-card-desc">${escapeHtml(m.description || '')}</div>
      <span class="badge ${m.active ? 'badge-active' : 'badge-inactive'}">${m.active ? 'Faol' : 'Nofaol'}</span>
      <div class="staff-card-actions">
        <button type="button" class="icon-btn" data-action="edit-staff" title="Tahrirlash" aria-label="${escapeHtml(m.name)}ni tahrirlash"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" data-action="toggle-staff" title="${m.active ? 'Nofaol qilish' : 'Faollashtirish'}" aria-label="${escapeHtml(m.name)}ni ${m.active ? 'nofaol qilish' : 'faollashtirish'}"><i class="fa-solid ${m.active ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete-staff" title="Butunlay o'chirish" aria-label="${escapeHtml(m.name)}ni butunlay o'chirish"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </div>
    </div>
  `).join('');
}

staffGrid?.addEventListener('click', (e) => {
  const card = e.target.closest('.staff-card');
  if (!card) return;
  const row = allStaffRows.find(m => String(m.id) === card.dataset.id);
  if (!row) return;
  if (e.target.closest('[data-action="edit-staff"]')) openStaffModal(row);
  if (e.target.closest('[data-action="toggle-staff"]')) toggleStaffActive(row);
  const delBtn = e.target.closest('[data-action="delete-staff"]');
  if (delBtn) deleteStaff(row, delBtn);
});

// Xodimni butunlay o'chirish. Ikki bosqichli tasdiqlash (bron o'chirishdagi
// kabi): 1-bosish "Ishonchingizmi?" holatiga o'tkazadi, 2-bosish o'chiradi.
// Agar shu xodimga bog'liq bronlar bo'lsa (foreign key), Supabase xatolik
// qaytaradi — bunday holda xodimni butunlay o'chirish o'rniga "Nofaol"
// qilishni tavsiya qilamiz (u holda saytda ko'rinmaydi, lekin tarix saqlanadi).
async function deleteStaff(row, btn) {
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.title = "Ishonchingiz komilmi? Yana bosing";
    clearTimeout(btn._confirmTimeout);
    btn._confirmTimeout = setTimeout(() => {
      btn.classList.remove('confirming');
      btn.title = "Butunlay o'chirish";
    }, 3000);
    return;
  }

  clearTimeout(btn._confirmTimeout);
  btn.disabled = true;
  const { error } = await supabaseClient.from('masters').delete().eq('id', row.id);
  btn.disabled = false;

  if (!error && row.photo_url) {
    await deleteStaffPhotoFile(row.photo_url);
  }

  if (error) {
    if (error.code === '23503') {
      toast("Bu xodimga tegishli bronlar mavjud, shuning uchun butunlay o'chirib bo'lmaydi. Uni \"Nofaol\" qiling — saytda ko'rinmay qoladi.", 'err');
    } else {
      toast('Xatolik: ' + error.message, 'err');
    }
    btn.classList.remove('confirming');
    btn.title = "Butunlay o'chirish";
    return;
  }

  toast("Xodim butunlay o'chirildi.");
  await loadStaffList();
  await loadCatalog(supabaseClient);
}

async function toggleStaffActive(row) {
  const { error } = await supabaseClient.from('masters').update({ active: !row.active }).eq('id', row.id);
  if (error) { toast('Xatolik: ' + error.message, 'err'); return; }
  toast(row.active ? "Xodim nofaol qilindi (saytda ko'rinmaydi)." : "Xodim faollashtirildi.");
  await loadStaffList();
  await loadCatalog(supabaseClient);
}

function openStaffModal(row = null) {
  stEditingId = row ? row.id : null;
  stPhotoFile = null;
  document.getElementById('staffModalTitle').textContent = row ? "Xodimni tahrirlash" : "Yangi xodim";
  stName.value = row?.name || '';
  stDesc.value = row?.description || '';
  stActive.checked = row ? !!row.active : true;
  stPhoto.value = '';
  stError.classList.add('hidden');
  if (row?.photo_url) {
    stPhotoPreview.src = row.photo_url;
    stPhotoPreviewWrap.classList.remove('hidden');
    stPhotoEmpty.classList.add('hidden');
  } else {
    stPhotoPreview.removeAttribute('src');
    stPhotoPreviewWrap.classList.add('hidden');
    stPhotoEmpty.classList.remove('hidden');
  }

  // Bandlik bo'limi faqat mavjud (allaqachon saqlangan) xodimni tahrirlashda
  // ko'rinadi — yangi, hali saqlanmagan xodimga bandlik biriktirib bo'lmaydi.
  if (row && stTimeOffSection) {
    stTimeOffSection.classList.remove('hidden');
    stToError?.classList.add('hidden');
    if (stToDate) stToDate.value = new Date().toISOString().slice(0, 10);
    if (stToFullDay) stToFullDay.checked = true;
    stToRangeFields?.classList.add('hidden');
    if (stToReason) stToReason.value = '';
    loadStaffTimeOffList(row.id);
  } else if (stTimeOffSection) {
    stTimeOffSection.classList.add('hidden');
  }

  staffModal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeStaffModal() {
  staffModal?.classList.add('hidden');
  document.body.style.overflow = '';
}

addStaffBtn?.addEventListener('click', () => openStaffModal(null));
staffCloseBtn?.addEventListener('click', closeStaffModal);
staffModal?.addEventListener('click', (e) => { if (e.target === staffModal) closeStaffModal(); });

// Rasm ko'p joy egallamasligi uchun: yuklashdan oldin brauzerning o'zida
// max 800px'gacha kichraytirib, JPEG (sifat 0.82) qilib siqamiz. Saytda bu
// rasm har doim kichik (56px yoki kartochka) ko'rinishda chiqadi, shuning
// uchun original (ko'pincha bir necha MB) hajmni saqlashning hojati yo'q —
// bu har bir tashrifchida qayta-qayta yuklanadigan trafikka bevosita ta'sir
// qiladi.
function resizeImageFile(file, maxDim = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Rasmni siqib bo'lmadi"))),
          'image/jpeg',
          quality,
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasmni o'qib bo'lmadi"));
    };
    img.src = url;
  });
}

// Xodim rasmi uchun umumiy ishlov beruvchi — fayl input, drag&drop yoki
// Ctrl+V orqali tanlangan/tashlangan/joylashtirilgan har qanday rasm shu
// funksiya orqali oldindan ko'rishga chiqariladi va saqlash uchun tayyorlanadi.
function setStaffPhotoFile(f) {
  if (!f || !f.type?.startsWith('image/')) return;
  stPhotoFile = f;
  const reader = new FileReader();
  reader.onload = () => {
    stPhotoPreview.src = reader.result;
    stPhotoPreviewWrap.classList.remove('hidden');
    stPhotoEmpty.classList.add('hidden');
  };
  reader.readAsDataURL(f);
}

stPhoto?.addEventListener('change', () => {
  const f = stPhoto.files?.[0];
  if (f) setStaffPhotoFile(f);
});

// Bosish orqali fayl tanlash (dropzone o'zi visual ko'rinish, real input yashirin)
stPhotoDropzone?.addEventListener('click', (e) => {
  if (e.target.closest('#stPhotoRemoveBtn')) return;
  stPhoto.click();
});
stPhotoDropzone?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stPhoto.click(); }
});

// Sudrab tashlash (drag & drop)
['dragenter', 'dragover'].forEach(evt => {
  stPhotoDropzone?.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    stPhotoDropzone.classList.add('is-dragover');
  });
});
['dragleave', 'dragend'].forEach(evt => {
  stPhotoDropzone?.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    stPhotoDropzone.classList.remove('is-dragover');
  });
});
stPhotoDropzone?.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  stPhotoDropzone.classList.remove('is-dragover');
  const f = e.dataTransfer?.files?.[0];
  if (f) setStaffPhotoFile(f);
});

// Ctrl+V bilan joylashtirish — modal ochiq bo'lganda ishlaydi
document.addEventListener('paste', (e) => {
  if (staffModal?.classList.contains('hidden')) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type?.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) { setStaffPhotoFile(f); e.preventDefault(); }
      break;
    }
  }
});

// Rasmni olib tashlash
stPhotoRemoveBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  stPhotoFile = null;
  stPhoto.value = '';
  stPhotoPreview.removeAttribute('src');
  stPhotoPreviewWrap.classList.add('hidden');
  stPhotoEmpty.classList.remove('hidden');
});

function staffPhotoPathFromUrl(url) {
  if (!url) return null;
  const marker = '/staff-photos/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function deleteStaffPhotoFile(url) {
  const path = staffPhotoPathFromUrl(url);
  if (!path) return;
  try {
    await supabaseClient.storage.from('staff-photos').remove([path]);
  } catch (err) {
    // Muhim emas — asosiy amal (saqlash/o'chirish) allaqachon muvaffaqiyatli
    // bo'lgan, faqat eski fayl Storage'da qolib ketishi mumkin.
    console.warn('Eski xodim rasmini o\'chirishda xatolik:', err);
  }
}

staffForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  stError.classList.add('hidden');
  const name = stName.value.trim();
  if (!name) {
    stError.textContent = "Ismni kiriting.";
    stError.classList.remove('hidden');
    return;
  }

  stSubmitBtn.disabled = true;
  const originalLabel = stSubmitBtn.textContent;
  stSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  try {
    const description = stDesc.value.trim() || null;
    // Ism — atoqli ot, shuning uchun API emas, faqat harf almashtirish
    // (lotin -> kirill) orqali o'giriladi (translit.js). Tavsif esa haqiqiy
    // ma'no tarjimasi talab qiladi, shuning uchun /api/translate chaqiriladi.
    const nameRu = uzLatinToCyrillic(name) || null;
    const descriptionRu = description ? await autoTranslateToRu(description) : null;
    // EN: ism o'zbekcha lotin yozuvida qoladi (inglizchada ham shunday
    // o'qiladi, transliteratsiya kerak emas) — faqat tavsif tarjima qilinadi.
    const descriptionEn = description ? await autoTranslateToEn(description) : null;

    let photoUrl = null;
    const oldPhotoUrl = stEditingId ? allStaffRows.find(m => String(m.id) === String(stEditingId))?.photo_url : null;
    if (stPhotoFile) {
      const path = `${stEditingId || slugify(name)}-${Date.now()}.jpg`;
      const compressed = await resizeImageFile(stPhotoFile);
      const { error: upErr } = await supabaseClient.storage.from('staff-photos').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: pub } = supabaseClient.storage.from('staff-photos').getPublicUrl(path);
      photoUrl = pub?.publicUrl || null;
    }

    if (stEditingId) {
      const patch = { name, name_ru: nameRu, description, description_ru: descriptionRu, description_en: descriptionEn, active: stActive.checked };
      if (photoUrl) patch.photo_url = photoUrl;
      const { error } = await supabaseClient.from('masters').update(patch).eq('id', stEditingId);
      if (error) throw error;
      // Yangi rasm muvaffaqiyatli saqlangach, eski rasm faylini Storage'dan
      // o'chiramiz — endi hech qayerda ishlatilmaydi.
      if (photoUrl && oldPhotoUrl && oldPhotoUrl !== photoUrl) {
        await deleteStaffPhotoFile(oldPhotoUrl);
      }
    } else {
      let id = slugify(name);
      if (allStaffRows.some(m => String(m.id) === id)) id = `${id}_${Math.floor(Math.random() * 1000)}`;
      const { error } = await supabaseClient.from('masters').insert({
        id, name, name_ru: nameRu, description, description_ru: descriptionRu, description_en: descriptionEn, active: stActive.checked, photo_url: photoUrl,
      });
      if (error) throw error;
    }

    toast(stEditingId ? "Xodim yangilandi." : "Xodim qo'shildi.");
    closeStaffModal();
    await loadStaffList();
    await loadCatalog(supabaseClient);
  } catch (err) {
    stError.textContent = "Xatolik: " + (err.message || err);
    stError.classList.remove('hidden');
  } finally {
    stSubmitBtn.disabled = false;
    stSubmitBtn.textContent = originalLabel;
  }
});

// ---------------------------------------------------------------------------
// XIZMATLAR (services) — ro'yxat, qo'shish, tahrirlash, faol/nofaol qilish
// ---------------------------------------------------------------------------
async function loadServiceList() {
  if (!supabaseClient || !serviceList) return;
  const { data, error } = await supabaseClient.from('services').select('*').order('name', { ascending: true });
  if (error) { toast('Xizmatlarni yuklashda xatolik: ' + error.message, 'err'); return; }
  allServiceRows = data || [];
  renderServiceListUI();
}

function renderServiceListUI() {
  if (!serviceList) return;
  if (!allServiceRows.length) {
    serviceList.innerHTML = `<p style="padding:16px; color:var(--ink-3); font-size:13px;">Hozircha xizmatlar yo'q.</p>`;
    return;
  }
  serviceList.innerHTML = allServiceRows.map(s => `
    <div class="service-row${s.active ? '' : ' inactive'}" data-id="${escapeHtml(String(s.id))}">
      <div class="service-row-main">
        <div class="service-row-name">${escapeHtml(s.name)}</div>
        <div class="service-row-meta">${money(s.price)} · ${s.duration} daqiqa</div>
      </div>
      <span class="badge ${s.active ? 'badge-active' : 'badge-inactive'}">${s.active ? 'Faol' : 'Nofaol'}</span>
      <div class="service-row-actions">
        <button type="button" class="icon-btn" data-action="edit-service" title="Tahrirlash" aria-label="${escapeHtml(s.name)}ni tahrirlash"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" data-action="toggle-service" title="${s.active ? 'Nofaol qilish' : 'Faollashtirish'}" aria-label="${escapeHtml(s.name)}ni ${s.active ? 'nofaol qilish' : 'faollashtirish'}"><i class="fa-solid ${s.active ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete-service" title="Butunlay o'chirish" aria-label="${escapeHtml(s.name)}ni butunlay o'chirish"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </div>
    </div>
  `).join('');
}

serviceList?.addEventListener('click', (e) => {
  const row = e.target.closest('.service-row');
  if (!row) return;
  const svc = allServiceRows.find(s => String(s.id) === row.dataset.id);
  if (!svc) return;
  if (e.target.closest('[data-action="edit-service"]')) openServiceModal(svc);
  if (e.target.closest('[data-action="toggle-service"]')) toggleServiceActive(svc);
  const delBtn = e.target.closest('[data-action="delete-service"]');
  if (delBtn) deleteService(svc, delBtn);
});

// Xizmatni butunlay o'chirish (xodimni o'chirish bilan bir xil ikki
// bosqichli tasdiqlash mantig'i). Agar shu xizmatga bog'liq bronlar
// bo'lsa, o'chirib bo'lmaydi — "Nofaol" qilishni tavsiya qilamiz.
async function deleteService(svc, btn) {
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.title = "Ishonchingiz komilmi? Yana bosing";
    clearTimeout(btn._confirmTimeout);
    btn._confirmTimeout = setTimeout(() => {
      btn.classList.remove('confirming');
      btn.title = "Butunlay o'chirish";
    }, 3000);
    return;
  }

  clearTimeout(btn._confirmTimeout);
  btn.disabled = true;
  const { error } = await supabaseClient.from('services').delete().eq('id', svc.id);
  btn.disabled = false;

  if (error) {
    if (error.code === '23503') {
      toast("Bu xizmatga tegishli bronlar mavjud, shuning uchun butunlay o'chirib bo'lmaydi. Uni \"Nofaol\" qiling — saytda ko'rinmay qoladi.", 'err');
    } else {
      toast('Xatolik: ' + error.message, 'err');
    }
    btn.classList.remove('confirming');
    btn.title = "Butunlay o'chirish";
    return;
  }

  toast("Xizmat butunlay o'chirildi.");
  await loadServiceList();
  await loadCatalog(supabaseClient);
}

async function toggleServiceActive(svc) {
  const { error } = await supabaseClient.from('services').update({ active: !svc.active }).eq('id', svc.id);
  if (error) { toast('Xatolik: ' + error.message, 'err'); return; }
  toast(svc.active ? "Xizmat nofaol qilindi (saytda ko'rinmaydi)." : "Xizmat faollashtirildi.");
  await loadServiceList();
  await loadCatalog(supabaseClient);
}

function openServiceModal(svc = null) {
  svEditingId = svc ? svc.id : null;
  document.getElementById('serviceModalTitle').textContent = svc ? "Xizmatni tahrirlash" : "Yangi xizmat";
  svName.value = svc?.name || '';
  svPrice.value = svc?.price ?? '';
  svDuration.value = svc?.duration ?? '';
  svActive.checked = svc ? !!svc.active : true;
  svError.classList.add('hidden');
  serviceModal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeServiceModal() {
  serviceModal?.classList.add('hidden');
  document.body.style.overflow = '';
}

addServiceBtn?.addEventListener('click', () => openServiceModal(null));
serviceCloseBtn?.addEventListener('click', closeServiceModal);
serviceModal?.addEventListener('click', (e) => { if (e.target === serviceModal) closeServiceModal(); });

serviceForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  svError.classList.add('hidden');
  const name = svName.value.trim();
  const price = Number(svPrice.value);
  const duration = Number(svDuration.value);

  if (!name || !price || !duration) {
    svError.textContent = "Barcha maydonlarni to'ldiring.";
    svError.classList.remove('hidden');
    return;
  }

  svSubmitBtn.disabled = true;
  const originalLabel = svSubmitBtn.textContent;
  svSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  try {
    // Xizmat nomi — ma'noli matn (masalan "Soqol shakllantirish"), shuning
    // uchun atoqli ot kabi harf almashtirish (translit.js) emas, balki
    // haqiqiy tarjima (/api/translate) ishlatiladi — xuddi ustalar tavsifi
    // kabi (yuqoridagi autoTranslateToRu'ga qarang).
    const nameRu = await autoTranslateToRu(name);
    const nameEn = await autoTranslateToEn(name);
    if (svEditingId) {
      const { error } = await supabaseClient.from('services')
        .update({ name, name_ru: nameRu, name_en: nameEn, price, duration, active: svActive.checked })
        .eq('id', svEditingId);
      if (error) throw error;
    } else {
      let id = slugify(name);
      if (allServiceRows.some(s => String(s.id) === id)) id = `${id}_${Math.floor(Math.random() * 1000)}`;
      const { error } = await supabaseClient.from('services').insert({ id, name, name_ru: nameRu, name_en: nameEn, price, duration, active: svActive.checked });
      if (error) throw error;
    }

    toast(svEditingId ? "Xizmat yangilandi." : "Xizmat qo'shildi.");
    closeServiceModal();
    await loadServiceList();
    await loadCatalog(supabaseClient);
  } catch (err) {
    svError.textContent = "Xatolik: " + (err.message || err);
    svError.classList.remove('hidden');
  } finally {
    svSubmitBtn.disabled = false;
    svSubmitBtn.textContent = originalLabel;
  }
});

// Xodim tahrirlash oynasi ichidagi bandlik bo'limi — faqat shu xodimning
// (stEditingId) band kunlarini ko'rsatadi va shungayina qo'shadi. Ochilishi
// openStaffModal() ichida boshqariladi.
async function loadStaffTimeOffList(masterId) {
  if (!stToListBody) return;
  stToListBody.innerHTML = `<p class="to-empty"><i class="fa-solid fa-spinner fa-spin"></i> Yuklanmoqda…</p>`;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseClient
    .from('master_time_off')
    .select('id, off_date, start_time, end_time, reason')
    .eq('master_id', masterId)
    .gte('off_date', today)
    .order('off_date', { ascending: true });

  if (error) {
    stToListBody.innerHTML = `<p class="to-empty">Yuklashda xatolik: ${escapeHtml(error.message)}</p>`;
    return;
  }
  renderStaffTimeOffList(data || [], masterId);
}

function renderStaffTimeOffList(rows, masterId) {
  if (!rows.length) {
    stToListBody.innerHTML = `<p class="to-empty">Bu xodim uchun belgilangan bandlik kunlari yo'q.</p>`;
    return;
  }
  stToListBody.innerHTML = rows.map(r => {
    const dateLabel = new Date(`${r.off_date}T00:00:00`).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' });
    const timeLabel = r.start_time ? `${r.start_time}–${r.end_time}` : "Butun kun";
    return `
      <div class="to-item">
        <div class="to-item-info">
          ${dateLabel} · ${timeLabel}
          ${r.reason ? `<div class="to-reason">${escapeHtml(r.reason)}</div>` : ''}
        </div>
        <button type="button" class="to-del" data-del-id="${r.id}" title="O'chirish" aria-label="${dateLabel} band kunini o'chirish"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </div>`;
  }).join('');

  stToListBody.querySelectorAll('[data-del-id]').forEach(btn => {
    btn.addEventListener('click', () => deleteStaffTimeOff(btn.dataset.delId, masterId));
  });
}

async function deleteStaffTimeOff(id, masterId) {
  if (!confirm("Bu bandlik yozuvini o'chirishni tasdiqlaysizmi?")) return;
  const { error } = await supabaseClient.from('master_time_off').delete().eq('id', id);
  if (error) {
    toast("O'chirishda xatolik: " + error.message, 'err');
    return;
  }
  toast("Bandlik o'chirildi.");
  loadStaffTimeOffList(masterId);
}

stToFullDay?.addEventListener('change', () => {
  stToRangeFields?.classList.toggle('hidden', stToFullDay.checked);
  if (stToStart) stToStart.required = !stToFullDay.checked;
  if (stToEnd) stToEnd.required = !stToFullDay.checked;
});

stToAddBtn?.addEventListener('click', async () => {
  stToError?.classList.add('hidden');
  if (!stEditingId) return; // faqat mavjud (saqlangan) xodim uchun ishlaydi

  const date = stToDate.value;
  const fullDay = stToFullDay.checked;
  const start = fullDay ? null : stToStart.value;
  const end = fullDay ? null : stToEnd.value;
  const reason = stToReason.value.trim() || null;

  if (!date) {
    stToError.textContent = "Sanani tanlang.";
    stToError.classList.remove('hidden');
    return;
  }
  if (!fullDay && (!start || !end || end <= start)) {
    stToError.textContent = "Tugash vaqti boshlanishdan keyin bo'lishi kerak.";
    stToError.classList.remove('hidden');
    return;
  }

  stToAddBtn.disabled = true;
  const originalLabel = stToAddBtn.textContent;
  stToAddBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  const { error } = await supabaseClient.from('master_time_off').insert({
    master_id: stEditingId,
    off_date: date,
    start_time: start,
    end_time: end,
    reason,
  });

  stToAddBtn.disabled = false;
  stToAddBtn.textContent = originalLabel;

  if (error) {
    stToError.textContent = "Saqlashda xatolik: " + error.message;
    stToError.classList.remove('hidden');
    return;
  }

  toast("Bandlik qo'shildi.");
  stToDate.value = date;
  stToFullDay.checked = true;
  stToRangeFields.classList.add('hidden');
  stToReason.value = '';
  loadStaffTimeOffList(stEditingId);
});

// ---------------------------------------------------------------------------
// Yangi bron (admin qo'lda qo'shadi) — telefon orqali kelgan mijozlar uchun.
// sql/PATCH_round8_admin_manual_booking.sql. Narx/davomiylik/nom xizmat va
// barber katalogidan avtomatik olinadi (validate_booking_against_catalog
// trigger'i), shu sabab bu yerda faqat service_id/master_id/sana/vaqt va
// mijoz ismi/telefonini yuborish kifoya. Band vaqtlar, ustaning dam olish
// kunlari va davomiylik to'qnashuvi — bularning barchasi baza tomonda
// (sql/catalog_validation_and_limits.sql, sql/PATCH_round7_master_time_off.sql)
// baribir qat'iy tekshiriladi, bu yerdagi hisob-kitob faqat UX uchun.
// ---------------------------------------------------------------------------
function populateServiceSelect() {
  if (!nbService) return;
  nbService.innerHTML = SERVICES.map(s => `<option value="${s.id}">${escapeHtml(s.name)} — ${s.duration} daq</option>`).join('');
}

function populateNbMasterSelect() {
  if (!nbMaster) return;
  nbMaster.innerHTML = MASTERS.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
}

function openNewBookingModal(presetMasterId) {
  nbEditingId = null;
  newBookingModal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  nbError?.classList.add('hidden');
  newBookingForm?.reset();
  nbSelectedTime = null;
  populateServiceSelect();
  populateNbMasterSelect();
  nbDate.value = new Date().toISOString().slice(0, 10); // Har doim bugungi sana bilan ochiladi
  if (presetMasterId) nbMaster.value = presetMasterId;
  document.getElementById('nbModalTitle').textContent = "Yangi bron";
  document.getElementById('nbModalSubtitle').textContent = presetMasterId
    ? "Eshikdan kirib kelgan mijoz uchun tezkor bron qo'shing"
    : "Telefon orqali kelgan mijoz uchun qo'lda bron qo'shing";
  nbSubmitBtn.textContent = "Bron qo'shish";
  renderNbSlots();
}

// #3: mavjud bronni tahrirlash — xuddi shu modaldan foydalanadi, faqat
// maydonlar bron qiymatlari bilan oldindan to'ldiriladi va submit paytida
// INSERT o'rniga admin_edit_booking() RPC'si chaqiriladi (sabab uchun
// sql/PATCH_round9_admin_edit_booking.sql'dagi izohga qarang).
function openEditBookingModal(booking) {
  nbEditingId = booking.id;
  newBookingModal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  nbError?.classList.add('hidden');
  populateServiceSelect();
  populateNbMasterSelect();
  nbName.value = booking.client_name || '';
  nbPhone.value = booking.client_phone || '';
  nbService.value = booking.service_id;
  nbMaster.value = booking.master_id;
  nbDate.value = booking.booking_date;
  nbSelectedTime = booking.booking_time;
  document.getElementById('nbModalTitle').textContent = "Bronni tahrirlash";
  document.getElementById('nbModalSubtitle').textContent = "Sana, vaqt yoki mijoz ma'lumotlarini to'g'irlang";
  nbSubmitBtn.textContent = "Saqlash";
  renderNbSlots();
}

function closeNewBookingModal() {
  newBookingModal?.classList.add('hidden');
  document.body.style.overflow = '';
  nbEditingId = null;
}

function nbToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function renderNbSlots() {
  if (!nbSlots) return;
  const masterId = nbMaster.value;
  const date = nbDate.value;
  const serviceId = nbService.value;
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '');

  if (!masterId || !serviceId || !isValidDate) {
    nbSlots.innerHTML = `<p class="nb-slots-empty">Avval sana, xizmat va barberni tanlang.</p>`;
    nbSelectedTime = null;
    return;
  }

  nbSlots.innerHTML = `<p class="nb-slots-empty"><i class="fa-solid fa-spinner fa-spin"></i> Tekshirilmoqda…</p>`;

  // Tahrirlash rejimida `bookings` jadvalini to'g'ridan-to'g'ri o'qiymiz
  // (admin allaqachon to'liq SELECT huquqiga ega) — chunki shu bronning
  // O'ZINI band vaqtlar ro'yxatidan chiqarib tashlash kerak (aks holda u
  // o'zining hozirgi vaqtini ham "band" deb ko'rsatib qo'yardi). Yangi
  // bron qo'shishda esa mijoz sayti ishlatadigan xavfsiz `booked_slots`
  // view'idan foydalanamiz.
  const bookedQuery = nbEditingId
    ? supabaseClient.from('bookings').select('id, booking_time, duration').eq('master_id', masterId).eq('booking_date', date).neq('status', 'cancelled')
    : supabaseClient.from('booked_slots').select('booking_time, duration').eq('master_id', masterId).eq('booking_date', date);

  const [{ data: bookedRows, error: bookedErr }, { data: offRows, error: offErr }] = await Promise.all([
    bookedQuery,
    supabaseClient.from('master_time_off').select('start_time, end_time, reason').eq('master_id', masterId).eq('off_date', date),
  ]);

  if (bookedErr || offErr) {
    nbSlots.innerHTML = `<p class="nb-slots-empty">Yuklashda xatolik: ${escapeHtml((bookedErr || offErr).message)}</p>`;
    return;
  }

  const fullDayOff = (offRows || []).find(t => !t.start_time);
  if (fullDayOff) {
    nbSlots.innerHTML = `<p class="nb-slots-empty">${escapeHtml(fullDayOff.reason || "Ushbu sanada bu barber ishlamaydi.")}</p>`;
    nbSelectedTime = null;
    return;
  }

  const booked = [
    ...(bookedRows || [])
      .filter(r => !nbEditingId || String(r.id) !== String(nbEditingId))
      .map(r => ({ time: r.booking_time, duration: r.duration })),
    ...(offRows || []).map(t => ({ time: t.start_time, duration: nbToMinutes(t.end_time) - nbToMinutes(t.start_time) })),
  ];

  const service = SERVICES.find(s => s.id === serviceId);
  const duration = service?.duration || 30;
  const CLOSING_MINUTES = 20 * 60;
  const now = new Date();
  const isToday = date === now.toISOString().slice(0, 10);

  const slots = generateDaySlots();
  nbSlots.innerHTML = slots.map(t => {
    const start = nbToMinutes(t);
    const end = start + duration;
    let disabled = end > CLOSING_MINUTES || booked.some(b => {
      const bStart = nbToMinutes(b.time);
      const bEnd = bStart + (b.duration || 30);
      return start < bEnd && end > bStart;
    });
    if (!disabled && isToday) {
      const [hh, mm] = t.split(':').map(Number);
      const slotDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
      if (slotDt < now) disabled = true; // admin uchun o'tgan vaqtni ko'rsatish shart emas
    }
    const selected = nbSelectedTime === t;
    // Faqat boshlanish vaqti emas, "boshlanish - tugash" oralig'ini ko'rsatamiz
    // — shunda uzunroq xizmatlarda nega bitta bron 2 slotni band qilishi aniq bo'ladi.
    const endLabel = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    return `<button type="button" class="nb-slot${selected ? ' selected' : ''}" data-time="${t}" ${disabled ? 'disabled' : ''}>${t} - ${endLabel}</button>`;
  }).join('');

  nbSlots.querySelectorAll('[data-time]:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      nbSelectedTime = btn.dataset.time;
      renderNbSlots();
    });
  });
}

newBookingBtn?.addEventListener('click', () => openNewBookingModal());
nbCloseBtn?.addEventListener('click', closeNewBookingModal);
newBookingModal?.addEventListener('click', (e) => { if (e.target === newBookingModal) closeNewBookingModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!newBookingModal?.classList.contains('hidden')) closeNewBookingModal();
  if (!staffModal?.classList.contains('hidden')) closeStaffModal();
  if (!serviceModal?.classList.contains('hidden')) closeServiceModal();
  if (!moreMenuModal?.classList.contains('hidden')) closeMoreMenu();
});
[nbMaster, nbDate, nbService].forEach(el => el?.addEventListener('change', () => { nbSelectedTime = null; renderNbSlots(); }));

newBookingForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  nbError.classList.add('hidden');

  const name = nbName.value.trim();
  const phone = nbPhone.value.trim();
  const serviceId = nbService.value;
  const masterId = nbMaster.value;
  const date = nbDate.value;

  if (!name || !phone) {
    nbError.textContent = "Mijoz ismi va telefonini kiriting.";
    nbError.classList.remove('hidden');
    return;
  }
  if (!serviceId || !masterId || !date) {
    nbError.textContent = "Xizmat, barber va sanani tanlang.";
    nbError.classList.remove('hidden');
    return;
  }
  if (!nbSelectedTime) {
    nbError.textContent = "Bo'sh vaqt slotini tanlang.";
    nbError.classList.remove('hidden');
    return;
  }

  nbSubmitBtn.disabled = true;
  const originalLabel = nbSubmitBtn.textContent;
  nbSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  let error;
  if (nbEditingId) {
    // Tahrirlash — admin_edit_booking() RPC orqali (sql/PATCH_round9_admin_edit_booking.sql).
    // Bu funksiya ichida katalog, bandlik va to'qnashuv tekshiruvlari QAYTA
    // bajariladi — chunki oddiy UPDATE'da bu trigger'lar ishlamaydi.
    ({ error } = await supabaseClient.rpc('admin_edit_booking', {
      p_booking_id: nbEditingId,
      p_service_id: serviceId,
      p_master_id: masterId,
      p_date: date,
      p_time: nbSelectedTime,
      p_client_name: name,
      p_client_phone: phone,
    }));
  } else {
    // Yangi qo'shish — service_name/master_name/price/duration'ni ataylab
    // yubormaymiz, bazadagi validate_booking_against_catalog trigger'i
    // ularni har doim haqiqiy katalog qiymati bilan avtomatik to'ldiradi.
    ({ error } = await supabaseClient.from('bookings').insert({
      service_id: serviceId,
      master_id: masterId,
      booking_date: date,
      booking_time: nbSelectedTime,
      client_name: name,
      client_phone: phone,
      status: 'confirmed',
    }));
  }

  nbSubmitBtn.disabled = false;
  nbSubmitBtn.textContent = originalLabel;

  if (error) {
    // 23505 — bazadagi bookings_master_slot_unique cheklovi: shu orada
    // boshqa birov (masalan onlaynda mijozning o'zi) xuddi shu vaqtga
    // ulgurib bron qilib qo'ygan bo'lishi mumkin.
    nbError.textContent = error.code === '23505'
      ? "Bu vaqt shu payt ichida band bo'lib qoldi. Iltimos, boshqa vaqtni tanlang."
      : (nbEditingId ? "Saqlashda xatolik: " : "Qo'shishda xatolik: ") + error.message;
    nbError.classList.remove('hidden');
    nbSelectedTime = null;
    renderNbSlots();
    return;
  }

  toast(nbEditingId ? "Bron yangilandi." : "Bron qo'shildi.");
  closeNewBookingModal();
  loadBookings();
});

async function checkSession() {
  if (!supabaseClient) {
    showLogin();
    showError("Supabase sozlanmagan (js/config.js). Admin panel ishlashi uchun avval Supabase ulanishi kerak.");
    return;
  }

  // Internet yo'q — Supabase'ga so'rov yuborishning ma'nosi yo'q (auth
  // sessiyasi ham, bronlar/katalog ham baribir kelmaydi). 6 soniyalik
  // spinner o'rniga darhol "aloqa yo'q" holatini ko'rsatamiz. "Qayta
  // urinish" bosilsa sahifa qaytadan yuklanadi.
  if (!isOnline()) {
    showBootOffline();
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) { showDashboard(); return; }
  await tryAutoLogin();
}

// #bootView'ni "internet yo'q" ko'rinishiga o'tkazadi (spinner o'rniga).
function showBootOffline() {
  if (bootViewHidden) return;
  bootView?.classList.add('boot--offline');
}
document.getElementById('bootRetryBtn')?.addEventListener('click', () => {
  window.location.reload();
});

// OFFLINE: doimiy banner. Aloqa qaytganda — agar hali login/dashboard
// ekraniga o'tilmagan bo'lsa (boot offline holatida to'xtab qolgan bo'lsa),
// sessiyani qaytadan tekshiramiz; aks holda (dashboard allaqachon ochiq)
// realtime obunani va joriy ko'rinishdagi ma'lumotlarni yangilaymiz.
initOfflineBanner(() => {
  if (bootView?.classList.contains('boot--offline')) {
    bootView.classList.remove('boot--offline');
    checkSession();
    return;
  }
  if (!dashView.classList.contains('hidden')) {
    subscribeRealtime();
    loadBookings();
  }
});

// Sessiya topilmasa (masalan tablet qayta yoqilgan yoki token muddati
// tugagan) — shu qurilmada eslab qolingan parol bo'lsa, xodimga login
// ekranini ko'rsatmasdan avtomatik tizimga kirishga urinamiz.
async function tryAutoLogin() {
  const saved = getRememberedPassword();
  if (!saved) { showLogin(); return; }
  const { error } = await supabaseClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password: saved });
  if (error) {
    // Eslab qolingan parol endi ishlamayapti (masalan parol o'zgargan) — tozalab, oddiy login ekranini ko'rsatamiz
    clearRememberedPassword();
    showLogin();
    return;
  }
  showDashboard();
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const password = document.getElementById('password').value;
  const remember = document.getElementById('rememberDevice')?.checked;

  if (!supabaseClient) {
    showError("Supabase sozlanmagan (js/config.js).");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
  if (error) {
    showError("Parol xato.");
    return;
  }
  if (remember) saveRememberedPassword(password); else clearRememberedPassword();
  showDashboard();
});

logoutBtn?.addEventListener('click', async () => {
  if (!confirm("Tizimdan chiqishni tasdiqlaysizmi?")) return;
  manualLogout = true;
  clearRememberedPassword();
  await supabaseClient.auth.signOut();
  showLogin();
});


refreshBtn?.addEventListener('click', loadBookings);
statusFilter?.addEventListener('change', loadBookings);

timeTabs?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  timeTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  activeTab = btn.dataset.tab;
  renderBookings();
});

let searchDebounce = null;
searchInput?.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = e.target.value;
    renderBookings();
  }, 180);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.booking-row')) {
    bookingsBody?.querySelectorAll('.booking-row.show-fab').forEach(r => r.classList.remove('show-fab'));
  }
});

initSupabase();
// ...keyin Supabase'dagi haqiqiy (admin panelda tahrirlangan) ro'yxat bilan yangilanadi
checkSession();
