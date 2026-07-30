// =============================================================================
// SEND-REMINDERS (Supabase Edge Function) — BEPUL, KO'P BOSQICHLI ESLATMA
//
// Navbat vaqti yaqinlashgan sari mijozga matnli eslatma yuboriladi:
//   2 soat qolganda    -> matnli xabar
//   1 soat qolganda    -> matnli xabar
//   30 daqiqa qolganda -> matnli xabar
//   10 daqiqa qolganda -> matnli xabar
// Har bir bosqich FAQAT BIR MARTA yuboriladi (bookings.reminder_stage
// ustunida kuzatiladi), shuning uchun mijoz spam bilan bezovta qilinmaydi.
//
// ESLATMA: Avvalgi versiyada 2-soat va 10-daqiqalik bosqichlar Microsoft
// Edge'ning norasmiy (reverse-engineered) TTS xizmati orqali OVOZLI xabar
// sifatida yuborilardi. Bu xizmat beqaror bo'lib chiqdi (WebSocket ulanishi
// muvaffaqiyatsiz bo'lganda funksiya bajarilish limitidan oshib ketib,
// butun cron tsikli o'chib qolar, natijada 2-soatlik eslatma umuman
// yetib bormas edi). Shu sabab TTS butunlay olib tashlandi — endi barcha
// bosqichlar sodda va ishonchli matnli xabar sifatida yuboriladi.
//
// Bu funksiyani sql/reminders.sql dagi pg_cron job har 5 daqiqada
// (HTTP POST orqali) chaqiradi — shuning uchun bu funksiya o'zi jadval
// bo'yicha ishlamaydi, faqat chaqirilganda bir marta ishlaydi.
//
// Joylashtirish (deploy):
//   supabase secrets set TELEGRAM_REMINDER_BOT_TOKEN=<bot_token>
//   supabase secrets set SB_URL=https://<PROJECT_REF>.supabase.co
//   supabase secrets set SB_SERVICE_ROLE_KEY=<service_role kaliti>
//   supabase functions deploy send-reminders --no-verify-jwt
// =============================================================================

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_REMINDER_BOT_TOKEN")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

// -----------------------------------------------------------------------------
// TIL (uz/ru) — sql/PATCH_round16_client_lang.sql orqali bookings.client_lang
// ustunida saqlangan, mijoz saytda tanlagan til. Rus mijozga faqat ruscha,
// o'zbek mijozga faqat o'zbekcha eslatma yuboriladi.
// -----------------------------------------------------------------------------
type Lang = "uz" | "ru";

function pickLang(value: unknown): Lang {
  return value === "ru" ? "ru" : "uz";
}

const STR = {
  uz: {
    minuteWord: "daqiqa",
    hourWord: "soat",
    title: "⏰ <b>Eslatma!</b>",
    body: (whenPhrase: string, time: string) =>
      `${whenPhrase}dan keyin (soat <b>${time}</b>) Bilol Barber'da navbatingiz bor.`,
    service: "✂️ <b>Xizmat:</b>",
    barber: "🧑‍🦱 <b>Barber:</b>",
    footer: "Kutib qolamiz! 💈",
  },
  ru: {
    minuteWord: "мин.",
    hourWord: "ч.",
    title: "⏰ <b>Напоминание!</b>",
    body: (whenPhrase: string, time: string) =>
      `Через ${whenPhrase} (в <b>${time}</b>) у вас запись в Bilol Barber.`,
    service: "✂️ <b>Услуга:</b>",
    barber: "🧑‍🦱 <b>Барбер:</b>",
    footer: "Ждём вас! 💈",
  },
} as const;

// -----------------------------------------------------------------------------
// Telegramga matnli xabar yuborish
// -----------------------------------------------------------------------------
async function sendTelegramText(chatId: number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Telegram sendMessage xatoligi: ${errText}`);
  }
}

// -----------------------------------------------------------------------------
// Eslatma bosqichlari — vaqt yaqinlashgan sari me'yorida ko'proq bezovta qiladi.
// Har bir bosqich FAQAT BIR MARTA yuboriladi (bookings.reminder_stage orqali
// kuzatiladi). Bosqichlar tartibda o'tkazib yuborilmaydi — agar funksiya biroz
// kech ishga tushsa ham, faqat ENG SO'NGGI mos bosqich yuboriladi, ortga qolgan
// bosqichlar "quvib tutilmaydi" (aks holda mijozga bir vaqtda bir nechta xabar
// birdan kelib, spam bo'lib qoladi).
// -----------------------------------------------------------------------------
const STAGES: Array<{ stage: number; minutesBefore: number }> = [
  { stage: 1, minutesBefore: 120 }, // 2 soat qolganda
  { stage: 2, minutesBefore: 60 },  // 1 soat qolganda
  { stage: 3, minutesBefore: 30 },  // 30 daqiqa qolganda
  { stage: 4, minutesBefore: 10 },  // 10 daqiqa qolganda
];

// -----------------------------------------------------------------------------
// Qolgan vaqtni odam o'qiydigan matnga aylantiradi ("1 soat 6 daqiqa",
// "45 daqiqa" va h.k.). MUHIM: bu bosqich yorlig'idan (120/60/30/10) emas,
// HAQIQIY hisoblangan `minutesLeft`dan olinadi — aks holda mijoz botga
// masalan bron vaqtidan 66 daqiqa oldin ulanib qolsa ("2 soat" bosqichi
// hali yuborilmagan bo'lgani uchun birinchi mos bosqich sifatida tanlanadi),
// xabarda "2 soatdan keyin" deb noto'g'ri yozilib qolar edi — voqelikda esa
// atigi ~1 soat qolgan bo'ladi.
function formatMinutesLeft(minutesLeft: number, lang: Lang): string {
  const s = STR[lang];
  const total = Math.max(1, Math.round(minutesLeft));
  if (total < 60) return `${total} ${s.minuteWord}`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins === 0 ? `${hours} ${s.hourWord}` : `${hours} ${s.hourWord} ${mins} ${s.minuteWord}`;
}

function buildReminderHtml(
  minutesLeft: number,
  b: { service_name: string; master_name: string; booking_time: string; client_lang?: unknown },
) {
  const lang = pickLang(b.client_lang);
  const s = STR[lang];
  const whenPhrase = formatMinutesLeft(minutesLeft, lang);
  return (
    `${s.title}\n\n` +
    `${s.body(whenPhrase, b.booking_time)}\n\n` +
    `${s.service} ${b.service_name}\n` +
    `${s.barber} ${b.master_name}\n\n` +
    `${s.footer}`
  );
}

// -----------------------------------------------------------------------------
// Asosiy handler
// -----------------------------------------------------------------------------
Deno.serve(async (_req) => {
  try {
    // Hali oxirgi (4-) bosqichgacha yetmagan, chat_id bor, bekor qilinmagan
    // bronlarni olib kelamiz. Aniq vaqt filtri JS tomonda hisoblanadi, chunki
    // booking_date+booking_time'ni SQL filterda solishtirish qulay emas.
    const listRes = await fetch(
      `${SB_URL}/rest/v1/bookings?select=id,client_chat_id,service_name,master_name,booking_date,booking_time,status,reminder_stage,client_lang` +
        `&reminder_stage=lt.4&client_chat_id=not.is.null&status=neq.cancelled`,
      {
        headers: {
          apikey: SB_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!listRes.ok) {
      throw new Error(`bookings so'rovi muvaffaqiyatsiz: ${await listRes.text()}`);
    }
    const bookings: Array<{
      id: number;
      client_chat_id: number;
      service_name: string;
      master_name: string;
      booking_date: string;
      booking_time: string;
      reminder_stage: number | null;
      client_lang: string | null;
    }> = await listRes.json();

    const now = Date.now();
    let sent = 0;
    let failed = 0;

    for (const b of bookings) {
      // MUHIM: booking_date/booking_time O'ZBEKISTON mahalliy vaqti (UTC+5)
      // sifatida saqlanadi, lekin bu funksiya UTC serverda ishlaydi. Vaqt
      // zonasi ko'rsatilmasa, JS buni UTC deb tushunib, haqiqiy vaqtdan 5
      // soat KECH hisoblaydi — natijada barcha eslatmalar (2soat/1soat/
      // 30daq/10daq) mijozga navbat vaqti allaqachon o'tib ketgandan keyin
      // yuboriladi. Shu sababli aniq "+05:00" offset qo'shilishi SHART.
      const bookingDateTime = new Date(`${b.booking_date}T${b.booking_time}:00+05:00`).getTime();
      if (Number.isNaN(bookingDateTime)) continue;

      const minutesLeft = (bookingDateTime - now) / 60000;
      if (minutesLeft <= 0) continue; // navbat vaqti allaqachon boshlangan/o'tgan

      const currentStage = b.reminder_stage ?? 0;

      // Bosqichlar orasidan hali yuborilmagan, vaqt bo'yicha mos keladigan
      // ENG SO'NGGISINI topamiz (masalan agar funksiya bir muddat ishlamay
      // qolgan bo'lsa, o'rtadagi bosqichlarni "quvib tutmaymiz").
      let target: { stage: number; minutesBefore: number } | null = null;
      for (const s of STAGES) {
        if (minutesLeft <= s.minutesBefore && s.stage > currentStage) {
          if (!target || s.stage > target.stage) target = s;
        }
      }
      if (!target) continue;

      const html = buildReminderHtml(minutesLeft, b);

      try {
        await sendTelegramText(b.client_chat_id, html);

        // Xabar allaqachon mijozga yuborildi — endi reminder_stage'ni
        // yangilash SHART, aks holda keyingi cron aylanishida (5 daqiqadan
        // keyin) shu bosqich yana bir marta yuborilib, mijoz ikki marta
        // xabar oladi. Shu sababli vaqtinchalik tarmoq xatosi uchun bir
        // necha marta qayta urinamiz.
        let updateOk = false;
        let lastErrText = "";
        for (let attempt = 1; attempt <= 3 && !updateOk; attempt++) {
          const updateRes = await fetch(`${SB_URL}/rest/v1/bookings?id=eq.${b.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: SB_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ reminder_stage: target.stage }),
          });
          if (updateRes.ok) {
            updateOk = true;
          } else {
            lastErrText = await updateRes.text();
            if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
        if (!updateOk) {
          throw new Error(
            `Booking #${b.id} reminder_stage 3 urinishdan keyin ham yangilanmadi (xabar mijozga yuborilgan bo'lishi mumkin!): ${lastErrText}`,
          );
        }
        sent++;
      } catch (err) {
        console.error(`Booking #${b.id} (bosqich ${target.stage}) uchun eslatma yuborilmadi:`, err);
        failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
