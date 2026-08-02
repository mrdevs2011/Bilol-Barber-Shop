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

// generateDaySlots() 30 daqiqalik slotlar beradi (09:00-19:30); band vaqtlar
// issiqlik xaritasida esa soat darajasida guruhlaymiz — shu funksiyadan faqat
// ish soatlari oralig'ini (09-19) izchil ushlab turish uchun foydalanamiz.
import { generateDaySlots } from '../js/data.js';

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
  to = new Date(today); // nusxa olish — 'today' keyinroq mutatsiya qilinishi mumkin (masalan 'week' holatida)

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
  const chartsGrid = document.querySelector('.stats-charts-grid');

  if (isLoading) {
    // KPI kartalarni skeleton bilan to'ldirish
    kpiRow?.querySelectorAll('.stat-value').forEach(el => {
      el.textContent = '...';
      el.style.opacity = '0.5';
    });
    // Grafik/jadval joylarini ham xiralashtirib, "yuklanyapti" holatini bildiramiz
    if (chartsGrid) {
      chartsGrid.style.opacity = '0.4';
      chartsGrid.style.pointerEvents = 'none';
    }
  } else {
    // Skeleton olib tashlash
    kpiRow?.querySelectorAll('.stat-value').forEach(el => {
      el.style.opacity = '1';
    });
    if (chartsGrid) {
      chartsGrid.style.opacity = '1';
      chartsGrid.style.pointerEvents = '';
    }
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
        const weekNum = Math.ceil(((date - jan4) / msPerDay + jan4.getUTCDay() + 1) / 7);
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

// =============================================================================
// XIZMATLAR BO'YICHA TAQSIMOT (Top 5)
// =============================================================================

/** Bronlarni xizmat nomi bo'yicha guruhlaydi va har biri uchun buyurtmalar
 *  sonini hamda tushumni hisoblaydi. Faqat 'done' bronlar hisobga olinadi —
 *  KPI/tushum grafigidagi mantiq bilan bir xil bo'lishi uchun (bekor
 *  qilingan yoki hali bo'lib o'tmagan bronning "qaysi xizmat ko'proq
 *  sotilyapti" degan savolga aloqasi yo'q).
 *  Qaytaradi: eng ko'p tushum keltirgan 5 ta xizmat, kamayish tartibida.
 */
function computeServiceStats(bookings) {
  const map = {}; // xizmat nomi -> {count, revenue}

  bookings.forEach(booking => {
    if (booking.status !== 'done') return;

    const name = booking.service_name || 'Noma\'lum xizmat';
    if (!map[name]) map[name] = { count: 0, revenue: 0 };
    map[name].count += 1;
    map[name].revenue += (booking.price || 0);
  });

  return Object.entries(map)
    .map(([name, v]) => ({ name, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

/** Xizmatlar taqsimoti grafigini Chart.js bilan chizadi (gorizontal bar). */
function drawServicesChart(bookings) {
  const canvas = document.getElementById('statsServicesChart');
  if (!canvas) return;

  if (window.servicesChartInstance) {
    window.servicesChartInstance.destroy();
  }

  const serviceStats = computeServiceStats(bookings);

  if (serviceStats.length === 0) {
    canvas.style.display = 'none';
    return;
  }

  canvas.style.display = 'block';

  const totalRevenue = serviceStats.reduce((sum, s) => sum + s.revenue, 0);

  window.servicesChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: serviceStats.map(s => s.name),
      datasets: [
        {
          label: 'Tushum (so\'m)',
          data: serviceStats.map(s => s.revenue),
          backgroundColor: 'var(--brass)',
          borderColor: 'var(--brass-deep)',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: 'y', // gorizontal bar — eng ko'p sotilgan xizmat tepada
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            // Har bir ustunda buyurtmalar soni va tushum ulushini (%) ko'rsatamiz
            label: function (ctx) {
              const item = serviceStats[ctx.dataIndex];
              const pct = totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 100) : 0;
              return `${item.count} ta bron · ${item.revenue.toLocaleString()} so'm (${pct}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return value.toLocaleString();
            },
          },
        },
      },
    },
  });
}

// =============================================================================
// USTALAR BO'YICHA TAQSIMOT (performance reytingi)
// =============================================================================

/** HTML-safe matn uchun oddiy escape (stats.js o'z ichida mustaqil,
 *  admin.js'dagi escapeHtml() import qilinmaydi). */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/** Bronlarni usta nomi bo'yicha guruhlaydi: bajargan bronlar soni, jami
 *  tushum, o'rtacha chek va no-show foizi (shu usta bo'yicha, xuddi
 *  umumiy KPI'dagi no-show mantig'i bilan bir xil: no_show / (done + no_show)).
 *  Qaytaradi: tushum bo'yicha kamayish tartibida massiv.
 */
function computeMasterStats(bookings) {
  const map = {}; // usta nomi -> {doneCount, revenue, noShowCount}

  bookings.forEach(booking => {
    const name = booking.master_name || 'Noma\'lum usta';
    if (!map[name]) map[name] = { doneCount: 0, revenue: 0, noShowCount: 0 };

    if (booking.status === 'done') {
      map[name].doneCount += 1;
      map[name].revenue += (booking.price || 0);
    }
    if (booking.status === 'no_show') {
      map[name].noShowCount += 1;
    }
  });

  return Object.entries(map)
    .map(([name, v]) => {
      const denom = v.doneCount + v.noShowCount;
      return {
        name,
        doneCount: v.doneCount,
        revenue: v.revenue,
        avgCheck: v.doneCount > 0 ? Math.round(v.revenue / v.doneCount) : 0,
        noShowRate: denom > 0 ? Math.round((v.noShowCount / denom) * 100) : 0,
      };
    })
    .filter(m => m.doneCount > 0 || m.noShowCount > 0) // umuman ishi bo'lmagan ustalarni ko'rsatmaymiz
    .sort((a, b) => b.revenue - a.revenue);
}

/** Ustalar reytingi jadvalini #statsMastersTable ichiga chizadi. */
function renderMastersTable(bookings) {
  const container = document.getElementById('statsMastersTable');
  if (!container) return;

  const masterStats = computeMasterStats(bookings);

  if (masterStats.length === 0) {
    container.innerHTML = '<div class="stats-table-row"><div>Ma\'lumot yo\'q</div></div>';
    return;
  }

  const headerRow = `
    <div class="stats-table-row stats-table-header">
      <div>Usta</div>
      <div>Bronlar</div>
      <div>Tushum</div>
      <div>No-show</div>
    </div>
  `;

  const dataRows = masterStats.map(m => `
    <div class="stats-table-row">
      <div>${escapeHtml(m.name)}</div>
      <div>${m.doneCount} ta</div>
      <div>${m.revenue.toLocaleString()} so'm<br><span class="stats-table-sub">O'rtacha: ${m.avgCheck.toLocaleString()} so'm</span></div>
      <div>${m.noShowRate}%</div>
    </div>
  `).join('');

  container.innerHTML = headerRow + dataRows;
}

// =============================================================================
// BAND VAQTLAR TAHLILI (kun x soat issiqlik xaritasi)
// =============================================================================

/** Bronlarni hafta kuni + soat bo'yicha guruhlab, issiqlik xaritasi uchun
 *  matritsa tayyorlaydi. 'cancelled' bronlar hisobga olinmaydi (bo'lib
 *  o'tmagan), qolgan barcha holatlar (done/no_show/new/confirmed) — chunki
 *  bu yerdagi savol "qachon ko'proq mijoz keladi/keladigan bo'lgan",
 *  faqat "qachon pul tushgan" emas.
 *  Qaytaradi: {dayOrder, hours, matrix, maxCount}
 */
function computeHeatmapData(bookings) {
  // Dushanbadan boshlab — biznes haftasi shu tartibda o'qilishi tabiiyroq
  const dayOrder = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
  // getUTCDay(): 0=Yakshanba,1=Dushanba,...,6=Shanba -> dayOrder indeksiga moslash
  const dayIndexMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

  // Ish soatlarini generateDaySlots()dan olamiz (09:00-19:30) — faqat
  // butun soatlarni ajratib olamiz, chunki heatmap soat darajasida
  const hourSet = new Set(generateDaySlots().map(slot => parseInt(slot.split(':')[0], 10)));
  const hours = Array.from(hourSet).sort((a, b) => a - b);

  const matrix = {}; // "dayIdx-hour" -> bron soni
  let maxCount = 0;

  bookings.forEach(booking => {
    if (booking.status === 'cancelled') return;
    if (!booking.booking_date || !booking.booking_time) return;

    try {
      const dateObj = new Date(booking.booking_date + 'T00:00:00Z');
      const dayIdx = dayIndexMap[dateObj.getUTCDay()];
      const hour = parseInt(String(booking.booking_time).split(':')[0], 10);
      if (isNaN(hour) || !hours.includes(hour)) return;

      const key = `${dayIdx}-${hour}`;
      matrix[key] = (matrix[key] || 0) + 1;
      if (matrix[key] > maxCount) maxCount = matrix[key];
    } catch (e) {
      // Sana/vaqt parse xatosi — o'tkazib yuboramiz
    }
  });

  return { dayOrder, hours, matrix, maxCount };
}

/** Band vaqtlar issiqlik xaritasini #statsHeatmapContainer ichiga chizadi
 *  (sof HTML/CSS grid — Chart.js shart emas). */
function renderHeatmap(bookings) {
  const container = document.getElementById('statsHeatmapContainer');
  if (!container) return;

  const { dayOrder, hours, matrix, maxCount } = computeHeatmapData(bookings);

  if (maxCount === 0) {
    container.innerHTML = '<div style="padding:12px; font-size:13px; color:var(--ink-3);">Ma\'lumot yo\'q</div>';
    return;
  }

  const dayShort = ['Du', 'Se', 'Cho', 'Pay', 'Ju', 'Sha', 'Yak'];

  let html = '<div class="heatmap-cell heatmap-corner"></div>';
  dayShort.forEach(d => {
    html += `<div class="heatmap-cell heatmap-day-label">${d}</div>`;
  });

  hours.forEach(hour => {
    html += `<div class="heatmap-cell heatmap-hour-label">${String(hour).padStart(2, '0')}:00</div>`;

    dayOrder.forEach((dayName, dayIdx) => {
      const count = matrix[`${dayIdx}-${hour}`] || 0;
      const intensity = count / maxCount;
      // Zichlik qancha yuqori bo'lsa, --brass rangi shuncha to'yingan bo'ladi
      const bg = count > 0 ? `rgba(201, 162, 39, ${(0.15 + intensity * 0.85).toFixed(2)})` : 'var(--canvas)';
      const textColor = intensity > 0.55 ? '#fff' : 'var(--ink-2)';
      html += `<div class="heatmap-cell" style="background:${bg}; color:${textColor};" title="${dayName}, ${String(hour).padStart(2, '0')}:00 — ${count} ta bron">${count > 0 ? count : ''}</div>`;
    });
  });

  container.innerHTML = html;
}

// =============================================================================
// HOLAT TAQSIMOTI (donut chart) + SHARHLAR/REYTING
// =============================================================================

/** Bronlarni holat bo'yicha 4 guruhga ajratadi: bajarilgan, kelmagan
 *  (no-show), bekor qilingan, kutilmoqda ('new' + 'confirmed' birlashtirilgan
 *  — ikkalasi ham "hali yakunlanmagan" degani).
 *  Bo'sh (0 ta) guruhlar diagrammada chalkashlik keltirmasligi uchun
 *  filtrlab tashlanadi.
 */
function computeStatusBreakdown(bookings) {
  let done = 0, noShow = 0, cancelled = 0, pending = 0;

  bookings.forEach(booking => {
    if (booking.status === 'done') done++;
    else if (booking.status === 'no_show') noShow++;
    else if (booking.status === 'cancelled') cancelled++;
    else if (booking.status === 'new' || booking.status === 'confirmed') pending++;
  });

  return [
    { label: 'Bajarilgan', count: done, color: 'var(--jade)' },
    { label: 'Kelmagan (no-show)', count: noShow, color: 'var(--amber)' },
    { label: 'Bekor qilingan', count: cancelled, color: 'var(--red)' },
    { label: 'Kutilmoqda', count: pending, color: 'var(--sky)' },
  ].filter(item => item.count > 0);
}

/** Holat taqsimoti donut diagrammasini Chart.js bilan chizadi. */
function drawStatusChart(bookings) {
  const canvas = document.getElementById('statsStatusChart');
  if (!canvas) return;

  if (window.statusChartInstance) {
    window.statusChartInstance.destroy();
  }

  const breakdown = computeStatusBreakdown(bookings);

  if (breakdown.length === 0) {
    canvas.style.display = 'none';
    return;
  }

  canvas.style.display = 'block';
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  window.statusChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: breakdown.map(b => b.label),
      datasets: [
        {
          data: breakdown.map(b => b.count),
          backgroundColor: breakdown.map(b => b.color),
          borderColor: 'var(--panel)',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const item = breakdown[ctx.dataIndex];
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return `${item.label}: ${item.count} ta (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/** Berilgan reyting uchun yulduzcha ikonalarini HTML sifatida qaytaradi
 *  (js/reviews.js'dagi starsHtml() bilan bir xil uslub — to'ldirilmagan
 *  yulduzlar xira ko'rinadi). */
function starsHtml(rating) {
  let html = '';
  const rounded = Math.round(rating);
  for (let i = 1; i <= 5; i++) {
    html += `<i class="fa-solid fa-star"${i <= rounded ? '' : ' style="opacity:.25"'}></i>`;
  }
  return html;
}

/** Tanlangan sana oralig'idagi tasdiqlangan sharhlarning o'rtacha reytingi
 *  va sonini #statsReviewsInfo ichiga chizadi. */
function renderReviewsInfo(comments) {
  const container = document.getElementById('statsReviewsInfo');
  if (!container) return;

  if (!comments || comments.length === 0) {
    container.innerHTML = '<div style="font-size:13px; color:var(--ink-3);">Bu oraliqda sharh yo\'q</div>';
    return;
  }

  const sum = comments.reduce((total, c) => total + (c.rating || 0), 0);
  const avg = sum / comments.length;

  container.innerHTML = `
    <div style="font-size:28px; font-weight:700; color:var(--ink);">${avg.toFixed(1)}</div>
    <div style="font-size:16px; color:var(--brass); margin:4px 0;">${starsHtml(avg)}</div>
    <div style="font-size:12.5px; color:var(--ink-3);">${comments.length} ta sharh asosida</div>
  `;
}

// Har bir renderStatsPanel() chaqiruvi o'ziga xos ID oladi — tarmoq sekin
// bo'lib, foydalanuvchi filterni tez-tez almashtirsa, faqat ENG OXIRGI
// so'rov natijasi ekranga chiqishi kerak (eskisi "kechikib" kelib, yangi
// natija ustiga yozib qo'ymasligi uchun).
let statsRequestId = 0;

// Joriy tanlangan sana oralig'i — admin.js "Statistika" tabiga qaytganda
// (masalan boshqa bo'limga o'tib qaytgach) shu qiymatni ishlatadi, aks
// holda filter har safar "Bugun"ga qaytib qolar edi.
let currentStatsRange = 'today';

// Oxirgi yuklangan bronlar va sana oralig'i — "CSV yuklab olish" tugmasi
// qayta so'rov yubormasdan, joriy ko'rinishdagi ma'lumotni eksport qiladi.
let lastLoadedBookings = [];
let lastLoadedDateRange = null;

/** admin.js uchun: foydalanuvchi oxirgi marta tanlagan sana oralig'ini
 *  qaytaradi (tab almashtirilganda filter holatini saqlab qolish uchun). */
export function getCurrentStatsRange() {
  return currentStatsRange;
}

/** Chart.js mavjud bo'lmaganda (masalan offline holatda CDN yuklanmagan)
 *  grafik joyida shu haqda xabar ko'rsatadi va canvas'ni yashiradi. */
function showChartUnavailable(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.style.display = 'none';

  const container = canvas.closest('.chart-container');
  if (container && !container.querySelector('.chart-unavailable-msg')) {
    const msg = document.createElement('div');
    msg.className = 'chart-unavailable-msg';
    msg.style.cssText = 'padding:20px 0; text-align:center; font-size:12.5px; color:var(--ink-3);';
    msg.textContent = 'Grafik yuklanmadi (internet kerak)';
    container.appendChild(msg);
  }
}

// =============================================================================
// CSV EKSPORT (10-bosqich, ixtiyoriy — MR alohida so'ragani uchun qo'shildi)
// =============================================================================

/** Bron holatini o'zbekcha o'qish uchun qulay matnga aylantiradi. */
const STATUS_LABELS_UZ = {
  done: 'Bajarilgan',
  no_show: 'Kelmagan (no-show)',
  cancelled: 'Bekor qilingan',
  new: 'Yangi',
  confirmed: 'Tasdiqlangan',
};

/** CSV katagi uchun qiymatni xavfsiz formatlaydi: ichida vergul, tirnoq
 *  yoki yangi qator bo'lsa — qo'shtirnoq ichiga oladi (standart CSV qoidasi). */
function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Tanlangan sana oralig'idagi bronlarni CSV faylga yig'ib, brauzerda
 *  yuklab olishni boshlaydi. Tashqi kutubxonasiz — Blob + ObjectURL orqali. */
function exportStatsToCSV(bookings, dateRange) {
  if (!bookings || bookings.length === 0) {
    toast('Eksport qilish uchun ma\'lumot yo\'q', 'error');
    return;
  }

  const headers = ['Sana', 'Vaqt', 'Xizmat', 'Usta', 'Mijoz', 'Telefon', 'Narx (so\'m)', 'Holat'];
  const rows = bookings.map(b => [
    b.booking_date || '',
    b.booking_time || '',
    b.service_name || '',
    b.master_name || '',
    b.client_name || '',
    b.client_phone || '',
    b.price || 0,
    STATUS_LABELS_UZ[b.status] || b.status || '',
  ]);

  const csvLines = [headers, ...rows].map(row => row.map(csvEscape).join(','));
  // \uFEFF — UTF-8 BOM: Excel o'zbek/kirill harflarini shusiz noto'g'ri ko'rsatadi
  const csvContent = '\uFEFF' + csvLines.join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const fromLabel = dateRange?.from || 'boshi';
  const toLabel = dateRange?.to || 'oxiri';

  const link = document.createElement('a');
  link.href = url;
  link.download = `statistika_${fromLabel}_${toLabel}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast('CSV fayl yuklab olindi', 'success');
}

/** Statistika sahifasini yangilaydi: ma'lumot yuklash, KPI hisoblash, grafiklar chizish.
 *  admin.js da global 'supabaseClient' ishlatiladi. */
export async function renderStatsPanel(rangeOrCustom = 'today') {
  // Bu chaqiruvni identifikatsiya qilamiz — oxirida, agar orada boshqa
  // (yangiroq) chaqiruv boshlangan bo'lsa, natijani ekranga chiqarmay
  // to'xtaymiz (eski javob yangisi ustidan yozib qo'ymasin).
  const requestId = ++statsRequestId;

  // Keyingi safar tab almashtirilib qaytilganda ham shu oraliq ishlatilsin
  currentStatsRange = rangeOrCustom;

  // Chart.js yuklanganmi tekshirish — yuklanmagan bo'lsa ham sahifa butunlay
  // ishlamay qolmasligi kerak: KPI kartalar, jadval va heatmap Chart.js'siz
  // ham ishlaydi, faqat canvas-grafiklar o'rniga ogohlantirish chiqadi.
  const chartJsAvailable = typeof Chart !== 'undefined';
  if (!chartJsAvailable) {
    console.error('Chart.js yuklanmadi — faqat grafiklar cheklanadi, qolgan bo\'limlar ishlayveradi');
    toast('Grafiklar uchun kutubxona yuklanmadi. Boshqa ma\'lumotlar baribir ko\'rsatiladi.', 'error');
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

  // Orada yangiroq so'rov boshlangan bo'lsa — bu javobni e'tiborsiz qoldiramiz
  if (requestId !== statsRequestId) return;

  if (bookingsError || !bookings) {
    lastLoadedBookings = [];
    lastLoadedDateRange = dateRange;
    showStatsEmpty(true);
    return;
  }

  if (bookings.length === 0) {
    lastLoadedBookings = [];
    lastLoadedDateRange = dateRange;
    showStatsEmpty(true);
    return;
  }

  lastLoadedBookings = bookings;
  lastLoadedDateRange = dateRange;
  showStatsEmpty(false);

  // Kommentlarni ham yuklash (KPI uchun)
  const { comments } = await fetchStatsComments(supabaseClient, dateRange.from, dateRange.to);

  // Yana bir bor tekshiramiz — kommentlar so'rovi davomida ham yangi filter
  // bosilgan bo'lishi mumkin
  if (requestId !== statsRequestId) return;

  console.log('Yuklangan bronlar:', bookings.length);
  console.log('Yuklangan kommentlar:', comments.length);

  // ===== STEP 3: KPI hisoblash =====
  const kpis = computeKpis(bookings);
  console.log('KPI:', kpis);

  // KPI kartalarni yangilash
  updateKpiCards(kpis, comments);

  // ===== STEP 4-5-8: Chart.js kerak bo'lgan grafiklar =====
  if (chartJsAvailable) {
    document.querySelectorAll('.chart-unavailable-msg').forEach(el => el.remove());
    drawRevenueChart(bookings, dateRange);
    drawServicesChart(bookings);
    drawStatusChart(bookings);
  } else {
    showChartUnavailable('statsRevenueChart');
    showChartUnavailable('statsServicesChart');
    showChartUnavailable('statsStatusChart');
  }

  // ===== STEP 6-7: Chart.js'siz ham ishlaydigan bo'limlar =====
  renderMastersTable(bookings);
  renderHeatmap(bookings);
  renderReviewsInfo(comments);
}

/** Statistika bo'limini birinchi marta initsializatsiya qiladi:
 *  filter tugmalariga event listener qo'shadi. */
export async function initStatsView() {
  const filterBtns = document.querySelectorAll('.stats-filter-btn');
  const exportCsvBtn = document.getElementById('statsExportCsv');

  exportCsvBtn?.addEventListener('click', () => {
    exportStatsToCSV(lastLoadedBookings, lastLoadedDateRange);
  });

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
}
