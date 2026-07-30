// =============================================================================
// CLEANUP-TICKETS (Supabase Edge Function) — "tickets" bucket'ini tozalash
//
// MUAMMO: mijoz bron qilgan zahoti brauzer booking-<id>.png rasmini
// "tickets" bucket'iga yuklaydi (js/api.js). Bu rasm faqat bitta maqsad
// uchun: mijoz Telegram botga "Start" bosganda telegram-webhook shu faylni
// o'qib botga yuboradi, so'ng deleteTicketPng() chaqirilib fayl o'chiriladi.
//
// Lekin: agar mijoz botga umuman "Start" bosmasa (REMINDERS_SETUP.mdda ham
// yozilgan — "ba'zi mijozlar bosmasligi mumkin"), o'chirish HECH QACHON
// ishga tushmaydi — chunki u faqat "muvaffaqiyatli yuborildi" holatida
// chaqiriladi. Bundan tashqari, mijoz bossa ham, deleteTicketPng() ichidagi
// so'rov tarmoq xatosi bilan muvaffaqiyatsiz bo'lsa, xatolik faqat konsolga
// yoziladi (qayta urinish yo'q) — fayl yana ham qoladi.
//
// Natija: har bir bron kamida bitta ~200-400KB PNG hosil qiladi, va katta
// qismi abadiy Storage'da qolib ketadi (bepul Supabase rejimida — 1GB
// Storage limiti bor).
//
// YECHIM: bu funksiya "tickets" bucket'idagi barcha booking-*.png
// fayllarini sanab chiqadi va TICKET_MAX_AGE_DAYS kundan (standart: 3)
// eski bo'lganlarini — ISHLATILGAN yoki ISHLATILMAGANIDAN QAT'IY NAZAR —
// o'chirib tashlaydi. 3 kun mijozga botga ulanish uchun yetarlicha vaqt
// beradi, shu bilan birga fayllar abadiy qolib ketishining oldini oladi.
//
// Joylashtirish (deploy):
//   supabase secrets set SB_URL=https://<PROJECT_REF>.supabase.co
//   supabase secrets set SB_SERVICE_ROLE_KEY=<service_role kaliti>
//   supabase functions deploy cleanup-tickets --no-verify-jwt
//
// Cron: sql/cleanup_tickets_cron.sql faylidagi kodni Supabase SQL
// Editor'da RUN qiling — bu har kuni bir marta shu funksiyani chaqiradigan
// pg_cron job o'rnatadi (send-reminders uchun sql/reminders.sql bilan bir
// xil naqsh).
// =============================================================================

const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

// Fayl shu necha kundan eski bo'lsa, ishlatilgan-ishlatilmaganidan qat'iy
// nazar o'chiriladi. TICKET_MAX_AGE_DAYS env orqali sozlash mumkin bo'lsa
// ham, standart qiymat 3 kun.
const MAX_AGE_DAYS = Number(Deno.env.get("TICKET_MAX_AGE_DAYS") ?? "3");

const BUCKET = "tickets";

type StorageObject = {
  name: string;
  created_at?: string;
  updated_at?: string;
};

// -----------------------------------------------------------------------------
// "tickets" bucket'idagi barcha fayllarni sahifalab (pagination) sanab
// chiqamiz — Storage list API bir chaqiruvda cheklangan sondagi fayllarni
// qaytaradi (standart limit 100), shuning uchun offset bilan davom etamiz.
// -----------------------------------------------------------------------------
async function listAllTickets(): Promise<StorageObject[]> {
  const all: StorageObject[] = [];
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const res = await fetch(`${SB_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        prefix: "",
        limit: pageSize,
        offset,
        sortBy: { column: "created_at", order: "asc" },
      }),
    });

    if (!res.ok) {
      throw new Error(`Storage list xatoligi: ${res.status} ${await res.text()}`);
    }

    const page: StorageObject[] = await res.json();
    all.push(...page);

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

// -----------------------------------------------------------------------------
// Ko'p faylni bitta so'rovda o'chiramiz (Storage bulk-remove endpoint'i).
// -----------------------------------------------------------------------------
async function removeTickets(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ prefixes: names }),
  });
  if (!res.ok) {
    throw new Error(`Storage remove xatoligi: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (_req) => {
  try {
    const objects = await listAllTickets();

    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const stale = objects.filter((obj) => {
      if (!obj.name || !obj.name.startsWith("booking-")) return false;
      const createdAt = obj.created_at ? new Date(obj.created_at).getTime() : NaN;
      if (Number.isNaN(createdAt)) return false;
      return createdAt < cutoff;
    });

    // Bir chaqiruvda juda ko'p nom yubormaslik uchun kichik partiyalarga
    // bo'lib o'chiramiz.
    const BATCH_SIZE = 100;
    let deleted = 0;
    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
      const batch = stale.slice(i, i + BATCH_SIZE).map((o) => o.name);
      await removeTickets(batch);
      deleted += batch.length;
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: objects.length, deleted }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
