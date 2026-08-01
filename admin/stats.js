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
// KPI HISOBLASH
// =============================================================================

/** Berilgan bronlar massividan KPI (Key Performance Indicators) hisoblaydi.
 *  Qaytaradi: {revenue, totalBookings, avgCheck, cancelRate, noShowRate, busiestDay, busiestDayCount}
 *
 *  Status mantig'i (qo'llanmada aytilgan):
 *  - Tushum: faqat 'done' bronlar narxlari
 *  - Jami bronlar: 'cancelled' BO'LMAGAN bronlar
 *  - Bekor qilish %: cancelled / (jami + cancelled) × 100
 *  - No-show %: no_show / (done + no_show) × 100 (faqat "kelishi kerak bo'lganlar" orasida)
 */
function computeKpis(bookings) {
  if (!bookings || bookings.length === 0) {
    return {
      revenue: 0,
      totalBookings: 0,
      avgCheck: 0,
      cancelRate: 0,
      noShowRate: 0,
      busiestDay: '—',
      busiestDayCount: 0,
    };
  }

  let revenue = 0;
  let doneCount = 0;
  let cancelledCount = 0;
  let noShowCount = 0;
  const dayCountMap = {}; // hafta kuni -> bron soni
  const dayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', "Payshanba", 'Juma', 'Shanba'];

  // Ma'lumotni ishlov berish
  bookings.forEach(booking => {
    const status = booking.status || '';
    const price = booking.price || 0;

    if (status === 'done') {
      revenue += price;
      doneCount++;
    }

    if (status === 'cancelled') {
      cancelledCount++;
    }

    if (status === 'no_show') {
      noShowCount++;
    }

    // Eng band kun hisoblash
    if (booking.booking_date) {
      try {
        const dateObj = new Date(booking.booking_date + 'T00:00:00Z');
        const dayIndex = dateObj.getUTCDay();
        const dayName = dayNames[dayIndex] || 'Noma\'lum';
        dayCountMap[dayName] = (dayCountMap[dayName] || 0) + 1;
      } catch (e) {
        // Sana parse xatosi — o'tkazib yuboramiz
      }
    }
  });

  // Jami bronlar (bekor qilingan BO'LMAGAN)
  const totalBookings = bookings.filter(b => b.status !== 'cancelled').length;

  // O'rtacha chek
  const avgCheck = doneCount > 0 ? Math.round(revenue / doneCount) : 0;

  // Bekor qilish % = cancelled / (jami + cancelled) × 100
  const totalWithCancelled = totalBookings + cancelledCount;
  const cancelRate = totalWithCancelled > 0
    ? Math.round((cancelledCount / totalWithCancelled) * 100)
    : 0;

  // No-show % = no_show / (done + no_show) × 100
  // (faqat kelishi kerak bo'lgan bronlar orasida)
  const noShowDenominator = doneCount + noShowCount;
  const noShowRate = noShowDenominator > 0
    ? Math.round((noShowCount / noShowDenominator) * 100)
    : 0;

  // Eng band kun (hafta kuni)
  let busiestDay = '—';
  let busiestDayCount = 0;
  if (Object.keys(dayCountMap).length > 0) {
    const sorted = Object.entries(dayCountMap).sort((a, b) => b[1] - a[1]);
    busiestDay = sorted[0][0];
    busiestDayCount = sorted[0][1];
  }

  return {
    revenue,
    totalBookings,
    avgCheck,
    cancelRate,
    noShowRate,
    busiestDay,
    busiestDayCount,
  };
}

/** KPI kartalarni DOM'da to'ldiradi va yangilaydi. */
function updateKpiCards(kpis, comments) {
  // Jami tushum
  const revenueEl = document.getElementById('statsRevenue');
  const revenueCountEl = document.getElementById('statsRevenueCount');
  if (revenueEl) {
    // money() funksiyasi admin.js'da ishlatiladi — hozircha oddiy format
    const formattedRevenue = kpis.revenue.toLocaleString() + ' so\'m';
    revenueEl.textContent = formattedRevenue;
    revenueCountEl.textContent = kpis.totalBookings > 0
      ? `${kpis.totalBookings} ta bron`
      : '—';
  }

  // Jami bronlar
  const totalEl = document.getElementById('statsTotalBookings');
  if (totalEl) {
    totalEl.textContent = kpis.totalBookings || '—';
  }

  // O'rtacha chek
  const avgEl = document.getElementById('statsAvgCheck');
  if (avgEl) {
    avgEl.textContent = kpis.avgCheck > 0
      ? kpis.avgCheck.toLocaleString() + ' so\'m'
      : '—';
  }

  // Bekor qilish %
  const cancelEl = document.getElementById('statsCancelRate');
  if (cancelEl) {
    cancelEl.textContent = kpis.cancelRate + '%';
  }

  // No-show %
  const noShowEl = document.getElementById('statsNoShowRate');
  if (noShowEl) {
    noShowEl.textContent = kpis.noShowRate + '%';
  }

  // Eng band kun
  const busiestDayEl = document.getElementById('statsBusiestDay');
  const busiestDayCountEl = document.getElementById('statsBusiestDayCount');
  if (busiestDayEl) {
    busiestDayEl.textContent = kpis.busiestDay;
  }
  if (busiestDayCountEl) {
    busiestDayCountEl.textContent = kpis.busiestDayCount > 0
      ? `${kpis.busiestDayCount} ta bron`
      : '—';
  }
}

// =============================================================================
// GRAFIKLAR CHIZISH (Chart.js)
// =============================================================================

/** Berilgan bronlar ma'lumotidan kunlik/haftalik tushum grafigi ma'lumotini tayyorlaydi.
 *  Oraliq 60 kundan uzun bo'lsa — haftalik guruhlash, aks holda — kunlik.
 *  Qaytaradi: {labels: [...], data: [...]}
 */
function prepareRevenueChartData(bookings, dateRange) {
  const labels = [];
  const revenueData = [];

  // Sana oralig'i davomini hisoblash
  const fromDate = new Date(dateRange.from + 'T00:00:00Z');
  const toDate = new Date(dateRange.to + 'T23:59:59Z');
  const daysCount = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

  // 60 kundan uzun bo'lsa, haftalik guruhlash; aks holda kunlik
  const isWeekly = daysCount > 60;

  if (isWeekly) {
    // Haftalik guruhlash
    const weeklyData = {}; // "2024-W32" -> revenue
    
    bookings.forEach(booking => {
      if (booking.status !== 'done') return; // Faqat bajarilganlar

      try {
        const date = new Date(booking.booking_date + 'T00:00:00Z');
        // ISO hafta raqamini hisoblash
        const jan4 = new Date(date.getUTCFullYear(), 0, 4);
        const msPerDay = 24 * 60 * 60 * 1000;
        const weekNum = Math.ceil(((date - jan4) / msPerDay) + jan4.getUTCDay() + 1) / 7;
        const weekKey = `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
        
        weeklyData[weekKey] = (weeklyData[weekKey] || 0) + (booking.price || 0);
      } catch (e) {
        // Sana parse xatosi
      }
    });

    // Sortilangan haftalik aroliq
    const sortedWeeks = Object.entries(weeklyData)
      .sort((a, b) => a[0].localeCompare(b[0]));

    sortedWeeks.forEach(([week, revenue]) => {
      labels.push(week);
      revenueData.push(revenue);
    });
  } else {
    // Kunlik guruhlash
    const dailyData = {}; // "2024-08-15" -> revenue

    bookings.forEach(booking => {
      if (booking.status !== 'done') return; // Faqat bajarilganlar

      const dateKey = booking.booking_date;
      if (dateKey) {
        dailyData[dateKey] = (dailyData[dateKey] || 0) + (booking.price || 0);
      }
    });

    // Sortilangan kunlar
    const sortedDays = Object.entries(dailyData)
      .sort((a, b) => a[0].localeCompare(b[0]));

    sortedDays.forEach(([day, revenue]) => {
      // Tarix formatini o'zbekchaga: "15-Aug" yoki faqat "15"
      const dateObj = new Date(day + 'T00:00:00Z');
      const dayNum = dateObj.getUTCDate();
      const monthNum = dateObj.getUTCMonth();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      labels.push(`${dayNum}-${monthNames[monthNum]}`);
      revenueData.push(revenue);
    });
  }

  return { labels, data: revenueData };
}

/** Tushum grafigini Chart.js bilan chizadi (bar chart). */
function drawRevenueChart(bookings, dateRange) {
  const canvas = document.getElementById('statsRevenueChart');
  if (!canvas) return;

  // Mavjud chart instance'ni o'chirish (agar bor bo'lsa)
  if (window.revenueChartInstance) {
    window.revenueChartInstance.destroy();
  }

  const chartData = prepareRevenueChartData(bookings, dateRange);

  if (chartData.labels.length === 0) {
    canvas.style.display = 'none';
    return;
  }

  canvas.style.display = 'block';

  window.revenueChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Tushum (so\'m)',
          data: chartData.data,
          backgroundColor: 'var(--brass)', // #C9A227
          borderColor: 'var(--brass-deep)', // #8A6A18
          borderWidth: 1,
          borderRadius: 4,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return value.toLocaleString() + ' so\'m';
            },
          },
        },
      },
    },
  });
}

/** Statistika sahifasini yangilaydi: ma'lumot yuklash, KPI hisoblash, grafiklar chizish.
 *  admin.js da global 'supabaseClient' ishlatiladi. */
export async function renderStatsPanel(rangeOrCustom = 'today') {
  // Chart.js yuklanganmi tekshirish
  if (typeof Chart === 'undefined') {
    console.error('Chart.js yuklanmadi');
    toast('Grafiklar uchun kutubxona yuklanmadi. Brauzer konsolini tekshiring.', 'error');
    return;
  }

  // Supabase clientini window'dan olamiz (admin.js tomonidan expose qilingan)
  const supabaseClient = window.supabaseClient;

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

  // ===== STEP 3: KPI hisoblash =====
  const kpis = computeKpis(bookings);
  console.log('KPI:', kpis);

  // KPI kartalarni yangilash
  updateKpiCards(kpis, comments);

  // ===== STEP 4: Grafiklar chizish =====
  drawRevenueChart(bookings, dateRange);
  
  // Keyingi bosqichlarda boshqa grafiklar (xizmatlar, ustalar, holat taqsimoti va h.k.) qo'shiladi
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
