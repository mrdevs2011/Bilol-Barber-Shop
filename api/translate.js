// =============================================================================
// Vercel Serverless Function: /api/translate
// Admin panelida xizmat/xodim TAVSIFINI (description) o'zbekchadan ruschaga
// avtomatik tarjima qilish uchun — TO'LIQ SERVER TARAFIDA, API kalit hech
// qachon brauzerga chiqarilmaydi.
//
// Vercel loyihasida quyidagi Environment Variable sozlangan bo'lishi SHART:
//   GOOGLE_TRANSLATE_API_KEY — Google Cloud Console -> "Cloud Translation
//                               API"ni yoqib, API kalit yarating
//                               (batafsili: DEPLOY.md).
// Ixtiyoriy (tavsiya etiladi, notify-admin.js bilan bir xil):
//   ALLOWED_ORIGIN_UZ, ALLOWED_ORIGIN_VERCEL
//
// Ism/familiya kabi atoqli otlar bu yerga UMUMAN aloqasi yo'q — ular
// admin/translit.js orqali (API'siz, faqat harf almashtirish bilan)
// brauzerning o'zida hal qilinadi.
// =============================================================================

const MAX_TEXT_LEN = 500;

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

  const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!API_KEY) {
    console.error('GOOGLE_TRANSLATE_API_KEY Vercel env da sozlanmagan.');
    return res.status(500).json({ ok: false, error: 'Server tomonda tarjima kaliti sozlanmagan' });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ ok: false, error: 'text kerak' });
  }
  if (text.length > MAX_TEXT_LEN) {
    return res.status(400).json({ ok: false, error: 'Matn juda uzun' });
  }

  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(API_KEY)}`;
    const gRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'uz', target: 'ru', format: 'text' }),
    });
    const data = await gRes.json();
    if (!gRes.ok) {
      console.error('Google Translate xatolik:', data);
      return res.status(502).json({ ok: false, error: data?.error?.message || 'Tarjima xizmati xatosi' });
    }
    const translated = data?.data?.translations?.[0]?.translatedText;
    if (!translated) {
      return res.status(502).json({ ok: false, error: "Tarjima natijasi bo'sh keldi" });
    }
    return res.status(200).json({ ok: true, translated });
  } catch (err) {
    console.error('translate xatolik:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
