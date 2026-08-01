// =============================================================================
// HOME: bosh sahifadagi "Xizmatlar" va "Ustalar" bo'limlarini render qilish
// =============================================================================
import { SERVICES, MASTERS, money, pickLang } from './data.js';
import { openBooking } from './booking.js';
import { t } from './i18n.js';

// =============================================================================
// SKELETON: servicesGrid/mastersGrid ma'lumot Supabase'dan kelguncha
// ko'rsatiladigan "joy tutuvchi" kartochkalar.
//
// MUHIM (1:1 o'lcham talabi): quyidagi skeleton kartochkalar haqiqiy
// renderServices()/renderMasters() kartochkalari bilan BIR XIL tashqi
// klasslarni ishlatadi (p-6/p-5, rounded-2xl, border, gap — hammasi
// index.html/app.css'dagi haqiqiy qiymatlar). Ichidagi har bir "suyak"
// blokning balandligi ham mos matn elementining haqiqiy shrift+line-height
// qiymatiga aniq teng qilib qo'yilgan (masalan sarlavha uchun 28px, chunki
// .text-lg'ning line-height'i 1.75rem = 28px). Natijada ma'lumot kelib,
// skeleton haqiqiy kontent bilan almashganda kartochka balandligi
// o'zgarmaydi — sahifa "sakramaydi" (zero layout shift).
// =============================================================================
function serviceSkeletonCard() {
  // Tashqi klasslar (bg-white, rounded-2xl, border, p-6) haqiqiy
  // .lift kartochkaning o'zidan olingan — shu sabab konteyner o'lchami
  // (kenglik/balandlik) aynan bir xil bo'ladi. Ichidagi har bir "skel-line"
  // balandligi mos matn elementining haqiqiy line-height'iga teng.
  return `
    <div class="skel-card bg-white rounded-2xl border border-emerald-950/8 p-6" aria-hidden="true">
      <div class="skel-block w-12 h-12 rounded-full mb-5"></div>
      <div class="skel-block skel-line" style="height:28px;width:64%;margin-bottom:.375rem;"></div>
      <div class="skel-block skel-line" style="height:22.75px;width:100%;margin-bottom:6px;"></div>
      <div class="skel-block skel-line" style="height:22.75px;width:78%;margin-bottom:1.25rem;"></div>
      <div class="flex items-center justify-between pt-4 border-t border-emerald-950/8">
        <div class="skel-block skel-line" style="height:16px;width:72px;"></div>
        <div class="skel-block skel-line" style="height:24px;width:64px;"></div>
      </div>
    </div>
  `;
}

function masterSkeletonCard() {
  return `
    <div class="skel-card bg-emerald-950/40 border border-cream/10 rounded-2xl overflow-hidden" aria-hidden="true">
      <div class="aspect-[3/4] overflow-hidden">
        <div class="skel-block skel-block--dark w-full h-full"></div>
      </div>
      <div class="p-5">
        <div class="skel-block skel-block--dark skel-line" style="height:28px;width:58%;"></div>
        <div class="skel-block skel-block--dark skel-line" style="height:16px;width:40%;margin-top:.25rem;"></div>
        <div class="skel-block skel-block--dark skel-line" style="height:20px;width:92%;margin-top:.5rem;"></div>
      </div>
    </div>
  `;
}

/** SERVICES kelguncha ko'rsatiladigan skeleton — soni SERVICES o'zi hali
 * yuklanmagani uchun standart (fallback) ro'yxat uzunligiga tenglashtiriladi. */
export function renderServicesSkeleton(count = SERVICES.length || 6) {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count }, serviceSkeletonCard).join('');
}

export function renderMastersSkeleton(count = MASTERS.length || 4) {
  const grid = document.getElementById('mastersGrid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count }, masterSkeletonCard).join('');
}

export function renderServices() {
  const grid = document.getElementById('servicesGrid');
  grid.innerHTML = SERVICES.map(s => `
    <div class="reveal lift group bg-white rounded-2xl border border-emerald-950/8 p-6 cursor-pointer focus-gold" data-service-card="${s.id}" role="button" tabindex="0" aria-label="${pickLang(s.name, s.name_ru, s.name_en)} xizmatiga bron qilish">
      <div class="w-12 h-12 rounded-full bg-emerald-900 text-gold-400 flex items-center justify-center mb-5 group-hover:bg-gold-500 group-hover:text-emerald-950 transition-colors">
        <i class="fa-solid ${s.icon}"></i>
      </div>
      <h3 class="font-display text-lg font-semibold mb-1.5">${pickLang(s.name, s.name_ru, s.name_en)}</h3>
      <p class="text-sm text-emerald-950/55 leading-relaxed mb-5">${pickLang(s.desc, s.desc_ru, s.desc_en)}</p>
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
        <img src="${m.img}" alt="${pickLang(m.name, m.name_ru, m.name_en)}" class="w-full h-full object-cover" loading="lazy">
      </div>
      <div class="p-5">
        <h3 class="font-display text-lg font-semibold">${pickLang(m.name, m.name_ru, m.name_en)}</h3>
        <p class="text-gold-400 text-xs tracking-wide uppercase mt-1">${m.role}</p>
        <p class="text-cream/50 text-sm mt-2">${pickLang(m.exp, m.exp_ru, m.exp_en)}</p>
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
