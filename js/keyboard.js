// =============================================================================
// KEYBOARD: mobil klaviatura ochilganda, fokusdagi input/textarea har doim
// klaviaturaning TEPASIDA (ko'rinadigan joyda) qolishini ta'minlaydi.
//
// Nega kerak: modal oynalar "position: fixed; inset: 0" bilan ochiladi.
// Mobil brauzerlarda klaviatura chiqqanda haqiqiy ko'rinadigan balandlik
// (visualViewport) qisqaradi, lekin "fixed" elementlar odatda LAYOUT
// viewport'ga (klaviaturasiz to'liq balandlikka) bog'langan holda qoladi —
// natijada pastroqdagi input klaviatura ORQASIDA qolib ketishi mumkin.
//
// Yechim ikki qismli ishlaydi (ikkalasi ham shart, bittasi yetarli emas):
//  1) --app-vh CSS o'zgaruvchisini haqiqiy (klaviaturani hisobga oluvchi)
//     balandlikka moslab turamiz — css/app.css shundan foydalanadigan
//     modal konteynerlari klaviatura chiqqanda avtomatik "qisqaradi" va
//     skroll qilinadigan bo'ladi.
//  2) Har qanday input/textarea fokusga kirganda, uni ko'rinadigan joyga
//     scrollIntoView qilamiz — klaviatura ochilish animatsiyasi tugashini
//     biroz kutib turamiz, aks holda hisob-kitob eski o'lchamlar bo'yicha
//     bajarilib, natija noto'g'ri chiqadi.
//
// Bu modul BUTUN sahifa uchun ishlaydi (auth, sozlamalar, bron, kelajakda
// qo'shiladigan har qanday forma) — yangi input qo'shilganda hech qanday
// qo'shimcha kod yozish shart emas.
// =============================================================================

function setAppVh() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-vh', `${h}px`);
}

function isTextField(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    // Klaviatura chiqarmaydigan input turlarini istisno qilamiz.
    return !['button', 'submit', 'checkbox', 'radio', 'range', 'file', 'reset', 'image'].includes(type);
  }
  return false;
}

function scrollFieldIntoView(el) {
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 300);
}

export function initKeyboardAvoidance() {
  setAppVh();
  window.addEventListener('resize', setAppVh);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      setAppVh();
      if (isTextField(document.activeElement)) scrollFieldIntoView(document.activeElement);
    });
  }

  document.addEventListener('focusin', (e) => {
    if (isTextField(e.target)) scrollFieldIntoView(e.target);
  });
}
