// Your PayNow number, added to reminders. Kept in this browser only (not in backups): it's a convenience, and a
// backup file shouldn't carry it to wherever it's shared.
const KEY = 'magpie:paynow';

export function readPayNow(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePayNow(value: string) {
  try {
    if (value.trim()) localStorage.setItem(KEY, value.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: reminders go out without it */
  }
}

/**
 * Share a message through the phone's share sheet (WhatsApp, Telegram, Messages…), or copy it where sharing isn't
 * available. Returns what happened, so the caller can say so.
 */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
