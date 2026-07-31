# Bilol Barber Shop — Claude Code uchun tuzatish promptlari

Bu fayl audit davomida topilgan barcha muammolarni tuzatish uchun tayyor
promptlarni o'z ichiga oladi. Har bir bo'limni **Claude Code**'ga alohida
(yoki ketma-ket) nusxalab bering — har biri mustaqil, bir-biriga bog'liq
emas. Muhimlik darajasi bo'yicha tartiblangan: yuqoridagilar birinchi
bajarilsin.

Loyiha papkasida ishga tushiring: `claude` (yoki `claude-code`), so'ng
quyidagi promptlardan birini joylashtiring.

---

## 1-PROMPT — [BAZA/XAVFSIZLIK] SQL patch'ni qo'llash

```
sql/PATCH_round3_security_cleanup.sql faylini o'qi. Bu fayl allaqachon
tayyor va Supabase'ga qo'llash uchun mo'ljallangan (men buni CLI orqali
tashqarida ishga tushiraman, sen bu qadamni bajarmaysan). Sening vazifang:
faylni o'qib, undagi 4 ta tuzatish (xavfli "Allow authenticated read"
policy'ni o'chirish, ochiq bot tokeni bo'lgan send_booking_reminders()
funksiyasini o'chirish, booked_slots view huquqlarini cheklash, dublikat
indexni o'chirish) loyihaning boshqa hech qaysi joyida (js/*.js,
admin/*.js, boshqa sql/*.sql fayllarda) ishlatilmayotganini tasdiqla —
ya'ni bu funksiya/policy nomlariga bog'liq hech qanday kod yo'qligini
tekshirib chiq. Agar bog'liqlik topsang, menga alohida ogohlantir va
patch'ni o'zgartirmasdan tur.
```

---

## 2-PROMPT — [KRITIK/XAVFSIZLIK] Bot tokenini yangilash eslatmasi

```
REMINDERS_SETUP.md va sql/reminders.sql fayllarini o'qi. Ularda
Supabase Secrets orqali saqlanadigan TELEGRAM_REMINDER_BOT_TOKEN haqida
yozilgan. Loyiha bazasida (allaqachon o'chirilgan send_booking_reminders
funksiyasi ichida) avval bir token ochiq holda saqlangan edi (hozir bu faylda ham olib
tashlandi — token allaqachon @BotFather orqali revoke qilingan bo'lishi
kerak, agar hali qilinmagan bo'lsa buni birinchi navbatda qiling).

Vazifang: butun repo (barcha .js, .md, .sql, .toml, .json fayllar)
bo'yicha shu yoki boshqa "digits:AA..." formatidagi Telegram bot
tokeniga o'xshash qatorlarni qidir (grep -rE "[0-9]{8,10}:[A-Za-z0-9_-]{35}").
Agar birortasi topilsa, menga aniq fayl va qatorni ko'rsat va HECH NARSANI
o'zingcha o'chirma/o'zgartirma — men buni qo'lda BotFather orqali revoke
qilib, keyin fayldan olib tashlayman.
```

---

## 3-PROMPT — [DIZAYN] "Ustalar" bo'limi matnini bitta barberga moslash

```
Loyihada js/data.js dagi MASTERS ro'yxatida hozircha faqat BITTA barber
bor (Alisher Yusupov). Lekin index.html dagi #ustalar bo'limi va "Nima
uchun biz" bo'limi ko'plik tilida yozilgan ("Professional barberlar",
"Har biri o'z sohasida...", "Jamoamiz muntazam malaka oshirish
kurslaridan o'tadi"), bu bitta kishilik jamoa uchun chalkash ko'rinadi.

Vazifang:
1. index.html dagi <section id="ustalar"> ichidagi sarlavha
   ("Professional barberlar") va tavsif paragrafini bitta shaxsga mos
   ravishda qayta yoz — masalan "Bosh barberimiz bilan tanishing" va
   unga mos, birlik tilidagi tavsif.
2. Xuddi shu sectiondagi eyebrow yorlig'i "Jamoamiz" so'zini kontekstga
   qarab "Ustamiz" yoki shunga o'xshashga almashtir.
3. "NIMA UCHUN BIZ" sectionidagi "Jamoamiz muntazam malaka oshirish
   kurslaridan o'tadi..." jumlasini ham birlik/umumiy tilga moslashtir
   (masalan "Muntazam malaka oshirish kurslaridan o'tamiz...").
4. Boshqa hech narsani o'zgartirma — faqat shu matn qatorlari.
5. O'zgartirishlardan keyin menga qaysi qatorlarni o'zgartirganingni
   qisqacha ro'yxat qilib ber.

MUHIM: agar kelajakda yana barber(lar) qo'shilishi rejalashtirilgan
bo'lsa (buni menga tasdiqlab so'ra, agar mavjud fayllarda buning
belgisi bo'lsa), unda ko'plik tilini saqlab qolish ham mumkin — shu
holatda menga ikkala variantni taklif qil va tanlashimni so'ra.
```

---

## 4-PROMPT — [DIZAYN/BUG] mastersGrid uchun responsive ustunlarni qo'shish

```
index.html faylida quyidagi qatorni top:

<div id="mastersGrid" class="grid gap-7"></div>

Bu #servicesGrid bilan solishtirganda (u yerda
"grid sm:grid-cols-2 lg:grid-cols-3 gap-6" bor) responsive ustun
sinflari yo'q. Hozircha faqat bitta barber borligi sabab bu ko'rinmayapti,
lekin kelajakda 2+ barber qo'shilsa, kartalar noto'g'ri (bitta tor
ustunda, juda cho'zilib) chiqadi.

Vazifang: shu qatorni quyidagicha o'zgartir (servicesGrid bilan bir xil
breakpoint mantig'ida, lekin masters kartalari kattaroq bo'lgani uchun
lg da 3 emas, 2 yoki 3 ustunni servicesGrid bilan solishtirib eng mos
kelganini tanla — ehtimol sm:grid-cols-2 lg:grid-cols-3 mos keladi,
chunki card eni servicesGrid bilan bir xil konteynerda):

<div id="mastersGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-7"></div>

O'zgartirgandan keyin, agar loyihada oddiy npm/dev server ishga tushirish
imkoni bo'lsa, saytni brauzerda ochib (yoki screenshot orqali) 1 va 2+
barber holatida (js/data.js ga vaqtincha 2-chi test barber qo'shib
ko'rib, keyin qaytarib olib tashlab) natijani tekshir.
```

---

## 5-PROMPT — [DIZAYN] Barber rasmini yaxshilash (fayl kerak bo'ladi)

```
assets/masters/barber.jpg fayli hozir atigi 207x226px o'lchamda —
kartada 254x339px (yoki undan katta ekranlarda ko'proq) qilib
ko'rsatilyapti, bu esa rasmni xiralashtiradi.

Menda [YANGI RASM FAYLI]ni qo'shaman/almashtiraman deb aytsam, o'sha
faylni assets/masters/barber.jpg o'rniga qo'yib, quyidagilarni tekshir:
1. Yangi rasm kamida 800x1000px (3:4 nisbatga yaqin) ekanligini
   tasdiqla (`identify` yoki shunga o'xshash vosita bilan).
2. Fayl hajmi 500KB dan oshsa, sifatni pasaytirmasdan siqishni taklif
   qil (masalan `cwebp` yoki `jpegoptim -m85`).
3. js/data.js dagi MASTERS ro'yxatida img yo'li to'g'ri ekanini
   tasdiqla.

Agar men hali fayl bermagan bo'lsam, hech narsa qilma — faqat shu
promptni "kutish rejimida" saqlab qo'y.
```

---

## 6-PROMPT — [DIZAYN] Oltin rang past-kontrast joylarini tuzatish

```
Loyihada quyidagi joylarda text-gold-500 (#C9A227) och (cream/oq)
fonda ishlatilgan, WCAG kontrast nisbati atigi 2.28:1 (talab: matn
uchun 4.5:1, katta ikonka/matn uchun 3:1) — bu past ko'rish
sharoitida (quyosh nuri, past ekran yorqinligi) o'qishni qiyinlashtiradi:

1. index.html qator ~330, ~344, ~358 — sharhlar bo'limidagi yulduzcha
   reytingi ikonkalari:
   class="text-gold-500 text-sm mb-4"
   ->  class="text-gold-600 text-sm mb-4"
   (gold-600 = #A9821C, cream fonda ~3.36:1 — yulduzcha ikonkalari
   uchun 3:1 talabini qondiradi, chunki bular dekorativ/katta emas
   lekin guruh holida aniq ko'rinadi)

2. index.html qator ~383, ~388, ~393 — "Nima uchun biz" bo'limidagi
   katta (text-2xl) ikonkalar:
   class="fa-solid fa-leaf text-gold-500 text-2xl mb-4"
   Bu holatda text-2xl (24px) katta hisoblanadi, shuning uchun WCAG
   talabi 3:1 — joriy 2.28:1 baribir yetarli emas. Shu uchtasini ham
   text-gold-600 ga almashtir.

3. index.html qator 300, 323 — "Narxnoma" va "Mijozlar fikri" eyebrow
   yorliqlari — bular ALLAQACHON text-gold-600 (to'g'ri), o'zgartirma,
   faqat tasdiqla.

4. Logotip (qator 175, 416, "BARBER" so'zi) va navigatsiya
   hover-holatlari (qator 179-190) — bularni O'ZGARTIRMA, chunki ular
   brendlash elementlari (WCAG'da logotiplar kontrast talabidan ozod)
   va hover holatlari muvaqqat/interaktiv.

Har bir o'zgarishdan keyin fayldagi boshqa joylarga (masalan CSS'da
alohida .gold klassi) ta'sir qilmasligini tekshir — faqat aytilgan
Tailwind utility klasslarini almashtir.
```

---

## 7-PROMPT — [KICHIK TOZALASH] Debug panel va boshqa qoldiqlarni olib tashlash

```
index.html faylida "VAQTINCHALIK DEBUG PANEL" izohli blok bor (script
teg ichida, ?debug=1 URL parametri bilan ishga tushadigan konsol
overlay). Izohning o'zida "MUAMMO HAL BO'LGACH BU BLOKNI OLIB TASHLASH
TAVSIYA ETILADI" deb yozilgan.

Vazifang:
1. Menga bu blok haligacha kerakligini so'ra ("Mobil qurilmalarda
   xatolarni tekshirish uchun hali kerakmi, yo'qmi?") — agar kerak
   emas desam, butun blokni (izoh + <script> tegi bilan birga) olib
   tashla.
2. Loyihada boshqa shunga o'xshash "vaqtinchalik" yoki "TODO" /
   "FIXME" belgili qoldiqlar bormi, grep orqali top (grep -rniE
   "TODO|FIXME|vaqtincha|temporary|debug" --include="*.js"
   --include="*.html") va ro'yxatini menga ko'rsat, hech birini
   so'ramasdan o'chirma.
```

---

## Ishga tushirish tartibi (tavsiya)

| # | Prompt | Xavf darajasi | Vaqt |
|---|---|---|---|
| 1 | SQL patch bog'liqligini tekshirish | Yuqori | 2 daq |
| 2 | Bot token qoldiqlarini qidirish | Yuqori | 2 daq |
| 4 | mastersGrid responsive tuzatish | O'rta (kelajakdagi bug) | 1 daq |
| 6 | Gold kontrast tuzatish | O'rta (qulaylik) | 3 daq |
| 3 | Ustalar matnini moslash | Past-o'rta (kontent) | 3 daq |
| 7 | Debug panel tozalash | Past | 2 daq |
| 5 | Barber rasmini almashtirish | Past (fayl kerak) | Kutishda |

Har bir prompt'ni ishlatgach, natijani (diff yoki screenshot) menga
qaytarsangiz, keyingisiga o'tamiz.
