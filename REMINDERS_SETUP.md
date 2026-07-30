# Bepul Telegram matnli eslatma tizimi — sozlash qo'llanmasi

Bu tizim navbat vaqti yaqinlashgan sari mijozni **me'yorida ko'proq**
eslatib boradi — bitta emas, to'rtta bosqichda:

| Qolgan vaqt | Turi |
|---|---|
| 2 soat | 💬 Matnli xabar |
| 1 soat | 💬 Matnli xabar |
| 30 daqiqa | 💬 Matnli xabar |
| 10 daqiqa | 💬 Matnli xabar |

Har bir bosqich mijozga **faqat bir marta** yuboriladi — spam bo'lmaydi,
lekin vaqt yaqinlashgan sari e'tibor sezilarli oshadi. SMS emas, haqiqiy
telefon qo'ng'irog'i ham emas — **butunlay bepul**.

> **Ovozli (TTS) xabarlar haqida:** avvalgi versiyada 2-soat va
> 10-daqiqalik bosqichlar Microsoft Edge'ning norasmiy
> (reverse-engineered) TTS xizmati orqali ovozli xabar sifatida
> yuborilardi. Bu xizmat beqaror bo'lib chiqdi — WebSocket ulanishi
> muvaffaqiyatsiz bo'lganda funksiya bajarilish limitidan oshib ketib,
> butun cron tsikli o'chib qolar, natijada eslatmalar umuman yetib
> bormas edi. Shu sabab TTS butunlay olib tashlandi — endi barcha
> bosqichlar sodda va ishonchli matnli xabar sifatida yuboriladi.

> **Nega haqiqiy telefon qo'ng'irog'i emas?** Telegram botlari umuman
> foydalanuvchiga qo'ng'iroq qila olmaydi — bu Bot API'da yo'q. Haqiqiy
> qo'ng'iroq faqat pullik xizmat (masalan Twilio) orqali, mijozning telefon
> raqamiga bo'ladi, chunki bu yerda mobil operator tarmog'iga pul to'lanadi.
> Shu sababli tanlangan yechim — bepul, lekin matnli xabar ko'rinishida.

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

> ⚠️ Bu funksiya `--no-verify-jwt` bilan deploy qilingani uchun
> `TELEGRAM_WEBHOOK_SECRET` sozlamasi ham majburiy — batafsili
> `DEPLOY.md`dagi "TELEGRAM_WEBHOOK_SECRET" bo'limiga qarang.

## 5-qadam — Supabase'da SQL'ni ishga tushiring (cron job)
1. Supabase Dashboard → SQL Editor → New query
2. `sql/reminders.sql` faylidagi kodni nusxalab qo'ying
3. `<PROJECT_REF>` ni `riyanrmrjrartdmwzymt` bilan, `<SB_SERVICE_ROLE_KEY>` ni
   service_role kaliti bilan almashtiring
4. **Run** tugmasini bosing

Tekshirish: `select * from cron.job;` — `send-booking-reminders` nomli job
ro'yxatda ko'rinishi kerak. Bu job har 5 daqiqada `send-reminders` Edge
Function'iga murojaat qiladi.

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
ravishda 4 bosqichli matnli eslatma oladi, siz hech narsa qilmaysiz.

---

### Qanday ko'rinishda keladi?
Har bir bosqichda mijozga oddiy Telegram xabari sifatida keladi, masalan:

> ⏰ **Eslatma!**
>
> 1 soatdan keyin (soat 14:30) Bilol Barber'da navbatingiz bor.
>
> ✂️ **Xizmat:** Fade / dizaynli kesish
> 🧑‍🦱 **Barber:** Alisher Yusupov
>
> Kutib qolamiz! 💈

Cron job har 5 daqiqada ishlaydi, shuning uchun har bir bosqich vaqt
chegarasidan kechiktirilib, taxminan 0–5 daqiqa farq bilan yetib boradi.
Xabardagi "qolgan vaqt" matni bosqich yorlig'idan (120/60/30/10) emas,
funksiya ishga tushgan paytda haqiqatda qancha vaqt qolganidan hisoblanadi
— shuning uchun funksiya biroz kech ishga tushsa ham, xabar noto'g'ri
vaqt ko'rsatmaydi.

### Cheklovlar va nozik jihatlar
- Mijoz botda **Start** bosmasa, unga eslatma yuborilmaydi (Telegram shunday
  ishlaydi — botlar avval yozmagan odamga xabar yubora olmaydi). Shuning
  uchun bron tugmasi matnini jozibali qildik, lekin baribir ba'zi mijozlar
  bosmasligi mumkin.
- Bosqichlar orasidan hech biri "quvib tutilmaydi": agar funksiya biror
  sababdan bir muddat ishlamay qolsa (masalan xizmat ko'rsatmay qolsa),
  mijozga bir vaqtning o'zida bir nechta o'tkazib yuborilgan bosqich
  birdan kelmaydi — faqat eng so'nggi mos bosqich yuboriladi.
- Agar kelajakda **hammaga**, hatto botni ishga tushirmagan mijozlarga ham
  eslatma yubormoqchi bo'lsangiz yoki **haqiqiy telefon qo'ng'irog'i**
  kerak bo'lsa, buning yagona yo'li — pullik xizmat (SMS uchun Eskiz.uz,
  qo'ng'iroq uchun Twilio). Xohlasangiz shuni ham qo'shib beraman.
