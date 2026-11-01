/** The Code_Word_Reminder setting (exorcism-protocol Requirement 2). */
import { deleteReminder, loadReminder, saveReminder } from "./reminder.ts";

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found as T;
}

export function bindReminderSettings(onChange: () => void): void {
  const input = el<HTMLInputElement>("reminder-input");
  const status = el("reminder-status");
  input.value = loadReminder(localStorage) ?? "";
  el<HTMLButtonElement>("reminder-save").addEventListener("click", () => {
    const result = saveReminder(localStorage, input.value);
    status.textContent = result.ok
      ? "Hint saved. It appears in step 2 of the protocol."
      : result.error;
    if (result.ok) input.value = result.value;
    onChange();
  });
  el<HTMLButtonElement>("reminder-delete").addEventListener("click", () => {
    deleteReminder(localStorage);
    input.value = "";
    status.textContent = "Hint deleted.";
    onChange();
  });
}
