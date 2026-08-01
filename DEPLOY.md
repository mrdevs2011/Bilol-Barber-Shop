# Joylashtirish (Deploy) qo'llanmasi

Kodda endi hech qanday kalit yoki URL hardcoded emas — barchasi Vercel
Environment Variables orqali beriladi va build vaqtida `js/config.js`ga
avtomatik yoziladi (`scripts/generate-config.js`).

## Vercel'da sozlanishi kerak bo'lgan Environment Variables

Settings -> Environment Variables (Production **va** Preview uchun):

| Nom | Qayerdan olinadi | Kimga ko'rinadi |
|---|---|---|
| `SUPABASE_URL` | Supabase -> Settings -> API -> Project URL | Brauzerga (bu sir emas) |
| `SUPABASE_ANON_KEY` | Supabase -> Settings -> API Keys -> Publishable key | Brauzerga (bu sir emas, RLS himoya qiladi) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Settings -> API Keys -> Secret key | Faqat serverga (`/api/notify-admin`) |
| `TELEGRAM_BOT_TOKEN` | @BotFather -> admin-bot | Faqat serverga |
| `TELEGRAM_CHAT_ID` | `https://api.telegram.org/bot<TOKEN>/getUpdates` | Faqat serverga |
| `ALLOWED_ORIGIN` | Saytingiz haqiqiy domeni | Faqat serverga |
| `ADMIN_EMAIL` *(ixtiyoriy)* | O'zingiz belgilaysiz | Brauzerga |
| `TELEGRAM_BOT_USERNAME` *(ixtiyoriy)* | Mijozlar-bot username | Brauzerga |

Muhim: `SUPABASE_URL`/`SUPABASE_ANON_KEY` "sir" sifatida belgilanmagan bo'lsa
ham xavfsiz — ular baribir har bir tashrifchining brauzeriga jo'natiladi
(shunday ishlashi kerak). Haqiqiy himoya Supabase RLS (`sql/*.sql`) orqali.

Har safar env qiymatlarini o'zgartirganingizdan keyin **Redeploy** qilish shart.

## Kesh avtomatik yangilanadi (CACHE_VERSION)

`service-worker.js` ichidagi `CACHE_VERSION` endi qo'lda oshirilmaydi — har
bir Vercel deployda `scripts/generate-config.js` uni joriy Git commit'ga mos
qiymat bilan avtomatik qayta yozadi. Shu tufayli har bir deploydan keyin
foydalanuvchilarning brauzeri (va o'rnatilgan PWA'lar) eski JS/CSS'ni emas,
har doim eng yangi versiyani oladi — qo'shimcha hech narsa qilish shart emas.

## Supabase Edge Function Secrets (Vercel'dan ALOHIDA)

`telegram-webhook` va `send-reminders` funksiyalari Vercel emas, Supabase'ning
o'z secrets tizimidan foydalanadi:

```
supabase secrets set SB_URL=https://XXXX.supabase.co
supabase secrets set SB_SERVICE_ROLE_KEY=...
supabase secrets set TELEGRAM_REMINDER_BOT_TOKEN=...
supabase secrets set TELEGRAM_WEBHOOK_SECRET=...   # pastga qarang, MUHIM
```

(Yoki Supabase Dashboard -> Edge Functions -> Secrets orqali qo'lda.)

### ⚠️ TELEGRAM_WEBHOOK_SECRET — MAJBURIY xavfsizlik qadami

`telegram-webhook` funksiyasi `--no-verify-jwt` bilan deploy qilingani
uchun (Telegram Supabase JWT yubormaydi), bu manzil odatiy holatda ochiq
bo'lib qoladi — kim bo'lsa ham shu URL'ga soxta so'rov yuborib, ixtiyoriy
bron ID'si uchun mijozning ism/telefon/narx ma'lumotini o'ziga
yo'naltirib olishi mumkin edi. Buning oldini olish uchun:

1. Tasodifiy, uzun (32+ belgili) maxfiy qator generatsiya qiling, masalan:
   ```
   openssl rand -hex 32
   ```
2. Shu qiymatni yuqoridagi `TELEGRAM_WEBHOOK_SECRET` sifatida saqlang.
3. Telegramga webhookni **aynan shu secret bilan** qayta o'rnating (bitta
   marta, deploy qilingandan keyin, brauzerda yoki `curl` bilan):
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<FUNKSIYA_URL>&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
   `<BOT_TOKEN>` — `TELEGRAM_REMINDER_BOT_TOKEN` qiymati, `<FUNKSIYA_URL>` —
   `https://XXXX.supabase.co/functions/v1/telegram-webhook`,
   `<TELEGRAM_WEBHOOK_SECRET>` — 2-qadamda saqlagan qiymat bilan AYNAN bir
   xil bo'lishi shart.
4. Tekshirish: `https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`
   ochib, javobda xatolik yo'qligiga ishonch hosil qiling.

Shundan keyin funksiya har bir kiruvchi so'rovda
`X-Telegram-Bot-Api-Secret-Token` header'ini shu qiymat bilan solishtiradi
— mos kelmasa so'rov 401 bilan rad etiladi.

## SQL

`sql/` papkasidagi barcha fayllarni Supabase SQL Editor'da tartib bilan
ishga tushirganingizga ishonch hosil qiling (`schema.sql` dan boshlab).

## Lokal ishlab chiqish

```bash
cp .env.example .env   # qiymatlarni to'ldiring
npm run build           # js/config.js generatsiya qiladi
# so'ng istalgan statik server bilan oching (masalan: npx serve .)
```
