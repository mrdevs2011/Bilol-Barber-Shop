# Mijoz hisobi (login/signup) + "Kelmadi" bloklash — sozlash

Bu tizim to'liq **bepul**: hech qanday to'lov tizimi, SMS-provayder yoki
tashqi xizmat kerak emas — faqat Supabase'ning o'zida bor imkoniyatlar
(Auth + Postgres trigger) ishlatiladi.

## Nima o'zgardi?
- Endi "Navbatga yozilish" tugmasi bosilganda, agar mijoz hali login
  qilmagan bo'lsa — avval **telefon + parol** bilan ro'yxatdan o'tish/kirish
  oynasi chiqadi. Shundan keyingina bron qadamlari ochiladi.
- Bron jarayonida endi ism/telefon **so'ralmaydi** — profilingizdan
  avtomatik olinadi. O'zgartirish kerak bo'lsa, header'dagi **⚙ Sozlamalar**
  tugmasi orqali (yoki shu yerdan **Chiqish** ham qilsa bo'ladi).
- Har bir bron endi mijozning hisobiga (`user_id`) bog'langan.
- Admin panelda bronni **"Kelmadi"** deb belgilasangiz, o'sha mijozning
  hisobiga avtomatik +1 yoziladi. **3 marta kelmasa — hisobi avtomatik
  bloklanadi** va u boshqa bron qila olmaydi (saytda tushunarli xabar
  ko'rsatiladi).
- Admin panelda mijoz ismi yonida ⚠️/🚫 belgisi bilan necha marta
  kelmagani ko'rinadi.

## Sozlash qadamlari

### 1-qadam — SQL'ni ishga tushiring
Supabase Dashboard → SQL Editor → New query → `sql/auth_and_noshow.sql`
faylining to'liq kodini qo'ying → **Run**.

### 2-qadam — Email tasdiqlashni o'chiring (MUHIM!)
Supabase Dashboard → **Authentication → Providers → Email** →
**"Confirm email"** ni **OFF** qiling → Save.

> Nega kerak? Biz mijozning telefon raqamini "soxta" email ko'rinishiga
> o'giramiz (masalan `998901234567@bilolbarber.client`) — u yerga hech
> qachon haqiqiy xat bormaydi. Agar "Confirm email" yoqilgan bo'lib qolsa,
> mijoz ro'yxatdan o'tgandan keyin hech qachon kelmaydigan tasdiqlash
> xatini "kutib" qolib, saytga umuman kira olmaydi.

### 3-qadam — Sinab ko'ring
1. Saytda "Navbatga yozilish"ni bosing → ro'yxatdan o'tish oynasi chiqishi kerak.
2. Ism, telefon, parol kiritib ro'yxatdan o'ting → darhol bron qadamlari ochilishi kerak.
3. Admin panelda o'sha bronni "Kelmadi" deb belgilang, 3 marta takrorlang
   (test uchun 3 ta turli bron yarating) → 3-sidan keyin `profiles`
   jadvalida `blocked = true` bo'lishi kerak:
   ```sql
   select phone, no_show_count, blocked from profiles order by no_show_count desc;
   ```
4. O'sha telefon bilan qayta bron qilishga urinsa — "Hisobingiz vaqtincha
   bloklangan..." xabari chiqishi kerak.

### Qo'lda blokdan chiqarish
```sql
update profiles set blocked = false, no_show_count = 0 where phone = '998901234567';
```

### Cheklov (nozik jihat)
Parol unutilsa, hozircha "parolni tiklash" funksiyasi yo'q (bu email orqali
ishlaydigan standart Supabase funksiyasi, lekin bizda haqiqiy email yo'q).
Bunday holatda eng oson yo'l — admin qo'lda Supabase Dashboard →
Authentication → Users bo'limidan o'sha foydalanuvchining parolini
qayta o'rnatib berishi. Xohlasangiz, buning uchun ham (masalan Telegram
orqali) qulayroq yechim qo'shib beraman.
