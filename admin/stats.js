// =============================================================================
// ADMIN STATISTIKA: Oylik/haftalik tahlil, grafiklar va KPI kartalar.
//
// Bu modul admin panelining "Statistika" bo'limini boshqaradi:
// - Sana oralig'i filtri (bugun, hafta, oy, custom)
// - Supabase'dan ma'lumot yuklash (filtrlangan bronlar)
// - KPI hisoblash (tushum, bekor %, no-show %)
// - Chart.js orqali grafiklar chizish
// - Ustalar va xizmatlar bo'yicha tahlil
// =============================================================================

// =============================================================================
// SANA ORALIQ HISOBLASH
// =============================================================================

/** Berilgan sana uchun "boshlanish" sanasini qaytaradi (00:00 vaqti bilan).
 *  Masalan: "2024-08-15" => "2024-08-15" (string sifatida) */
function dateToString(date) {
  return date.toISOString().split('T')[0];
}

/** Bugungi sanani "bugun" deb qaytaradi (UTC asosida, lekin server qayd qilgani kabi) */
function getTodayString() {
  return dateToString(new Date());
}

/** Berilgan range ('today', 'week', 'month', 'custom') uchun
 *  {from, to} ob'ektini qaytaradi (YYYY-MM-DD formatida). */
function computeDateRange(rangeOrCustom) {
  const today = new Date();
  let from, to;

  if (typeof rangeOrCustom === 'object' && rangeOrCustom.from && rangeOrCustom.to) {
    // Custom sana oralig'i
    return {
      from: rangeOrCustom.from,
      to: rangeOrCustom.to,
    };
  }

  const range = rangeOrCustom || 'today';
  to = today;

  switch (range) {
    case 'today':
      from = new Date(today);
      from.setHours(0, 0, 0, 0);
      break;
    case 'week': {
      // Shu haftaning boshi (dushanba)
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // dushanba = 1, yakshanba = 0
      from = new Date(today.setDate(diff));
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      // Shu oyning boshi
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case '30days':
      // Oxirgi 30 kun
      from = new Date(today);
      from.setDate(from.getDate() - 29); // 29 kun oldin, bugun qo'shib = 30 kun
      from.setHours(0, 0, 0, 0);
      break;
    case '3months':
      // Oxirgi 3 oy
      from = new Date(today);
      from.setMonth(from.getMonth() - 3);
      from.setHours(0, 0, 0, 0);
      break;
    default:
      from = new Date(today);
      from.setHours(0, 0, 0, 0);
  }

  return {
    from: dateToString(from),
    to: dateToString(to),
  };
}

// =============================================================================
// SUPABASE MA'LUMOT YUKLASH
// =============================================================================

/** Supabase'dan tanlangan sana oralig'idagi bronlarni yuklaydi.
 *  fromDate, toDate — YYYY-MM-DD formatida string.
 *  Qaytaradi: {bookings: [], error: null} yoki {bookings: null, error: "xato matni"}
 */
async function fetchStatsBookings(supabaseClient, fromDate, toDate) {
  if (!supabaseClient) {
    return { bookings: null, error: 'Supabase ulanmagan' };
  }

  try {
    // Loading holatini ko'rsatish — KPI kartalarni skeleton bilan to'ldirish
    showStatsLoading(true);

    const { data, error } = await supabaseClient
      .from('bookings')
      .select(
        'id, service_id, service_name, master_id, master_name, ' +
        'booking_date, booking_time, client_name, client_phone, ' +
        'price, duration, status, created_at'
      )
      .gte('booking_date', fromDate)
      .lte('booking_date', toDate)
      .order('booking_date', { ascending: true })
      .limit(5000); // Xavfsizlik: 1 yildan ko'proq tanlansa ham shart emas

    if (error) {
      console.error('Statistika so\'rovi xatosi:', error);
      toast('Statistika yuklanmadi: ' + (error.message || 'Noma\'lum xato'), 'error');
      return { bookings: null, error: error.message };
    }

    return { bookings: data || [], error: null };
  } catch (err) {
    console.error('Statistika yuklash exception:', err);
    toast('Statistika yuklashda muammo', 'error');
    return { bookings: null, error: err.message };
  } finally {
    showStatsLoading(false);
  }
}

/** Supabase'dan kommentlar (sharhlar) va reyting ma'lumotlarini yuklaydi. */
async function fetchStatsComments(supabaseClient, fromDate, toDate) {
  if (!supabaseClient) return { comments: [], error: null };

  try {
    const { data, error } = await supabaseClient
      .from('comments')
      .select('id, rating, created_at')
      .eq('status', 'approved')
      .gte('created_at', fromDate + 'T00:00:00')
      .lte('created_at', toDate + 'T23:59:59')
      .limit(1000);

    if (error) {
      console.warn('Kommentlar so\'rovi xatosi:', error);
      return { comments: [], error: null }; // Xato bo'lsa, sharhlar bo'lmasin deb hisoblaymiz
    }

    return { comments: data || [], error: null };
  } catch (err) {
    console.warn('Kommentlar yuklash exception:', err);
    return { comments: [], error: null };
  }
}

// =============================================================================
// UI YANGILASH VA LOADING HOLATLAR
// =============================================================================

/** KPI kartalar va grafiklar yuklanmoqda holatini ko'rsatadi yoki o'chiradi. */
function showStatsLoading(isLoading) {
  const kpiRow = document.getElementById('statsKpiRow');
  if (!kpiRow) return;

  if (isLoading) {
    // KPI kartalarni skeleton bilan to'ldirish
    kpiRow.querySelectorAll('.stat-value').forEach(el => {
      el.textContent = '...';
      el.style.opacity = '0.5';
    });
  } else {
    // Skeleton olib tashlash
    kpiRow.querySelectorAll('.stat-value').forEach(el => {
      el.style.opacity = '1';
    });
  }
}

/** Bo'sh natija holatini ko'rsatadi (agar bronlar bo'lmasa). */
function showStatsEmpty(show = true) {
  const emptyEl = document.getElementById('statsEmpty');
  const chartsGrid = document.querySelector('.stats-charts-grid');
  const kpiRow = document.getElementById('statsKpiRow');

  if (emptyEl) emptyEl.classList.toggle('hidden', !show);
  if (chartsGrid) chartsGrid.classList.toggle('hidden', show);
  if (kpiRow) kpiRow.classList.toggle('hidden', show);
}

/** Bitta toast (notification) ko'rsatadi. Boshqa joylarda ishlatilgan kabi. */
function toast(message, type = 'info') {
  const toastHost = document.getElementById('toastHost');
  if (!toastHost) return;

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.textContent = message;
  toastEl.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--ink);
    color: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 9999;
    animation: slideIn 0.3s ease-out;
  `;
  toastHost.appendChild(toastEl);

  setTimeout(() => toastEl.remove(), 3000);
}

// =============================================================================
// ASOSIY RENDER FUNKSIYASI
// =============================================================================

/** Statistika sahifasini yangilaydi: ma'lumot yuklash, KPI hisoblash, grafiklar chizish.
 *  admin.js da global 'supabaseClient' ishlatiladi. */
export async function renderStatsPanel(rangeOrCustom = 'today') {
  // Supabase clientini admin.js dan olamiz (u global o'zgaruvchi)
  const globalScope = window;
  const supabaseClient = globalScope.supabaseClient || window.supabaseClient;

  if (!supabaseClient) {
    console.error('Supabase client topilmadi');
    toast('Supabase ulanmagan', 'error');
    return;
  }

  // Sana oralig'ini hisoblash
  const dateRange = computeDateRange(rangeOrCustom);
  console.log('Sana oralig\'i:', dateRange);

  // Ma'lumot yuklash
  const { bookings, error: bookingsError } = await fetchStatsBookings(
    supabaseClient,
    dateRange.from,
    dateRange.to
  );

  if (bookingsError || !bookings) {
    showStatsEmpty(true);
    return;
  }

  if (bookings.length === 0) {
    showStatsEmpty(true);
    return;
  }

  showStatsEmpty(false);

  // Kommentlarni ham yuklash (KPI uchun)
  const { comments } = await fetchStatsComments(supabaseClient, dateRange.from, dateRange.to);

  console.log('Yuklangan bronlar:', bookings.length);
  console.log('Yuklangan kommentlar:', comments.length);
  // Keyingi bosqichlarda KPI hisoblash va grafiklar chizish qo'shiladi
}

/** Statistika bo'limini birinchi marta initsializatsiya qiladi:
 *  filter tugmalariga event listener qo'shadi. */
export async function initStatsView() {
  const filterBtns = document.querySelectorAll('.stats-filter-btn');
  const applyCustomBtn = document.getElementById('statsApplyCustom');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const range = e.target.dataset.range;
      if (range) {
        // Barcha tugmalardan 'active' klassni olib tashlaydi
        filterBtns.forEach(b => b.classList.remove('active'));
        // Bosilgan tugmaga qo'shamuz
        e.target.classList.add('active');
        // Statistika sahifasini yangilayapman
        renderStatsPanel(range);
      }
    });
  });

  applyCustomBtn?.addEventListener('click', () => {
    const fromDate = document.getElementById('statsFromDate').value;
    const toDate = document.getElementById('statsToDate').value;
    if (fromDate && toDate) {
      // Custom sana bo'lsa, tugmalardan active klassni olib tashlash
      filterBtns.forEach(b => b.classList.remove('active'));
      renderStatsPanel({ from: fromDate, to: toDate });
    }
  });
}
