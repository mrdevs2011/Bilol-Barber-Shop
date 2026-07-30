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
 * 2-bosqich: xizmat/barber nomi va tavsifi kabi bazadan keladigan (statik
 * i18n.js jadvalida yo'q) matnlar uchun. RU tanlangan bo'lsa va ruscha
 * varianti kiritilgan bo'lsa — o'shani, aks holda har doim mavjud bo'lgan
 * asosiy (uz) matnni qaytaradi, shu sababli sayt hech qachon bo'sh joy
 * ko'rsatmaydi.
 */
export function pickLang(uzText, ruText) {
  return (getLang() === 'ru' && ruText) ? ruText : uzText;
}

// `export let` — ES modullarda "live binding": data.js bu qiymatlarni
// qayta tayinlasa (masalan loadCatalog() ichida), boshqa fayllarda
// `import { SERVICES } from './data.js'` qilib olingan nom ham avtomatik
// yangi qiymatni ko'rsatadi, qayta import qilish shart emas.
export let SERVICES = DEFAULT_SERVICES;
export let MASTERS = DEFAULT_MASTERS;

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
        desc: s.description || '',
        desc_ru: s.description_ru || '',
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
        role: "Barber",
        exp: m.description || '',
        exp_ru: m.description_ru || '',
        img: m.photo_url || 'assets/masters/barber.jpg',
        specialties: allServiceIds,
      }));
    }
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
