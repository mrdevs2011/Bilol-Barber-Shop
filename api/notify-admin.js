// =============================================================================
// Vercel Serverless Function: /api/notify-admin
// Bron tushganda adminga Telegram orqali xabar yuborish — TO'LIQ SERVER
// TARAFIDA, tokenlar hech qachon brauzerga yuborilmaydi.
//
// Vercel loyihasida quyidagi Environment Variable'lar sozlangan bo'lishi
// SHART (Project -> Settings -> Environment Variables):
//   TELEGRAM_BOT_TOKEN        — admin bildirishnoma boti tokeni
//   TELEGRAM_CHAT_ID          — admin(lar)ning chat ID'si
//   SUPABASE_URL              — https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — Supabase Dashboard -> Settings -> API
//                               (bu kalit FAQAT shu yerda, serverda
//                               ishlatiladi — hech qachon frontend'ga
//                               chiqarilmaydi!)
//   ALLOWED_ORIGIN_UZ         — (tavsiya etiladi) https://sizning-domeningiz.uz
//   ALLOWED_ORIGIN_VERCEL     — (tavsiya etiladi) https://loyiha-nomi.vercel.app
//                               (Vercel'ning standart preview/prod domeni)
//
// HIMOYA QATLAMLARI (xavfsizlik auditidan keyin to'liq versiya):
//   1) Faqat o'z saytimizdan kelgan so'rovlar (Origin tekshiruvi)
//   2) IP-asosli tezlik cheklovi
//   3) Payload hajm cheklovi
//   4) MUHIM (audit topilmasi M-3 yopilishi): xabar faqat Supabase'da
//      HAQIQATAN mavjud bo'lgan bron (bookingId) uchun yuboriladi — bu
//      Origin sarlavhasi soxtalashtirilgan taqdirda ham, tasodifiy/soxta
//      xabarlar admin Telegramiga yetib bormasligini kafolatlaydi.
// =============================================================================

const MAX_CAPTION_LEN = 2000;
const MAX_PHOTO_BASE64_LEN = 4 * 1024 * 1024; // ~3MB rasm uchun yetarli

let webpush = null;
let vapidConfigured = false;
async function getWebPush() {
  if (webpush) return vapidConfigured ? webpush : null;
  try {
    const mod = await import('web-push');
    webpush = mod.default || mod;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@bilolbarber.uz';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidConfigured = true;
    } else {
      console.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY sozlanmagan — admin push xabarnomasi o\u2019tkazib yuborildi.');
    }
  } catch (err) {
    console.warn('web-push paketini yuklab bo\u2019lmadi:', err);
  }
  return vapidConfigured ? webpush : null;
}

/**
 * Yangi bron tushganda barcha adminning (is_admin=true) push obunalariga
 * qisqa bildirishnoma yuboradi. Telegramdan mustaqil — biri ishlamasa ham
 * ikkinchisi ishlaydi. Xatolik yuz bersa ham asosiy oqim (Telegram xabari)
 * to'xtamasligi uchun bu funksiya hech qachon exception otmaydi.
 */
async function notifyAdminPush(row) {
  const wp = await getWebPush();
  if (!wp) return;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&is_admin=eq.true`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!res.ok) return;
    const subs = await res.json();
    if (!Array.isArray(subs) || subs.length === 0) return;

    const payload = JSON.stringify({
      title: '\ud83d\udc88 Yangi bron!',
      body: `${row.client_name || 'Mijoz'} \u2014 ${row.service_name || ''} (${row.booking_date || ''} ${row.booking_time || ''})`.trim(),
      url: '/admin/today',
      tag: `booking-${row.id}`,
    });

    const staleIds = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        // 404/410 — obuna endi amal qilmaydi (mijoz brauzerdan o'chirgan,
        // ilovani o'chirgan va h.k.) — bazadan tozalaymiz.
        if (err?.statusCode === 404 || err?.statusCode === 410) staleIds.push(sub.id);
        else console.warn(`Admin push (sub ${sub.id}) yuborilmadi:`, err?.message || err);
      }
    }));

    if (staleIds.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${staleIds.join(',')})`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('notifyAdminPush xatolik:', err);
  }
}

// Oddiy xotira-ichi (in-memory) tezlik cheklovi — funksiya "issiq" turgan
// paytda ishlaydi. Serverless muhitda mukammal emas, lekin (4)-himoya bilan
// birga ishlatilgani uchun amaliy jihatdan yetarli.
const requestLog = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 daqiqa
const RATE_LIMIT_MAX = 8; // 1 daqiqada eng ko'pi bilan 8 ta so'rov

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

/**
 * Berilgan bookingId Supabase'da HAQIQATAN mavjudligini service-role kaliti
 * bilan tekshiradi (RLS'ni chetlab o'tadi, chunki bu tekshiruv o'zi
 * xavfsizlik nazorati — faqat mavjudligini bilish uchun ishlatiladi,
 * boshqa hech narsa qaytarilmaydi/o'zgartirilmaydi).
 */
async function bookingExists(bookingId) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY || !bookingId) {
    console.error(
      `bookingExists: yetishmayotgan sozlama — SUPABASE_URL=${!!SUPABASE_URL}, ` +
      `SUPABASE_SERVICE_ROLE_KEY=${!!SERVICE_KEY}, bookingId=${bookingId}`
    );
    return false;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&select=id`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '(o\'qib bo\'lmadi)');
      console.error(
        `bookingExists: Supabase javobi OK emas — status=${res.status}, body=${bodyText}`
      );
      return false;
    }
    const rows = await res.json();
    if (!(Array.isArray(rows) && rows.length === 1)) {
      console.error(`bookingExists: bron topilmadi (id=${bookingId}), qaytgan qatorlar: ${JSON.stringify(rows)}`);
    }
    return Array.isArray(rows) && rows.length === 1;
  } catch (err) {
    console.error('bookingExists tekshiruvida xatolik:', err);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // 1) Origin tekshiruvi (ALLOWED_ORIGIN_UZ va/yoki ALLOWED_ORIGIN_VERCEL
  //    sozlangan bo'lsa). Ikkalasi ham bo'sh bo'lsa — tekshiruv o'tkazib
  //    yuboriladi (masalan lokal devda), aks holda kelgan so'rov shu
  //    ikkitadan kamida bittasiga mos kelishi shart.
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

  // 2) Tezlik cheklovi
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Juda ko'p so'rov, birozdan keyin urinib ko'ring." });
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID Vercel env da sozlanmagan.');
    return res.status(500).json({ ok: false, error: 'Server tomonda Telegram sozlanmagan' });
  }

  try {
    const { caption, photoBase64, bookingId, clientName, serviceName, bookingDate, bookingTime } = req.body || {};

    if (!caption && !photoBase64) {
      return res.status(400).json({ ok: false, error: 'caption yoki photoBase64 kerak' });
    }

    // 3) Hajm cheklovi
    if (caption && caption.length > MAX_CAPTION_LEN) {
      return res.status(400).json({ ok: false, error: 'Xabar juda uzun' });
    }
    if (photoBase64 && photoBase64.length > MAX_PHOTO_BASE64_LEN) {
      return res.status(400).json({ ok: false, error: 'Rasm juda katta' });
    }

    // 4) Bron haqiqatan mavjudligini tekshirish (asosiy anti-abuse himoyasi)
    if (!bookingId) {
      return res.status(400).json({ ok: false, error: 'bookingId kerak' });
    }
    const exists = await bookingExists(bookingId);
    if (!exists) {
      console.warn(`notify-admin: mavjud bo'lmagan bookingId (${bookingId}) bilan urinish, rad etildi.`);
      return res.status(403).json({ ok: false, error: 'Bron topilmadi' });
    }

    // Push xabarnomani Telegramdan mustaqil yuboramiz — biri sekinlashsa/
    // ishlamasa ham ikkinchisiga ta'sir qilmasin (xatolik yutiladi).
    await notifyAdminPush({
      id: bookingId,
      client_name: clientName,
      service_name: serviceName,
      booking_date: bookingDate,
      booking_time: bookingTime,
    }).catch(() => {});

    // Agar rasm (bron kartasi) yuborilsa -> sendPhoto, aks holda -> sendMessage
    if (photoBase64) {
      const buffer = Buffer.from(photoBase64, 'base64');
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
      }
      form.append('photo', new Blob([buffer], { type: 'image/png' }), 'yangi-bron.png');

      const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      const result = await tgRes.json();
      return res.status(200).json(result);
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: caption, parse_mode: 'HTML' }),
    });
    const result = await tgRes.json();
    return res.status(200).json(result);
  } catch (err) {
    console.error('notify-admin xatolik:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
