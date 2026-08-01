import { getLang, getMonthNames, getWeekdayNames, t } from './i18n.js';

// =============================================================================
// MA'LUMOTLAR: Xizmatlar va barberlar ro'yxati
//
// MUHIM (round-11 o'zgarishi): SERVICES va MASTERS endi FAQAT statik emas —
// sayt yuklanganda loadCatalog() orqali Supabase'dagi "services" va
// "masters" jadvallaridan (active=true bo'lganlar) olinadi. Shunda admin
// panelda ("Tahrirlash" bo'limi) qo'shilgan/o'zgartirilgan xodim yoki
// xizmat saytda DARHOL ko'rinadi — kod qayta joylashtirish shart emas.
//
// Quyidagi DEFAULT_* ro'yxatlar faqat ZAXIRA (fallback) sifatida qoladi —
// agar Supabase ulanmagan bo'lsa yoki so'rov xato bersa, sayt butunlay
// bo'sh qolib ketmasligi uchun shu standart ma'lumotlar ko'rsatiladi.
// =============================================================================

const DEFAULT_SERVICES = [
  { id: 'classic_cut',    name: "Oddiy soch kesish",      desc: "Yuvish + kesish + ukladka",                          duration: 40,  price: 40000,  icon: 'fa-scissors' },
  { id: 'fade_cut',       name: "Fade / dizaynli kesish",  desc: "Zamonaviy fade va dizaynli kesimlar",                duration: 50,  price: 60000,  icon: 'fa-user-tie' },
  { id: 'kids_cut',       name: "Bolalar soch kesish",     desc: "14 yoshgacha bo'lgan mijozlar uchun",                duration: 30,  price: 30000,  icon: 'fa-child' },
  { id: 'beard_trim',     name: "Soqol shakllantirish",    desc: "Soqol modellashtirish va tarash",                   duration: 25,  price: 30000,  icon: 'fa-user-tie' },
  { id: 'royal_shave',    name: "Ustara bilan tarash",     desc: "Issiq sochiq bilan klassik tarash",                 duration: 30,  price: 35000,  icon: 'fa-droplet' },
  { id: 'cut_beard_combo',name: "Soch + soqol kombosi",    desc: "To'liq kesish va soqol shakllantirish birga",       duration: 60,  price: 65000,  icon: 'fa-star' },
];

const DEFAULT_MASTERS = [
  { id: 'barber2', name: 'Barber 1',  role: "Barber", exp: "", img: 'assets/masters/barber2.jpg', specialties: ['classic_cut', 'fade_cut', 'kids_cut', 'beard_trim', 'royal_shave', 'cut_beard_combo'] },
  { id: 'barber3', name: 'Barber 2',  role: "Barber", exp: "", img: 'assets/masters/barber3.jpg', specialties: ['classic_cut', 'fade_cut', 'kids_cut', 'beard_trim', 'royal_shave', 'cut_beard_combo'] },
  { id: 'barber4', name: 'Barber 3',  role: "Barber", exp: "", img: 'assets/masters/barber4.jpg', specialties: ['classic_cut', 'fade_cut', 'kids_cut', 'beard_trim', 'royal_shave', 'cut_beard_combo'] },
  { id: 'barber5', name: 'Barber 4',  role: "Barber", exp: "", img: 'assets/masters/barber5.jpg', specialties: ['classic_cut', 'fade_cut', 'kids_cut', 'beard_trim', 'royal_shave', 'cut_beard_combo'] },
];

/**
 * 2-bosqich (+ EN qo'shildi): xizmat/barber nomi va tavsifi kabi bazadan
 * keladigan (statik i18n.js jadvalida yo'q) matnlar uchun. RU yoki EN
 * tanlangan bo'lsa va shu tildagi varianti kiritilgan bo'lsa — o'shani,
 * aks holda har doim mavjud bo'lgan asosiy (uz) matnni qaytaradi, shu
 * sababli sayt hech qachon bo'sh joy ko'rsatmaydi.
 */
export function pickLang(uzText, ruText, enText) {
  const lang = getLang();
  if (lang === 'ru' && ruText) return ruText;
  if (lang === 'en' && enText) return enText;
  return uzText;
}

// `export let` — ES modullarda "live binding": data.js bu qiymatlarni
// qayta tayinlasa (masalan loadCatalog() ichida), boshqa fayllarda
// `import { SERVICES } from './data.js'` qilib olingan nom ham avtomatik
// yangi qiymatni ko'rsatadi, qayta import qilish shart emas.
export let SERVICES = DEFAULT_SERVICES;
export let MASTERS = DEFAULT_MASTERS;

// =============================================================================
// KATALOG KESHI (localStorage): oldin SERVICES/MASTERS har safar sahifa
// ochilganda Supabase'dan QAYTA so'ralar edi — hatto ma'lumot bir kun oldin
// bilan bir xil bo'lsa ham, mijoz har kirganda "bo'sh -> skeleton -> tarmoq
// javobi" bosqichlarini qayta-qayta ko'rardi. Endi "stale-while-revalidate"
// mantig'i: oxirgi muvaffaqiyatli javob localStorage'ga saqlanadi va
// keyingi tashrifda DARHOL (tarmoqni kutmasdan) ishlatiladi, shu bilan
// birga fonda Supabase'dan yangisi so'raladi — agar farq bo'lsa, kartochkalar
// jimgina (foydalanuvchi bilmasdan) yangilanadi. Versiya raqami (v1) — agar
// kelajakda saqlanadigan maydonlar tarkibi o'zgarsa, eski keshni chalkashtirib
// yubormaslik uchun kalitni almashtirish kifoya.
const CATALOG_CACHE_KEY = 'bilol:catalog:v1';

/** Oxirgi saqlangan katalogni localStorage'dan o'qib, SERVICES/MASTERS'ga
 * darhol (sinxron, tarmoqsiz) tadbiq qiladi. Kesh topilsa true, bo'lmasa
 * false qaytaradi — chaqiruvchi shu orqali skeleton kerakmi yoki yo'qmi
 * qaror qiladi. */
export function hydrateCatalogFromCache() {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.services) || !Array.isArray(cached.masters)) return false;
    if (!cached.services.length || !cached.masters.length) return false;
    SERVICES = cached.services;
    MASTERS = cached.masters;
    return true;
  } catch (e) {
    // localStorage yo'q, bloklangan yoki JSON buzilgan — jimgina e'tibor bermaymiz
    return false;
  }
}

function saveCatalogCache() {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ services: SERVICES, masters: MASTERS, savedAt: Date.now() }));
  } catch (e) { /* kvota to'lgan yoki bloklangan bo'lishi mumkin — jim o'tkazamiz */ }
}

// =============================================================================
// TEZKOR "O'ZGARISHNI TEKSHIRISH" (versiya imzosi): to'liq loadCatalog()
// har doim BARCHA ustunlarni (nom — 3 tilda, tavsif — 3 tilda, narx,
// davomiylik, rasm manzili) yuklaydi. Sahifa/panel ochilgan sari shuni
// qayta-qayta so'rash trafikni behuda sarflaydi, chunki 99% holatda admin
// hech narsa o'zgartirmagan bo'ladi. Shu sabab avval FAQAT id+active+
// updated_at (sql/PATCH_round20_catalog_version_check.sql orqali qo'shilgan,
// bir necha bayt/qator) so'raladi va "imzo" (signature) tuziladi. Agar bu
// imzo oxirgi saqlangan bilan bir xil bo'lsa — hech narsa o'zgarmagan,
// to'liq ma'lumot qayta yuklanmaydi, kesh ishlatiladi. Farq bo'lsa (yoki
// oldin hech qachon tekshirilmagan bo'lsa) — to'liq loadCatalog() chaqiriladi.
const CATALOG_VERSION_KEY = 'bilol:catalog:version:v1';

function readCachedVersion() {
  try { return localStorage.getItem(CATALOG_VERSION_KEY); } catch (e) { return null; }
}
function saveCachedVersion(sig) {
  try { localStorage.setItem(CATALOG_VERSION_KEY, sig); } catch (e) { /* jim o'tkazamiz */ }
}

/** Qator ro'yxatini (id+active+updated_at) tartiblab, bitta qatorli
 * "imzo" satriga aylantiradi — tartib farq qilsa ham (masalan `order by`
 * natijasi turlicha kelsa ham) natija bir xil bo'lishi uchun saralanadi. */
function buildSignature(rows) {
  return rows
    .map((r) => `${r.id}:${r.active ? 1 : 0}:${r.updated_at || ''}`)
    .sort()
    .join('|');
}

/** Faqat id/active/updated_at ustunlarini so'raydi (nom, tavsif, narx,
 * rasm — YO'Q) — shu sababli javob hajmi to'liq so'rovdan o'nlab marta
 * kichik bo'ladi. Tarmoq/RLS xatosi bo'lsa null qaytaradi (chaqiruvchi bu
 * holatda "xavfsiz tomonga" — to'liq yuklashga — o'tadi). */
async function fetchCatalogSignature(supabase) {
  try {
    const [svcRes, mstRes] = await Promise.all([
      supabase.from('services').select('id,active,updated_at'),
      supabase.from('masters').select('id,active,updated_at'),
    ]);
    if (svcRes.error || mstRes.error) return null;
    return `${buildSignature(svcRes.data || [])}::${buildSignature(mstRes.data || [])}`;
  } catch (e) {
    return null;
  }
}

/**
 * Sahifa (mijoz sayti) va admin panel ochilganda ishlatiladigan "aqlli"
 * yuklash. Ikkalasi ham shu bitta funksiyani chaqiradi — shu sabab
 * tekshiruv mantig'i bir joyda, ikki marta yozilmaydi.
 *
 * 1) Eng yengil so'rov bilan joriy holat imzosi olinadi (tez, kam trafik).
 * 2) Agar bu imzo localStorage'dagi oxirgisi bilan BIR XIL bo'lsa —
 *    hech narsa o'zgarmagan, to'liq ma'lumot QAYTA so'ralmaydi (kesh
 *    ishlatilaveradi). Supabase'ga to'liq borib-kelish shu holatda
 *    umuman bo'lmaydi.
 * 3) Farq bo'lsa (yoki avval tekshirilmagan, yoki tekshiruv o'zi xato
 *    bergan bo'lsa) — to'liq loadCatalog() chaqiriladi va yangi imzo
 *    saqlanadi.
 *
 * @param {object} supabase
 * @param {boolean} hasLocalCache — chaqiruvchida SERVICES/MASTERS allaqachon
 *   (hydrateCatalogFromCache orqali) keshdan to'ldirilganmi. False bo'lsa,
 *   imzolar mos kelsa ham baribir to'liq yuklanadi — chunki solishtiradigan
 *   hech narsa yo'q.
 * @returns {Promise<boolean>} true = to'liq ma'lumot qayta yuklandi/yangilandi
 */
export async function loadCatalogSmart(supabase, hasLocalCache) {
  if (!supabase) return false;

  const newSig = await fetchCatalogSignature(supabase);
  const oldSig = readCachedVersion();

  if (hasLocalCache && newSig !== null && newSig === oldSig) {
    // Imzo bir xil — servis/xodim ro'yxatida (nom, narx, tavsif, rasm,
    // active holati) HECH NARSA o'zgarmagan. To'liq so'rovni tejaymiz.
    return false;
  }

  await loadCatalog(supabase);
  if (newSig !== null) saveCachedVersion(newSig);
  return true;
}

/**
 * Supabase'dan xizmatlar va xodimlar (faqat active=true) ro'yxatini
 * yuklab, SERVICES/MASTERS'ni yangilaydi. main.js (mijoz sayti) va
 * admin/admin.js ikkalasi ham shu funksiyani chaqiradi.
 *
 * MUHIM: masters jadvalida "specialties" (qaysi xizmatlarni bajaradi)
 * ustuni YO'Q — hozircha barcha faol xodim barcha faol xizmatni bajaradi
 * deb hisoblanadi (bu avvalgi statik ro'yxatdagi haqiqiy xatti-harakat
 * bilan bir xil — barcha barberlarda specialties = barcha xizmatlar edi).
 */
export async function loadCatalog(supabase) {
  if (!supabase) return;
  try {
    const [svcRes, mstRes] = await Promise.all([
      supabase.from('services').select('*').eq('active', true).order('name', { ascending: true }),
      supabase.from('masters').select('*').eq('active', true).order('name', { ascending: true }),
    ]);

    if (!svcRes.error && svcRes.data && svcRes.data.length) {
      SERVICES = svcRes.data.map(s => ({
        id: s.id,
        name: s.name,
        name_ru: s.name_ru || '',
        name_en: s.name_en || '',
        desc: s.description || '',
        desc_ru: s.description_ru || '',
        desc_en: s.description_en || '',
        duration: s.duration,
        price: s.price,
        icon: 'fa-scissors',
      }));
    }

    if (!mstRes.error && mstRes.data && mstRes.data.length) {
      const allServiceIds = SERVICES.map(s => s.id);
      MASTERS = mstRes.data.map(m => ({
        id: m.id,
        name: m.name,
        name_ru: m.name_ru || '',
        name_en: m.name_en || '',
        role: "Barber",
        exp: m.description || '',
        exp_ru: m.description_ru || '',
        exp_en: m.description_en || '',
        img: m.photo_url || 'assets/masters/barber.jpg',
        specialties: allServiceIds,
      }));
    }

    // Muvaffaqiyatli javobni keyingi tashrif uchun saqlab qo'yamiz
    saveCatalogCache();
  } catch (e) {
    console.warn("Katalogni Supabase'dan yuklashda xato, standart ro'yxat ishlatiladi:", e);
  }
}

/** Narxni "250 000 so'm" (yoki joriy tilga qarab "250 000 сум") ko'rinishida formatlaydi */
export function money(n) {
  return n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ' + t('currency.sum');
}

/** Sanani "24-iyul, Payshanba" (yoki joriy tilga qarab "24 июля, четверг") ko'rinishida formatlaydi */
export function formatDateUz(dateStr) {
  if (!dateStr) return '—';
  const days = getWeekdayNames(false);
  const months = getMonthNames(false);
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}-${months[d.getMonth()]}, ${days[d.getDay()]}`;
}

/** Ish kuni uchun 09:00–19:30 oralig'ida 30 daqiqalik slotlar ro'yxati */
export function generateDaySlots() {
  const slots = [];
  for (let h = 9; h < 20; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}
