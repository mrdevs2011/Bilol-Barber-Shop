// =============================================================================
// BOOKING: bron modali — qadamlar, slotlar, xulosa va yuborish
// =============================================================================
import { SERVICES, MASTERS, money, formatDateUz, generateDaySlots, pickLang } from './data.js';
import { state, resetState, bookedSlotsCache } from './state.js';
import { submitBookingToBackend, fetchBookedSlots, fetchMasterTimeOff } from './api.js';
import { TELEGRAM_BOT_USERNAME } from './config.js';
import { requireAuth, getCurrentProfile, toFullPhone } from './auth.js';
import { t, getMonthNames, getWeekdayNames } from './i18n.js';

const modal = () => document.getElementById('bookingModal');

// Oy/kun nomlari endi joriy tilga qarab js/i18n.js'dan olinadi (getMonthNames/getWeekdayNames).

// Mijoz faqat joriy kundan boshlab shu necha kun oldindan bron qila oladi
const BOOKING_WINDOW_DAYS = 30;
// Oy tanlashda ko'rsatiladigan oylar soni: joriy oy + keyingi 2 oy
const VISIBLE_MONTHS_COUNT = 3;

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Joriy oy + keyingi 2 oyni [{year, month}] ko'rinishida qaytaradi (o'tgan oylar yo'q). */
function getVisibleMonths() {
  const now = new Date();
  const months = [];
  for (let i = 0; i < VISIBLE_MONTHS_COUNT; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

/** Oy "tab" tugmalarini joriy oy + keyingi 2 oy bilan chizadi, joriy oyni default tanlangan holda. */
function renderMonthTabs() {
  const wrap = document.getElementById('monthTabs');
  const months = getVisibleMonths();
  const currentYear = new Date().getFullYear();

  if (!state.bookingMonthValue) {
    state.bookingMonthValue = `${months[0].year}-${months[0].month}`;
  }

  const monthNames = getMonthNames();
  wrap.innerHTML = months.map(({ year, month }) => {
    const name = monthNames[month - 1];
    const label = name.charAt(0).toUpperCase() + name.slice(1) + (year !== currentYear ? ` ${year}` : '');
    const value = `${year}-${month}`;
    const isSelected = state.bookingMonthValue === value;
    return `<button type="button" data-month-value="${value}" class="month-tab${isSelected ? ' selected' : ''}">${label}</button>`;
  }).join('');

  wrap.querySelectorAll('[data-month-value]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.bookingMonthValue = btn.dataset.monthValue;
      state.bookingDayValue = '';
      renderMonthTabs();
      renderDayCards();
      syncHiddenDate();
    });
  });
}

/** Kun kartochkalarini tanlangan oy bo'yicha, faqat bugundan +30 kungacha bo'lgan kunlar bilan chizadi. */
function renderDayCards() {
  const wrap = document.getElementById('dayCardWrap');
  const [yStr, mStr] = (state.bookingMonthValue || '').split('-');
  const year = Number(yStr);
  const month = Number(mStr);

  if (!year || !month) { wrap.innerHTML = ''; return; }

  const today = startOfDay(new Date());
  const windowEnd = startOfDay(new Date());
  windowEnd.setDate(windowEnd.getDate() + BOOKING_WINDOW_DAYS);

  const total = daysInMonth(year, month);
  const monthNames = getMonthNames();
  const weekdaysShort = getWeekdayNames(true);
  const monthName = monthNames[month - 1];
  let html = '';
  const validDays = [];
  for (let day = 1; day <= total; day++) {
    const d = new Date(year, month - 1, day);
    if (d < today || d > windowEnd) continue;
    validDays.push(day);
    const weekday = weekdaysShort[d.getDay()];
    const isSelected = Number(state.bookingDayValue) === day;
    html += `<button type="button" data-day="${day}" class="day-card${isSelected ? ' selected' : ''}">
      <div class="day-card-weekday">${weekday}</div>
      <div class="day-card-num">${day}</div>
      <div class="day-card-month">${monthName}</div>
    </button>`;
  }
  wrap.innerHTML = html;

  // Oldin tanlangan kun yangi oyning to'g'ri oralig'ida bo'lmasa, tanlovni tozalaymiz
  if (state.bookingDayValue && !validDays.includes(Number(state.bookingDayValue))) {
    state.bookingDayValue = '';
  }

  wrap.querySelectorAll('[data-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.bookingDayValue = btn.dataset.day;
      renderDayCards();
      syncHiddenDate();
    });
  });
}

function syncHiddenDate() {
  const [yStr, mStr] = (state.bookingMonthValue || '').split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(state.bookingDayValue);
  const dateVal = (year && month && day)
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : '';
  document.getElementById('bookingDate').value = dateVal;
  renderTimeSlots();
}

/** Modal har safar ochilganda (yoki qadam qayta boshlanganda) sana tanlovlarini "bugun"ga nisbatan qayta quradi. */
function resetDateSelects() {
  const months = getVisibleMonths();
  state.bookingMonthValue = `${months[0].year}-${months[0].month}`;
  state.bookingDayValue = '';
  renderMonthTabs();
  renderDayCards();
  document.getElementById('bookingDate').value = '';
}

function populateDateSelects() {
  resetDateSelects();
}

function stepLabel(n) {
  return t(`booking.step${n}`);
}

/* ---------------------------------------------------------------------------
   Ochish / yopish
--------------------------------------------------------------------------- */
export function openBooking(preselectServiceId) {
  // Endi navbatga yozilish uchun avval hisobga kirish shart — login qilmagan
  // bo'lsa, requireAuth avtorizatsiya oynasini ochadi va muvaffaqiyatli
  // kirish/ro'yxatdan o'tishdan so'ng shu funksiyani o'zi qayta chaqiradi.
  requireAuth(() => openBookingAfterAuth(preselectServiceId));
}

function openBookingAfterAuth(preselectServiceId) {
  modal().classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  isSubmitting = false;
  hideTicketLoading();
  document.getElementById('backBtn').disabled = false;
  document.getElementById('modalCloseBtn').disabled = false;
  resetState(preselectServiceId);

  renderModalServiceList();
  renderModalMasterList();
  goToStep(1);

  resetDateSelects();
  // Ism/telefon endi alohida qadamda so'ralmaydi — mijozning profilidan
  // (ro'yxatdan o'tganda kiritilgan ma'lumotlardan) to'g'ridan-to'g'ri olinadi.
  const profile = getCurrentProfile();
  state.name = profile?.full_name || '';
  state.phone = profile?.phone || '';

  const status = document.getElementById('submitStatus');
  status.classList.add('hidden');
  status.textContent = '';

  // Chipta hali tasdiqlanmagan holatga qaytariladi
  document.getElementById('ticketStamp').classList.add('hidden');
  document.getElementById('ticketLabel').textContent = t('ticket.summaryLabel');
  document.getElementById('sumCodeRow').classList.add('hidden');
  document.getElementById('closeTicketBtn').classList.add('hidden');
  const reminderCta = document.getElementById('reminderCta');
  reminderCta.classList.add('hidden');
  reminderCta.innerHTML = '';
  const confirmBtn = document.getElementById('confirmBtn');
  confirmBtn.disabled = false;
  confirmBtn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> ${t('booking.confirm')}`;
}

/** Haqiqiy bron ID'siga asoslangan kod (chiptadagi / adminga ketadigan
 * xabardagi kod bilan bir xil formatda) — masalan "B0042". Avval bu yerda
 * tasodifiy (Math.random()) kod ishlatilardi, u hech qayerga yozilmasdan
 * faqat ekranda ko'rinardi; mijoz o'sha kodni aytsa, admin bazada uni
 * topa olmas edi. Endi ikkalasi bir xil — buildTicketSvg() dagi `code`
 * hisoblash mantig'i bilan mos. */
function generateBookingCode(bookingId) {
  return bookingId ? `B${String(bookingId).padStart(4, '0')}` : '—';
}

/* ---------------------------------------------------------------------------
   Bron yuborilayotgandagi animatsion overlay: chipta ustida aylanuvchi
   halqa, sirg'anuvchi progress chizig'i va navbat bilan almashinuvchi
   matnlar ko'rsatiladi — 10-20 soniya cho'zilib ketsa ham mijoz zerikmasin.
--------------------------------------------------------------------------- */
function getLoadingMessages() {
  return [
    { icon: 'fa-magnifying-glass', text: t('booking.loading1') },
    { icon: 'fa-calendar-check', text: t('booking.loading2') },
    { icon: 'fa-scissors', text: t('booking.loading3') },
    { icon: 'fa-bell', text: t('booking.loading4') },
    { icon: 'fa-ticket', text: t('booking.loading5') },
    { icon: 'fa-hourglass-half', text: t('booking.loading6') },
  ];
}

let loadingMsgTimer = null;
let loadingMsgIndex = 0;

function showTicketLoading() {
  const overlay = document.getElementById('ticketLoadingOverlay');
  const textEl = document.getElementById('ticketLoadingText');
  const iconEl = document.getElementById('ticketLoadingIcon');
  if (!overlay) return;

  const loadingMessages = getLoadingMessages();
  loadingMsgIndex = 0;
  overlay.classList.remove('hidden');
  iconEl.className = `fa-solid ${loadingMessages[0].icon}`;
  textEl.textContent = loadingMessages[0].text;

  clearInterval(loadingMsgTimer);
  loadingMsgTimer = setInterval(() => {
    loadingMsgIndex = (loadingMsgIndex + 1) % loadingMessages.length;
    const msg = loadingMessages[loadingMsgIndex];
    // Matn va ikonani yumshoq (fade) almashtirish uchun avval xiralashtiramiz.
    textEl.classList.add('is-swapping');
    setTimeout(() => {
      iconEl.className = `fa-solid ${msg.icon}`;
      textEl.textContent = msg.text;
      textEl.classList.remove('is-swapping');
    }, 200);
  }, 2200);
}

function hideTicketLoading() {
  clearInterval(loadingMsgTimer);
  loadingMsgTimer = null;
  document.getElementById('ticketLoadingOverlay')?.classList.add('hidden');
}

export function closeBooking() {
  // Bron yuborilayotganda mijoz tasodifan (X / fon bosish / Esc) modalni
  // yopib qo'ymasligi uchun — so'rov tugaguncha yopilishni bloklaymiz.
  if (isSubmitting) return;
  modal().classList.add('hidden');
  document.body.style.overflow = '';
}

/* ---------------------------------------------------------------------------
   1-qadam: Xizmat va usta ro'yxatlari
--------------------------------------------------------------------------- */
function renderModalServiceList() {
  const wrap = document.getElementById('modalServiceList');
  wrap.innerHTML = SERVICES.map(s => `
    <button type="button" data-service-id="${s.id}"
      class="service-opt text-left border rounded-xl px-4 py-3.5 transition-colors ${state.serviceId === s.id ? 'border-gold-500 bg-gold-500/10' : 'border-emerald-950/12 hover:border-emerald-950/30'}">
      <div class="flex items-center justify-between mb-1">
        <span class="font-semibold text-sm">${pickLang(s.name, s.name_ru, s.name_en)}</span>
        <i class="fa-solid ${s.icon} text-emerald-800/50 text-sm"></i>
      </div>
      <div class="flex items-center gap-3 text-xs text-emerald-950/50 font-mono">
        <span>${s.duration} ${t('services.minutes')}</span><span>•</span><span>${money(s.price)}</span>
      </div>
    </button>
  `).join('');

  wrap.querySelectorAll('[data-service-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.serviceId = btn.dataset.serviceId;
      // Agar avval tanlangan usta yangi xizmatni bajarmasa (masalan,
      // kelajakda ikkinchi usta qo'shilib, ularning mutaxassisliklari
      // farqli bo'lsa), tanlovni tozalaymiz — aks holda mijoz "usta A"
      // tanlangan holicha, u qilmaydigan xizmatga bron qilib qo'yishi
      // mumkin edi (chunki keyingi qadam validatsiyasi faqat masterId
      // bo'sh emasligini tekshiradi, mosligini emas).
      const currentMaster = MASTERS.find(m => m.id === state.masterId);
      if (currentMaster && !currentMaster.specialties.includes(state.serviceId)) {
        state.masterId = null;
      }
      renderModalServiceList();
      renderModalMasterList();
    });
  });
}

function renderModalMasterList() {
  const wrap = document.getElementById('modalMasterList');
  const relevant = state.serviceId ? MASTERS.filter(m => m.specialties.includes(state.serviceId)) : MASTERS;
  const list = relevant.length ? relevant : MASTERS;

  wrap.innerHTML = list.map(m => `
    <button type="button" data-master-id="${m.id}"
      class="master-opt text-center border rounded-xl p-3 transition-colors ${state.masterId === m.id ? 'border-gold-500 bg-gold-500/10' : 'border-emerald-950/12 hover:border-emerald-950/30'}">
      <img src="${m.img}" class="w-14 h-14 rounded-full object-cover mx-auto mb-2" alt="${pickLang(m.name, m.name_ru, m.name_en)}">
      <div class="text-xs font-semibold leading-tight">${pickLang(m.name, m.name_ru, m.name_en).split(' ')[0]}</div>
    </button>
  `).join('');

  wrap.querySelectorAll('[data-master-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.masterId = btn.dataset.masterId;
      renderModalMasterList();
    });
  });
}

/* ---------------------------------------------------------------------------
   Qadamlar orasida yurish
--------------------------------------------------------------------------- */
function goToStep(n) {
  state.step = n;
  document.querySelectorAll('.booking-step').forEach(el => {
    el.classList.toggle('hidden', Number(el.dataset.step) !== n);
  });
  document.querySelectorAll('[data-step-dot]').forEach(dot => {
    const s = Number(dot.dataset.stepDot);
    dot.classList.toggle('bg-gold-500', s <= n);
    dot.classList.toggle('bg-emerald-950/10', s > n);
  });
  document.getElementById('stepLabel').textContent = stepLabel(n);
  document.getElementById('backBtn').classList.toggle('hidden', n === 1);
  document.getElementById('nextBtn').classList.toggle('hidden', n === 3);
  document.getElementById('confirmBtn').classList.toggle('hidden', n !== 3);

  // UI TUZATISH: 1-qadamda (xizmat/barber ro'yxati) mijoz pastga skroll
  // qilib "Davom etish"ni bosishi mumkin edi — shu holatda modal skroll
  // pozitsiyasi saqlanib qolib, 2- yoki 3-qadam ochilganda mijoz bo'sh
  // joyni ko'rib qolar, sarlavha va yangi qadam tepada qolib ketardi.
  // Har bir qadam almashganda modal ichini yuqoriga qaytaramiz.
  const scrollPanel = modal().querySelector('.overflow-y-auto');
  if (scrollPanel) scrollPanel.scrollTop = 0;

  if (n === 2) renderTimeSlots();
  if (n === 3) renderSummary();
}

function stepBack() {
  if (state.step > 1) goToStep(state.step - 1);
}

function stepNext() {
  if (state.step === 1) {
    if (!state.serviceId) return alert(t('booking.errChooseService'));
    if (!state.masterId) return alert(t('booking.errChooseMaster'));
    const master = MASTERS.find(m => m.id === state.masterId);
    if (!master || !master.specialties.includes(state.serviceId)) {
      state.masterId = null;
      renderModalMasterList();
      return alert(t('booking.errMasterMismatch'));
    }
  }
  if (state.step === 2) {
    const dateVal = document.getElementById('bookingDate').value;
    if (!dateVal) return alert(t('booking.errChooseDate'));
    if (!state.time) return alert(t('booking.errChooseTime'));
    state.date = dateVal;
  }
  if (state.step < 3) goToStep(state.step + 1);
}

/* ---------------------------------------------------------------------------
   2-qadam: Vaqt slotlari
--------------------------------------------------------------------------- */
async function renderTimeSlots() {
  const dateVal = document.getElementById('bookingDate').value;
  const wrap = document.getElementById('timeSlotWrap');

  if (!dateVal || !state.masterId) {
    wrap.innerHTML = `<p class="text-sm text-emerald-950/40">${t('booking.chooseDateFirst')}</p>`;
    return;
  }

  // Foydalanuvchi sana maydoniga qo'lda yozayotganda tugallanmagan/noto'g'ri
  // qiymatlar (masalan yil qismi 1-3 ta raqam bo'lganda) ham "change" hodisasi
  // sifatida kelib qolishi mumkin — bunday holatda serverga so'rov yubormaymiz.
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateVal) &&
    Number(dateVal.slice(0, 4)) >= 2020 && Number(dateVal.slice(0, 4)) <= 2100;
  if (!isValidDate) {
    wrap.innerHTML = `<p class="text-sm text-emerald-950/40">${t('booking.chooseDateValid')}</p>`;
    return;
  }

  state.date = dateVal;

  const key = `${state.masterId}_${dateVal}`;

  // Yuklanmoqda holati (server javobini kutayotganda)
  wrap.innerHTML = `<p class="text-sm text-emerald-950/40"><i class="fa-solid fa-spinner fa-spin mr-1"></i> ${t('booking.checkingSlots')}</p>`;

  // Haqiqiy band vaqtlarni Supabase'dan olib kelamiz va keshni yangilaymiz
  // (shu orqali boshqa mijozlar qilgan bronlar ham hisobga olinadi), shu
  // bilan bir qatorda ustaning admin panelda belgilangan dam olish/bandlik
  // vaqtlarini ham (sql/PATCH_round7_master_time_off.sql) olamiz.
  let timeOff = [];
  try {
    const [serverBooked, serverTimeOff] = await Promise.all([
      fetchBookedSlots(state.masterId, dateVal),
      fetchMasterTimeOff(state.masterId, dateVal),
    ]);
    bookedSlotsCache[key] = serverBooked;
    timeOff = serverTimeOff;
  } catch (err) {
    console.warn("Band vaqtlarni olishda xatolik:", err);
  }

  // Butun kun band (start_time/end_time yo'q yozuv) bo'lsa — vaqt slotlarini
  // umuman ko'rsatmaymiz, o'rniga tushunarli xabar chiqaramiz.
  const fullDayOff = timeOff.find(off => !off.start_time);
  if (fullDayOff) {
    const reasonText = fullDayOff.reason
      ? String(fullDayOff.reason).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
      : t('booking.dayOff');
    wrap.innerHTML = `<p class="text-sm text-red-600 font-semibold"><i class="fa-solid fa-circle-info mr-1"></i> ${reasonText} ${t('booking.chooseOtherDay')}</p>`;
    return;
  }

  const booked = [...(bookedSlotsCache[key] || []), ...timeOff.map(off => ({
    time: off.start_time,
    duration: toMinutes(off.end_time) - toMinutes(off.start_time),
  }))];
  const slots = generateDaySlots();

  // Tanlangan xizmatning davomiyligi — shu bo'yicha slot band/bo'sh
  // ekanini hisoblaymiz (audit round-2, #8: avval faqat boshlanish vaqti
  // solishtirilardi, xizmat davomiyligi hisobga olinmasdi — natijada
  // masalan 10:00dagi 50 daqiqalik bron 10:30ni "bo'sh" deb ko'rsatib,
  // ustaning oldida ikki mijoz to'qnashishi mumkin edi).
  const currentService = SERVICES.find(s => s.id === state.serviceId);
  const currentDuration = currentService?.duration || 30;

  // Sayt ish vaqti 09:00–20:00 (bekor qilinishi mumkin bo'lgan yopilish
  // vaqtidan keyin xizmat "davom etib" ketmasligi uchun).
  const CLOSING_MINUTES = 20 * 60;

  function toMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function isOverlapping(candidateStart) {
    const candidateEnd = candidateStart + currentDuration;
    if (candidateEnd > CLOSING_MINUTES) return true; // yopilish vaqtidan keyin tugaydi
    return booked.some(b => {
      const bStart = toMinutes(b.time);
      const bEnd = bStart + (b.duration || 30);
      return candidateStart < bEnd && candidateEnd > bStart;
    });
  }

  // Bugungi sana tanlangan bo'lsa, allaqachon o'tib ketgan (yoki juda yaqin,
  // ustaga tayyorgarlik uchun vaqt qolmagan) vaqt slotlarini bloklaymiz —
  // aks holda mijoz "bugun soat 10:00" kabi allaqachon o'tgan vaqtga ham
  // bron qilib qo'yishi mumkin edi.
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const isToday = dateVal === todayStr;
  const PREP_BUFFER_MIN = 30;

  wrap.innerHTML = slots.map(slotTime => {
    const isBooked = isOverlapping(toMinutes(slotTime));
    let isPast = false;
    if (isToday) {
      const [hh, mm] = slotTime.split(':').map(Number);
      const slotDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
      isPast = (slotDateTime - now) < PREP_BUFFER_MIN * 60000;
    }
    const isDisabled = isBooked || isPast;
    const isSelected = state.time === slotTime;
    return `<button type="button" data-time="${slotTime}" ${isDisabled ? 'disabled' : ''} ${isPast && !isBooked ? `title="${t('booking.slotPast')}"` : (isBooked && !isPast ? `title="${t('booking.slotTaken')}"` : '')}
      class="slot-btn font-mono text-sm border rounded-lg px-3.5 py-2.5 ${isSelected ? 'selected' : 'border-emerald-950/15 hover:border-gold-500'}">
      ${slotTime}
    </button>`;
  }).join('');

  wrap.querySelectorAll('[data-time]:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.time = btn.dataset.time;
      renderTimeSlots();
    });
  });
}

/* ---------------------------------------------------------------------------
   4-qadam: Xulosa (chipta)
--------------------------------------------------------------------------- */
function renderSummary() {
  const service = SERVICES.find(s => s.id === state.serviceId);
  const master = MASTERS.find(m => m.id === state.masterId);

  document.getElementById('sumService').textContent = (service && pickLang(service.name, service.name_ru, service.name_en)) || '—';
  document.getElementById('sumMaster').textContent = master ? `${t('ticket.barberPrefix')}: ${pickLang(master.name, master.name_ru, master.name_en)}` : '—';
  document.getElementById('sumDate').textContent = formatDateUz(state.date);
  document.getElementById('sumTime').textContent = state.time || '—';
  document.getElementById('sumClient').textContent = state.name || '—';
  document.getElementById('sumPhone').textContent = state.phone || '—';
  document.getElementById('sumDuration').textContent = service ? `${service.duration} ${t('services.minutes')}` : '—';
  document.getElementById('sumPrice').textContent = service ? money(service.price) : '—';
}

/* ---------------------------------------------------------------------------
   Bepul Telegram eslatma: mijozni botga yo'naltiradigan tugma.
   Mijoz "Start" bossa, botimiz (sql/reminders.sql + Edge Function orqali)
   uning chat_id'sini shu bronga bog'laydi va navbatidan ~2 soat oldin
   avtomatik eslatma yuboradi. To'liq sozlash: REMINDERS_SETUP.md.
--------------------------------------------------------------------------- */
function renderReminderButton(bookingId) {
  const wrap = document.getElementById('reminderCta');
  if (!wrap) return;

  if (!TELEGRAM_BOT_USERNAME || !bookingId) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }

  const deepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=b${bookingId}`;
  wrap.innerHTML = `
    <a href="${deepLink}" target="_blank" rel="noopener noreferrer"
      class="flex items-center justify-center gap-2 border border-gold-400/60 text-gold-600 font-semibold text-sm px-5 py-3 rounded-full hover:bg-gold-50 transition-colors mb-2">
      <i class="fa-brands fa-telegram"></i> ${t('booking.reminderCta')}
    </a>`;
  wrap.classList.remove('hidden');
}

/* ---------------------------------------------------------------------------
   Yuborish: Supabase + Telegram (api.js orqali)
--------------------------------------------------------------------------- */
// Modul darajasidagi bayroq — "Bron qilish" tugmasi tez-tez (ikki marta)
// bosilsa ham, ikkinchi bosilish HECH NARSA qilmasdan darhol chiqib
// ketishi uchun. `confirmBtn.disabled = true` ham qo'yiladi, lekin u DOM
// render/event-loop tsiklidan keyin kuchga kiradi — shu oradagi juda tez
// ikkinchi bosishda ikkalasi ham submitBooking() ni ishga tushirib,
// bitta buyurtma o'rniga ikkita alohida bron yozilib qolishi mumkin edi.
// Shu bayroq esa darhol, sinxron tarzda tekshiriladi.
let isSubmitting = false;

async function submitBooking() {
  if (isSubmitting) return;

  if (!state.name || !state.phone) {
    alert(t('booking.errProfileMissing'));
    return;
  }

  isSubmitting = true;

  const service = SERVICES.find(s => s.id === state.serviceId);
  const master = MASTERS.find(m => m.id === state.masterId);
  const statusEl = document.getElementById('submitStatus');
  const confirmBtn = document.getElementById('confirmBtn');

  // --- Oddiy bot filtri (client tomonda) -----------------------------------
  // 1) Honeypot: odam ko'rmaydigan maydon to'ldirilgan bo'lsa — bot.
  // 2) Vaqt izi: modal ochilganidan 3 soniyadan kamroq vaqt ichida 4 qadamli
  //    forma to'liq to'ldirilib yuborilgan bo'lsa — inson uchun amalda
  //    imkonsiz, demak avtomatlashtirilgan yuborish ehtimoli katta.
  // Eslatma: bu faqat oddiy/ommaviy botlarni to'xtatadi. Haqiqiy himoya
  // supabase/schema.sql dagi server tomon tekshiruvlarida (narx/davomiylik
  // katalogdan olinishi va tezlik cheklovi) amalga oshirilgan — chunki
  // client kodini istalgan kishi o'chirib/o'zgartirib yuborishi mumkin.
  const honeypot = document.getElementById('companyWebsite').value;
  const elapsed = Date.now() - state.openedAt;
  if (honeypot || elapsed < 3000) {
    console.warn('Bron bot deb belgilandi va bloklandi (honeypot yoki juda tez yuborish).');
    statusEl.classList.remove('hidden');
    statusEl.className = 'text-sm mb-2 text-red-600 font-semibold';
    statusEl.textContent = t('booking.errBotBlocked');
    isSubmitting = false;
    return;
  }

  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${t('booking.sending')}`;
  document.getElementById('backBtn').disabled = true;
  document.getElementById('modalCloseBtn').disabled = true;
  statusEl.classList.add('hidden');
  showTicketLoading();

  try {
    const saved = await submitBookingToBackend({
      service, master,
      date: state.date,
      time: state.time,
      name: state.name,
      phone: toFullPhone(state.phone),
    });

    hideTicketLoading();
    // MUHIM: bron muvaffaqiyatli yakunlangach, "isSubmitting" bayrog'ini
    // ham qaytarish SHART — aks holda u "true" holicha qolib ketadi (avval
    // faqat xatolik bo'lganda "false"ga qaytarilardi) va closeBooking()
    // "hali yuborilyapti" deb hisoblab, X / "Yopish" tugmalarini bosilganda
    // hech narsa qilmay jim chiqib ketaverardi — mijoz oynani yopa olmay
    // qolardi.
    isSubmitting = false;
    document.getElementById('backBtn').disabled = false;
    document.getElementById('modalCloseBtn').disabled = false;
    statusEl.classList.remove('hidden');
    statusEl.className = 'text-sm mb-2 text-emerald-700 font-semibold';
    statusEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> ${t('booking.success')}`;

    // Chiptani "tasdiqlangan bron kartasi"ga aylantiramiz
    const code = generateBookingCode(saved?.id);
    document.getElementById('sumCode').textContent = code;
    document.getElementById('sumCodeRow').classList.remove('hidden');
    document.getElementById('ticketLabel').textContent = t('ticket.confirmedLabel');
    document.getElementById('ticketStamp').classList.remove('hidden');

    confirmBtn.classList.add('hidden');
    // UI TUZATISH: bron muvaffaqiyatli yuborilgach, "Orqaga" tugmasi
    // avval ham ko'rinishda qolardi — mijoz bosib, allaqachon saqlangan
    // bronni o'zgartirayotgandek 2-qadamga qaytib ketishi mumkin edi.
    // Endi tasdiqlangan chiptada faqat "Yopish" tugmasi qoladi.
    document.getElementById('backBtn').classList.add('hidden');
    document.getElementById('closeTicketBtn').classList.remove('hidden');

    // Bepul Telegram eslatma: mijoz botni ishga tushirsa, navbatidan
    // ~2 soat oldin avtomatik eslatma oladi (sozlash: config.js +
    // sql/reminders.sql). Bot username kiritilmagan bo'lsa, tugma chiqmaydi.
    renderReminderButton(saved?.id);

    const key = `${state.masterId}_${state.date}`;
    if (!bookedSlotsCache[key]) bookedSlotsCache[key] = [];
    bookedSlotsCache[key].push({ time: state.time, duration: service.duration });
  } catch (err) {
    console.error(err);
    hideTicketLoading();
    document.getElementById('backBtn').disabled = false;
    document.getElementById('modalCloseBtn').disabled = false;
    statusEl.classList.remove('hidden');
    statusEl.className = 'text-sm mb-2 text-red-600 font-semibold';
    // MUHIM (til sizib chiqmasligi uchun): js/api.js'dan kelgan xabarlar
    // `.friendly = true` bilan belgilanadi — bular allaqachon joriy tilga
    // tarjima qilingan va to'g'ridan-to'g'ri ko'rsatilishi mumkin. Agar
    // biror sabab bilan bu belgisiz, kutilmagan (masalan tarmoq xatosi)
    // xabar kelib qolsa — uni XOM holda HECH QACHON ko'rsatmaymiz (chunki
    // u boshqa tilda yoki texnik bo'lishi mumkin), faqat konsolga yozamiz
    // va o'rniga umumiy, joriy tilga tarjima qilingan xabar chiqaramiz.
    if (err && err.friendly) {
      statusEl.textContent = err.message;
    } else {
      console.error('Tarjima qilinmagan/kutilmagan xatolik:', err);
      statusEl.textContent = t('booking.errGeneric') + '. ' + t('booking.errRetry');
    }
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> ${t('booking.confirm')}`;
    isSubmitting = false;
  }
}

// Til almashganda, agar bron oynasi ochiq bo'lsa — oy/kun nomlarini va
// joriy qadam sarlavhasini joriy tilga qarab qayta chizamiz.
document.addEventListener('bilol:langchange', () => {
  if (modal().classList.contains('hidden')) return;
  renderModalServiceList();
  renderModalMasterList();
  renderMonthTabs();
  renderDayCards();
  document.getElementById('stepLabel').textContent = stepLabel(state.step);
  if (state.step === 3) renderSummary();
});

/* ---------------------------------------------------------------------------
   Modalning statik hodisalarini ulash (bir marta chaqiriladi)
--------------------------------------------------------------------------- */
export function initBookingModal() {
  document.querySelectorAll('[data-open-booking]').forEach(btn => {
    btn.addEventListener('click', () => {
      openBooking();
    });
  });

  document.getElementById('modalCloseBtn').addEventListener('click', closeBooking);
  document.getElementById('modalBackdrop').addEventListener('click', closeBooking);

  document.getElementById('backBtn').addEventListener('click', stepBack);
  document.getElementById('nextBtn').addEventListener('click', stepNext);
  document.getElementById('confirmBtn').addEventListener('click', submitBooking);
  document.getElementById('closeTicketBtn').addEventListener('click', closeBooking);

  populateDateSelects();

  // Esc bosilganda modalni yopish
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal().classList.contains('hidden')) closeBooking();
  });
        }
