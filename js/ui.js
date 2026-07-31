// =============================================================================
// UI: header scroll effekti, mobil menyu, scroll-reveal animatsiyasi
// =============================================================================

export function initHeaderScroll() {
  const header = document.getElementById('siteHeader');
  const inner = document.getElementById('headerInner');

  // MUHIM (unsilliq scroll tuzatildi): avval har bir scroll hodisasida
  // (ya'ni har pikselda) sinxron ravishda DOM'ga yozilardi — bu asosiy
  // threadni band qilib, ayniqsa mobil qurilmalarda scrollni "junky"
  // qilib qo'yardi. Endi ikkita optimallashtirish qilindi:
  //  1) requestAnimationFrame orqali bir kadrga bittadan yangilanish
  //     (throttling) — scroll hodisasi qancha tez-tez kelmasin, DOM
  //     eng ko'pi bilan har animatsiya kadrida bir marta yangilanadi.
  //  2) Holat (scrolled/isOverHero) haqiqatan o'zgarganda GINA DOM'ga
  //     yoziladi — bir xil qiymatni qayta-qayta yozish (style thrashing)
  //     oldini olinadi.
  let ticking = false;
  let lastState = null; // 'top' | 'dark'

  // SODDALASHTIRILDI: header endi faqat 1 ta primary rangga (emerald-950,
  // screenshotdagi to'q rang) o'tadi — oq/krem fonga umuman almashmaydi.
  // Ya'ni 2 xil almashuvchi fon o'rniga faqat 1 ta holat bor:
  //  1) 'top'  — sahifa boshida: fon shaffof, matn krem rangda.
  //  2) 'dark' — scroll qilingach (butun sahifa davomida): fon to'liq
  //              emerald-950, matn doim krem rangda qoladi (fon hech
  //              qachon och/oq bo'lmagani uchun matn rangini almashtirish
  //              shart emas).
  function apply() {
    ticking = false;

    const scrolled = window.scrollY > 40;
    const state = scrolled ? 'dark' : 'top';

    if (state !== lastState) {
      lastState = state;

      header.classList.toggle('bg-emerald-950', state === 'dark');
      header.classList.toggle('shadow-sm', state === 'dark');

      inner.classList.toggle('border-cream/10', state === 'dark');
      inner.classList.toggle('py-3.5', state === 'dark');
      inner.classList.toggle('py-5', state === 'top');
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  apply();
}

export function initMobileMenu() {
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const menuIcon = document.getElementById('menuIcon');

  function toggle() {
    mobileMenu.classList.toggle('hidden');
    menuIcon.classList.toggle('fa-bars');
    menuIcon.classList.toggle('fa-xmark');
  }

  menuBtn.addEventListener('click', toggle);
  document.querySelectorAll('.mobile-link').forEach(a => a.addEventListener('click', toggle));
}

export function initRevealAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('show'); });
  }, { threshold: 0.15 });

  // home.js kabi boshqa modullar keyinchalik qo'shadigan elementlarni ham
  // kuzatuvga olishi uchun observerni global qilib qo'yamiz.
  window.__revealObserver = observer;

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/**
 * Header'dagi globus tugmasi — bosilganda UZ/RU/EN ro'yxatini (har biri
 * oldida dumaloq bayroqcha bilan) ochib-yopadi. Tilni tanlash mantig'i
 * o'zi (setLang chaqirish, lang-active klassini yangilash) allaqachon
 * i18n.js -> initLangSwitchers() orqali ishlaydi (u sahifadagi BARCHA
 * [data-lang-switch] elementlariga qarab chiqadi) — bu yerda faqat
 * dropdown panelining ochilib-yopilishi boshqariladi.
 */
export function initHeaderLangDropdown() {
  const wrap = document.getElementById('headerLangWrap');
  const btn = document.getElementById('headerLangBtn');
  const dropdown = document.getElementById('headerLangDropdown');
  if (!wrap || !btn || !dropdown) return;

  function close() {
    dropdown.classList.remove('show');
    btn.classList.remove('lang-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function open() {
    dropdown.classList.add('show');
    btn.classList.add('lang-open');
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('show')) close(); else open();
  });

  // Til tanlangach panel avtomatik yopilsin (tanlov initLangSwitchers'dagi
  // o'z listeneri orqali baribir amalga oshadi — bu yerda faqat yopamiz).
  dropdown.querySelectorAll('[data-lang-switch]').forEach(item => {
    item.addEventListener('click', close);
  });

  // Tashqariga bosilsa yopiladi.
  document.addEventListener('click', (e) => {
    if (dropdown.classList.contains('show') && !wrap.contains(e.target)) close();
  });

  // Esc tugmasi bilan ham yopiladi.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
