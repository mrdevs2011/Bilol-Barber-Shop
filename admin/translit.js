// =============================================================================
// O'ZBEKCHA LOTIN -> KIRILL harf almashtirish (transliteratsiya).
//
// MUHIM: bu TARJIMA emas, faqat imlo (yozuv) o'zgartirish — ism/familiya
// kabi atoqli otlar uchun mo'ljallangan (masalan "Alisher Yusupov" ->
// "Алишер Юсупов"). Ma'no tarjimasi kerak bo'lgan matnlar (tavsif) uchun
// /api/translate serverless funksiyasi ishlatiladi (bu faylga aloqasi yo'q).
//
// 100% lingvistik jihatdan mukammal emas (masalan katta-kichik harflar
// so'z darajasida qo'llaniladi), lekin odatiy Ism-Familiya va xizmat nomi
// kabi qisqa matnlar uchun amaliy jihatdan yetarli.
// =============================================================================

const APOST = `['ʻʼ\`‘’]`; // o' / g' dagi turli tutuq belgisi variantlari
const APOST_RE_O = new RegExp(`^o${APOST}`);
const APOST_RE_G = new RegExp(`^g${APOST}`);

// Ikki (yoki undan ortiq) harfli birikmalar — bittalik harflardan OLDIN
// tekshiriladi, aks holda masalan "sh" ikkita alohida harf sifatida
// o'girilib qolar edi.
const DIGRAPHS = [
  ['sh', 'ш'],
  ['ch', 'ч'],
  ['yo', 'ё'],
  ['ya', 'я'],
  ['yu', 'ю'],
  ['ts', 'ц'],
  ['ng', 'нг'],
];

const SINGLES = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и',
  j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ',
  r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з',
};

const APOSTROPHE_ALONE = 'ъ'; // tutuq belgisi (o'/g' tarkibida bo'lmasa)
const LETTER_TEST = /[a-z'ʻʼ`‘’]/i;

/** Bitta so'zni (bo'sh joysiz) kichik harflarda kirillga o'tkazadi. */
function transliterateLower(word) {
  let out = '';
  let atStart = true;
  let i = 0;
  while (i < word.length) {
    const rest = word.slice(i);
    if (APOST_RE_O.test(rest)) { out += 'ў'; i += 2; atStart = false; continue; }
    if (APOST_RE_G.test(rest)) { out += 'ғ'; i += 2; atStart = false; continue; }

    let digraphMatched = false;
    for (const [lat, cyr] of DIGRAPHS) {
      if (rest.startsWith(lat)) {
        out += cyr;
        i += lat.length;
        atStart = false;
        digraphMatched = true;
        break;
      }
    }
    if (digraphMatched) continue;

    const ch = word[i];
    if (!LETTER_TEST.test(ch)) { out += ch; i++; atStart = true; continue; }

    if (ch === 'e' && atStart) { out += 'э'; i++; atStart = false; continue; }
    if (/['ʻʼ`‘’]/.test(ch)) { out += APOSTROPHE_ALONE; i++; atStart = false; continue; }

    out += SINGLES[ch] ?? ch;
    atStart = false;
    i++;
  }
  return out;
}

/**
 * Berilgan matnni (Ism Familiya yoki xizmat nomi kabi) o'zbekcha lotin
 * yozuvidan kirillga o'giradi, har bir so'zning katta-kichik harf holatini
 * (agar Bosh harf bilan boshlangan bo'lsa) saqlab qoladi.
 */
export function uzLatinToCyrillic(text) {
  if (!text) return '';
  return text
    .split(/(\s+)/) // bo'shliqlarni ham saqlab qolish uchun capture group
    .map((chunk) => {
      if (/^\s+$/.test(chunk) || chunk === '') return chunk;
      const lower = transliterateLower(chunk.toLowerCase());
      const firstOrig = chunk[0];
      if (firstOrig && firstOrig === firstOrig.toUpperCase() && firstOrig !== firstOrig.toLowerCase()) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join('');
}
