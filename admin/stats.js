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

// Qo'shimcha modul funksiyalari import qilinadi (izoh bo'lmasa admin.js tomonidan o'tkaziladi)

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
        // Bosilgan tugmaga qo'shamiz
        e.target.classList.add('active');
        // Statistika sahifasini yangilayapman (bu funksiya admin.js'da belgilangan bo'ladi)
        renderStats(range);
      }
    });
  });

  applyCustomBtn?.addEventListener('click', () => {
    const fromDate = document.getElementById('statsFromDate').value;
    const toDate = document.getElementById('statsToDate').value;
    if (fromDate && toDate) {
      renderStats({ from: fromDate, to: toDate });
    }
  });
}

/** Berilgan sana oralig'i uchun statistika ma'lumotini yuklash va ko'rsatish.
 *  Range: 'today', 'week', 'month', '30days', '3months' yoki { from, to } object.
 */
export async function renderStats(range = 'today') {
  console.log('Statistika yuklash:', range);
  // Keyingi bosqichlarda to'liq bo'ladi
}
