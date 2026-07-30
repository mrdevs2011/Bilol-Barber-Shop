// =============================================================================
// AUTH: telefon + parol orqali ro'yxatdan o'tish/kirish.
//
// Nega "telefon + parol", email emas? Chunki O'zbekistonda mijozlar email
// bilan emas, telefon raqami bilan tanish. Supabase Auth esa standart holda
// faqat email+parolni bepul qo'llab-quvvatlaydi (telefon+SMS OTP esa pullik
// SMS-provayder talab qiladi). Shu sababli telefon raqami "soxta" email
// ko'rinishiga o'giriladi (masalan 998901234567@bilolbarber.client) — bu
// odatiy, keng qo'llaniladigan bepul yechim: mijoz buni hech qachon
// ko'rmaydi, faqat sahna orqasida ishlatiladi.
//
// MUHIM: Supabase loyihasida Authentication -> Providers -> Email ->
// "Confirm email" OFF qilingan bo'lishi shart (sql/auth_and_noshow.sql
// faylining boshidagi izohga qarang) — aks holda signUp() dan keyin
// sessiya darhol qaytmay, mijoz hech qachon yubormaydigan tasdiqlash
// xatini kutib qoladi.
// =============================================================================
import { getSupabaseClient } from './api.js';
import { isInstalled } from './pwa.js';
import { t } from './i18n.js';

// Supabase (GoTrue/PostgREST) ba'zan xatolik javobini "message" maydonisiz
// qaytaradi — shunda kutubxona xom obyektni JSON.stringify() qilib beradi,
// natijada foydalanuvchiga ekranda aynan "[]" yoki "{}" kabi tushunarsiz matn
// chiqib qoladi. Shu holatni ushlab, o'rniga odam o'qiy oladigan xabar
// ko'rsatamiz; asl xatolikni esa konsolga (F12 -> Console) yozib qo'yamiz,
// shunda aniq sababini (Supabase loyihasi sozlamasi, tarmoq va h.k.) topish
// mumkin bo'ladi.
function friendlyErrorMessage(rawMessage, context) {
  const msg = (rawMessage || '').trim();

  // MOBIL QURILMALARDA KO'PROQ UCHRAYDI: ilova fon rejimida uzoq turib
  // qolsa (boshqa ilovaga o'tilganda) tarmoq uzilishi yoki sessiya/token
  // eskirishi mumkin — bularni aniqlab, "server xatoligi" degan noaniq
  // umumiy xabar o'rniga aniq, harakatga chaqiruvchi xabar ko'rsatamiz.
  if (/failed to fetch|network ?error|load failed|ERR_INTERNET|ERR_NETWORK/i.test(msg)) {
    return t('err.networkMobile');
  }
  if (/jwt|token is expired|invalid claim|session.*(expired|missing)|refresh_token/i.test(msg)) {
    return t('err.sessionExpired');
  }

  const looksRaw = !msg || msg === '[]' || msg === '{}' || /^[\[{]/.test(msg);
  if (looksRaw) {
    console.error(`[auth] ${context}: kutilmagan/bo'sh xatolik javobi ->`, rawMessage);
    return t('err.genericServer');
  }
  return msg;
}

let currentProfile = null; // { id, phone, full_name, no_show_count, blocked } | null
let pendingCallback = null;

// BUG FIX: initAuth() Supabase'dan sessiyani tekshirishi ASINXRON (tarmoq
// so'rovi bo'lishi mumkin) va main.js uni "await" qilmasdan chaqiradi (sahifa
// tezroq ko'rinishi uchun). Muammo: agar mijoz sahifa ochilgan zahoti "Bron
// qilish" tugmasini bossa, requireAuth() hali currentProfile to'ldirilmagan
// paytda ishga tushadi va login ALLAQACHON qilingan bo'lsa ham noto'g'ri
// ravishda login oynasini ochib yuboradi. Shu promise shu holatni oldini
// oladi: requireAuth() endi avval shu promise tugashini kutadi, keyin
// currentProfile'ni tekshiradi.
let resolveAuthReady;
const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });

// MUHIM: bu domen HAQIQIY TLD asosida bo'lishi shart — Supabase Auth email
// formatini tekshirganda TLD'ni ham tasdiqlaydi, shuning uchun o'ylab
// topilgan domenlarni (masalan ".client") "invalid" deb rad etadi.
// Shu sabab saytning haqiqiy, hozir ishlab turgan domeni ishlatiladi
// (bilol-barber.vercel.app — ".app" haqiqiy TLD). Kelajakda bilolbarber.uz
// ulansa ham bu yerni o'zgartirish shart emas — ikkalasi ham ishlaydi,
// chunki bu yerda hech qachon haqiqiy xat yuborilmaydi, faqat Supabase
// Auth uchun identifikator sifatida ishlatiladi.
const PHONE_DOMAIN = 'customer.bilol-barber.vercel.app';

// O'zbekistonda haqiqatda mavjud bo'lgan barcha 2 xonali kodlar (ham
// mobil operatorlar, ham shahar/hudud kodlari) — manba: ITU/milliy
// raqamlash rejasi (en.wikipedia.org/wiki/Telephone_numbers_in_Uzbekistan).
// Shu ro'yxatda YO'Q har qanday kod (masalan 01, 15, 40, 60, 63, 64, 68,
// 81-86, 89 va h.k.) haqiqatda mavjud emas, shuning uchun rad etiladi.
const VALID_UZ_CODES = new Set([
  '20', '33', '50', '55',           // 20 OQ(Beeline), 33 Humans, 50 Ucell, 55 Uztelecom(VoIP)
  '61', '62', '65', '66', '67', '69', // hudud (fixed) kodlari
  '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', // Uzmobile/Tashkent/hudud/turli
  '80',                              // Perfectum Mobile (5G)
  '87', '88',                        // Mobiuz
  '90', '91', '92',                  // Beeline
  '93', '94',                        // Ucell
  '95',                              // Uzmobile (CDMA)
  '97',                              // Mobiuz
  '98',                              // Perfectum Mobile (CDMA)
  '99',                              // Uzmobile
]);

// Telefon raqam "to'g'ri ko'rinishda"mi tekshiradi. "+" belgisi shart
// emas — muhimi umumiy raqamlar soni: agar "998" bilan boshlansa, aynan
// 12 xona (998 + 9 xonali operator+raqam) bo'lishi kerak; aks holda
// (operator kodi bilan boshlangan mahalliy raqam, "+" bilan yozilgan
// bo'lsa ham) aynan 9 xona bo'lishi kerak.
function isValidPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return false;

  let local; // "998" davlat kodisiz, mahalliy 9 xonali qism
  if (digits.startsWith('998') && digits.length > 9) {
    if (digits.length !== 12) return false;
    local = digits.slice(3);
  } else {
    if (digits.length !== 9) return false;
    local = digits;
  }

  // Operator/hudud kodi — mahalliy raqamning birinchi 2 xonasi (masalan
  // 998 "90" 123 45 67 dagi "90"). Faqat O'zbekistonda haqiqatda mavjud
  // bo'lgan kodlar qabul qilinadi (VALID_UZ_CODES ro'yxatiga qarang).
  const operatorCode = local.slice(0, 2);
  if (!VALID_UZ_CODES.has(operatorCode)) return false;

  return true;
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  // O'zbekiston raqami bo'lsa (masalan +998 91 555 43 23 -> 998915554323),
  // "998" davlat kodini olib tashlaymiz, faqat mahalliy qismi qoladi
  // (915554323). Boshqa davlat kodlari (masalan +91 504 33 44) esa
  // o'zgarishsiz, kiritilgan holicha qoladi.
  if (digits.startsWith('998') && digits.length > 9) {
    digits = digits.slice(3);
  }
  return digits;
}

// Saqlangan (998 olib tashlangan) raqamni bot/chek/admin uchun TO'LIQ
// ko'rinishga qaytaradi. 9 xonali bo'lsa — bu O'zbekiston mahalliy raqami,
// shuning uchun "998" qayta qo'shiladi. Boshqa uzunlikdagi (xorijiy)
// raqamlar allaqachon o'z davlat kodi bilan saqlangan, o'zgarishsiz qoladi.
export function toFullPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return '';
  const full = d.length === 9 ? `998${d}` : d;
  return `+${full}`;
}

// Telefon inputiga yozayotganda avtomatik formatlash. Input endi HAR DOIM
// faqat mahalliy 9 xonani ifodalaydi — "+998" HTML'da alohida, doimiy
// (o'zgarmas) prefiks sifatida ko'rsatiladi, mijoz uni qayta terishi
// shart emas. Shu tufayli avvalgi "998 davlat kodimi yoki 99 operator
// kodi + 8?" degan chalkashlik (masalan "+99 8" ko'rinishida noto'g'ri
// guruhlanish) butunlay yo'qoladi.
//
// Yagona istisno — agar mijoz butun raqamni "998" bilan birga joylashtirsa
// (paste qilsa, masalan +998901234567), buni aniq tanib, "998"ni olib
// tashlaymiz — bu holat chalkash emas, chunki bir zumda TO'LIQ 12 xona
// keladi (bosqichma-bosqich terishda bunday uzunlikka erishilmaydi).
function formatPhoneMask(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) {
    digits = digits.slice(3);
  }
  digits = digits.slice(0, 9);

  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 5));
  if (digits.length > 5) parts.push(digits.slice(5, 7));
  if (digits.length > 7) parts.push(digits.slice(7, 9));
  return parts.join(' ');
}

function attachPhoneMask(input) {
  if (!input || input.dataset.maskAttached) return;
  input.dataset.maskAttached = '1';
  input.addEventListener('input', () => {
    const atEnd = input.selectionStart === input.value.length;
    input.value = formatPhoneMask(input.value);
    if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
}

function toPseudoEmail(digits) {
  return `${digits}@${PHONE_DOMAIN}`;
}

export function getCurrentProfile() {
  return currentProfile;
}

export function isLoggedIn() {
  return !!currentProfile;
}

async function loadProfile(userId) {
  const client = getSupabaseClient();
  if (!client || !userId) { currentProfile = null; return; }
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
  if (error) {
    console.warn('Profilni yuklashda xatolik:', error.message);
    // Sessiya bor, lekin profil topilmadi (masalan trigger biroz kechikdi) —
    // baribir bosh ma'lumot bilan davom etamiz, aks holda mijoz "login
    // qilolmayapman" degan holatga tushib qoladi.
    currentProfile = { id: userId, phone: '', full_name: '', no_show_count: 0, blocked: false };
    return;
  }
  currentProfile = data;
}

/* ---------------------------------------------------------------------------
   Ro'yxatdan o'tish / Kirish / Chiqish
--------------------------------------------------------------------------- */
export async function signUp(fullName, phoneRaw, password) {
  const client = getSupabaseClient();
  if (!client) throw new Error(t('err.connection'));

  if (!isValidPhone(phoneRaw)) throw new Error(t('err.invalidPhone'));
  const digits = normalizePhone(phoneRaw);
  if (fullName.trim().length <= 2) throw new Error(t('err.nameTooShort'));
  if (!password || password.length < 6) throw new Error(t('err.passwordTooShort'));

  const email = toPseudoEmail(digits);
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { phone: digits, full_name: fullName.trim() } },
  });

  if (error) {
    if (/registered|exists/i.test(error.message)) {
      throw new Error(t('err.phoneAlreadyRegistered'));
    }
    throw new Error(friendlyErrorMessage(error.message, 'signUp'));
  }

  if (!data.session) {
    // Supabase ikkita holatda "session: null, error: null" qaytaradi:
    //   1) "Confirm email" hali OFF qilinmagan bo'lsa (sozlash muammosi).
    //   2) Bu email (pseudo-email, ya'ni telefon raqami) allaqachon
    //      RO'YXATDAN O'TGAN bo'lsa — Supabase buni ataylab xatolik
    //      qilib qaytarmaydi (email enumeration hujumidan himoya uchun),
    //      shu o'rniga `identities: []` bilan "muvaffaqiyatli" javob beradi.
    // Ikkinchisini aniqlab, to'g'ri xabar ko'rsatamiz — aks holda mijoz
    // bu holatni umumiy server xatosi deb tushunib qoladi.
    const looksAlreadyRegistered = Array.isArray(data.user?.identities) && data.user.identities.length === 0;
    if (looksAlreadyRegistered) {
      throw new Error(t('err.phoneAlreadyRegistered'));
    }
    throw new Error(t('err.signupIncomplete'));
  }

  await loadProfile(data.user.id);
  updateHeaderUI();
  return currentProfile;
}

export async function signIn(phoneRaw, password) {
  const client = getSupabaseClient();
  if (!client) throw new Error(t('err.connection'));

  const digits = normalizePhone(phoneRaw);
  const email = toPseudoEmail(digits);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    // Avval tarmoq/sessiya muammosi emasligini tekshiramiz — aks holda
    // mijoz haqiqatan internet uzilgani uchun kira olmayotgan bo'lsa ham,
    // unga noto'g'ri ravishda "parolingiz xato" deb ko'rsatib yuboramiz.
    if (/failed to fetch|network ?error|load failed|ERR_INTERNET|ERR_NETWORK/i.test(error.message || '')) {
      throw new Error(t('err.networkMobile'));
    }
    throw new Error(t('err.wrongCredentials'));
  }

  await loadProfile(data.user.id);
  updateHeaderUI();
  return currentProfile;
}

export async function signOut() {
  const client = getSupabaseClient();
  if (client) await client.auth.signOut();
  currentProfile = null;
  updateHeaderUI();
}

export async function updateProfile(fullName, phoneRaw) {
  const client = getSupabaseClient();
  if (!client || !currentProfile) throw new Error(t('err.loginFirst'));

  if (!isValidPhone(phoneRaw)) throw new Error(t('err.invalidPhone'));
  const digits = normalizePhone(phoneRaw);
  if (fullName.trim().length <= 2) throw new Error(t('err.nameTooShort'));

  const phoneChanged = digits !== currentProfile.phone;

  // MUHIM: mijoz "Sozlamalar"dan telefon raqamini o'zgartirsa, login qilishda
  // ishlatiladigan Supabase Auth "email" (raqamga asoslangan pseudo-email)
  // ham shu yangi raqamga mos ravishda YANGILANISHI shart — aks holda mijoz
  // profilida yangi raqam ko'rinadi-yu, lekin login sahifasida hali ham
  // ESKI raqami bilan kirishga majbur bo'lib qoladi. Shu sabab profiles
  // jadvalini yangilashdan OLDIN auth email'ni yangilaymiz — agar bu raqam
  // (pseudo-email) boshqa hisobda band bo'lsa, xatolik shu yerda chiqadi va
  // profiles jadvali umuman tegilmay qoladi (ikki joy sinxronsiz qolmaydi).
  if (phoneChanged) {
    const { error: authErr } = await client.auth.updateUser({ email: toPseudoEmail(digits) });
    if (authErr) {
      if (/registered|exists|duplicate/i.test(authErr.message)) {
        throw new Error(t('err.phoneUsedByAnotherAccount'));
      }
      throw new Error(friendlyErrorMessage(authErr.message, 'updateProfile/auth'));
    }
  }

  const { data, error } = await client
    .from('profiles')
    .update({ full_name: fullName.trim(), phone: digits })
    .eq('id', currentProfile.id)
    .select()
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error(t('err.phoneUsedByAnotherAccount'));
    }
    throw new Error(friendlyErrorMessage(error.message, 'updateProfile/profiles'));
  }

  currentProfile = data;
  return currentProfile;
}

/* ---------------------------------------------------------------------------
   Booking oqimi bilan bog'lash: login talab qilish
--------------------------------------------------------------------------- */
export async function requireAuth(onSuccess) {
  // Sessiya hali tekshirilayotgan bo'lsa (sahifa endigina ochilgan), shu
  // yerda kutib turamiz — aks holda login qilingan mijozga ham bekorga
  // login oynasi chiqib ketadi.
  await authReady;

  if (currentProfile) {
    if (currentProfile.blocked) {
      alert(t('auth.blockedMsg'));
      return;
    }
    onSuccess();
    return;
  }
  pendingCallback = onSuccess;
  openAuthModal('login');
}

function consumePendingCallback() {
  const cb = pendingCallback;
  pendingCallback = null;
  if (cb) cb();
}

/* ---------------------------------------------------------------------------
   Auth modal UI
--------------------------------------------------------------------------- */
function authModal() { return document.getElementById('authModal'); }

function openAuthModal(mode = 'login') {
  setAuthMode(mode);
  authModal().classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  updateAuthInstallBtn();
}

function updateAuthInstallBtn() {
  const btn = document.getElementById('authInstallBtn');
  if (!btn) return;
  const installed = isInstalled();
  btn.classList.toggle('hidden', installed);
  btn.classList.toggle('flex', !installed);
}

function closeAuthModal() {
  authModal().classList.add('hidden');
  document.body.style.overflow = '';
  pendingCallback = null;
  document.getElementById('authError').classList.add('hidden');
}

/** Login oynasi muvaffaqiyatli kirishsiz, mijoz tomonidan bekor qilinganda
 *  chaqiriladi (X tugma / fon bosish / Escape). */
function cancelAuthModal() {
  closeAuthModal();
}

function setAuthMode(mode) {
  const isLogin = mode === 'login';
  document.getElementById('authTitle').textContent = isLogin ? t('auth.loginTitle') : t('auth.registerTitle');
  document.getElementById('authNameRow').classList.toggle('hidden', isLogin);
  document.getElementById('authSubmitBtn').textContent = isLogin ? t('auth.loginBtn') : t('auth.registerBtn');
  document.getElementById('authSwitchText').textContent = isLogin ? t('auth.noAccount') : t('auth.haveAccount');
  document.getElementById('authSwitchBtn').textContent = isLogin ? t('auth.registerBtn') : t('auth.loginBtn');
  authModal().dataset.mode = mode;
  document.getElementById('authError').classList.add('hidden');
}

function updateHeaderUI() {
  document.querySelectorAll('[data-auth-logged-in]').forEach(el => el.classList.toggle('auth-gate', !currentProfile));
  document.querySelectorAll('[data-auth-logged-out]').forEach(el => el.classList.toggle('auth-gate', !!currentProfile));
  // Boshqa modullar (masalan "Mening bronlarim" dashboard bo'limi) shu
  // hodisani tinglab, login holati o'zgarganda o'zini yangilab oladi.
  document.dispatchEvent(new CustomEvent('bilol:authchange', { detail: { loggedIn: !!currentProfile } }));
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const mode = authModal().dataset.mode;
  const errEl = document.getElementById('authError');
  const btn = document.getElementById('authSubmitBtn');
  const name = document.getElementById('authName').value;
  const phone = document.getElementById('authPhone').value;
  const password = document.getElementById('authPassword').value;

  errEl.classList.add('hidden');
  btn.disabled = true;
  const original = btn.textContent;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  try {
    if (mode === 'login') {
      await signIn(phone, password);
    } else {
      await signUp(name, phone, password);
    }
    closeAuthModal();
    // Login/ro'yxatdan o'tish muvaffaqiyatli bo'lgach, sahifani avtomatik
    // yangilaymiz — shunda barcha ma'lumotlar (bron holati, sozlamalar va
    // h.k.) yangi sessiyaga mos ravishda to'liq qayta yuklanadi.
    window.location.reload();
    return;
  } catch (err) {
    errEl.textContent = friendlyErrorMessage(err.message, 'handleAuthSubmit');
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ---------------------------------------------------------------------------
   Sozlamalar (profil) oynasi
--------------------------------------------------------------------------- */
function settingsModal() { return document.getElementById('settingsModal'); }

function openSettingsModal() {
  // "Sozlamalar" tugmasi endi login holatidan qat'iy nazar doim ko'rinadi
  // (mobil/desktop). Agar mijoz hali kirmagan/ro'yxatdan o'tmagan bo'lsa,
  // profil tahrirlash oynasi o'rniga login/ro'yxatdan o'tish oynasi
  // ochiladi — u yerda ham til almashtirish mumkin (authLangToggle).
  if (!currentProfile) {
    openAuthModal('login');
    return;
  }
  document.getElementById('settingsName').value = currentProfile.full_name || '';
  document.getElementById('settingsPhone').value = currentProfile.phone
    ? formatPhoneMask(currentProfile.phone)
    : '';
  document.getElementById('settingsError').classList.add('hidden');
  document.getElementById('settingsSuccess').classList.add('hidden');
  settingsModal().classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
  settingsModal().classList.add('hidden');
  document.body.style.overflow = '';
}



async function handleSettingsSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('settingsError');
  const okEl = document.getElementById('settingsSuccess');
  const btn = document.getElementById('settingsSaveBtn');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  btn.disabled = true;
  const original = btn.textContent;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  try {
    await updateProfile(
      document.getElementById('settingsName').value,
      document.getElementById('settingsPhone').value,
    );
    okEl.textContent = t('settings.saved');
    okEl.classList.remove('hidden');
  } catch (err) {
    errEl.textContent = friendlyErrorMessage(err.message, 'handleSettingsSubmit');
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

export async function initAuth() {
  const client = getSupabaseClient();
  if (client) {
    const { data: { session } } = await client.auth.getSession();
    if (session) await loadProfile(session.user.id);
    client.auth.onAuthStateChange(async (_event, session) => {
      if (session) await loadProfile(session.user.id);
      else currentProfile = null;
      updateHeaderUI();
    });
  }
  updateHeaderUI();
  resolveAuthReady(); // dastlabki sessiya tekshiruvi tugadi — requireAuth() endi to'g'ri javob beradi

  document.getElementById('authForm')?.addEventListener('submit', handleAuthSubmit);
  document.getElementById('authModalCloseBtn')?.addEventListener('click', cancelAuthModal);
  document.getElementById('authModalBackdrop')?.addEventListener('click', cancelAuthModal);
  document.getElementById('authSwitchBtn')?.addEventListener('click', () => {
    setAuthMode(authModal().dataset.mode === 'login' ? 'signup' : 'login');
  });
  document.getElementById('authInstallBtn')?.addEventListener('click', () => {
    window.location.href = '/install';
  });
  document.querySelectorAll('[data-logout]').forEach(el => {
    el.addEventListener('click', async () => { await signOut(); closeSettingsModal(); });
  });
  document.querySelectorAll('[data-open-settings]').forEach(el => {
    el.addEventListener('click', openSettingsModal);
  });
  document.getElementById('settingsForm')?.addEventListener('submit', handleSettingsSubmit);
  document.getElementById('settingsModalCloseBtn')?.addEventListener('click', closeSettingsModal);
  document.getElementById('settingsModalBackdrop')?.addEventListener('click', closeSettingsModal);

  // Til almashganda auth oynasidagi dinamik matnlarni (Kirish/Ro'yxatdan
  // o'tish holatiga qarab almashadigan) qayta qo'llaymiz.
  document.addEventListener('bilol:langchange', () => {
    setAuthMode(authModal().dataset.mode || 'login');
  });

  attachPhoneMask(document.getElementById('authPhone'));
  attachPhoneMask(document.getElementById('settingsPhone'));

  // UI TUZATISH: bron modalida Esc bilan yopish ishlardi, lekin bu ikkita
  // (auth va sozlamalar) modalda ishlamas edi — klaviatura foydalanuvchisi
  // uchun nomuvofiq xatti-harakat edi. Endi barcha modallar bir xil ishlaydi.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!authModal().classList.contains('hidden')) cancelAuthModal();
    else if (!settingsModal().classList.contains('hidden')) closeSettingsModal();
  });
}