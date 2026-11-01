/**
 * Code_Word_Reminder (exorcism-protocol Requirement 2): a short hint, never the code word,
 * kept in localStorage under one key. It holds no audio and no scores.
 */

export const REMINDER_KEY = "doppelganger.codeWordReminder";
export const REMINDER_MAX = 80;

export type ReminderResult = { ok: true; value: string } | { ok: false; error: string };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function validateReminder(input: string): ReminderResult {
  const value = input.trim();
  if (value.length === 0) return { ok: false, error: "Write a short hint first." };
  if (value.length > REMINDER_MAX) {
    return { ok: false, error: `Keep the hint to ${REMINDER_MAX} characters or fewer.` };
  }
  return { ok: true, value };
}

export function loadReminder(storage: StorageLike): string | null {
  try {
    const value = storage.getItem(REMINDER_KEY);
    if (value === null) return null;
    const result = validateReminder(value);
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

export function saveReminder(storage: StorageLike, input: string): ReminderResult {
  const result = validateReminder(input);
  if (!result.ok) return result;
  try {
    storage.setItem(REMINDER_KEY, result.value);
  } catch {
    return { ok: false, error: "This browser did not allow saving the hint." };
  }
  return result;
}

export function deleteReminder(storage: StorageLike): void {
  try {
    storage.removeItem(REMINDER_KEY);
  } catch {
    // Nothing stored, or storage disabled: nothing to delete.
  }
}
