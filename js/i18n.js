// =============================================================================
// I18N: sayt interfeysini o'zbek (uz), rus (ru) va ingliz (en) tillari orasida almashtirish.
//
// Ishlash tartibi:
//  - Tanlangan til localStorage'da ("bilol:lang") saqlanadi, shu sabab
//    sahifa qayta ochilganda ham eslab qoladi.
//  - index.html'dagi matnlar data-i18n="kalit" (textContent uchun),
//    data-i18n-placeholder="kalit" (input placeholder uchun) yoki
//    data-i18n-title="kalit" (title/aria-label uchun) atributlari bilan
//    belgilangan — applyTranslations() shularni aylanib chiqib matnni
//    joriy tilga almashtiradi.
//  - JS orqali dinamik chiqadigan matnlar (booking.js, mybookings.js va
//    h.k.) shu fayldan import qilingan t(kalit) funksiyasini chaqiradi.
//
// MUHIM: bu DB'dagi haqiqiy kontentni (xizmat/usta nomlari, sharhlar)
// TARJIMA QILMAYDI — faqat sayt interfeysi (tugmalar, sarlavhalar, tizim
// xabarlari) ikki tilli. Xizmat/usta nomlari admin panelda qanday
// kiritilgan bo'lsa, shunday ko'rinaveradi (bu alohida, kattaroq vazifa).
// =============================================================================

const STORAGE_KEY = 'bilol:lang';
const SUPPORTED = ['uz', 'ru', 'en'];
const DEFAULT_LANG = 'uz';

const DICT = {
  uz: {
    // ---- Navigatsiya / header ----
    'nav.services': 'Xizmatlar',
    'nav.masters': 'Barberlar',
    'nav.reviews': 'Sharhlar',
    'nav.location': 'Joylashuv',
    'nav.contact': 'Aloqa',
    'nav.myBookings': 'Mening bronlarim',
    'nav.settings': 'Sozlamalar',
    'cta.book': 'Navbatga yozilish',
    'cta.newBooking': 'Yangi bron',
    'cta.chooseTime': 'Vaqtni tanlash',
    'cta.viewServices': 'Xizmatlarni ko\u2019rish',

    // ---- Shaxsiy kabinet ----
    'dashboard.eyebrow': 'Shaxsiy kabinet',
    'dashboard.title': 'Mening bronlarim',
    'dashboard.empty': 'Hali bron qilmagansiz.',
    'dashboard.cancelBtn': 'Bronni bekor qilish',
    'dashboard.tooLate': 'Bekor qilish muddati o\u2019tdi (kamida 2 soat oldin kerak). Bog\u2019lanish uchun administratorga murojaat qiling.',
    'dashboard.cancelConfirm': 'Bronni bekor qilishni tasdiqlaysizmi?',
    'dashboard.cancelError': 'Bronni bekor qilishda xatolik yuz berdi.',
    'dashboard.loadError': 'Bronlarni yuklashda xatolik',

    // ---- Bron holati ----
    'status.new': 'Yangi',
    'status.confirmed': 'Tasdiqlangan',
    'status.done': 'Bajarilgan',
    'status.no_show': 'Kelmadi',
    'status.cancelled': 'Bekor qilingan',

    // ---- Countdown ----
    'countdown.day': 'kun',
    'countdown.hour': 'soat',
    'countdown.minute': 'daqiqa',
    'countdown.left': 'qoldi',
    'countdown.startingNow': 'Hozir boshlanadi',

    // ---- Hero ----
    'hero.badge': 'Andijondagi ishonchli erkaklar barber shopi',
    'hero.title1': 'O\u2019zingizga bo\u2019lgan',
    'hero.title2': 'ishonchni',
    'hero.titleEm': 'barberlarimiz',
    'hero.title3': 'bilan oshiring',
    'hero.subtitle': 'Soch, soqol va tarash bo\u2019yicha tajribali barberlar jamoasi — sizga qulay vaqtda, qulay narxda, yuqori sifatli xizmat ko\u2019rsatadi.',
    'stats.experience': 'yillik tajriba',
    'stats.masters': 'tajribali barber',
    'stats.rating': 'mijozlar bahosi',

    // ---- Ticket preview (dekorativ) ----
    'ticket.previewLabel': 'Bron chiptasi',
    'ticket.previewService': 'Fade / dizaynli kesish',
    'ticket.previewBarber': 'Barber: Alisher Yusupov',
    'ticket.previewDate': '24-iyul, Payshanba',
    'ticket.previewDuration': '50 daqiqa',
    'ticket.previewPrice': '60 000 so\u2019m',
    'ticket.dateLabel': 'Sana',
    'ticket.timeLabel': 'Vaqt',
    'ticket.durationLabel': 'Davomiyligi',
    'ticket.summaryLabel': 'Bron xulosasi',
    'ticket.confirmedLabel': 'Bron tasdiqlandi',
    'ticket.confirmedStamp': 'Tasdiqlandi',
    'ticket.codeLabel': 'Bron kodi',
    'ticket.clientLabel': 'Mijoz',
    'ticket.phoneLabel': 'Telefon',
    'ticket.barberPrefix': 'Barber',
    'ticket.newLabel': 'Yangi bron',

    // ---- Valyuta ----
    'currency.sum': 'so\u2019m',

    // ---- Xatolik xabarlari (auth / booking) — avval kodda qattiq yozilgan edi ----
    'err.connection': 'Ulanishda xatolik. Sahifani yangilab ko\u2019ring.',
    'err.loginFirst': 'Avval hisobingizga kiring.',
    'err.invalidPhone': 'Iltimos, to\u2019g\u2019ri telefon raqam kiriting.',
    'err.nameTooShort': 'Ism kamida 3 belgidan iborat bo\u2019lishi kerak.',
    'err.passwordTooShort': 'Parol kamida 6 belgidan iborat bo\u2019lishi kerak.',
    'err.phoneAlreadyRegistered': 'Bu telefon raqam bilan allaqachon ro\u2019yxatdan o\u2019tilgan. Iltimos, \u201cKirish\u201d bo\u2019limidan kiring.',
    'err.signupIncomplete': 'Ro\u2019yxatdan o\u2019tish tugallanmadi. Agar bu birinchi safar bo\u2019lsa, admin bilan bog\u2019laning (Supabase sozlamasi kerak).',
    'err.wrongCredentials': 'Telefon raqam yoki parol noto\u2019g\u2019ri.',
    'err.phoneUsedByAnotherAccount': 'Bu telefon raqam boshqa hisobda allaqachon ishlatilgan.',
    'err.bookLoginRequired': 'Bron qilish uchun avval hisobingizga kiring.',
    'err.slotTaken': 'Kechirasiz, bu vaqt hozirgina band qilindi. Iltimos, boshqa vaqtni tanlang.',
    'err.accountBlocked': 'Hisobingiz vaqtincha bloklangan (bir necha marta navbatga kelmaganingiz sabab). Administrator bilan bog\u2019laning.',
    'err.genericServer': 'Server xatoligi yuz berdi. Iltimos, birozdan so\u2019ng qayta urinib ko\u2019ring.',
    'err.sessionExpired': 'Sessiyangiz muddati tugagan (uzoq vaqt fon rejimida qolgan bo\u2019lishi mumkin). Iltimos, sahifani yangilab, qaytadan urinib ko\u2019ring.',
    'err.networkMobile': 'Internet aloqasi uzilib qoldi. Wi-Fi yoki mobil internetni tekshirib, qaytadan urinib ko\u2019ring.',
    'a11y.menu': 'Menyu',
    'a11y.close': 'Yopish',

    // ---- Xizmatlar bo'limi ----
    'services.eyebrow': 'Narxnoma',
    'services.title': 'Xizmatlar va narxlar',
    'services.subtitle': 'Har bir xizmatni tanlab, to\u2019g\u2019ridan-to\u2019g\u2019ri bron qilish oynasini oching — davomiyligi va narxi oldindan ko\u2019rsatilgan.',
    'services.minutes': 'daqiqa',
    'services.minutesShort': 'daq',

    // ---- Ustalar bo'limi ----
    'masters.eyebrow': 'Jamoamiz',
    'masters.title': 'Professional barberlar',
    'masters.subtitle': 'Har biri o\u2019z sohasida yillar davomida tajriba orttirgan, mijozlar tomonidan sevib tanlangan barberlar.',

    // ---- Sharhlar bo'limi ----
    'reviews.eyebrow': 'Mijozlar fikri',
    'reviews.title': 'Bizga ishonishadi',
    'reviews.subtitle': 'Har bir mijozimizning fikri biz uchun muhim — quyida ulardan ba\u2019zilarining sharhlari.',
    'reviews.empty': 'Hozircha tasdiqlangan sharhlar yo\u2019q — birinchi bo\u2019lib fikringizni yozing!',
    'reviews.formTitle': 'Sharh qoldiring',
    'reviews.formHint': 'Yuborilgan sharhingiz tekshiruvdan o\u2019tgach shu sahifada chiqadi.',
    'reviews.placeholder': 'Xizmat haqida fikringizni yozing...',
    'reviews.submit': 'Yuborish',
    'reviews.submitting': 'Yuborilmoqda...',
    'reviews.loginPrompt': 'Sharh qoldirish uchun hisobingizga kiring',
    'reviews.instagramCta': 'Instagramda ko\u2019proq sharh va natijalarni ko\u2019ring',
    'reviews.regular': 'Doimiy mijoz',
    'reviews.new': 'Yangi mijoz',
    'reviews.errNoRating': 'Iltimos, avval yulduzcha orqali baho bering.',
    'reviews.errTooShort': 'Sharh matni juda qisqa.',
    'reviews.errConnection': 'Ulanishda xatolik. Sahifani yangilab ko\u2019ring.',
    'reviews.errPrefix': 'Xatolik',
    'reviews.success': 'Rahmat! Sharhingiz yuborildi — admin tasdiqlagach shu sahifada chiqadi.',

    // ---- Nima uchun biz ----
    'why.title1': 'Premium mahsulotlar',
    'why.desc1': 'Faqat sertifikatlangan, yuqori sifatli professional erkaklar parvarish vositalari bilan ishlaymiz.',
    'why.title2': 'Tajribali barberlar',
    'why.desc2': 'Jamoamiz muntazam malaka oshirish kurslaridan o\u2019tadi va zamonaviy texnikalarni qo\u2019llaydi.',
    'why.title3': 'Tezkor onlayn bron',
    'why.desc3': 'Bir necha bosishda o\u2019zingizga qulay vaqtni tanlang — navbatda kutish shart emas.',

    // ---- Footer ----
    'footer.tagline': 'Ishonchli tarosh — bizning ustunligimiz. Erkaklar uchun premium barber shop xizmatlari.',
    'footer.hoursTitle': 'Ish vaqti',
    'footer.hoursWeekday': 'Dush – Shan',
    'footer.hoursSunday': 'Yakshanba',
    'footer.hoursNote': 'Bayram kunlari ish jadvali o\u2019zgarishi mumkin, iltimos oldindan qo\u2019ng\u2019iroq qiling.',
    'footer.locationTitle': 'Joylashuv',
    'footer.address': 'Andijon sh., Bobur ko\u2019chasi, 12-uy',
    'footer.viewMap': 'Xaritada ko\u2019rish',
    'footer.contactTitle': 'Aloqa',
    'footer.copyright': '\u00a9 2026 BILOL BARBER. Barcha huquqlar himoyalangan.',
    'footer.installApp': 'Ilovani o\u2019rnatish',
    'footer.builtWith': 'Onlayn bron tizimi bilan ishlab chiqilgan',

    // ---- Bron modali ----
    'booking.modalTitle': 'Navbatga yozilish',
    'booking.step1': '1-qadam / 3 — Xizmat va barber',
    'booking.step2': '2-qadam / 3 — Sana va vaqt',
    'booking.step3': '3-qadam / 3 — Tasdiqlash',
    'booking.chooseService': 'Xizmatni tanlang',
    'booking.chooseMaster': 'Barberni tanlang',
    'booking.chooseDate': 'Sanani tanlang',
    'booking.chooseTime': 'Bo\u2019sh vaqtni tanlang',
    'booking.bookedHint': 'Band vaqtlar kulrang va o\u2019chirilgan holda ko\u2019rsatiladi.',
    'booking.back': 'Orqaga',
    'booking.next': 'Davom etish',
    'booking.confirm': 'Bron qilish',
    'booking.close': 'Yopish',
    'booking.chooseDateFirst': 'Avval sanani tanlang.',
    'booking.chooseDateValid': 'Iltimos, to\u2019g\u2019ri sanani tanlang.',
    'booking.checkingSlots': 'Bo\u2019sh vaqtlar tekshirilmoqda...',
    'booking.dayOff': 'Ushbu sanada bu barber ishlamaydi.',
    'booking.chooseOtherDay': 'Iltimos, boshqa sana yoki barberni tanlang.',
    'booking.slotPast': 'Bu vaqt allaqachon o\u2019tib ketgan',
    'booking.slotTaken': 'Bu vaqt band (avvalgi bronning davomiyligi bilan to\u2019qnashadi)',
    'booking.errChooseService': 'Iltimos, xizmatni tanlang.',
    'booking.errChooseMaster': 'Iltimos, ustani tanlang.',
    'booking.errMasterMismatch': 'Tanlangan usta ushbu xizmatni bajarmaydi. Iltimos, boshqa ustani tanlang.',
    'booking.errChooseDate': 'Iltimos, sanani tanlang.',
    'booking.errChooseTime': 'Iltimos, bo\u2019sh vaqtni tanlang.',
    'booking.errProfileMissing': 'Profilingizda ism yoki telefon raqam topilmadi. Iltimos, avval "Sozlamalar" bo\u2019limida to\u2019ldiring.',
    'booking.errBotBlocked': 'Xatolik yuz berdi. Iltimos, sahifani yangilab qaytadan urinib ko\u2019ring.',
    'booking.sending': 'Yuborilmoqda...',
    'booking.success': 'Bron muvaffaqiyatli qabul qilindi! Tez orada siz bilan bog\u2019lanamiz.',
    'booking.errGeneric': 'Xatolik yuz berdi',
    'booking.errRetry': 'Iltimos, qaytadan urinib ko\u2019ring yoki telefon orqali bog\u2019laning.',
    'booking.reminderCta': 'Telegram orqali bepul eslatma oling',
    'booking.loading1': 'Bo\u2019sh joy tekshirilmoqda...',
    'booking.loading2': 'Navbat band qilinmoqda...',
    'booking.loading3': 'Barber jadvali yangilanmoqda...',
    'booking.loading4': 'Administratorga xabar tayyorlanmoqda...',
    'booking.loading5': 'Chiptangiz rasmiylashtirilmoqda...',
    'booking.loading6': 'Yana bir zum, deyarli tayyor...',

    // ---- Sozlamalar (profil) modali ----
    'settings.title': 'Sozlamalar',
    'settings.subtitle': 'Ism va telefon raqamingizni yangilang',
    'settings.nameLabel': 'Ismingiz',
    'settings.phoneLabel': 'Telefon raqamingiz',
    'settings.save': 'Saqlash',
    'settings.saved': 'Ma\u2019lumotlar saqlandi.',
    'settings.logout': 'Chiqish',
    'settings.language': 'Til',

    // ---- Auth modali ----
    'auth.loginTitle': 'Kirish',
    'auth.registerTitle': 'Ro\u2019yxatdan o\u2019tish',
    'auth.subtitle': 'Navbatga yozilish uchun hisobingizga kiring',
    'auth.nameLabel': 'Ismingiz',
    'auth.phoneLabel': 'Telefon raqamingiz',
    'auth.passwordLabel': 'Parol',
    'auth.passwordHint': 'Kamida 6 belgi',
    'auth.loginBtn': 'Kirish',
    'auth.registerBtn': 'Ro\u2019yxatdan o\u2019tish',
    'auth.noAccount': 'Hisobingiz yo\u2019qmi?',
    'auth.haveAccount': 'Hisobingiz bormi?',
    'auth.installApp': 'Ilovani telefoningizga o\u2019rnatish',
    'auth.blockedMsg': 'Sizning hisobingiz vaqtincha bloklangan — bir necha marta navbatga kelmaganingiz sabab. Iltimos, administrator bilan bog\u2019laning.',

    // ---- Meta (brauzer tabi / ijtimoiy tarmoq preview) ----
    'meta.title': 'BILOL BARBER — Onlayn Bron',
    'meta.description': 'BILOL BARBER — erkaklar uchun zamonaviy barber shop. Onlayn navbatga yozilish, xizmatlar va barberlar.',
    'meta.ogLocale': 'uz_UZ',

    // ---- SERVERDAN (Postgres trigger) kelgan xabarlarni tarjima qilish ----
    // MUHIM: bu xabarlar bazada har doim o'zbek tilida yaratiladi (sql/*.sql
    // fayllaridagi RAISE EXCEPTION matnlari) — translateServerError() shu
    // matnni tanib, joriy tilga almashtiradi, aks holda rus foydalanuvchiga
    // ham o'zbekcha xato matni chiqib qolardi.
    'srv.dayOff': 'Ushbu sanada bu barber ishlamaydi. Iltimos, boshqa sana yoki barberni tanlang.',
    'srv.masterBusyRange': 'Kechirasiz, bu vaqt oralig\u2019ida usta band. Iltimos, boshqa vaqtni tanlang.',
    'srv.pastTime': 'Bu vaqt allaqachon o\u2019tib ketgan. Iltimos, kelajakdagi vaqtni tanlang.',
    'srv.tooFarFuture': 'Bron vaqti juda uzoq kelajakka mo\u2019ljallangan (90 kundan ortiq oldindan bron qilib bo\u2019lmaydi).',
    'srv.tooManyActive': 'Sizda allaqachon 2 ta faol bron bor. Yangi bron qilishdan oldin birini bekor qiling yoki kutib turing.',
    'srv.bookingNotFound': 'Bron topilmadi.',
    'srv.notYourBooking': 'Bu bronni bekor qilish huquqingiz yo\u2019q.',
    'srv.cannotCancelNow': 'Bu bronni endi bekor qilib bo\u2019lmaydi.',
    'srv.cancelTooLate': 'Bronni faqat boshlanishiga kamida 2 soat qolganda bekor qilish mumkin. Iltimos, administrator bilan bog\u2019laning.',
    'srv.reviewBlocked': 'Bloklangan hisob sharh qoldira olmaydi.',
    'srv.invalidCatalog': 'Tanlangan xizmat yoki barber topilmadi. Iltimos, sahifani yangilab qaytadan urinib ko\u2019ring.',
    'srv.invalidName': 'Ism noto\u2019g\u2019ri kiritilgan. Iltimos, to\u2019liq ismingizni kiriting.',
    'srv.invalidPhone': 'Telefon raqam noto\u2019g\u2019ri kiritilgan.',
    'srv.pastDate': 'O\u2019tgan sanaga bron qilib bo\u2019lmaydi. Iltimos, kelajakdagi sanani tanlang.',
    'srv.rateLimitPhone': 'Siz yaqinda bron yubordingiz. Iltimos, bir necha daqiqadan so\u2019ng qayta urinib ko\u2019ring.',
    'srv.rateLimitGlobal': 'Hozir so\u2019rovlar soni ko\u2019p. Iltimos, bir necha daqiqadan so\u2019ng qayta urinib ko\u2019ring.',
  },

  ru: {
    'nav.services': 'Услуги',
    'nav.masters': 'Барберы',
    'nav.reviews': 'Отзывы',
    'nav.location': 'Адрес',
    'nav.contact': 'Контакты',
    'nav.myBookings': 'Мои записи',
    'nav.settings': 'Настройки',
    'cta.book': 'Записаться',
    'cta.newBooking': 'Новая запись',
    'cta.chooseTime': 'Выбрать время',
    'cta.viewServices': 'Смотреть услуги',

    'dashboard.eyebrow': 'Личный кабинет',
    'dashboard.title': 'Мои записи',
    'dashboard.empty': 'У вас пока нет записей.',
    'dashboard.cancelBtn': 'Отменить запись',
    'dashboard.tooLate': 'Срок отмены истёк (нужно минимум за 2 часа). Свяжитесь с администратором.',
    'dashboard.cancelConfirm': 'Подтвердите отмену записи?',
    'dashboard.cancelError': 'Ошибка при отмене записи.',
    'dashboard.loadError': 'Ошибка при загрузке записей',

    'status.new': 'Новая',
    'status.confirmed': 'Подтверждена',
    'status.done': 'Выполнена',
    'status.no_show': 'Не пришёл',
    'status.cancelled': 'Отменена',

    'countdown.day': 'дн.',
    'countdown.hour': 'ч.',
    'countdown.minute': 'мин.',
    'countdown.left': 'осталось',
    'countdown.startingNow': 'Начинается сейчас',

    'hero.badge': 'Надёжная мужская барбершоп в Андижане',
    'hero.title1': 'Подчеркните',
    'hero.title2': 'уверенность',
    'hero.titleEm': 'с нашими барберами',
    'hero.title3': '',
    'hero.subtitle': 'Команда опытных барберов по стрижке, бороде и бритью — качественный сервис в удобное время и по доступной цене.',
    'stats.experience': 'лет опыта',
    'stats.masters': 'опытных барберов',
    'stats.rating': 'оценка клиентов',

    'ticket.previewLabel': 'Талон записи',
    'ticket.previewService': 'Фейд / дизайнерская стрижка',
    'ticket.previewBarber': 'Барбер: Алишер Юсупов',
    'ticket.previewDate': '24 июля, четверг',
    'ticket.previewDuration': '50 мин.',
    'ticket.previewPrice': '60 000 сум',
    'ticket.dateLabel': 'Дата',
    'ticket.timeLabel': 'Время',
    'ticket.durationLabel': 'Длительность',
    'ticket.summaryLabel': 'Итог записи',
    'ticket.confirmedLabel': 'Запись подтверждена',
    'ticket.confirmedStamp': 'Подтверждено',
    'ticket.codeLabel': 'Код записи',
    'ticket.clientLabel': 'Клиент',
    'ticket.phoneLabel': 'Телефон',
    'ticket.barberPrefix': 'Барбер',
    'ticket.newLabel': 'Новая запись',

    // ---- Валюта ----
    'currency.sum': 'сум',

    // ---- Сообщения об ошибках (auth / booking) ----
    'err.connection': 'Ошибка соединения. Обновите страницу.',
    'err.loginFirst': 'Сначала войдите в аккаунт.',
    'err.invalidPhone': 'Пожалуйста, введите корректный номер телефона.',
    'err.nameTooShort': 'Имя должно содержать не менее 3 символов.',
    'err.passwordTooShort': 'Пароль должен содержать не менее 6 символов.',
    'err.phoneAlreadyRegistered': 'Этот номер телефона уже зарегистрирован. Пожалуйста, войдите через раздел «Вход».',
    'err.signupIncomplete': 'Регистрация не завершена. Если это первый раз, обратитесь к администратору (нужна настройка Supabase).',
    'err.wrongCredentials': 'Неверный номер телефона или пароль.',
    'err.phoneUsedByAnotherAccount': 'Этот номер телефона уже используется в другом аккаунте.',
    'err.bookLoginRequired': 'Чтобы записаться, сначала войдите в аккаунт.',
    'err.slotTaken': 'Извините, это время только что заняли. Пожалуйста, выберите другое время.',
    'err.accountBlocked': 'Ваш аккаунт временно заблокирован (из-за неявок на запись). Свяжитесь с администратором.',
    'err.genericServer': 'Произошла ошибка сервера. Пожалуйста, попробуйте немного позже.',
    'err.sessionExpired': 'Срок вашей сессии истёк (возможно, приложение долго было в фоновом режиме). Обновите страницу и попробуйте снова.',
    'err.networkMobile': 'Соединение с интернетом прервалось. Проверьте Wi-Fi или мобильный интернет и попробуйте снова.',
    'a11y.menu': 'Меню',
    'a11y.close': 'Закрыть',

    'services.eyebrow': 'Прайс-лист',
    'services.title': 'Услуги и цены',
    'services.subtitle': 'Выберите услугу, чтобы сразу открыть окно записи — длительность и цена показаны заранее.',
    'services.minutes': 'мин.',
    'services.minutesShort': 'мин',

    'masters.eyebrow': 'Наша команда',
    'masters.title': 'Профессиональные барберы',
    'masters.subtitle': 'Каждый из них имеет многолетний опыт в своей области и любим клиентами.',

    'reviews.eyebrow': 'Отзывы клиентов',
    'reviews.title': 'Нам доверяют',
    'reviews.subtitle': 'Мнение каждого клиента важно для нас — ниже несколько отзывов.',
    'reviews.empty': 'Пока нет подтверждённых отзывов — напишите первым!',
    'reviews.formTitle': 'Оставить отзыв',
    'reviews.formHint': 'Ваш отзыв появится здесь после проверки.',
    'reviews.placeholder': 'Напишите свой отзыв об услуге...',
    'reviews.submit': 'Отправить',
    'reviews.submitting': 'Отправка...',
    'reviews.loginPrompt': 'Войдите в аккаунт, чтобы оставить отзыв',
    'reviews.instagramCta': 'Больше отзывов и результатов в Instagram',
    'reviews.regular': 'Постоянный клиент',
    'reviews.new': 'Новый клиент',
    'reviews.errNoRating': 'Пожалуйста, сначала поставьте оценку.',
    'reviews.errTooShort': 'Текст отзыва слишком короткий.',
    'reviews.errConnection': 'Ошибка соединения. Обновите страницу.',
    'reviews.errPrefix': 'Ошибка',
    'reviews.success': 'Спасибо! Ваш отзыв отправлен — появится здесь после одобрения администратором.',

    'why.title1': 'Премиум-средства',
    'why.desc1': 'Работаем только с сертифицированными профессиональными средствами по уходу для мужчин.',
    'why.title2': 'Опытные барберы',
    'why.desc2': 'Наша команда регулярно проходит курсы повышения квалификации и применяет современные техники.',
    'why.title3': 'Быстрая онлайн-запись',
    'why.desc3': 'Выберите удобное время в пару кликов — без очередей.',

    'footer.tagline': 'Надёжное бритьё — наше преимущество. Премиум-услуги барбершопа для мужчин.',
    'footer.hoursTitle': 'Часы работы',
    'footer.hoursWeekday': 'Пн – Сб',
    'footer.hoursSunday': 'Воскресенье',
    'footer.hoursNote': 'В праздничные дни график может измениться, пожалуйста, звоните заранее.',
    'footer.locationTitle': 'Адрес',
    'footer.address': 'г. Андижан, ул. Бобура, дом 12',
    'footer.viewMap': 'Посмотреть на карте',
    'footer.contactTitle': 'Контакты',
    'footer.copyright': '\u00a9 2026 BILOL BARBER. Все права защищены.',
    'footer.installApp': 'Установить приложение',
    'footer.builtWith': 'Разработано на системе онлайн-записи',

    'booking.modalTitle': 'Записаться',
    'booking.step1': 'Шаг 1 / 3 — Услуга и барбер',
    'booking.step2': 'Шаг 2 / 3 — Дата и время',
    'booking.step3': 'Шаг 3 / 3 — Подтверждение',
    'booking.chooseService': 'Выберите услугу',
    'booking.chooseMaster': 'Выберите барбера',
    'booking.chooseDate': 'Выберите дату',
    'booking.chooseTime': 'Выберите свободное время',
    'booking.bookedHint': 'Занятое время показано серым и неактивным.',
    'booking.back': 'Назад',
    'booking.next': 'Продолжить',
    'booking.confirm': 'Записаться',
    'booking.close': 'Закрыть',
    'booking.chooseDateFirst': 'Сначала выберите дату.',
    'booking.chooseDateValid': 'Пожалуйста, выберите корректную дату.',
    'booking.checkingSlots': 'Проверка свободного времени...',
    'booking.dayOff': 'В этот день барбер не работает.',
    'booking.chooseOtherDay': 'Пожалуйста, выберите другую дату или барбера.',
    'booking.slotPast': 'Это время уже прошло',
    'booking.slotTaken': 'Время занято (пересекается с длительностью другой записи)',
    'booking.errChooseService': 'Пожалуйста, выберите услугу.',
    'booking.errChooseMaster': 'Пожалуйста, выберите барбера.',
    'booking.errMasterMismatch': 'Выбранный барбер не оказывает эту услугу. Выберите другого барбера.',
    'booking.errChooseDate': 'Пожалуйста, выберите дату.',
    'booking.errChooseTime': 'Пожалуйста, выберите свободное время.',
    'booking.errProfileMissing': 'В вашем профиле не найдено имя или номер телефона. Пожалуйста, заполните их в разделе "Настройки".',
    'booking.errBotBlocked': 'Произошла ошибка. Обновите страницу и попробуйте снова.',
    'booking.sending': 'Отправка...',
    'booking.success': 'Запись успешно принята! Скоро мы с вами свяжемся.',
    'booking.errGeneric': 'Произошла ошибка',
    'booking.errRetry': 'Попробуйте ещё раз или свяжитесь с нами по телефону.',
    'booking.reminderCta': 'Получить бесплатное напоминание в Telegram',
    'booking.loading1': 'Проверяем свободное время...',
    'booking.loading2': 'Резервируем очередь...',
    'booking.loading3': 'Обновляем расписание барбера...',
    'booking.loading4': 'Готовим сообщение администратору...',
    'booking.loading5': 'Оформляем ваш талон...',
    'booking.loading6': 'Ещё немного, почти готово...',

    'settings.title': 'Настройки',
    'settings.subtitle': 'Обновите ваше имя и номер телефона',
    'settings.nameLabel': 'Ваше имя',
    'settings.phoneLabel': 'Номер телефона',
    'settings.save': 'Сохранить',
    'settings.saved': 'Данные сохранены.',
    'settings.logout': 'Выйти',
    'settings.language': 'Язык',

    'auth.loginTitle': 'Вход',
    'auth.registerTitle': 'Регистрация',
    'auth.subtitle': 'Войдите в аккаунт, чтобы записаться',
    'auth.nameLabel': 'Ваше имя',
    'auth.phoneLabel': 'Номер телефона',
    'auth.passwordLabel': 'Пароль',
    'auth.passwordHint': 'Минимум 6 символов',
    'auth.loginBtn': 'Войти',
    'auth.registerBtn': 'Зарегистрироваться',
    'auth.noAccount': 'Нет аккаунта?',
    'auth.haveAccount': 'Уже есть аккаунт?',
    'auth.installApp': 'Установить приложение на телефон',
    'auth.blockedMsg': 'Ваш аккаунт временно заблокирован из-за нескольких неявок. Свяжитесь с администратором.',

    // ---- Мета (вкладка браузера / превью в соцсетях) ----
    'meta.title': 'BILOL BARBER — Онлайн-запись',
    'meta.description': 'BILOL BARBER — современный барбершоп для мужчин. Онлайн-запись, услуги и барберы.',
    'meta.ogLocale': 'ru_RU',

    // ---- Переведённые серверные (Postgres trigger) сообщения ----
    'srv.dayOff': 'В этот день барбер не работает. Пожалуйста, выберите другую дату или барбера.',
    'srv.masterBusyRange': 'Извините, в этот промежуток времени барбер занят. Пожалуйста, выберите другое время.',
    'srv.pastTime': 'Это время уже прошло. Пожалуйста, выберите время в будущем.',
    'srv.tooFarFuture': 'Слишком ранняя запись (нельзя записаться более чем за 90 дней вперёд).',
    'srv.tooManyActive': 'У вас уже есть 2 активные записи. Отмените одну из них или дождитесь их выполнения, прежде чем создавать новую.',
    'srv.bookingNotFound': 'Запись не найдена.',
    'srv.notYourBooking': 'У вас нет прав на отмену этой записи.',
    'srv.cannotCancelNow': 'Эту запись больше нельзя отменить.',
    'srv.cancelTooLate': 'Запись можно отменить не позднее чем за 2 часа до начала. Свяжитесь с администратором.',
    'srv.reviewBlocked': 'Заблокированный аккаунт не может оставлять отзывы.',
    'srv.invalidCatalog': 'Выбранная услуга или барбер не найдены. Обновите страницу и попробуйте снова.',
    'srv.invalidName': 'Имя введено неверно. Пожалуйста, введите полное имя.',
    'srv.invalidPhone': 'Номер телефона введён неверно.',
    'srv.pastDate': 'Нельзя записаться на прошедшую дату. Пожалуйста, выберите дату в будущем.',
    'srv.rateLimitPhone': 'Вы недавно уже отправляли запись. Пожалуйста, повторите попытку через несколько минут.',
    'srv.rateLimitGlobal': 'Сейчас слишком много запросов. Пожалуйста, повторите попытку через несколько минут.',
  },

  en: {
    'nav.services': 'Services',
    'nav.masters': 'Barbers',
    'nav.reviews': 'Reviews',
    'nav.location': 'Location',
    'nav.contact': 'Contact',
    'nav.myBookings': 'My Bookings',
    'nav.settings': 'Settings',
    'cta.book': 'Book Now',
    'cta.newBooking': 'New Booking',
    'cta.chooseTime': 'Choose Time',
    'cta.viewServices': 'View Services',

    'dashboard.eyebrow': 'Personal Account',
    'dashboard.title': 'My Bookings',
    'dashboard.empty': "You don't have any bookings yet.",
    'dashboard.cancelBtn': 'Cancel Booking',
    'dashboard.tooLate': 'The cancellation window has passed (at least 2 hours notice is required). Please contact the administrator.',
    'dashboard.cancelConfirm': 'Confirm cancellation of this booking?',
    'dashboard.cancelError': 'Error cancelling the booking.',
    'dashboard.loadError': 'Error loading bookings',

    'status.new': 'New',
    'status.confirmed': 'Confirmed',
    'status.done': 'Completed',
    'status.no_show': 'No-show',
    'status.cancelled': 'Cancelled',

    'countdown.day': 'd',
    'countdown.hour': 'h',
    'countdown.minute': 'min',
    'countdown.left': 'left',
    'countdown.startingNow': 'Starting now',

    'hero.badge': "Andijan's trusted men's barber shop",
    'hero.title1': 'Boost your',
    'hero.title2': 'confidence',
    'hero.titleEm': 'with our barbers',
    'hero.title3': '',
    'hero.subtitle': 'A team of experienced barbers for haircuts, beard grooming, and shaving — quality service at a convenient time and a fair price.',
    'stats.experience': 'years of experience',
    'stats.masters': 'expert barbers',
    'stats.rating': 'customer rating',

    'ticket.previewLabel': 'Booking ticket',
    'ticket.previewService': 'Fade / design haircut',
    'ticket.previewBarber': 'Barber: Alisher Yusupov',
    'ticket.previewDate': 'July 24, Thursday',
    'ticket.previewDuration': '50 min',
    'ticket.previewPrice': "60,000 so'm",
    'ticket.dateLabel': 'Date',
    'ticket.timeLabel': 'Time',
    'ticket.durationLabel': 'Duration',
    'ticket.summaryLabel': 'Booking summary',
    'ticket.confirmedLabel': 'Booking confirmed',
    'ticket.confirmedStamp': 'Confirmed',
    'ticket.codeLabel': 'Booking code',
    'ticket.clientLabel': 'Client',
    'ticket.phoneLabel': 'Phone',
    'ticket.barberPrefix': 'Barber',
    'ticket.newLabel': 'New booking',

    // ---- Currency ----
    'currency.sum': "so'm",

    // ---- Error messages (auth / booking) ----
    'err.connection': 'Connection error. Please refresh the page.',
    'err.loginFirst': 'Please sign in to your account first.',
    'err.invalidPhone': 'Please enter a valid phone number.',
    'err.nameTooShort': 'Name must be at least 3 characters.',
    'err.passwordTooShort': 'Password must be at least 6 characters.',
    'err.phoneAlreadyRegistered': 'This phone number is already registered. Please sign in via "Login".',
    'err.signupIncomplete': 'Registration was not completed. If this is your first time, please contact the administrator (Supabase setup required).',
    'err.wrongCredentials': 'Incorrect phone number or password.',
    'err.phoneUsedByAnotherAccount': 'This phone number is already used by another account.',
    'err.bookLoginRequired': 'Please sign in to your account before booking.',
    'err.slotTaken': 'Sorry, this time slot was just taken. Please choose another time.',
    'err.accountBlocked': 'Your account is temporarily blocked (due to repeated no-shows). Please contact the administrator.',
    'err.genericServer': 'A server error occurred. Please try again shortly.',
    'err.sessionExpired': 'Your session has expired (the app may have been in the background for a while). Please refresh the page and try again.',
    'err.networkMobile': 'The internet connection was lost. Please check your Wi-Fi or mobile data and try again.',
    'a11y.menu': 'Menu',
    'a11y.close': 'Close',

    // ---- Services section ----
    'services.eyebrow': 'Price list',
    'services.title': 'Services & Prices',
    'services.subtitle': 'Select a service to open the booking window right away — duration and price are shown upfront.',
    'services.minutes': 'min',
    'services.minutesShort': 'min',

    // ---- Masters section ----
    'masters.eyebrow': 'Our Team',
    'masters.title': 'Professional Barbers',
    'masters.subtitle': "Each of them has years of experience in their craft and is loved by our clients.",

    // ---- Reviews section ----
    'reviews.eyebrow': 'Client Feedback',
    'reviews.title': 'Trusted by Our Clients',
    'reviews.subtitle': 'Every client\u2019s opinion matters to us — here are some of their reviews.',
    'reviews.empty': 'No approved reviews yet — be the first to share your feedback!',
    'reviews.formTitle': 'Leave a Review',
    'reviews.formHint': 'Your review will appear on this page after it has been checked.',
    'reviews.placeholder': 'Write your feedback about the service...',
    'reviews.submit': 'Submit',
    'reviews.submitting': 'Submitting...',
    'reviews.loginPrompt': 'Sign in to your account to leave a review',
    'reviews.instagramCta': 'See more reviews and results on Instagram',
    'reviews.regular': 'Regular client',
    'reviews.new': 'New client',
    'reviews.errNoRating': 'Please give a star rating first.',
    'reviews.errTooShort': 'Review text is too short.',
    'reviews.errConnection': 'Connection error. Please refresh the page.',
    'reviews.errPrefix': 'Error',
    'reviews.success': 'Thank you! Your review has been submitted — it will appear here once approved by the admin.',

    // ---- Why us ----
    'why.title1': 'Premium Products',
    'why.desc1': "We work only with certified, high-quality professional men's grooming products.",
    'why.title2': 'Experienced Barbers',
    'why.desc2': 'Our team regularly takes skill-development courses and applies modern techniques.',
    'why.title3': 'Fast Online Booking',
    'why.desc3': 'Choose a convenient time in just a few clicks — no need to wait in line.',

    // ---- Footer ----
    'footer.tagline': "Reliable grooming is our strength. Premium barber shop services for men.",
    'footer.hoursTitle': 'Working Hours',
    'footer.hoursWeekday': 'Mon – Sat',
    'footer.hoursSunday': 'Sunday',
    'footer.hoursNote': 'Hours may vary on holidays, please call ahead.',
    'footer.locationTitle': 'Location',
    'footer.address': 'Andijan, Bobur Street, 12',
    'footer.viewMap': 'View on Map',
    'footer.contactTitle': 'Contact',
    'footer.copyright': '\u00a9 2026 BILOL BARBER. All rights reserved.',
    'footer.installApp': 'Install App',
    'footer.builtWith': 'Built with an online booking system',

    // ---- Booking modal ----
    'booking.modalTitle': 'Book an Appointment',
    'booking.step1': 'Step 1 / 3 — Service & Barber',
    'booking.step2': 'Step 2 / 3 — Date & Time',
    'booking.step3': 'Step 3 / 3 — Confirmation',
    'booking.chooseService': 'Choose a service',
    'booking.chooseMaster': 'Choose a barber',
    'booking.chooseDate': 'Choose a date',
    'booking.chooseTime': 'Choose an available time',
    'booking.bookedHint': 'Booked times are shown greyed out and disabled.',
    'booking.back': 'Back',
    'booking.next': 'Continue',
    'booking.confirm': 'Book',
    'booking.close': 'Close',
    'booking.chooseDateFirst': 'Please choose a date first.',
    'booking.chooseDateValid': 'Please choose a valid date.',
    'booking.checkingSlots': 'Checking available times...',
    'booking.dayOff': "This barber doesn't work on this date.",
    'booking.chooseOtherDay': 'Please choose another date or barber.',
    'booking.slotPast': 'This time has already passed',
    'booking.slotTaken': 'This time is taken (overlaps with another booking)',
    'booking.errChooseService': 'Please choose a service.',
    'booking.errChooseMaster': 'Please choose a barber.',
    'booking.errMasterMismatch': "The selected barber doesn't offer this service. Please choose another barber.",
    'booking.errChooseDate': 'Please choose a date.',
    'booking.errChooseTime': 'Please choose an available time.',
    'booking.errProfileMissing': 'No name or phone number found in your profile. Please fill them in under "Settings" first.',
    'booking.errBotBlocked': 'Something went wrong. Please refresh the page and try again.',
    'booking.sending': 'Sending...',
    'booking.success': "Booking confirmed! We'll get in touch with you soon.",
    'booking.errGeneric': 'Something went wrong',
    'booking.errRetry': 'Please try again or contact us by phone.',
    'booking.reminderCta': 'Get a free reminder on Telegram',
    'booking.loading1': 'Checking availability...',
    'booking.loading2': 'Reserving your spot...',
    'booking.loading3': "Updating the barber's schedule...",
    'booking.loading4': 'Preparing a message for the administrator...',
    'booking.loading5': 'Preparing your ticket...',
    'booking.loading6': 'Almost there...',

    // ---- Settings (profile) modal ----
    'settings.title': 'Settings',
    'settings.subtitle': 'Update your name and phone number',
    'settings.nameLabel': 'Your name',
    'settings.phoneLabel': 'Your phone number',
    'settings.save': 'Save',
    'settings.saved': 'Your details have been saved.',
    'settings.logout': 'Log out',
    'settings.language': 'Language',

    // ---- Auth modal ----
    'auth.loginTitle': 'Log In',
    'auth.registerTitle': 'Sign Up',
    'auth.subtitle': 'Sign in to your account to book an appointment',
    'auth.nameLabel': 'Your name',
    'auth.phoneLabel': 'Your phone number',
    'auth.passwordLabel': 'Password',
    'auth.passwordHint': 'At least 6 characters',
    'auth.loginBtn': 'Log In',
    'auth.registerBtn': 'Sign Up',
    'auth.noAccount': "Don't have an account?",
    'auth.haveAccount': 'Already have an account?',
    'auth.installApp': 'Install the app on your phone',
    'auth.blockedMsg': 'Your account is temporarily blocked due to repeated no-shows. Please contact the administrator.',

    // ---- Meta (browser tab / social preview) ----
    'meta.title': 'BILOL BARBER — Online Booking',
    'meta.description': "BILOL BARBER — a modern men's barber shop. Online booking, services, and barbers.",
    'meta.ogLocale': 'en_US',

    // ---- Translated SERVER (Postgres trigger) messages ----
    'srv.dayOff': "This barber doesn't work on this date. Please choose another date or barber.",
    'srv.masterBusyRange': 'Sorry, the barber is busy during this time slot. Please choose another time.',
    'srv.pastTime': 'This time has already passed. Please choose a time in the future.',
    'srv.tooFarFuture': 'This booking time is too far in the future (bookings cannot be made more than 90 days ahead).',
    'srv.tooManyActive': 'You already have 2 active bookings. Please cancel one or wait for them to be completed before making a new one.',
    'srv.bookingNotFound': 'Booking not found.',
    'srv.notYourBooking': "You don't have permission to cancel this booking.",
    'srv.cannotCancelNow': 'This booking can no longer be cancelled.',
    'srv.cancelTooLate': 'A booking can only be cancelled at least 2 hours before it starts. Please contact the administrator.',
    'srv.reviewBlocked': 'A blocked account cannot leave reviews.',
    'srv.invalidCatalog': 'The selected service or barber was not found. Please refresh the page and try again.',
    'srv.invalidName': 'The name entered is invalid. Please enter your full name.',
    'srv.invalidPhone': 'The phone number entered is invalid.',
    'srv.pastDate': 'You cannot book a past date. Please choose a date in the future.',
    'srv.rateLimitPhone': 'You recently submitted a booking. Please try again in a few minutes.',
    'srv.rateLimitGlobal': 'Too many requests right now. Please try again in a few minutes.',
  },
};

// Sana formatlash uchun kun/oy nomlari (data.js va booking.js shu yerdan oladi)
const DAYS_LONG = {
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const DAYS_SHORT = {
  uz: ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const MONTHS = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
// Oy tab tugmalari uchun bosh harfli shakl (ru holatida ham xuddi shu so'z ishlatiladi,
// negizi grammatik jihatdan farq qilishi mumkin bo'lsa-da, tab yorlig'i uchun yetarli)
const MONTHS_NOMINATIVE = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

let currentLang = null;

function readStoredLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch (e) { /* localStorage yo'q bo'lishi mumkin — sukut bo'yicha davom etamiz */ }
  return DEFAULT_LANG;
}

export function getLang() {
  if (!currentLang) currentLang = readStoredLang();
  return currentLang;
}

export function getMonthNames(nominative = false) {
  const table = nominative ? MONTHS_NOMINATIVE : MONTHS;
  return table[getLang()] || table.uz;
}

export function getWeekdayNames(short = true) {
  const table = short ? DAYS_SHORT : DAYS_LONG;
  return table[getLang()] || table.uz;
}

/** Berilgan kalit uchun joriy tildagi matnni qaytaradi. Topilmasa — kalitning o'zi. */
export function t(key) {
  const lang = getLang();
  // MUHIM: avval oldingi kod shu yerda "||" zanjiridan foydalangan edi
  // (DICT[lang][key] || DICT.uz[key] || key). Bu KATTA xato edi — agar
  // biror til uchun tarjima ATAYLAB bo'sh qator ('') qilib qo'yilgan
  // bo'lsa (masalan 'hero.title3' rus tilida — gap tarkibiga kirmagani
  // uchun bo'sh qilingan), bo'sh qator JS'da "falsy" hisoblanadi va "||"
  // uni "tarjima yo'q" deb noto'g'ri tushunib, o'zbekcha matnni orqasidan
  // qo'shib yuborardi (natijada rus sarlavhasi oxirida ortiqcha o'zbekcha
  // so'z chiqib qolardi). Shu sabab endi kalit haqiqatan mavjudmi
  // (qiymatidan qat'iy nazar) hasOwnProperty bilan aniq tekshiriladi.
  const table = DICT[lang];
  if (table && Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  if (Object.prototype.hasOwnProperty.call(DICT.uz, key)) return DICT.uz[key];
  return key;
}

// =============================================================================
// SERVER XATOLIKLARINI TARJIMA QILISH
//
// MUHIM (til sizib chiqmasligi): Supabase/Postgres trigger'lari (masalan
// sql/catalog_validation_and_limits.sql, PATCH_round5_client_cancel_booking.sql,
// PATCH_round7_master_time_off.sql, PATCH_round14_comments.sql) xato
// yuzaga kelganda RAISE EXCEPTION orqali xabar qaytaradi — bu xabarlar
// bazada har doim FAQAT O'ZBEK tilida yozilgan. Agar shu xom matn to'g'ridan
// to'g'ri ekranga chiqarilsa, rus tilini tanlagan mijoz ham o'zbekcha xato
// ko'radi. Quyidagi ro'yxat har bir bilingan server xabarini tanib, uni
// t() orqali joriy tilga almashtiradi. Yangi RAISE EXCEPTION matni
// qo'shilganda, shu ro'yxatga ham mos qator qo'shish SHART — aks holda
// o'sha yangi xabar tarjimasiz sizib chiqadi.
const SERVER_ERROR_PATTERNS = [
  [/ishlamaydi/i, 'srv.dayOff'],
  [/usta band|barber band/i, 'srv.masterBusyRange'],
  [/allaqachon o.tib ketgan/i, 'srv.pastTime'],
  [/juda uzoq kelajakka/i, 'srv.tooFarFuture'],
  [/2 ta faol bron/i, 'srv.tooManyActive'],
  [/bron topilmadi/i, 'srv.bookingNotFound'],
  [/bekor qilish huquqingiz yo.q/i, 'srv.notYourBooking'],
  [/endi bekor qilib bo.lmaydi/i, 'srv.cannotCancelNow'],
  [/kamida 2 soat qolganda bekor/i, 'srv.cancelTooLate'],
  [/bloklangan hisob sharh/i, 'srv.reviewBlocked'],
  // MUHIM: bazadagi haqiqiy (schema_dump.sql) trigger "Noma'lum ... xizmat/
  // barber" deb yozadi, eski sql/catalog_validation_and_limits.sql patch
  // faylida esa "Noto'g'ri ... xizmat/barber" — ikkalasi ham ishlab
  // turgan bo'lishi mumkin bo'lgani uchun ikkalasi ham tanib olinadi.
  [/(noto.g.ri|noma.lum) yoki mavjud bo.lmagan/i, 'srv.invalidCatalog'],
  // Quyidagi 5 tasi bookings_before_insert() trigger'idan (schema_dump.sql)
  // — 1-bosqich auditda o'tkazib yuborilgan, chunki o'sha vaqtda faqat
  // sql/*.sql patch fayllari ko'rib chiqilgan edi, ammo shu trigger
  // bazada HAQIQATDA ishlab turibdi va bron yuborishda tez-tez uchrashi
  // mumkin (masalan ism/telefon validatsiyasi, rate-limit).
  [/ism noto.g.ri kiritilgan/i, 'srv.invalidName'],
  [/telefon raqam noto.g.ri kiritilgan/i, 'srv.invalidPhone'],
  [/o.tgan sanaga bron qilib bo.lmaydi/i, 'srv.pastDate'],
  [/yaqinda bron yubordingiz/i, 'srv.rateLimitPhone'],
  [/so.rovlar soni ko.p/i, 'srv.rateLimitGlobal'],
];

/**
 * Postgres/Supabase'dan kelgan xom (har doim o'zbekcha) xatolik matnini
 * tanib, joriy tildagi tarjimasini qaytaradi. Tanib bo'lmasa — null
 * qaytaradi (chaqiruvchi tomon shu holda umumiy, xom matnni ko'rsatmaydigan
 * generic xabarga tushishi kerak).
 */
export function translateServerError(rawMessage) {
  const msg = String(rawMessage || '');
  for (const [pattern, key] of SERVER_ERROR_PATTERNS) {
    if (pattern.test(msg)) return t(key);
  }
  return null;
}

/** DOM'dagi barcha data-i18n(-placeholder/-title) atributli elementlarni joriy tilga yangilaydi. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = t(el.getAttribute('data-i18n-title'));
    el.setAttribute('title', key);
    el.setAttribute('aria-label', key);
  });
  // MUHIM: brauzer tab sarlavhasi (<title>) va meta teglar (description,
  // og:*, twitter:*) ham mijoz tiliga mos bo'lishi kerak — aks holda RU
  // foydalanuvchi tab'da yoki ijtimoiy tarmoqqa ulashganda o'zbekcha
  // matnni ko'rib qoladi.
  root.querySelectorAll('[data-i18n-content]').forEach(el => {
    el.setAttribute('content', t(el.getAttribute('data-i18n-content')));
  });
  document.documentElement.setAttribute('lang', getLang());
  document.querySelectorAll('[data-lang-switch]').forEach(btn => {
    btn.classList.toggle('lang-active', btn.dataset.langSwitch === getLang());
  });
}

/** Tilni almashtiradi, saqlaydi va sahifadagi barcha tarjimalarni qayta qo'llaydi. */
export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === getLang()) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* jim o'tkazamiz */ }
  applyTranslations();
  document.dispatchEvent(new CustomEvent('bilol:langchange', { detail: { lang } }));
}

/** Til almashtirish tugmalarini ([data-lang-switch="uz|ru|en"]) ulaydi. */
export function initLangSwitchers() {
  document.querySelectorAll('[data-lang-switch]').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.langSwitch));
  });
  applyTranslations();
}