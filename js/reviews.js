// =============================================================================
// SHARHLAR (haqiqiy mijoz sharhlari): ommaviy sayt faqat Supabase'dagi
// `comments` jadvalidan status='approved' bo'lgan sharhlarni ko'rsatadi.
// Login qilgan mijoz o'z qurilmasidan yulduzcha (1-5) va matn yuborishi
// mumkin — ismi va "doimiy/yangi mijoz" belgisi mijoz tomonidan
// kiritilmaydi, buni server (sql/PATCH_round14_comments.sql dagi trigger)
// profil va bron tarixidan avtomatik hisoblab qo'yadi. Yangi sharh admin
// tasdiqlaguncha ('pending') bu yerda ko'rinmaydi.
// =============================================================================
import { getSupabaseClient } from './api.js';
import { requireAuth } from './auth.js';
import { t, translateServerError } from './i18n.js';

let selectedRating = 0;

function grid() { return document.getElementById('reviewsGrid'); }
function emptyEl() { return document.getElementById('reviewsEmpty'); }
function formEl() { return document.getElementById('reviewForm'); }
function textEl() { return document.getElementById('reviewText'); }
function charCountEl() { return document.getElementById('reviewCharCount'); }
function msgEl() { return document.getElementById('reviewMsg'); }
function submitBtnEl() { return document.getElementById('reviewSubmitBtn'); }
function starsWrap() { return document.getElementById('reviewStars'); }

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** "Javohir Mahmudov" -> "JM", bo'sh bo'lsa "M" */
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'M';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function starsHtml(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<i class="fa-solid fa-star"${i <= rating ? '' : ' style="opacity:.25"'}></i>`;
  }
  return html;
}

/* ---------------------------------------------------------------------------
   Ommaviy ro'yxatni yuklash/chizish
--------------------------------------------------------------------------- */
async function loadReviews() {
  const client = getSupabaseClient();
  const el = grid();
  if (!client || !el) return;

  const { data, error } = await client
    .from('comments')
    .select('id, client_name, rating, comment_text, customer_type, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(9);

  if (error) {
    console.warn('Sharhlarni yuklashda xatolik:', error.message);
    el.innerHTML = '';
    emptyEl()?.classList.remove('hidden');
    return;
  }
  renderReviews(data || []);
}

function renderReviews(list) {
  const el = grid();
  const empty = emptyEl();
  if (!el) return;

  if (!list.length) {
    el.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  el.innerHTML = list.map((r) => `
    <div class="review-card reveal lift">
      <div class="review-card-stars">${starsHtml(r.rating)}</div>
      <p class="review-card-text">"${escapeHtml(r.comment_text)}"</p>
      <div class="review-card-foot">
        <div class="review-card-avatar">${escapeHtml(initials(r.client_name))}</div>
        <div>
          <div class="review-card-name">${escapeHtml(r.client_name)}</div>
          <div class="review-card-tag">${r.customer_type === 'doimiy' ? t('reviews.regular') : t('reviews.new')}</div>
        </div>
      </div>
    </div>
  `).join('');
}

/* ---------------------------------------------------------------------------
   Yulduzcha (reyting) tanlash
--------------------------------------------------------------------------- */
function setRating(n) {
  selectedRating = n;
  starsWrap()?.querySelectorAll('.review-star').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.star) <= n);
  });
}

function wireStars() {
  starsWrap()?.addEventListener('click', (e) => {
    const btn = e.target.closest('.review-star');
    if (!btn) return;
    setRating(Number(btn.dataset.star));
  });
}

function wireCharCount() {
  textEl()?.addEventListener('input', () => {
    const len = textEl().value.length;
    if (charCountEl()) charCountEl().textContent = `${len}/500`;
  });
}

function showMsg(text, type) {
  const el = msgEl();
  if (!el) return;
  el.textContent = text;
  el.className = `review-msg ${type}`;
}

/* ---------------------------------------------------------------------------
   Sharh yuborish: ism/holat/mijoz-turi HECH QACHON shu yerdan yuborilmaydi —
   ularni serverdagi trigger profil va bron tarixidan o'zi belgilaydi.
--------------------------------------------------------------------------- */
async function submitReview() {
  const text = textEl()?.value.trim() || '';

  if (selectedRating < 1) {
    showMsg(t('reviews.errNoRating'), 'err');
    return;
  }
  if (text.length < 3) {
    showMsg(t('reviews.errTooShort'), 'err');
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    showMsg(t('reviews.errConnection'), 'err');
    return;
  }

  const btn = submitBtnEl();
  if (btn) { btn.disabled = true; btn.textContent = t('reviews.submitting'); }

  const { error } = await client.from('comments').insert({
    rating: selectedRating,
    comment_text: text,
  });

  if (btn) { btn.disabled = false; btn.textContent = t('reviews.submit'); }

  if (error) {
    // MUHIM (til sizib chiqmasligi): masalan bloklangan hisob sharh
    // qoldirmoqchi bo'lsa, trigger xatoni o'zbekcha qaytaradi. Xom holda
    // ko'rsatish o'rniga avval tarjima qilishga urinamiz.
    const translated = translateServerError(error.message);
    if (translated) {
      showMsg(translated, 'err');
    } else {
      console.error('Tarjima qilinmagan sharh xatoligi:', error.message);
      showMsg(t('reviews.errPrefix') + '.', 'err');
    }
    return;
  }

  showMsg(t('reviews.success'), 'ok');
  formEl()?.reset();
  setRating(0);
  if (charCountEl()) charCountEl().textContent = '0/500';
}

function wireSubmit() {
  formEl()?.addEventListener('submit', (e) => {
    e.preventDefault();
    requireAuth(() => submitReview());
  });

  document.getElementById('reviewLoginPrompt')?.addEventListener('click', () => {
    requireAuth(() => {}); // login qilgan bo'lsa hech narsa qilmaydi, bo'lmasa login oynasini ochadi
  });
}

export function initReviews() {
  wireStars();
  wireCharCount();
  wireSubmit();
  loadReviews();
  document.addEventListener('bilol:langchange', loadReviews);
}
