// =============================================================================
// MENING BRONLARIM: login qilgan mijoz o'z bronlarini bosh sahifada, alohida
// oyna(modal)/tab ochmasdan, xuddi shaxsiy kabinet (dashboard) kabi ko'radi —
// necha vaqt qolganini (countdown) kuzatadi va hali boshlanmagan bronni
// bekor qiladi.
//
// MUHIM: bekor qilish to'g'ridan-to'g'ri UPDATE orqali emas, balki
// sql/PATCH_round5_client_cancel_booking.sql dagi cancel_own_booking() RPC
// funksiyasi orqali amalga oshiriladi — chunki bookings jadvalida UPDATE
// huquqi RLS orqali faqat adminga berilgan (auth_and_noshow.sql'ga qarang).
// =============================================================================
import { getSupabaseClient, notifyBookingCancelled } from './api.js';
import { getCurrentProfile } from './auth.js';
import { money, formatDateUz, SERVICES, MASTERS, pickLang } from './data.js';
import { t, translateServerError } from './i18n.js';

function statusLabel(status) {
  return t(`status.${status}`);
}

/**
 * `bookings.service_name`/`master_name` bazada bron yaratilgan paytdagi
 * (har doim o'zbek tilidagi) "muzlatilgan" nusxa — chunki shu ustunlar
 * admin panel/Telegram uchun ham ishlatiladi (tafsilot: js/api.js).
 * Mijozning shaxsiy kabinetida esa nomni joriy SERVICES/MASTERS
 * katalogidan (u RU nomi bilan ham keladi) qidirib, joriy tilga mos
 * ko'rsatamiz. Agar xizmat/xodim keyinchalik o'chirilgan yoki nofaol
 * qilingan bo'lsa (shuning uchun joriy katalogda topilmaydi) — bazadagi
 * eski (uz) nomga qaytamiz, bo'sh joy ko'rsatmaslik uchun.
 */
function localizedServiceName(b) {
  const svc = SERVICES.find(s => s.id === b.service_id);
  return svc ? pickLang(svc.name, svc.name_ru, svc.name_en) : b.service_name;
}

function localizedMasterName(b) {
  const m = MASTERS.find(x => x.id === b.master_id);
  return m ? pickLang(m.name, m.name_ru, m.name_en) : b.master_name;
}

// MUHIM: bu qiymat sql/PATCH_round5_client_cancel_booking.sql dagi
// v_min_notice bilan bir xil (2 soat) bo'lishi kerak — shu yerda faqat
// tugmani oldindan yashirish/xabar berish uchun ishlatiladi, haqiqiy
// (kafolatlangan) tekshiruv baribir bazadagi RPC funksiyada.
const MIN_CANCEL_NOTICE_MS = 2 * 60 * 60 * 1000;

let cachedBookings = [];
let countdownTimer = null;

function section() { return document.getElementById('mening-bronlarim'); }
function listEl() { return document.getElementById('myBookingsList'); }

function bookingDateTime(b) {
  return new Date(`${b.booking_date}T${b.booking_time}:00`);
}

/** Millisekundni "2 kun 3 soat qoldi" kabi o'qilishi oson matnga aylantiradi. */
function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} ${t('countdown.day')}`);
  if (hours > 0) parts.push(`${hours} ${t('countdown.hour')}`);
  if (days === 0 && mins > 0) parts.push(`${mins} ${t('countdown.minute')}`);
  return parts.length ? parts.join(' ') + ' ' + t('countdown.left') : t('countdown.startingNow');
}

function renderList() {
  const el = listEl();
  if (!el) return;

  if (!cachedBookings.length) {
    el.innerHTML = `<p class="col-span-full text-center text-cream/50 py-10">${t('dashboard.empty')}</p>`;
    return;
  }

  el.innerHTML = cachedBookings.map(b => {
    const dt = bookingDateTime(b);
    const ms = dt.getTime() - Date.now();
    const isActiveStatus = b.status === 'new' || b.status === 'confirmed';
    const countdown = isActiveStatus ? formatCountdown(ms) : null;
    // Bekor qilish faqat boshlanishiga kamida 2 soat qolganda mumkin
    // (haqiqiy tekshiruv RPC funksiyada — bu yerda faqat UI uchun).
    const canCancel = isActiveStatus && ms >= MIN_CANCEL_NOTICE_MS;
    const tooLateToCancel = isActiveStatus && ms > 0 && ms < MIN_CANCEL_NOTICE_MS;
    const stCls = b.status === 'cancelled' || b.status === 'no_show' ? 'text-red-400 bg-red-500/10'
      : b.status === 'done' ? 'text-emerald-300 bg-emerald-500/10'
      : 'text-gold-400 bg-gold-500/10';

    return `
    <div class="bg-cream/6 border border-cream/10 rounded-2xl p-5">
      <div class="flex items-center justify-between mb-1 gap-2">
        <span class="font-semibold">${localizedServiceName(b)}</span>
        <span class="text-xs font-semibold px-2.5 py-1 rounded-full ${stCls} whitespace-nowrap">${statusLabel(b.status) || b.status}</span>
      </div>
      <p class="text-sm text-cream/60">${localizedMasterName(b)} · ${formatDateUz(b.booking_date)}, ${b.booking_time}</p>
      <p class="text-sm text-cream/60">${money(b.price)}</p>
      ${countdown ? `<p class="text-gold-400 font-semibold text-sm mt-2"><i class="fa-regular fa-clock mr-1"></i>${countdown}</p>` : ''}
      ${canCancel ? `<button type="button" class="cancel-booking-btn mt-3 w-full border border-red-400/30 text-red-400 font-semibold py-2.5 rounded-full hover:bg-red-500/10 transition-colors" data-cancel-id="${b.id}">${t('dashboard.cancelBtn')}</button>` : ''}
      ${tooLateToCancel ? `<p class="text-xs text-cream/40 mt-3"><i class="fa-solid fa-circle-info mr-1"></i>${t('dashboard.tooLate')}</p>` : ''}
    </div>`;
  }).join('');

  el.querySelectorAll('.cancel-booking-btn').forEach(btn => {
    btn.addEventListener('click', () => handleCancel(btn.dataset.cancelId, btn));
  });
}

async function loadMyBookings() {
  const el = listEl();
  if (!el) return;

  const profile = getCurrentProfile();
  if (!profile) {
    // Chiqib ketilganda ro'yxatni tozalab qo'yamiz — bo'lim ham
    // data-auth-logged-in orqali avtomatik yashiriladi.
    cachedBookings = [];
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `<p class="col-span-full text-center py-10"><i class="fa-solid fa-spinner fa-spin"></i></p>`;

  const client = getSupabaseClient();
  if (!client) { cachedBookings = []; renderList(); return; }

  const { data, error } = await client
    .from('bookings')
    .select('id, service_id, service_name, master_id, master_name, booking_date, booking_time, price, status')
    .eq('user_id', profile.id)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: false });

  if (error) {
    // MUHIM (til sizib chiqmasligi): xom Supabase/Postgres xabarini
    // ko'rsatmaymiz — u har doim o'zbekcha bo'lishi mumkin. Konsolga
    // yozamiz, ekranga esa faqat joriy tildagi umumiy xabarni chiqaramiz.
    console.error('Bronlarni yuklashda xatolik:', error.message);
    el.innerHTML = `<p class="col-span-full text-center text-red-400 py-10">${t('dashboard.loadError')}</p>`;
    return;
  }
  cachedBookings = data || [];
  renderList();
}

async function handleCancel(id, btn) {
  if (!confirm(t('dashboard.cancelConfirm'))) return;
  btn.disabled = true;
  const original = btn.textContent;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  // Xabar botga aniq ma'lumot bilan (mijoz ismi/telefoni) borishi uchun,
  // bekor qilishdan OLDIN shu bronning joriy ma'lumotlarini saqlab qo'yamiz.
  const cancelledBooking = cachedBookings.find(b => String(b.id) === String(id));

  const client = getSupabaseClient();
  try {
    const { error } = await client.rpc('cancel_own_booking', { p_booking_id: Number(id) });
    if (error) throw error;

    if (cancelledBooking) {
      const profile = getCurrentProfile();
      notifyBookingCancelled({
        ...cancelledBooking,
        client_name: profile?.full_name || '—',
        client_phone: profile?.phone || '—',
      }).catch(err => console.warn("Bekor qilish haqida botga xabar yuborilmadi:", err));
    }

    await loadMyBookings();
  } catch (err) {
    // MUHIM (til sizib chiqmasligi): cancel_own_booking() RPC xato bersa,
    // xabar bazada har doim o'zbekcha keladi (masalan "kamida 2 soat
    // qolganda bekor qilish mumkin"). Xom holda alert() qilish o'rniga,
    // avval joriy tilga tarjima qilishga urinamiz; tanib bo'lmasa xom
    // matnni ko'rsatmasdan umumiy xabarga tushamiz.
    const translated = translateServerError(err.message);
    alert(translated || t('dashboard.cancelError'));
    if (!translated) console.error('Tarjima qilinmagan bekor qilish xatoligi:', err.message);
    btn.disabled = false;
    btn.textContent = original;
  }
}

export function initMyBookings() {
  // Sahifa ochilishi bilan darhol yuklaymiz (login holati hali aniqlanmagan
  // bo'lsa bo'sh chiqadi — auth.js login/sessiya tiklanganda 'bilol:authchange'
  // hodisasini yuboradi va biz shu yerda qayta yuklaymiz).
  loadMyBookings();

  document.addEventListener('bilol:authchange', loadMyBookings);
  document.addEventListener('bilol:langchange', renderList);

  // Countdown matnini har daqiqada yangilab turish uchun.
  if (!countdownTimer) countdownTimer = setInterval(renderList, 60000);
}
