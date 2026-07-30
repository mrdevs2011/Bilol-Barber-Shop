// =============================================================================
// BUILD SCRIPT: js/config.js faylini Vercel Environment Variables'dan
// generatsiya qiladi. Bu skript Vercel'da har bir deploy paytida avtomatik
// ishga tushadi (vercel.json -> "buildCommand"), shuning uchun kodda
// (repo'da) hech qanday kalit/URL hardcoded holda saqlanmaydi.
//
// MUHIM: SUPABASE_ANON_KEY (publishable key) — bu SIR EMAS. Supabase buni
// atayin shunday yaratgan: brauzerda ochiq bo'lishi mumkin, chunki haqiqiy
// himoya Row Level Security (RLS) orqali ta'minlanadi. Uni shu skript
// orqali generatsiya qilishdan maqsad — kalitni sirni saqlash emas, balki
// kod bilan konfiguratsiyani ajratish (kalit almashsa, kodni tahrirlash
// shart bo'lmasin).
//
// Servis-role kalit, Telegram tokenlari kabi HAQIQIY sirlar bu skriptga
// UMUMAN KIRITILMAYDI — ular faqat /api/notify-admin.js (server) va
// Supabase Edge Function ichida process.env / Deno.env orqali o'qiladi,
// brauzerga hech qachon yuborilmaydi.
//
// Lokal ishlab chiqish uchun: loyiha papkasida .env fayl yarating
// (.env.example'ga qarang) va shu skriptni qo'lda ishga tushiring:
//   node scripts/generate-config.js
// =============================================================================

const fs = require('fs');
const path = require('path');

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(
    `\n[generate-config] XATOLIK: quyidagi Environment Variable'lar topilmadi: ${missing.join(', ')}\n` +
    `Vercel loyiha sozlamalarida (Settings -> Environment Variables) shu nomlar bilan qiymat qo'shing,\n` +
    `so'ng qayta deploy qiling. Lokal ishlab chiqishda esa .env faylini to'ldiring.\n`
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bilolbarber.uz';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'bilolbarber_navbat_bot';

const output = `// =============================================================================
// AVTOMATIK GENERATSIYA QILINGAN FAYL — QO'LDA TAHRIRLAMANG!
// Bu fayl har bir "vercel deploy" paytida scripts/generate-config.js
// tomonidan Environment Variables asosida qayta yaratiladi.
// Qiymatlarni o'zgartirish uchun: Vercel -> Settings -> Environment Variables
// =============================================================================

export const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};

// Bot username public (maxfiy emas) — mijoz botni Telegram'da qidirish/ochish
// uchun ishlatiladi.
export const TELEGRAM_BOT_USERNAME = ${JSON.stringify(TELEGRAM_BOT_USERNAME)};

// Admin panel (/admin) uchun: Supabase Authentication -> Users bo'limida
// shu email bilan foydalanuvchi yarating va parol belgilang.
export const ADMIN_EMAIL = ${JSON.stringify(ADMIN_EMAIL)};
`;

const outPath = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(outPath, output, 'utf8');
console.log(`[generate-config] js/config.js muvaffaqiyatli yaratildi (SUPABASE_URL: ${SUPABASE_URL}).`);

// =============================================================================
// service-worker.js dagi CACHE_VERSION'ni har bir build'da AVTOMATIK oshiradi.
// Bu orqali "eski JS/CSS keshda qolib, yangi HTML bilan mos kelmay qolishi"
// turidagi xatolar butunlay oldini oladi — endi hech kim qo'lda
// CACHE_VERSION'ni oshirishni unutib qo'ymaydi.
//
// Manba (ustuvorlik tartibida):
//   1) VERCEL_GIT_COMMIT_SHA — Vercel har bir deployda avtomatik beradi,
//      hech qanday sozlash shart emas (har bir commit uchun unikal).
//   2) Lokal build uchun fallback: joriy vaqt belgisi (timestamp).
// =============================================================================
const swPath = path.join(__dirname, '..', 'service-worker.js');
const swSource = fs.readFileSync(swPath, 'utf8');

const versionTag = (process.env.VERCEL_GIT_COMMIT_SHA || `local${Date.now()}`).slice(0, 12);
const newSwSource = swSource.replace(
  /const CACHE_VERSION = ['"][^'"]*['"];/,
  `const CACHE_VERSION = ${JSON.stringify(`v-${versionTag}`)};`
);

if (newSwSource === swSource) {
  console.warn('[generate-config] OGOHLANTIRISH: service-worker.js ichida CACHE_VERSION qatori topilmadi — kesh versiyasi yangilanmadi.');
} else {
  fs.writeFileSync(swPath, newSwSource, 'utf8');
  console.log(`[generate-config] service-worker.js CACHE_VERSION yangilandi: v-${versionTag}`);
}
