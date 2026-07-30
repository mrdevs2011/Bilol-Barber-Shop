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
// KO'P QURILMA/TELEGRAM (sql/PATCH_round18_telegram_link_once_and_
// subscribers.sql): bitta mijoz turli bronlarida yoki turli qurilmalarida
// "Telegram orqali eslatma oling" tugmasini necha marta bossa ham (yoki
// yangi Telegram akkaunt ochsa ham), har bir chat_id telegram_subscribers
// jadvaliga (mijozning auth user_id'si bilan) yozilib boradi — CHEKSIZ.
// Bu funksiya endi har bir bron uchun eslatmani FAQAT o'sha bronning
// client_chat_id ustuniga emas, balki mijozning BARCHA ma'lum
// chat_id'lariga (client_chat_id + telegram_subscribers'dagi hammasi)
// yuboradi — mijoz qaysi qurilmadan Telegram ochgan bo'lsa ham, o'sha
// yerga avtomatik eslatma boradi, hech narsa qayta bosish shart emas.
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
    // Hali oxirgi (4-) bosqichgacha yetmagan, bekor qilinmagan bronlarni
    // olib kelamiz. Aniq vaqt filtri JS tomonda hisoblanadi, chunki
    // booking_date+booking_time'ni SQL filterda solishtirish qulay emas.
    //
    // MUHIM: endi `client_chat_id=not.is.null` filtri OLIB TASHLANDI —
    // chat_id yo'q bo'lsa ham, mijozning user_id'siga bog'langan
    // telegram_subscribers yozuvlari bo'lishi mumkin (pastga qarang).
    const listRes = await fetch(
      `${SB_URL}/rest/v1/bookings?select=id,client_chat_id,user_id,service_name,master_name,booking_date,booking_time,status,reminder_stage,client_lang` +
        `&reminder_stage=lt.4&status=neq.cancelled`,
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
      client_chat_id: number | null;
      user_id: string | null;
      service_name: string;
      master_name: string;
      booking_date: string;
      booking_time: string;
      reminder_stage: number | null;
      client_lang: string | null;
    }> = await listRes.json();

    // Shu bronlar egalari (user_id) uchun ma'lum BARCHA chat_id'larni bir
    // so'rovda olib, xaritaga (user_id -> chat_id[]) yig'amiz — bronlar soni
    // qancha bo'lmasin, bitta qo'shimcha so'rov yetarli.
    const subscribersByUser = new Map<string, number[]>();
    const userIds = [...new Set(bookings.map((b) => b.user_id).filter((id): id is string => !!id))];
    if (userIds.length > 0) {
      const subRes = await fetch(
        `${SB_URL}/rest/v1/telegram_subscribers?select=user_id,chat_id&user_id=in.(${userIds.join(",")})`,
        {
          headers: {
            apikey: SB_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
          },
        },
      );
      if (subRes.ok) {
        const subs: Array<{ user_id: string; chat_id: number }> = await subRes.json();
        for (const sub of subs) {
          const list = subscribersByUser.get(sub.user_id) ?? [];
          list.push(sub.chat_id);
          subscribersByUser.set(sub.user_id, list);
        }
      } else {
        console.error("telegram_subscribers so'rovi muvaffaqiyatsiz:", await subRes.text());
        // Davom etamiz — hech bo'lmasa client_chat_id borlarga eslatma boradi.
      }
    }

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

      // Shu bron mijoziga tegishli BARCHA chat_id'lar: bronning o'zidagi
      // client_chat_id (agar bor bo'lsa) + mijoz hisobiga bog'langan
      // telegram_subscribers'dagi hammasi (necha qurilma/Telegram bo'lsa
      // ham). Takrorlanish bo'lmasligi uchun Set ishlatiladi.
      const chatIds = new Set<number>();
      if (b.client_chat_id) chatIds.add(b.client_chat_id);
      if (b.user_id) {
        for (const cid of subscribersByUser.get(b.user_id) ?? []) chatIds.add(cid);
      }
      if (chatIds.size === 0) continue; // bu mijoz hech qanday Telegram'ga ulanmagan

      const html = buildReminderHtml(minutesLeft, b);

      // Har bir chat_id'ga alohida yuboramiz — bittasi ishlamay qolsa
      // (masalan mijoz botni bloklagan bo'lsa) qolganlariga baribir boradi.
      let successCount = 0;
      for (const cid of chatIds) {
        try {
          await sendTelegramText(cid, html);
          successCount++;
        } catch (err) {
          console.error(`Booking #${b.id} (bosqich ${target.stage}) -> chat ${cid} ga yuborilmadi:`, err);
        }
      }

      if (successCount === 0) {
        // Hech kimga yuborib bo'lmadi — reminder_stage'ni YANGILAMAYMIZ,
        // shunda keyingi cron aylanishida qayta urinib ko'riladi.
        failed++;
        continue;
      }

      // Kamida bittasiga yuborildi — endi reminder_stage'ni yangilash
      // SHART, aks holda keyingi cron aylanishida (5 daqiqadan keyin) shu
      // bosqich yana bir marta yuborilib, mijoz ikki marta xabar oladi.
      // Shu sababli vaqtinchalik tarmoq xatosi uchun bir necha marta
      // qayta urinamiz.
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
        console.error(
          `Booking #${b.id} reminder_stage 3 urinishdan keyin ham yangilanmadi (xabar mijozga yuborilgan bo'lishi mumkin!): ${lastErrText}`,
        );
      }
      sent++;
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
