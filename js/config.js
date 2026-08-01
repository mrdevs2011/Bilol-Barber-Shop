// =============================================================================
// BU FAYL AVTOMATIK GENERATSIYA QILINADI (scripts/generate-config.js orqali)!
//
// Bu yerdagi qiymatlar HOZIRDA PLACEHOLDER — real ishlashi uchun Vercel
// deploy paytida "buildCommand" (vercel.json'ga qarang) shu faylni
// Environment Variables asosida qayta yozadi.
//
// Lokal ishga tushirish uchun:
//   1) .env.example'dan nusxa olib .env yarating, qiymatlarni to'ldiring
//   2) node scripts/generate-config.js
//
// Kerakli Environment Variable'lar (Vercel -> Settings -> Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY  (majburiy)
//   ADMIN_EMAIL, TELEGRAM_BOT_USERNAME  (ixtiyoriy, default qiymat bor)
// =============================================================================

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
export const TELEGRAM_BOT_USERNAME = "bilolbarber_navbat_bot";
export const ADMIN_EMAIL = "admin@bilolbarber.uz";

// Web Push uchun VAPID PUBLIC kalit — sir emas (xuddi SUPABASE_ANON_KEY
// kabi brauzerda ochiq bo'lishi mumkin), PushManager.subscribe() shuni
// ishlatadi. Haqiqiy himoya PRIVATE kalit orqali (faqat serverda, hech
// qachon brauzerga chiqmaydi).
export const VAPID_PUBLIC_KEY = "";
