import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { t, getLang, translateServerError } from './i18n.js';
import { SERVICES, MASTERS, pickLang } from './data.js';

// MUHIM: mijozga ko'rsatishga tayyor (allaqachon joriy tilga tarjima
// qilingan) xabarlar uchun ishlatiladi. `.friendly = true` belgisi
// booking.js'ga bu xabarni QAYTA umumiy "Xatolik yuz berdi: ..." qobig'iga
// o'ramasdan, to'g'ridan-to'g'ri ko'rsatish kerakligini bildiradi — avval
// buning uchun matn ichidan "iltimos"/"пожалуйста" so'zini qidiruvchi
// mo'rt (fragile) regex ishlatilardi, endi aniq flag orqali tekshiriladi.
function friendlyError(message) {
  const err = new Error(message);
  err.friendly = true;
  return err;
}

// MOBIL QURILMALARDA KO'PROQ UCHRAYDIGAN 2 XATOLIK TURINI ANIQLASH:
//
//  1) Tarmoq uzilishi (Wi-Fi <-> mobil internet almashishi, signal
//     yo'qolishi) — brauzer fetch() so'zsiz "Failed to fetch" yoki
//     "NetworkError" turidagi texnik xato tashlaydi.
//  2) Sessiya muddati tugashi — mobil brauzerlar sahifa fon rejimida
//     (boshqa ilovaga o'tilganda) uzoq turib qolsa uni "muzlatib" qo'yadi,
//     shu payt Supabase avtomatik token yangilanmaydi; mijoz qaytib kelib
//     "Bron qilish"ni bossa, eskirgan token bilan so'rov ketadi va server
//     "JWT expired" / "invalid claim" kabi texnik xato qaytaradi.
//
// Ikkalasi ham avval umumiy "server xatoligi" ostida yashiringan edi —
// endi aniq, mijozga tushunarli va TO'G'RI harakatga chaqiruvchi (sahifani
// yangilash / internetni tekshirish) xabar bilan almashtiriladi.
function classifyUnexpectedError(err) {
  const msg = String(err?.message || err || '');
  if (/failed to fetch|network ?error|load failed|ERR_INTERNET|ERR_NETWORK/i.test(msg)) {
    return friendlyError(t('err.networkMobile'));
  }
  if (/jwt|token is expired|invalid claim|session.*(expired|missing)|refresh_token/i.test(msg)) {
    return friendlyError(t('err.sessionExpired'));
  }
  return null; // tanib bo'lmadi — chaqiruvchi tomon o'zining odatiy (generic) xabarini ko'rsatadi
}

let supabaseClient = null;

export function initSupabase() {
  try {
    if (window.supabase && SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
      // MUHIM: mijoz (telefon+parol) sessiyasi endi shu yerda saqlanadi
      // (persistSession: true), lekin ALOHIDA storageKey bilan — shu sabab
      // admin panel (/admin, o'zining "bilolbarber-admin-auth" kaliti bilan)
      // sessiyasi bilan HECH QACHON aralashmaydi, ikkalasi bir xil brauzerda
      // yonma-yon ishlasa ham.
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storageKey: 'bilolbarber-client-auth',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
    }
  } catch (e) {
    console.warn('Supabase init xatosi:', e);
  }
  return supabaseClient;
}

/** Boshqa modullar (masalan js/auth.js) shu yerda yaratilgan bitta
 * supabase clientdan foydalanishi uchun. */
export function getSupabaseClient() {
  return supabaseClient;
}

/**
 * Bron kartasi (ticket) dizaynini SVG sifatida chizamiz. Ikkita variant bor:
 * 'admin' — yangi bron haqida admin botiga ketadigan xabar uchun, va
 * 'client' — mijozning o'z eslatma botiga (telegram-webhook orqali)
 * ketadigan tasdiqlash kartasi uchun. Ikkalasi ham shu yerda, brauzerda
 * (haqiqiy tizim shriftlari bilan) generatsiya qilinadi — bu Telegram'ga
 * yuboriladigan yagona rendering nuqtasi, shu sabab har doim ishonchli.
 */
function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTicketSvg(row, variant = 'admin') {
  const code = row.id ? `B${String(row.id).padStart(4, '0')}` : '—';
  const isClient = variant === 'client';

  // MUHIM (tillar sizib chiqmasligi uchun): admin botiga ketadigan karta har
  // doim o'zbek tilida qoladi (do'kon egasi uchun ichki bot), lekin MIJOZGA
  // ketadigan karta endi mijoz saytda tanlagan tilda (uz/ru) chiziladi —
  // t() joriy tilni ishlatadi. Admin variantida t() UZ lug'atiga tushib
  // qoladi, chunki setLang() faqat mijoz brauzerida chaqirilgan bo'ladi va
  // getLang() o'sha yerdagi localStorage qiymatini o'qiydi.
  const currency = isClient ? t('currency.sum') : 'so\u2019m';
  const priceFmt = Number(row.price).toLocaleString('uz-UZ') + ' ' + currency;
  const W = 720, H = 420;

  const line = (label, value, y) => `
    <text x="48" y="${y}" font-family="Manrope" font-size="20" fill="#9fbfae">${escapeXml(label)}</text>
    <text x="${W - 48}" y="${y}" text-anchor="end" font-family="Manrope" font-size="22" font-weight="bold" fill="#ffffff">${escapeXml(value)}</text>`;

  const headerLabel = isClient ? t('ticket.confirmedLabel').toUpperCase() : 'YANGI BRON';
  const codeLabel = isClient ? t('ticket.codeLabel') : 'Bron kodi';
  const dateLabel = isClient ? t('ticket.dateLabel') : 'Sana';
  const timeLabel = isClient ? t('ticket.timeLabel') : 'Vaqt';
  const clientLabel = isClient ? t('ticket.clientLabel') : 'Mijoz';
  const phoneLabel = isClient ? t('ticket.phoneLabel') : 'Telefon';
  const barberPrefix = isClient ? t('ticket.barberPrefix') : 'Barber';
  const minutesWord = isClient ? t('services.minutes') : 'daqiqa';
  const stampText = isClient ? t('ticket.confirmedStamp').toUpperCase() + ' \u2713' : '';

  const stamp = isClient
    ? `<g transform="translate(${W - 190},30)">
      <rect x="0" y="0" width="150" height="46" rx="23" fill="none" stroke="#d4af37" stroke-width="2" transform="rotate(-8)"/>
      <text x="75" y="29" text-anchor="middle" font-family="Manrope" font-size="15" fill="#d4af37" transform="rotate(-8)">${escapeXml(stampText)}</text>
    </g>`
    : '';

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <g>
    <rect x="0" y="0" width="${W}" height="${H}" rx="24" ry="24" fill="#0b3d2e" stroke="#d4af37" stroke-width="4"/>
    <circle cx="0" cy="${H / 2}" r="22" fill="#1a1a1a"/>
    <circle cx="${W}" cy="${H / 2}" r="22" fill="#1a1a1a"/>

    <text x="48" y="56" font-family="Manrope" font-size="16" letter-spacing="2" fill="#d4af37">${escapeXml(headerLabel)}</text>
    ${stamp}

    <text x="48" y="118" font-family="Playfair Display" font-size="34" font-weight="bold" fill="#ffffff">${escapeXml(row.service_name)}</text>
    <text x="48" y="150" font-family="Manrope" font-size="20" fill="#9fbfae">${escapeXml(barberPrefix)}: ${escapeXml(row.master_name)}</text>

    <line x1="48" y1="178" x2="${W - 48}" y2="178" stroke="#d4af37" stroke-opacity="0.5" stroke-width="1"/>

    ${line(codeLabel, code, 216)}
    ${line(dateLabel, row.booking_date, 254)}
    ${line(timeLabel, row.booking_time, 292)}
    ${line(clientLabel, row.client_name || '—', 330)}
    ${line(phoneLabel, row.client_phone || '—', 368)}

    <text x="48" y="${H - 26}" font-family="Manrope" font-size="18" fill="#9fbfae">${row.duration} ${escapeXml(minutesWord)}</text>
    <text x="${W - 48}" y="${H - 24}" text-anchor="end" font-family="Playfair Display" font-size="28" font-weight="bold" fill="#d4af37">${priceFmt}</text>
  </g>
</svg>`;
}

/**
 * SVG matnini brauzerning o'zida (Image + <canvas>) PNG Blob'ga aylantiradi.
 * Serverga yoki CLI'ga hech qanday bog'liqlik yo'q — hammasi mijoz
 * brauzerida, bron yuborilgan zahoti bajariladi.
 */
function svgToPngBlob(svg, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        const scale = 2; // Telegram'da aniqroq ko'rinishi uchun 2x
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob); else reject(new Error("canvas.toBlob bo'sh natija qaytardi"));
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG'ni rasm sifatida yuklab bo'lmadi"));
    };
    img.src = url;
  });
}

/**
 * Mijoz kartasi rasmini brauzerda generatsiya qilib, Supabase Storage'dagi
 * ommaviy "tickets" bucket'iga `booking-<id>.png` nomi bilan yuklaydi.
 * Mijoz keyinroq Telegram eslatma botiga "/start" bossa, telegram-webhook
 * Edge Function shu faylni o'qib, rasm sifatida yuboradi — serverning o'zi
 * endi hech qanday rendering qilmaydi (avvalgi resvg-wasm/shrift muammosi
 * shu sabab butunlay bartaraf etildi).
 */
function showTicketDebug(msg) {
  // Konsolga chiqarish bilan bir qatorda, sahifaning o'ziga ham (ko'rinadigan
  // qizil qutichaga) yozamiz — chunki telefonda DevTools konsoliga kirish
  // qiyin, shu sabab xatoni ekranda ko'rsatib, screenshot olish osonroq.
  console.warn(msg);
  const el = document.getElementById('ticketDebug');
  if (el) {
    el.textContent = '⚠️ Ticket debug: ' + msg;
    el.classList.remove('hidden');
  }
}

/**
 * `bookings.service_name`/`master_name` bazada har doim o'zbek tilida
 * saqlanadi (chunki xuddi shu `row` admin Telegram botiga ham ketadi —
 * uning shabloni har doim uz). Lekin MIJOZGA ko'rsatiladigan chiptada nom
 * mijoz saytda tanlagan tilda bo'lishi kerak — shu sabab faqat chipta
 * uchun joriy katalogdan (SERVICES/MASTERS) tarjima qilingan nusxa yasaymiz.
 * Xizmat/xodim keyinchalik o'chirilgan/nofaol bo'lsa — bazadagi asl (uz)
 * nomga qaytamiz, chipta hech qachon bo'sh joy ko'rsatmasin.
 */
function localizeRowForClient(row) {
  const svc = SERVICES.find(s => s.id === row.service_id);
  const mst = MASTERS.find(m => m.id === row.master_id);
  return {
    ...row,
    service_name: svc ? pickLang(svc.name, svc.name_ru) : row.service_name,
    master_name: mst ? pickLang(mst.name, mst.name_ru) : row.master_name,
  };
}

async function uploadClientTicket(row) {
  if (!supabaseClient || !row.id) return;
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const svg = buildTicketSvg(localizeRowForClient(row), 'client');
    const blob = await svgToPngBlob(svg, 720, 420);
    const { error } = await supabaseClient.storage
      .from('tickets')
      .upload(`booking-${row.id}.png`, blob, { contentType: 'image/png', upsert: true });
    if (error) {
      showTicketDebug(`Storage yuklash xatoligi (booking-${row.id}.png): ${error.message}`);
    }
  } catch (err) {
    showTicketDebug(`Rasm generatsiya xatoligi (booking-${row.id}): ${err?.message || err}`);
  }
}

/**
 * Blob'ni base64 stringga aylantiradi (serverless function'ga yuborish uchun).
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // "data:image/png;base64,XXXX" -> faqat "XXXX" qismini olamiz
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Adminga bron haqida (bron kartasi rasmi bilan birga) xabar yuboradi.
 * MUHIM: Telegram tokeni bu yerda YO'Q — chaqiruv o'zimizning
 * /api/notify-admin serverless function'iga yuboriladi, u yerda token
 * Vercel Environment Variable orqali xavfsiz saqlanadi.
 */
/**
 * Telegram parse_mode:'HTML' xabarlari uchun oddiy HTML-escape. Mijoz
 * kiritgan ism/telefon kabi qiymatlarda "&", "<", ">" belgilari bo'lsa,
 * escape qilinmasa Telegram butun xabarni "can't parse entities" xatosi
 * bilan rad etib, admin o'sha bron haqida HECH QANDAY bildirishnoma
 * olmay qolar edi (audit round-2, #10).
 */
function escapeTelegramHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Sekin yoki javob qaytarmayotgan tarmoq/serverless funksiyasi butun bron
// jarayonini (va shu bilan modal X / Orqaga tugmalarini) noaniq vaqtga
// bloklab qo'ymasligi uchun — har bir tashqi so'rovga qattiq vaqt chegarasi
// qo'yamiz (audit: X/Orqaga tugmalari "ishlamay qolishi" shu tufayli edi).
const NOTIFY_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function notifyTelegram(row) {
  const caption =
    `💈 <b>YANGI BRON!</b>\n\n` +
    `👤 <b>Mijoz:</b> ${escapeTelegramHtml(row.client_name)}\n` +
    `📞 <b>Telefon:</b> ${escapeTelegramHtml(row.client_phone)}\n` +
    `✂️ <b>Xizmat:</b> ${escapeTelegramHtml(row.service_name)}\n` +
    `🧑‍🦱 <b>Barber:</b> ${escapeTelegramHtml(row.master_name)}\n` +
    `📅 <b>Sana:</b> ${escapeTelegramHtml(row.booking_date)} ${escapeTelegramHtml(row.booking_time)}\n` +
    `💰 <b>Narx:</b> ${Number(row.price).toLocaleString('uz-UZ')} so'm\n` +
    `⏱ <b>Davomiyligi:</b> ${row.duration} daqiqa`;

  // Avval bron kartasi rasmini generatsiya qilishga urinamiz (caption shu
  // rasmning tagiga yoziladi). Muvaffaqiyatsiz bo'lsa (masalan juda eski
  // brauzer), oddiy matnli xabarga tushamiz — mijoz ma'lumoti hech qachon
  // yo'qolmasligi kerak.
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const svg = buildTicketSvg(row, 'admin');
    const blob = await svgToPngBlob(svg, 720, 420);
    const photoBase64 = await blobToBase64(blob);

    const res = await fetchWithTimeout('/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, photoBase64, bookingId: row.id }),
    }, NOTIFY_TIMEOUT_MS);
    const result = await res.json();
    if (!result.ok) {
      console.warn('Telegram rasm yuborilmadi, matnga tushyapmiz:', result.description || result.error);
      await notifyTelegramTextOnly(caption, row.id);
    }
  } catch (err) {
    console.warn('Bron kartasi rasmini generatsiya qilishda xatolik, matnga tushyapmiz:', err);
    await notifyTelegramTextOnly(caption, row.id);
  }
}

async function notifyTelegramTextOnly(text, bookingId) {
  try {
    const res = await fetchWithTimeout('/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: text, bookingId }),
    }, NOTIFY_TIMEOUT_MS);
    const result = await res.json();
    if (!result.ok) console.warn('Telegram xabari yuborilmadi:', result.description || result.error);
  } catch (err) {
    console.warn("Serverless funksiya bilan bog'lanishda xatolik:", err);
  }
}

/**
 * Mijoz "Mening bronlarim" bo'limidan o'z bronini bekor qilganda admin
 * botiga xabar yuboradi (rasm shart emas — oddiy matnli xabar kifoya).
 */
export async function notifyBookingCancelled(row) {
  const caption =
    `❌ <b>BRON BEKOR QILINDI</b>\n\n` +
    `👤 <b>Mijoz:</b> ${escapeTelegramHtml(row.client_name)}\n` +
    `📞 <b>Telefon:</b> ${escapeTelegramHtml(row.client_phone)}\n` +
    `✂️ <b>Xizmat:</b> ${escapeTelegramHtml(row.service_name)}\n` +
    `🧑‍🦱 <b>Barber:</b> ${escapeTelegramHtml(row.master_name)}\n` +
    `📅 <b>Sana:</b> ${escapeTelegramHtml(row.booking_date)} ${escapeTelegramHtml(row.booking_time)}\n` +
    `💰 <b>Narx:</b> ${Number(row.price).toLocaleString('uz-UZ')} so'm\n\n` +
    `<i>Mijoz shaxsiy kabinetidan o'zi bekor qildi.</i>`;
  await notifyTelegramTextOnly(caption, row.id);
}

/**
 * Berilgan usta va sana uchun band bo'lgan vaqtlarni Supabase'dan
 * (xavfsiz `booked_slots` view orqali) o'qib keladi.
 * MUHIM (audit round-2, #8): endi faqat boshlanish vaqtini emas, har bir
 * bronning `duration`sini ham qaytaradi — chaqiruvchi tomon (js/booking.js)
 * shu orqali xizmat davomiyligi tufayli kesishadigan slotlarni ham "band"
 * deb belgilay oladi (masalan 10:00dagi 50 daqiqalik bron 10:30ni ham
 * band qiladi). Haqiqiy, kafolatlangan himoya baribir bazadagi
 * on_booking_no_overlap trigger'da — bu yerdagi hisob-kitob faqat
 * foydalanuvchi tajribasi (UX) uchun, optimistik.
 * @returns {Promise<{time: string, duration: number}[]>}
 */
export async function fetchBookedSlots(masterId, date) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('booked_slots')
    .select('booking_time, duration')
    .eq('master_id', masterId)
    .eq('booking_date', date);

  if (error) {
    console.warn("Band vaqtlarni o'qishda xatolik:", error.message);
    return [];
  }
  return data.map(r => ({ time: r.booking_time, duration: r.duration }));
}

/**
 * Berilgan usta va sana uchun "dam olish/bandlik" yozuvlarini o'qiydi
 * (sql/PATCH_round7_master_time_off.sql — admin panelda qo'shiladi).
 * `start_time`/`end_time` null bo'lsa — butun kun band degani.
 * @returns {Promise<{start_time: string|null, end_time: string|null, reason: string|null}[]>}
 */
export async function fetchMasterTimeOff(masterId, date) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('master_time_off')
    .select('start_time, end_time, reason')
    .eq('master_id', masterId)
    .eq('off_date', date);

  if (error) {
    console.warn("Bandlik kunlarini o'qishda xatolik:", error.message);
    return [];
  }
  return data;
}

/**
 * Bron ma'lumotlarini Supabase 'bookings' jadvaliga saqlaydi
 * (README/config.js'dagi SQL sxema bilan bir xil jadval va ustun nomlari).
 * @param {object} payload - { service, master, date, time, name, phone }
 */
export async function submitBookingToBackend({ service, master, date, time, name, phone }) {
  const row = {
    service_id: service.id,
    service_name: service.name,
    master_id: master.id,
    master_name: master.name,
    booking_date: date,
    booking_time: time,
    client_name: name,
    client_phone: phone,
    price: service.price,
    duration: service.duration,
  };

  if (!supabaseClient) {
    console.warn("Supabase ulanmagan (demo rejim). Ma'lumotlar faqat konsolga chiqarildi:", row);
    await notifyTelegram(row);
    return row;
  }

  // Bron endi faqat login qilgan mijozga tegishli bo'ladi (RLS shuni talab
  // qiladi — sql/auth_and_noshow.sql'ga qarang). js/booking.js har doim
  // login qilingandan keyingina shu funksiyani chaqiradi, shuning uchun
  // bu yerda sessiya bo'lishi kerak; bo'lmasa aniq xabar bilan to'xtaymiz.
  //
  // MUHIM (mobil qurilmalar): bu yerdan boshlab try/catch bilan o'raymiz —
  // agar ilova uzoq vaqt fon rejimida turgach mijoz qaytib kelsa (tarmoq
  // uzilgan yoki token eskirgan bo'lishi mumkin), supabase-js xom texnik
  // xato ("Failed to fetch", "JWT expired" va h.k.) tashlab yuborishi
  // mumkin — buni aniqlab, mijozga TO'G'RI (harakatga chaqiruvchi) xabar
  // ko'rsatamiz, "server xatoligi" degan tushunarsiz umumiy matn o'rniga.
  let user;
  try {
    const authResult = await supabaseClient.auth.getUser();
    user = authResult.data.user;
  } catch (err) {
    const classified = classifyUnexpectedError(err);
    if (classified) throw classified;
    throw err;
  }
  if (!user) {
    throw friendlyError(t('err.bookLoginRequired'));
  }
  row.user_id = user.id;

  // MUHIM (til sizib chiqmasligi uchun): mijoz saytda tanlagan tilni
  // ('uz'/'ru') bronga yozib qo'yamiz — backend (telegram-webhook,
  // send-reminders Edge Function'lari) shu ustunni o'qib, mijozga aynan
  // o'sha tilda javob yozadi. sql/PATCH_round16_client_lang.sql'ni
  // ishlatmasdan turib bu ustun mavjud bo'lmasa, insert xato beradi —
  // shu patch albatta ishga tushirilishi kerak.
  row.client_lang = getLang();

  let inserted, error;
  try {
    const insertResult = await supabaseClient.from('bookings').insert([row]).select('id').single();
    inserted = insertResult.data;
    error = insertResult.error;
  } catch (err) {
    const classified = classifyUnexpectedError(err);
    if (classified) throw classified;
    throw err;
  }
  if (error) {
    // Postgres unique constraint xatosi (kod 23505) — demak shu vaqtga
    // ayni damda boshqa kimdir ulgurib bron qilib qo'ygan.
    if (error.code === '23505') {
      throw friendlyError(t('err.slotTaken'));
    }
    if (error.code === '42501') {
      throw friendlyError(t('err.accountBlocked'));
    }
    // MUHIM (til sizib chiqmasligi): validate_booking_against_catalog va
    // shunga o'xshash trigger'lar xatoni har doim o'zbek tilida
    // qaytaradi — shu matnni xom holda ko'rsatish o'rniga, avval joriy
    // tilga tarjima qilishga urinamiz; tanib bo'lmasa xom matnni umuman
    // ko'rsatmaymiz (faqat konsolga yozamiz), o'rniga umumiy tarjima
    // qilingan xabar chiqadi.
    const translated = translateServerError(error.message);
    if (translated) throw friendlyError(translated);
    // Tarjima qilinmadi — tarmoq/sessiya muammosi bo'lishi mumkinmi,
    // oxirgi marta shuni tekshiramiz, faqat shundan keyin generic'ga tushamiz.
    const classified = classifyUnexpectedError(error);
    if (classified) throw classified;
    console.error('Kutilmagan Supabase xatoligi (tarjima qilinmadi):', error.message);
    throw friendlyError(t('booking.errGeneric') + '. ' + t('booking.errRetry'));
  }

  // MUHIM (audit: "X va Orqaga tugmalari ishlamayapti" xatosi): bron
  // haqiqatda shu paytda ALLAQACHON bazaga yozilgan va tasdiqlangan.
  // Quyidagi ikkita chaqiruv (admin uchun Telegram xabari + mijoz chiptasi
  // rasmini saqlash) esa faqat qo'shimcha, kritik bo'lmagan orqa fon
  // ishlari — ularni `await` qilib turish esa booking.js'dagi
  // `isSubmitting` bayrog'ini keraksiz uzoq vaqt "true" holatda ushlab
  // turardi va shu bilan modal X / Orqaga tugmalarini bloklab qo'yardi
  // (ayniqsa sekin internet yoki Telegram/serverless funksiya kechikkanda,
  // 10-30+ soniyaga cho'zilishi mumkin edi). Endi bular fonda, natijani
  // kutmasdan ishga tushiriladi — xatolik bo'lsa ham (masalan tarmoq
  // uzilsa) faqat konsolga yoziladi, mijozga ko'rinadigan UI hech qachon
  // bloklanib qolmaydi.
  notifyTelegram({ ...row, id: inserted?.id }).catch(err => console.warn('notifyTelegram xatoligi:', err));
  uploadClientTicket({ ...row, id: inserted?.id }).catch(err => console.warn('uploadClientTicket xatoligi:', err));

  // Chaqiruvchi tomonga bron id'sini ham qaytaramiz — bu Telegram eslatma
  // botiga chuqur havola (deep link) yasash uchun kerak bo'ladi
  // (masalan https://t.me/BOT?start=b123).
  return { ...row, id: inserted?.id };
    }
