const STORAGE_KEY = "datamog-show-warnings";

let showWarnings = readStored();

function readStored(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "false") return false;
  } catch {}
  return true;
}

export function getShowWarnings(): boolean {
  return showWarnings;
}

export function setShowWarnings(value: boolean): void {
  showWarnings = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {}
}
