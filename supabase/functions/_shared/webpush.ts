// =============================================================================
// SHARED: Web Push yuborish yordamchisi (Deno Edge Function ichida).
// npm:web-push kutubxonasi orqali VAPID bilan shifrlangan push xabar
// yuboradi — Firebase yoki boshqa pullik xizmat SHART EMAS.
//
// Kerakli Supabase secrets (bir marta sozlanadi):
//   supabase secrets set VAPID_PUBLIC_KEY=<public key>
//   supabase secrets set VAPID_PRIVATE_KEY=<private key>
//   supabase secrets set VAPID_SUBJECT=mailto:admin@bilolbarber.uz
// (kalitlarni "npx web-push generate-vapid-keys" bilan generatsiya qiling)
// =============================================================================

// @deno-types="npm:web-push@3.6.7"
import webpush from "npm:web-push@3.6.7";

export interface PushSubscriptionRow {
  id?: string | number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

let configured = false;

/** VAPID kalitlarini bir marta sozlaydi. Sozlanmagan bo'lsa false qaytaradi
 *  (chaqiruvchi tomon push yuborishni jimgina o'tkazib yuborishi kerak). */
export function configureWebPush(): boolean {
  if (configured) return true;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@bilolbarber.uz";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** Bitta obunaga push yuboradi. Muvaffaqiyatsiz bo'lsa xatoni qaytaradi
 *  (chaqiruvchi tomon 404/410 statusini "eskirgan obuna" deb talqin qilib,
 *  bazadan o'chirishi mumkin). */
export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: Record<string, unknown>,
): Promise<void> {
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
  );
}

/** Ko'plab obunalarga bir xil xabarni yuboradi, muvaffaqiyatsiz (404/410)
 *  obunalar id'sini qaytaradi — chaqiruvchi ularni bazadan o'chirishi mumkin. */
export async function sendWebPushToMany(
  subs: PushSubscriptionRow[],
  payload: Record<string, unknown>,
): Promise<{ sent: number; staleIds: Array<string | number> }> {
  let sent = 0;
  const staleIds: Array<string | number> = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendWebPush(sub, payload);
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if ((status === 404 || status === 410) && sub.id !== undefined) {
          staleIds.push(sub.id);
        } else {
          console.error(`Push (endpoint ...${sub.endpoint.slice(-16)}) yuborilmadi:`, err);
        }
      }
    }),
  );
  return { sent, staleIds };
}
