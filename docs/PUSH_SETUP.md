# Web Push xabarnomalar — sozlash qo'llanmasi

Bu funksiya butunlay **bepul** (hech qanday Firebase/SMS/pullik xizmat kerak
emas). Mijoz yoki admin brauzerda "Push xabarnomalarni yoqish"ni bossa, sayt
yopiq yoki telefon qulflangan bo'lsa ham tizim bildirishnomasi keladi:

- **Mijoz** — bron vaqti yaqinlashganda (2 soat / 1 soat / 30 daq / 10 daq),
  Telegram bilan bir qatorda, mustaqil ikkinchi kanal sifatida.
- **Admin** — yangi bron tushganda darhol.

## 1) SQL migratsiyasi

Supabase Dashboard -> SQL Editor -> `sql/PATCH_round21_web_push.sql` faylini
to'liq RUN qiling (`push_subscriptions` jadvali + RLS yaratiladi).

## 2) VAPID kalitlarini generatsiya qilish

Bitta marta, terminalda:

```bash
npx web-push generate-vapid-keys
```

Bu ikkita kalit beradi — PUBLIC (sir emas) va PRIVATE (**sir, hech qayerga
ommaviy chiqarmang**).

## 3) Vercel (asosiy sayt + admin panel — statik frontend va /api)

Vercel loyihasi -> Settings -> Environment Variables:

| Nomi | Qiymati |
|---|---|
| `VAPID_PUBLIC_KEY` | generatsiya qilingan PUBLIC kalit |
| `VAPID_PRIVATE_KEY` | generatsiya qilingan PRIVATE kalit |
| `VAPID_SUBJECT` | `mailto:admin@bilolbarber.uz` (ixtiyoriy, default shu) |

`VAPID_PUBLIC_KEY` build vaqtida `scripts/generate-config.js` orqali
`js/config.js`'ga yoziladi (brauzer shuni ishlatadi). `VAPID_PRIVATE_KEY`
esa faqat `/api/notify-admin.js` (server) ichida ishlatiladi — brauzerga
hech qachon chiqmaydi.

Qayta deploy qiling (`npm run build` avtomatik ishga tushadi).

## 4) Supabase Edge Function (`send-reminders`) — mijozga push yuborish uchun

```bash
supabase secrets set VAPID_PUBLIC_KEY=<public key>
supabase secrets set VAPID_PRIVATE_KEY=<private key>
supabase secrets set VAPID_SUBJECT=mailto:admin@bilolbarber.uz
supabase functions deploy send-reminders --no-verify-jwt
```

(Agar `send-reminders` allaqachon boshqa sozlamalar — `TELEGRAM_REMINDER_BOT_TOKEN`,
`SB_URL`, `SB_SERVICE_ROLE_KEY` — bilan ishlab turgan bo'lsa, ular
o'zgarishsiz qoladi, yuqoridagi 3 ta yangi secret qo'shiladi xolos.)

## 5) Sinash

1. Saytga (yoki admin panelga) kiring.
2. Mijoz: Sozlamalar -> "Push xabarnomalar" tugmasini yoqing.
   Admin: yuqori panelda qo'ng'iroq (🔔) tugmasini bosing.
3. Brauzer ruxsat so'raydi — "Ruxsat berish" (Allow) tanlang.
4. Yangi bron qiling — admin darhol push oladi. Bron vaqtini yaqin qilib
   test qilsangiz (masalan 12 daqiqadan keyin), 10 daqiqalik bosqichda
   mijoz ham push oladi.

## Eslatma

- iOS'da Safari push faqat sayt **Bosh ekranga qo'shilgan (PWA sifatida
  o'rnatilgan)** holatda ishlaydi — oddiy Safari tabida ishlamaydi
  (Apple cheklovi, bizning kodimizga bog'liq emas).
- Agar `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` sozlanmagan bo'lsa, Push
  tugmasi o'zi avtomatik yashiriladi — mavjud Telegram/email eslatmalarga
  hech qanday ta'sir qilmaydi.
