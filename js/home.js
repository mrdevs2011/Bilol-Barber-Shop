// =============================================================================
// HOME: bosh sahifadagi "Xizmatlar" va "Ustalar" bo'limlarini render qilish
// =============================================================================
import { SERVICES, MASTERS, money, pickLang } from './data.js';
import { openBooking } from './booking.js';
import { t } from './i18n.js';

export function renderServices() {
  const grid = document.getElementById('servicesGrid');
  grid.innerHTML = SERVICES.map(s => `
    <div class="reveal lift group bg-white rounded-2xl border border-emerald-950/8 p-6 cursor-pointer focus-gold" data-service-card="${s.id}" role="button" tabindex="0" aria-label="${pickLang(s.name, s.name_ru)} xizmatiga bron qilish">
      <div class="w-12 h-12 rounded-full bg-emerald-900 text-gold-400 flex items-center justify-center mb-5 group-hover:bg-gold-500 group-hover:text-emerald-950 transition-colors">
        <i class="fa-solid ${s.icon}"></i>
      </div>
      <h3 class="font-display text-lg font-semibold mb-1.5">${pickLang(s.name, s.name_ru)}</h3>
      <p class="text-sm text-emerald-950/55 leading-relaxed mb-5">${pickLang(s.desc, s.desc_ru)}</p>
      <div class="flex items-center justify-between pt-4 border-t border-emerald-950/8">
        <span class="text-xs font-mono text-emerald-950/50"><i class="fa-regular fa-clock mr-1"></i>${s.duration} ${t('services.minutes')}</span>
        <span class="font-display font-semibold text-emerald-800">${money(s.price)}</span>
      </div>
    </div>
  `).join('');

  // UI TUZATISH: bu kartochkalar oldin oddiy <div onclick> edi — sichqonchasiz
  // (klaviatura, ekran-diktor) foydalanuvchi ularni umuman faollashtira
  // olmasdi, chunki <div> standart holda fokus olmaydi. Endi tabindex+role
  // bilan Tab orqali fokuslanadi, Enter/Space bilan xuddi bosilgandek ishlaydi.
  grid.querySelectorAll('[data-service-card]').forEach(card => {
    card.addEventListener('click', () => openBooking(card.dataset.serviceCard));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBooking(card.dataset.serviceCard);
      }
    });
  });

  // Yangi qo'shilgan .reveal elementlarini kuzatuvga olish
  document.querySelectorAll('#servicesGrid .reveal').forEach(el => window.__revealObserver?.observe(el));
}

export function renderMasters() {
  const grid = document.getElementById('mastersGrid');
  grid.innerHTML = MASTERS.map(m => `
    <div class="reveal lift bg-emerald-950/40 border border-cream/10 rounded-2xl overflow-hidden">
      <div class="aspect-[3/4] overflow-hidden">
        <img src="${m.img}" alt="${pickLang(m.name, m.name_ru)}" class="w-full h-full object-cover" loading="lazy">
      </div>
      <div class="p-5">
        <h3 class="font-display text-lg font-semibold">${pickLang(m.name, m.name_ru)}</h3>
        <p class="text-gold-400 text-xs tracking-wide uppercase mt-1">${m.role}</p>
        <p class="text-cream/50 text-sm mt-2">${pickLang(m.exp, m.exp_ru)}</p>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('#mastersGrid .reveal').forEach(el => window.__revealObserver?.observe(el));

  // UI TUZATISH: hero qismidagi "necha barber" statistikasi avval qo'lda
  // "4" deb yozib qo'yilgan edi — MASTERS ro'yxati o'zgarganda (masalan
  // hozircha 1 ta barber bo'lganda) bu raqam yolg'on va'aga aylanib
  // qolardi. Endi haqiqiy ro'yxat uzunligidan avtomatik olinadi.
  const statEl = document.getElementById('statMasterCount');
  if (statEl) statEl.textContent = String(MASTERS.length);
}
