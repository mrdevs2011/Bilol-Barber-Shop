// =============================================================================
// TELEGRAM WEBHOOK (Supabase Edge Function) — BEPUL
// Mijoz botga "/start b<booking_id>" yuborganda ishga tushadi:
//   1) uning chat_id'sini shu bronga (bookings.client_chat_id) yozib qo'yadi
//   2) chiroyli formatlangan tasdiqlash xabarini yuboradi
//   3) bron kartasi rasmini (saytda, brauzerda oldindan generatsiya qilib
//      Supabase Storage'ga yuklab qo'yilgan PNG) rasm sifatida yuboradi
//
// MUHIM (2-versiya): Avvalgi versiyada bu rasm serverning o'zida
// (resvg-wasm + shrift fayllari orqali) SVG'dan PNG'ga generatsiya
// qilinardi. Amalda production'da shriftlar noto'g'ri yuklanib, matnsiz
// (bo'sh) karta chiqib qolish muammosi kuzatildi. Shu sabab bu yondashuv
// butunlay olib tashlandi — endi rasm brauzerning o'zida (js/api.js,
// haqiqiy tizim shriftlari bilan) tayyor PNG holida generatsiya qilinadi
// va bron yaratilgan zahoti Supabase Storage'dagi "tickets" bucket'iga
// `booking-<id>.png` nomi bilan yuklanadi. Bu funksiya endi shunchaki
// o'sha tayyor faylni Storage'dan o'qib, Telegram'ga jo'natadi — hech
// qanday shrift/rendering muammosi yo'q.
//
// MUHIM (3-versiya — XAVFSIZLIK TUZATISHI): bu funksiya "--no-verify-jwt"
// bilan deploy qilinadi (Telegram Supabase JWT yubormagani uchun bu
// SHART), lekin bu degani — bu manzil butunlay OCHIQ, ya'ni Telegramdan
// tashqari HAR QANDAY odam shu URL'ga to'g'ridan-to'g'ri soxta so'rov
// yuborib, o'zini Telegram update yuborayotgandek ko'rsatishi mumkin edi.
// Bunday holatda ular ixtiyoriy booking_id ("/start b1", "/start b2", ...
// deb ketma-ket sanab) uchun client_chat_id'ni O'ZINING chat_id'siga
// yozdirib, o'sha bronning to'liq ma'lumotini (mijoz ismi, telefoni,
// narxi, vaqti) va undan keyingi eslatma xabarini o'ziga oldirib olishi
// mumkin edi (IDOR / shaxsiy ma'lumot sizib chiqishi).
//
// YECHIM: Telegram webhook o'rnatilganda "secret_token" beriladi (pastga
// qarang), Telegram esa har bir so'rovda shu tokenni
// "X-Telegram-Bot-Api-Secret-Token" header'ida yuboradi. Bu funksiya endi
// har bir so'rovda shu header'ni serverda saqlangan qiymat bilan
// solishtiradi — mos kelmasa (yoki umuman yo'q bo'lsa) so'rov 401 bilan
// rad etiladi va bronlarga hech qanday yozuv/o'qish amalga oshmaydi.
//
// Joylashtirish:
//   1) Supabase Dashboard -> Edge Functions -> telegram-webhook ->
//      Secrets bo'limiga TELEGRAM_WEBHOOK_SECRET nomi bilan tasodifiy,
//      uzun (masalan 32+ belgili) qiymat qo'shing:
//        supabase secrets set TELEGRAM_WEBHOOK_SECRET=<tasodifiy_uzun_qator>
//   2) supabase functions deploy telegram-webhook --no-verify-jwt
//   3) Telegramga webhookni O'SHA SECRET bilan qayta o'rnating (bitta marta,
//      brauzer manzil satrida yoki curl bilan):
//        https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<FUNKSIYA_URL>&secret_token=<TELEGRAM_WEBHOOK_SECRET>
//      MUHIM: bu yerdagi <TELEGRAM_WEBHOOK_SECRET> 1-qadamda qo'ygan
//      qiymat bilan AYNAN bir xil bo'lishi kerak.
// =============================================================================

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_REMINDER_BOT_TOKEN")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;

// -----------------------------------------------------------------------------
// TIL (uz/ru) — mijoz saytda tanlagan til sql/PATCH_round16_client_lang.sql
// orqali bookings.client_lang ustunida saqlanadi. Bu funksiya o'sha ustunni
// o'qib, mijozga aynan o'sha tilda javob yozadi (rus mijoz — faqat ruscha,
// o'zbek mijoz — faqat o'zbekcha; ikkalasi hech qachon aralashmaydi).
// -----------------------------------------------------------------------------
type Lang = "uz" | "ru";

function pickLang(value: unknown): Lang {
  return value === "ru" ? "ru" : "uz";
}

const STR = {
  uz: {
    notFound: "Bron topilmadi yoki xatolik yuz berdi. Iltimos, saytdan qaytadan urinib ko'ring.",
    linkedNoData: "✅ Rahmat! Bron bog'landi, lekin ma'lumotlarini o'qib bo'lmadi.",
    title: "🎉 <b>Bron tasdiqlandi!</b>",
    service: "✂️ <b>Xizmat:</b>",
    barber: "🧑‍🦱 <b>Barber:</b>",
    date: "📅 <b>Sana:</b>",
    time: "⏰ <b>Vaqt:</b>",
    duration: "⏱ <b>Davomiyligi:</b>",
    durationUnit: "daqiqa",
    price: "💰 <b>Narx:</b>",
    currency: "so'm",
    footer: "Navbatingizdan ~2 soat oldin shu yerga avtomatik eslatma yuboramiz. Kutib qolamiz! 💈",
  },
  ru: {
    notFound: "Запись не найдена или произошла ошибка. Пожалуйста, попробуйте ещё раз на сайте.",
    linkedNoData: "✅ Спасибо! Запись привязана, но не удалось прочитать данные.",
    title: "🎉 <b>Запись подтверждена!</b>",
    service: "✂️ <b>Услуга:</b>",
    barber: "🧑‍🦱 <b>Барбер:</b>",
    date: "📅 <b>Дата:</b>",
    time: "⏰ <b>Время:</b>",
    duration: "⏱ <b>Длительность:</b>",
    durationUnit: "мин.",
    price: "💰 <b>Цена:</b>",
    currency: "сум",
    footer: "Отправим автоматическое напоминание сюда примерно за 2 часа до вашей записи. Ждём вас! 💈",
  },
} as const;

// -----------------------------------------------------------------------------
// Telegramga yuborish
// -----------------------------------------------------------------------------
async function sendTelegramText(chatId: number, html: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
  });
}

async function sendTelegramPhoto(chatId: number, png: Uint8Array, caption: string) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("photo", new Blob([png], { type: "image/png" }), "bron-kartasi.png");
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Telegram sendPhoto xatoligi: ${await res.text()}`);
  }
}

// -----------------------------------------------------------------------------
// Bron uchun oldindan brauzerda generatsiya qilingan karta rasmini
// Supabase Storage'dan (ommaviy "tickets" bucket) o'qiydi.
// -----------------------------------------------------------------------------
async function fetchTicketPng(bookingId: string): Promise<Uint8Array | null> {
  // MUHIM: "tickets" bucket endi PRIVATE (sql/storage_tickets.sql xavfsizlik
  // tuzatishidan keyin) — shuning uchun ommaviy /object/public/... manzili
  // endi ishlamaydi (403/404 qaytaradi). Bu funksiya SB_SERVICE_ROLE_KEY'ga
  // ega bo'lgani uchun, authenticated /object/... endpointidan (RLS'ni
  // chetlab o'tadigan service-role so'rovi bilan) o'qiymiz.
  const url = `${SB_URL}/storage/v1/object/tickets/booking-${bookingId}.png`;
  const res = await fetch(url, {
    headers: {
      apikey: SB_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// -----------------------------------------------------------------------------
// Rasm Telegramga muvaffaqiyatli yuborilgandan keyin Storage'dan o'chiramiz —
// endi kerak emas (boshqa hech qayerda ishlatilmaydi), shuning uchun bepul
// 1 GB fayl limitini bekorga band qilib turmasin.
// -----------------------------------------------------------------------------
async function deleteTicketPng(bookingId: string) {
  try {
    const url = `${SB_URL}/storage/v1/object/tickets/booking-${bookingId}.png`;
    await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: SB_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
      },
    });
  } catch (delErr) {
    // O'chira olmasak ham muhim emas — keyingi tozalashda yoki qo'lda
    // olib tashlanadi, mijozga hech qanday ta'sir qilmaydi.
    console.error("Ticket rasmini o'chirishda xatolik:", delErr);
  }
}

// -----------------------------------------------------------------------------
// Asosiy handler
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    // XAVFSIZLIK: bu so'rov haqiqatan Telegramdan kelayotganini tasdiqlaymiz
    // (yuqoridagi 3-versiya izohiga qarang). Header mos kelmasa — hech
    // qanday bron o'qilmaydi/yozilmaydi, darhol rad etamiz.
    const incomingSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 401 });
    }

    const update = await req.json();
    const message = update.message;
    if (!message || !message.text) {
      return new Response("ok");
    }

    const chatId = message.chat.id;
    const text: string = message.text.trim();

    const match = text.match(/^\/start\s+b(\d+)/);
    if (!match) {
      return new Response("ok");
    }
    const bookingId = match[1];

    // 1) chat_id'ni bronga yozamiz
    const updateRes = await fetch(`${SB_URL}/rest/v1/bookings?id=eq.${bookingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ client_chat_id: chatId }),
    });

    if (!updateRes.ok) {
      // Bu bosqichda hali bookings.client_lang'ni o'qiy olmadik — sukut
      // bo'yicha o'zbekcha xabar (bron umuman topilmagani uchun bu holatda
      // farqi kam, lekin baribir aniqlik uchun UZ qoldirildi).
      await sendTelegramText(chatId, STR.uz.notFound);
      return new Response("ok");
    }

    // 2) bronning to'liq ma'lumotini olamiz (matn uchun) — client_lang ham
    //    shu yerda olinadi, shunga qarab javob tili tanlanadi.
    const getRes = await fetch(
      `${SB_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,service_name,master_name,booking_date,booking_time,client_name,client_phone,price,duration,client_lang`,
      {
        headers: {
          apikey: SB_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
        },
      },
    );
    const rows = await getRes.json();
    const b = rows?.[0];
    const lang = pickLang(b?.client_lang);
    const s = STR[lang];

    if (!b) {
      await sendTelegramText(chatId, s.linkedNoData);
      return new Response("ok");
    }

    const priceFmt = Number(b.price).toLocaleString("uz-UZ") + " " + s.currency;
    const caption =
      `${s.title}\n\n` +
      `${s.service} ${b.service_name}\n` +
      `${s.barber} ${b.master_name}\n` +
      `${s.date} ${b.booking_date}\n` +
      `${s.time} ${b.booking_time}\n` +
      `${s.duration} ${b.duration} ${s.durationUnit}\n` +
      `${s.price} ${priceFmt}\n\n` +
      `${s.footer}`;

    // 3) oldindan brauzerda tayyorlangan karta rasmini Storage'dan olib
    //    yuboramiz. Topilmasa (masalan juda eski bron, rasm hali yo'q
    //    paytda yaratilgan bo'lsa) — mijoz hech bo'lmasa matnli tasdiqni oladi.
    const png = await fetchTicketPng(bookingId);
    if (png) {
      try {
        await sendTelegramPhoto(chatId, png, caption);
        // Muvaffaqiyatli yuborildi — Storage'dagi nusxa endi kerak emas.
        await deleteTicketPng(bookingId);
      } catch (photoErr) {
        console.error("Karta rasmini yuborishda xatolik:", photoErr);
        await sendTelegramText(chatId, caption);
        // Yuborishda xatolik bo'ldi — faylni saqlab qolamiz, keyingi
        // urinishda (mijoz botga qayta /start yozganda) yana kerak bo'ladi.
      }
    } else {
      await sendTelegramText(chatId, caption);
    }

    return new Response("ok");
  } catch (err) {
    console.error(err);
    return new Response("ok");
  }
});
