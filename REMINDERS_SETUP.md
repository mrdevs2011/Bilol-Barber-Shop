# Bepul Telegram ovozli eslatma tizimi — sozlash qo'llanmasi

Bu tizim navbat vaqti yaqinlashgan sari mijozni **me'yorida ko'proq**
eslatib boradi — bitta emas, to'rtta bosqichda:

| Qolgan vaqt | Turi |
|---|---|
| 2 soat | 🔊 Ovozli xabar |
| 1 soat | 💬 Matnli xabar |
| 30 daqiqa | 💬 Matnli xabar |
| 10 daqiqa | 🔊 Ovozli xabar (yana) |

Ovozli xabarlar o'zbek tilida gapiruvchi audio (Microsoft Edge TTS orqali
yasaladi). Har bir bosqich mijozga **faqat bir marta** yuboriladi — spam
bo'lmaydi, lekin vaqt yaqinlashgan sari e'tibor sezilarli oshadi. SMS emas,
haqiqiy telefon qo'ng'irog'i ham emas — **butunlay bepul**.

> **Nega haqiqiy telefon qo'ng'irog'i emas?** Telegram botlari umuman
> foydalanuvchiga qo'ng'iroq qila olmaydi — bu Bot API'da yo'q. Haqiqiy
> qo'ng'iroq faqat pullik xizmat (masalan Twilio) orqali, mijozning telefon
> raqamiga bo'ladi, chunki bu yerda mobil operator tarmog'iga pul to'lanadi.
> Shu sababli tanlangan yechim — bepul, lekin "ovozli xabar" ko'rinishida.

Kerak bo'ladigan narsalar: mavjud Telegram bot (allaqachon bor —
`@bilolbarber_navbat_bot`) va Supabase loyihangiz (allaqachon bor).

---

## 1-qadam — Supabase CLI o'rnating va loyihaga ulaning
```bash
npm install -g supabase
supabase login
supabase link --project-ref riyanrmrjrartdmwzymt
```

## 2-qadam — Maxfiy kalitlarni sozlang
> ⚠️ **DIQQAT:** pastdagi qiymatlarni faqat terminalda ishlatiladigan buyruq
> sifatida ko'ring — haqiqiy token/kalitni HECH QACHON shu faylning o'ziga
> yozib qo'ymang (git, zip, chatga yuborilsa — tokeningiz oshkor bo'ladi).
> Agar avval shu faylda haqiqiy token turgan bo'lsa, BotFather'da uni
> darhol revoke qilib, yangisini oling.
```bash
supabase secrets set TELEGRAM_REMINDER_BOT_TOKEN=<BotFather'dan olingan token>
supabase secrets set SB_URL=https://riyanrmrjrartdmwzymt.supabase.co
supabase secrets set SB_SERVICE_ROLE_KEY=<Dashboard -> Settings -> API -> service_role kaliti>
```

## 3-qadam — Ikkala Edge Function'ni joylashtiring (deploy)
```bash
supabase functions deploy telegram-webhook --no-verify-jwt
supabase functions deploy send-reminders --no-verify-jwt
```

Deploy tugagach, `send-reminders` funksiyasi shu manzilda ishlaydi:
`https://riyanrmrjrartdmwzymt.functions.supabase.co/send-reminders`

## 4-qadam — Telegram'ga webhook manzilini bering (bir marta)
Brauzerda yoki terminalda shu havolani oching:
```
https://api.telegram.org/bot<TELEGRAM_REMINDER_BOT_TOKEN>/setWebhook?url=https://riyanrmrjrartdmwzymt.functions.supabase.co/telegram-webhook
```
`{"ok":true,"result":true,...}` javobini ko'rsangiz — tayyor.

## 5-qadam — Supabase'da SQL'ni ishga tushiring (cron job)
1. Supabase Dashboard → SQL Editor → New query
2. `sql/reminders.sql` faylidagi kodni nusxalab qo'ying
3. `<PROJECT_REF>` ni `riyanrmrjrartdmwzymt` bilan, `<SB_SERVICE_ROLE_KEY>` ni
   service_role kaliti bilan almashtiring
4. **Run** tugmasini bosing

Tekshirish: `select * from cron.job;` — `send-booking-reminders` nomli job
ro'yxatda ko'rinishi kerak. Bu job endi to'g'ridan-to'g'ri Telegram'ga emas,
balki `send-reminders` Edge Function'iga murojaat qiladi — ovozni o'sha
funksiya yasaydi.

## 6-qadam — Sinab ko'ring
1. Saytda bron qiling
2. Oxirgi qadamda chiqqan **"Telegram orqali bepul eslatma oling"** tugmasini bosing
3. Botda **Start** tugmasini bosing → tasdiqlash xabarini olishingiz kerak
4. Supabase'da: `select id, client_chat_id from bookings order by id desc limit 1;`
   — `client_chat_id` to'ldirilgan bo'lishi kerak
5. Funksiyani qo'lda sinash uchun (kutmasdan):
   ```bash
   curl -X POST https://riyanrmrjrartdmwzymt.functions.supabase.co/send-reminders \
     -H "Authorization: Bearer <SB_SERVICE_ROLE_KEY>"
   ```
   Javobda `{"ok":true,"sent":N,"failed":0}` chiqishi kerak (agar hozir aynan
   4 ta bosqichdan (2 soat / 1 soat / 30 daq / 10 daq) birortasiga to'g'ri
   keladigan bron bo'lmasa, `sent:0` chiqadi — bu normal).

Shu bilan tizim tayyor — navbat vaqti yaqinlashgan sari mijoz avtomatik
ravishda 4 bosqichli eslatma oladi, siz hech narsa qilmaysiz.

---

### Qanday ko'rinishda keladi?
- **2 soat va 10 daqiqa qolganda** (ovozli bosqichlar): Telegram'da audio-fayl
  sifatida keladi (pleer bilan, "voice message" davra ko'rinishida emas —
  buning sababi quyida). Bosilganda o'zbek tilida diktor ovozida o'qib
  beradi: *"Assalomu alaykum. Eslatma. ... Bilol Barber'da sizning
  navbatingiz bor..."*
- **1 soat va 30 daqiqa qolganda** (matnli bosqichlar): oddiy Telegram xabari
  sifatida keladi.

Cron job har 5 daqiqada ishlaydi, shuning uchun har bir bosqich vaqt
chegarasidan kechiktirilib, taxminan 0–5 daqiqa farq bilan yetib boradi.

### Cheklovlar va nozik jihatlar
- Mijoz botda **Start** bosmasa, unga eslatma yuborilmaydi (Telegram shunday
  ishlaydi — botlar avval yozmagan odamga xabar yubora olmaydi). Shuning
  uchun bron tugmasi matnini jozibali qildik, lekin baribir ba'zi mijozlar
  bosmasligi mumkin.
- **Microsoft Edge TTS — rasmiy ochiq API emas.** U Microsoft Edge
  brauzerining ichki ovozli-o'qish xizmatidan reverse-engineering yo'li
  bilan foydalanadi (jamiyat tomonidan keng qo'llaniladi, lekin Microsoft
  buni rasman qo'llab-quvvatlamaydi). Natijada u **ogohlantirishsiz
  ishlamay qolishi** mumkin. Agar bir kuni eslatmalar kelishi to'xtasa,
  birinchi navbatda shuni tekshiring: `supabase functions logs send-reminders`.
- Audio `.mp3` formatida yuboriladi (Telegram'ning "haqiqiy ovozli xabar"
  formati — `.ogg`/Opus — talab qiladi, buni yasash uchun ffmpeg kerak
  bo'lardi, Edge Function muhitida esa bunday dasturlarni ishga tushirib
  bo'lmaydi). Shu sababli mijozda u davra shaklidagi "voice message" emas,
  balki oddiy audio-pleer sifatida ko'rinadi — lekin baribir ovozli, o'z
  ovozi bilan keladi va bildirishnoma beradi.
- Agar kelajakda **hammaga**, hatto botni ishga tushirmagan mijozlarga ham
  eslatma yubormoqchi bo'lsangiz yoki **haqiqiy telefon qo'ng'irog'i**
  kerak bo'lsa, buning yagona yo'li — pullik xizmat (SMS uchun Eskiz.uz,
  qo'ng'iroq uchun Twilio). Xohlasangiz shuni ham qo'shib beraman.
