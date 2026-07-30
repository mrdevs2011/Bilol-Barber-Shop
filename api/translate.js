// =============================================================================
// Vercel Serverless Function: /api/translate
// Admin panelida xizmat/xodim TAVSIFINI (description) o'zbekchadan ruschaga
// avtomatik tarjima qilish uchun — TO'LIQ SERVER TARAFIDA.
//
// HECH QANDAY API KALIT TALAB QILINMAYDI — faqat ochiq kodli / bepul
// tarjima xizmatlaridan foydalaniladi:
//   1) MyMemory Translation API (https://api.mymemory.translated.net) — asosiy
//   2) Lingva Translate (https://lingva.ml va ko'chirma instance'lar) — zaxira
// Birinchisi ishlamasa (limit, tarmoq xatosi va h.k.), avtomatik ikkinchisiga
// o'tadi. Ikkalasi ham bepul va key so'ramaydi.
//
// Ixtiyoriy (tavsiya etiladi, notify-admin.js bilan bir xil):
//   ALLOWED_ORIGIN_UZ, ALLOWED_ORIGIN_VERCEL
//
// Ism/familiya kabi atoqli otlar bu yerga UMUMAN aloqasi yo'q — ular
// admin/translit.js orqali (API'siz, faqat harf almashtirish bilan)
// brauzerning o'zida hal qilinadi.
// =============================================================================

const MAX_TEXT_LEN = 500;

// Bir nechta Lingva ko'zgu (mirror) instance — biri ishlamay qolsa, keyingisi
// sinab ko'riladi. Ro'yxat https://github.com/thedaviddelta/lingva-translate
// loyihasidagi umumiy instance'lar asosida.
const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://lingva.garudalinux.org',
  'https://translate.plausibility.cloud',
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 1) MyMemory — https://api.mymemory.translated.net (bepul, keysiz)
async function translateWithMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=uz|ru`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  // MyMemory ba'zan limitga yetganda ham 200 status bilan matn ichida
  // xatolik xabarini qaytaradi — shuni ham tekshiramiz.
  if (!translated || /MYMEMORY WARNING|QUOTA/i.test(translated)) {
    throw new Error('MyMemory natija bermadi yoki limitga yetdi');
  }
  return translated;
}

// 2) Lingva Translate — https://github.com/thedaviddelta/lingva-translate
//    (Google Translate'ning ochiq kodli, keysiz veb-muqobili)
async function translateWithLingva(text) {
  let lastErr;
  for (const base of LINGVA_INSTANCES) {
    try {
      const url = `${base}/api/v1/uz/ru/${encodeURIComponent(text)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`Lingva (${base}) HTTP ${res.status}`);
      const data = await res.json();
      if (data?.translation) return data.translation;
      throw new Error(`Lingva (${base}) natija bermadi`);
    } catch (err) {
      lastErr = err;
      // keyingi instance'ni sinab ko'ramiz
    }
  }
  throw lastErr || new Error('Barcha Lingva instance ishlamadi');
}

const requestLog = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ALLOWED_ORIGINS = [
    process.env.ALLOWED_ORIGIN_UZ,
    process.env.ALLOWED_ORIGIN_VERCEL,
  ].filter(Boolean);

  if (ALLOWED_ORIGINS.length > 0) {
    const origin = req.headers.origin || req.headers.referer || '';
    const isAllowed = ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed));
    if (!isAllowed) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Juda ko'p so'rov, birozdan keyin urinib ko'ring." });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ ok: false, error: 'text kerak' });
  }
  if (text.length > MAX_TEXT_LEN) {
    return res.status(400).json({ ok: false, error: 'Matn juda uzun' });
  }
  const trimmed = text.trim();

  // Avval MyMemory, ishlamasa Lingva — ikkalasi ham bepul va API kalit
  // talab qilmaydi, shu sabab hech qanday Environment Variable kerak emas.
  try {
    const translated = await translateWithMyMemory(trimmed);
    return res.status(200).json({ ok: true, translated, provider: 'mymemory' });
  } catch (myMemoryErr) {
    console.warn('MyMemory tarjima xatolik, Lingva sinab ko\'rilmoqda:', myMemoryErr);
    try {
      const translated = await translateWithLingva(trimmed);
      return res.status(200).json({ ok: true, translated, provider: 'lingva' });
    } catch (lingvaErr) {
      console.error('Lingva ham ishlamadi:', lingvaErr);
      return res.status(502).json({ ok: false, error: "Tarjima xizmatlari hozircha javob bermayapti, birozdan keyin urinib ko'ring." });
    }
  }
}
