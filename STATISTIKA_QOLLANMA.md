# Statistika sahifasini yaratish — bosqichma-bosqich qo'llanma (Claude AI uchun)

> Bu fayl **loyihaning o'zi emas** — admin panelga "Statistika" bo'limini
> qurish uchun keyingi Claude AI suhbatida ergashiladigan reja. Hozircha
> `admin/index.html` ichida faqat bo'sh placeholder bor:
> `<main id="viewStats" class="hidden">...tez orada...</main>`, nav tugmasi
> (`data-view="stats"`) va `activateView()`dagi almashtirish logikasi
> allaqachon tayyor. Shu fayldagi bosqichlarni ketma-ket bajarish orqali
> o'sha placeholder to'liq, "advanced" statistika sahifasiga aylantiriladi.

## 0. Ishlash uslubi (MUHIM — avvalgi suhbatlardan qoida)

Loyiha egasi (MR) quyidagicha ishlashni afzal ko'radi — shu qoidalarga
qat'iy amal qilinsin:

- **Bittada bitta qadam.** Quyidagi bosqichlarning har biri alohida
  javobda bajariladi — hammasini bir suhbatda ketma-ket avtomatik
  bajaravermang, balki har bosqichdan keyin natijani ko'rsating.
- **Bitta fayl — bitta vaqtda.** Katta fayllarni (ayniqsa `admin/admin.js`,
  2800+ qator) bir yo'la butunlay qayta yozmang; `str_replace` bilan aniq,
  tor joyni tahrirlang.
- Kod ichidagi izohlar **o'zbek tilida**, mavjud fayllardagi uslubga mos
  ("nima uchun shunday qilingani" tushuntirilsin, shunchaki "nima
  qilinayotgani" emas).
- Yangi narsa qo'shilganda **eskisini buzmaslik** — masalan `renderDashboard()`,
  `loadBookings()` kabi mavjud funksiyalarga tegilmaydi, statistika o'z
  alohida funksiyalarida yashaydi.
- Har bosqich oxirida loyihani zip qilib, o'zgargan narsani qisqacha
  (2-3 gap) tushuntiring — uzun "post-amble" kerak emas.

## 1. Maqsad

"Statistika" bo'limi — admin uchun **oylik/haftalik tahlil** oynasi:
qancha tushum tushdi, qaysi xizmat ko'proq sotilyapti, qaysi usta ko'proq
ishlayapti, mijozlar qachon ko'proq keladi, no-show/bekor qilish darajasi
qanday — hammasi grafik, diagramma va jadval ko'rinishida.

Bu **kundalik** ishlatiladigan bo'lim emas (shuning uchun bottombar'da emas,
lekin alohida tab sifatida — desktopda sidebar'da, mobil/planshetda pastki
tab-bar'da to'g'ridan-to'g'ri ko'rinadi, chunki oxirgi o'zgarishda shunday
qilib qo'yilgan).

## 2. Hozirgi holat (nima allaqachon tayyor)

| Nima | Qayerda | Holati |
|---|---|---|
| Nav tugmasi | `admin/index.html`, `#viewSwitch` ichida `data-view="stats"` | ✅ Tayyor |
| Bo'sh <main> | `admin/index.html`, `<main id="viewStats" class="hidden">` | ✅ Tayyor, ammo bo'sh placeholder |
| View almashtirish | `admin/admin.js`, `activateView()` funksiyasida `viewStats` hide/show logikasi | ✅ Tayyor |
| `VIEW_SLUGS`/`VIEW_TITLES` | `admin/admin.js`, `stats: 'stats'`, `'Statistika'` | ✅ Tayyor |
| Statistika **kontenti** | — | ❌ Yo'q — shu qo'llanma bo'yicha quriladi |

`activateView()` ichida `view === 'stats'` bo'lganda hali hech qanday
funksiya chaqirilmaydi (masalan `staff`da `loadStaffAndServices()`
chaqirilgani kabi). **1-bosqichda** shu qo'shiladi.

## 3. Ma'lumotlar manbai (Supabase jadvallari)

Statistikaning barcha raqamlari **`bookings`** jadvalidan olinadi (asosiy),
qo'shimcha kontekst uchun `services`, `masters`, `comments`/`reviews`,
`profiles`:

```
bookings:
  id, service_id, service_name, master_id, master_name,
  booking_date (date), booking_time (text "HH:MM"), client_name,
  client_phone, price (bigint), duration (int, daqiqa),
  status (text: 'new' | 'confirmed' | 'done' | 'no_show' | 'cancelled'),
  client_chat_id, reminder_sent, created_at, user_id

services:  id, name, price, duration, active, description
masters:   id, name, active, photo_url, description
comments:  id, user_id, client_name, rating (1-5), comment_text,
           customer_type ('yangi'|'doimiy'), status, created_at
profiles:  id, phone, full_name, no_show_count, blocked, created_at
```

**Muhim status mantig'i** (admin.js'dan, `updateStats()`/`renderDashboard()`
bilan bir xil bo'lishi kerak — statistikadagi raqamlar dashboard'dagi bilan
mos kelmasa, admin chalkashib qoladi):

- **Tushum (revenue)** faqat `status = 'done'` bo'lgan bronlar bo'yicha
  hisoblanadi (hali kelmagan yoki bekor qilingan mijozning puli
  "tushum"ga kirmaydi).
- `status = 'cancelled'` — umuman statistikaga (buyurtmalar soniga ham)
  qo'shilmaydi, chunki bo'lib o'tmagan.
- `status = 'no_show'` — alohida ko'rsatkich sifatida hisoblanadi (mijoz
  kelmagan holatlar % i).
- `status = 'new'`/`'confirmed'` — "kutilayotgan" (kelajakdagi yoki hali
  admin tomonidan yakunlanmagan) bronlar.

**Muhim**: hozirgi `admin.js`dagi `currentBookings` massivi faqat oxirgi
**500 ta** bronni saqlaydi (`loadBookings()`dagi `.limit(500)`) va odatda
sana bo'yicha filtrlanmagan. Statistika oylar davomidagi ma'lumotni
ko'rsatishi kerak bo'lgani uchun, **`currentBookings`ni qayta ishlatish
tavsiya etilmaydi** — buning o'rniga statistika o'ziga alohida, sana
oralig'iga qarab `.gte('booking_date', ...)`/`.lte('booking_date', ...)`
bilan cheklangan so'rov yuboradi (pastda, 4-bosqich).

## 4. Fayl tuzilishi rejasi

Kod tartibli bo'lishi uchun statistika mantig'i **alohida faylda** yashaydi
(admin.js allaqachon 2800+ qator, yana kattalashtirmaslik kerak):

```
admin/
  stats.js          ← YANGI: barcha statistika funksiyalari shu yerda
  admin.js           ← faqat import qilinadi va activateView('stats')da
                        bitta funksiya chaqiriladi (masalan renderStats())
  index.html          ← #viewStats ichiga HTML skelet (kartalar, canvas
                        joylari) qo'shiladi
```

`admin.js`ning boshida boshqa modullar qanday import qilingani bilan bir
xil uslubda:

```js
import { renderStats, initStatsFilters } from './stats.js';
```

## 5. Chart kutubxonasi — Chart.js (jsdelivr orqali, CSP allaqachon ruxsat beradi)

Loyihada bundler yo'q (oddiy ES modul, `<script type="module">`), shuning
uchun grafik kutubxonasi CDN orqali ulanadi. **`vercel.json`dagi
Content-Security-Policy allaqachon `https://cdn.jsdelivr.net`ni
`script-src`da ruxsat bergan** — demak qo'shimcha CSP o'zgartirish shart
emas, faqat `admin/index.html`ga bitta `<script>` qo'shiladi:

```html
<!-- admin.js'dan OLDIN yuklanishi kerak, chunki stats.js Chart global
     obyektidan foydalanadi -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
```

Muqobil (agar keyinchalik offline/CSP muammosi chiqsa): Chart.js UMD
faylini `admin/vendor/chart.umd.min.js` sifatida lokal saqlab, undan
`<script src="/admin/vendor/chart.umd.min.js">` bilan yuklash — xuddi
`js/vendor/supabase.js` qilingani kabi.

## 6. BOSQICHLAR (har biri alohida javobda bajariladi)

### Bosqich 1 — Skelet: sana oralig'i tanlash paneli + bo'sh KPI kartalar

**Fayl:** `admin/index.html` (`#viewStats` ichini to'ldirish),
`admin/stats.js` (yangi, bo'sh funksiyalar bilan boshlash),
`admin/admin.js` (import + `activateView`ga ulash).

1. `#viewStats` ichiga:
   - Sana oralig'i filter paneli: tez tugmalar ("Bugun", "Shu hafta",
     "Shu oy", "Oxirgi 30 kun", "Oxirgi 3 oy") + ixtiyoriy "dan/gacha"
     sana inputlari (mavjud `nbDate`/boshqa joylardagi `<input type="date">`
     uslubiga mos).
   - KPI kartalar qatori (mavjud `.stats`/`.stat-card` CSS klasslarini
     **qayta ishlatib**, dashboard'dagi kabi): Jami tushum, Jami bronlar,
     O'rtacha chek, Bekor qilish %, No-show %, Eng band kun.
   - Grafiklar uchun bo'sh joy: har biri o'z sarlavhasi va `<canvas>` bilan
     (masalan `<canvas id="statsRevenueChart"></canvas>`), pastda 7-8
     bosqichlarda to'ldiriladi.
2. `admin/stats.js`: hozircha faqat skelet — `initStatsView()` (bir marta,
   filter tugmalariga listener biriktiradi) va `renderStats(range)`
   (hozircha konsolga `console.log(range)` bosib qo'ysa bo'ladi — keyingi
   bosqichlarda to'ldiriladi).
3. `admin/admin.js`: import qo'shish, `activateView()`dagi
   `if (view === 'stats') { renderStats(currentStatsRange); }` qatorini
   qo'shish (xuddi `if (view === 'staff') loadStaffAndServices();` kabi).

**Natija tekshiruvi:** "Statistika" tabiga bosilganda filter paneli va
bo'sh KPI kartalar ko'rinadi, sana tugmalariga bosilganda konsolga to'g'ri
sana oralig'i chiqadi.

### Bosqich 2 — Ma'lumot yuklash qatlami (Supabase so'rovlari)

**Fayl:** `admin/stats.js`

`fetchStatsBookings(fromDate, toDate)` funksiyasi:

```js
const { data, error } = await supabaseClient
  .from('bookings')
  .select('id, service_id, service_name, master_id, master_name, booking_date, booking_time, price, duration, status, created_at')
  .gte('booking_date', fromDate)
  .lte('booking_date', toDate)
  .order('booking_date', { ascending: true });
```

- Xatolikni ko'rsatish uchun mavjud `toast()` funksiyasidan foydalaning
  (admin.js'da allaqachon bor, boshqa joylarda ishlatilgan).
- Yuklash paytida KPI kartalarga skeleton/spinner ko'rsatish (mavjud
  `skeletonHtml()` uslubiga qarang).
- **500 limit yo'q** — chunki bu safar sana oralig'i bilan cheklangan,
  lekin baribir juda uzoq oraliq (masalan "1 yil") tanlansa, xavfsizlik
  uchun `.limit(5000)` qo'yish tavsiya etiladi.

**Natija tekshiruvi:** tanlangan sana oralig'idagi bronlar massivi to'g'ri
qaytishini konsolda tekshiring (`console.table(data)`).

### Bosqich 3 — KPI kartalarni hisoblash va to'ldirish

**Fayl:** `admin/stats.js`

`computeKpis(bookings)` — 3-bo'limdagi status mantig'iga qat'iy amal qilib:

- **Jami tushum** = `done` bronlar narxlari yig'indisi → `money()` bilan
  formatlanadi (`js/data.js`dan import).
- **Jami bronlar** = `cancelled` bo'lmaganlar soni.
- **O'rtacha chek** = tushum / `done` bronlar soni.
- **Bekor qilish %** = `cancelled` / (jami, cancelled qo'shilgan holda) × 100.
- **No-show %** = `no_show` / (`done` + `no_show`) × 100 (faqat "kelishi
  kerak bo'lgan" bronlar orasida, kelajakdagilarni hisobga olmasdan).
- **Eng band kun** (hafta kuni, masalan "Juma") — `booking_date`dan
  JS `Date.getDay()` bilan hisoblanadi, eng ko'p bron tushgan kun.

Natijalarni tegishli DOM elementlariga (`#statsRevenue`, `#statsTotal`,
h.k.) yozing.

**Natija tekshiruvi:** raqamlar dashboard'dagi "Bugun" bo'limi bilan bir
xil kun uchun **mos kelishi** kerak (masalan "Bugun" filtri tanlansa,
`statTodaySub`dagi "bajarilgan" soni bilan solishtiring).

### Bosqich 4 — Tushum grafigi (vaqt bo'yicha, chiziqli/ustunli)

**Fayl:** `admin/stats.js`

- X o'qi: sanalar (tanlangan oraliqqa qarab kunlik, agar oraliq 60 kundan
  uzun bo'lsa — haftalik guruhlash).
- Y o'qi: shu kun/hafta uchun `done` bronlar tushumi.
- Chart.js `type: 'bar'` yoki `'line'`, rang — loyiha palitrasidan
  `--brass` (`#C9A227`) asosiy rang sifatida.
- Har safar filter o'zgarganda avvalgi Chart instance'ni `.destroy()`
  qilib qaytadan yaratish kerak (Chart.js'da eski canvas ustiga
  qayta chizishdan oldin bu shart, aks holda xotira sizib, eski grafik
  ustma-ust chiqadi).

### Bosqich 5 — Xizmatlar bo'yicha taqsimot (Top xizmatlar)

**Fayl:** `admin/stats.js`

- `service_name` bo'yicha guruhlash: nechta marta buyurtma qilingan va
  qancha tushum keltirgan.
- Ko'rinish: gorizontal bar chart (Chart.js `indexAxis: 'y'`) — eng
  ko'p sotilgan xizmat tepada.
- Har bir xizmat qatorida ikkita raqam: buyurtmalar soni va tushum ulushi
  (%).

### Bosqich 6 — Ustalar bo'yicha taqsimot (performance)

**Fayl:** `admin/stats.js`

- `master_name` bo'yicha guruhlash: bajargan bronlar soni, jami tushum,
  o'rtacha chek, no-show foizi (shu usta bo'yicha).
- Ko'rinish: jadval (kartalarga o'xshab, `staff-grid`/`ms-grid` CSS
  uslubiga mos) — "Reyting" tarzida eng ko'p tushum keltirgan ustadan
  boshlab.

### Bosqich 7 — Band vaqtlar tahlili (soat/kun issiqlik xaritasi)

**Fayl:** `admin/stats.js`

- `booking_time` (HH:MM) va `booking_date`dan hafta kunini olib, 7×~11
  (09:00–19:30, 30 daqiqalik slotlar — `generateDaySlots()`dan) matritsa
  yasang: har katakda shu kun+soatda nechta bron tushgani.
- Ko'rinish: oddiy CSS grid-heatmap (rang intensivligi = zichlik) — Chart
  shart emas, sof HTML/CSS bilan ham chiroyli chiqadi (`background:
  rgba(201,162,39, intensity)` kabi).
- Bu — "qachon ko'proq xodim kerak" degan savolga javob beradi.

### Bosqich 8 — Holat taqsimoti (status breakdown) + reyting/sharhlar

**Fayl:** `admin/stats.js`

- Donut/pie chart: `done` / `no_show` / `cancelled` / `new`+`confirmed`
  ulushlari.
- Qo'shimcha kichik blok: `comments` jadvalidan `status='approved'`
  sharhlarning o'rtacha reytingi (⭐) va soni — tanlangan sana oralig'ida
  yozilganlar bo'yicha (`created_at` bilan filtrlab).

### Bosqich 9 — Silliqlash va UX

- Filter o'zgarganda barcha bo'limlar (KPI + barcha grafiklar) bitta
  `renderStats()` chaqiruvi orqali yangilanishi kerak (alohida-alohida
  emas).
- Mobil ekranda grafiklar ustma-ust (bitta ustun) joylashishi, desktopda
  2 ustunli grid bo'lishi kerak (`.stats{grid-template-columns:
  repeat(auto-fit, minmax(...))}` uslubiga mos, mavjud CSS'ni qayta
  ishlatish).
- Bo'sh natija holati ("bu oraliqda bron yo'q") — mavjud
  `.nb-slots-empty`/`commentsEmpty` uslubidagi bo'sh-holat komponentiga
  mos qiling.
- Yuklanish paytida grafik joylarida skeleton/spinner (`fa-spinner
  fa-spin`, boshqa joylarda ishlatilgani kabi).

### Bosqich 10 — (Ixtiyoriy, keyinroq) Excel/PDF eksport

- "Statistikani yuklab olish" tugmasi — CSV formatida (bookings
  ma'lumotlarini `Blob` + `URL.createObjectURL` bilan, tashqi
  kutubxonasiz ham qilsa bo'ladi, chunki CSV oddiy matn).
- Bu bosqich shart emas — faqat agar MR alohida so'rasa qo'shiladi.

## 7. Test/QA cheklist (har bosqichdan keyin, ayniqsa oxirida)

- [ ] "Bugun" filtri tanlanganda KPI raqamlari Dashboard'dagi "Bugun"
      bo'limi bilan bir xil.
- [ ] Bron **umuman bo'lmagan** oraliq tanlanganda sahifa xato bermay,
      "ma'lumot yo'q" holatini ko'rsatadi (grafiklar bo'sh massiv bilan
      Chart.js'ni sindirmasligi kerak — massiv bo'sh bo'lsa chart
      chizilmasin, o'rniga bo'sh-holat matni chiqsin).
- [ ] Filter tez-tez almashtirilganda (masalan "Bugun" → "Shu oy" → "Shu
      hafta" tez-tez bosilsa) eski so'rovlar natijasi keyingi so'rov
      ustiga "kechikib" tushib qolmasligi kerak (oddiy holat uchun oxirgi
      so'rovni belgilab, faqat shu javobni qabul qilish yetarli).
- [ ] Mobil (390px) va desktop (1440px) kengliklarda barcha grafik va
      kartalar to'g'ri joylashadi, gorizontal scroll paydo bo'lmaydi.
- [ ] `activateView('stats')` URL'ni to'g'ri o'zgartiradi
      (`/admin/stats/`) va browserning orqaga/oldinga tugmasi ishlaydi
      (bu allaqachon umumiy `activateView()` mexanizmi orqali avtomatik
      ishlashi kerak — sinab ko'rish kifoya).
- [ ] Chart.js CDN yuklanmasa (masalan offline holatda PWA ochilsa) —
      sahifa umuman ishlamay qolmasligi kerak; KPI kartalar hech bo'lmasa
      ko'rinsin, grafik joyida "Grafik yuklanmadi (internet kerak)" degan
      matn chiqsin (`try/catch` bilan `typeof Chart === 'undefined'`
      tekshiruvi).

## 8. Kelajakda kengaytirish g'oyalari (hozircha qilinmaydi)

- Mijozlar bo'yicha tahlil: yangi vs doimiy mijozlar nisbati, eng ko'p
  qaytgan mijozlar reytingi (`profiles`/`client_phone` bo'yicha guruhlab).
- Solishtirish rejimi: "shu oy vs o'tgan oy" yonma-yon.
- Bashorat/trend chizig'i (oddiy chiziqli regressiya — ortiqcha
  murakkablik, faqat alohida so'ralsa).
- Postgres tomonda tayyor `VIEW`/`RPC` funksiyasi (masalan
  `stats_daily_revenue`) — agar bronlar soni juda ko'payib, client-side
  agregatsiya sekinlashib qolsa, shu yerga o'tish kerak bo'ladi (hozircha
  kerak emas, chunki bitta barbershop uchun ma'lumot hajmi kichik).
