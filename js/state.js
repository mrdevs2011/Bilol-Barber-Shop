// =============================================================================
// STATE: joriy bron jarayonining vaqtinchalik holati
// =============================================================================

export const state = {
  step: 1,
  serviceId: null,
  masterId: null,
  date: null,
  time: null,
  name: '',
  phone: '',
  // Sana kartochkalarida (oy tab / kun kartasi) joriy tanlov: "YYYY-M" va kun raqami
  bookingMonthValue: '',
  bookingDayValue: '',
  // Modal ochilgan vaqt — juda tez (bot) yuborishlarni aniqlash uchun.
  openedAt: 0,
};

export function resetState(preselectServiceId) {
  state.step = 1;
  state.serviceId = preselectServiceId || null;
  state.masterId = null;
  state.date = null;
  state.time = null;
  state.name = '';
  state.phone = '';
  state.bookingMonthValue = '';
  state.bookingDayValue = '';
  state.openedAt = Date.now();
}

// Soddalashtirilgan "band vaqtlar" bazasi (demo/kesh maqsadida).
// Haqiqiy loyihada har safar Supabase'dan so'ralishi tavsiya etiladi.
// Kalit: `${masterId}_${date}` -> ["10:00", "14:30", ...]
export const bookedSlotsCache = {};
