export type Theme = "light" | "dark";

const STORAGE_KEY = "datamog-theme";
const listeners = new Set<(theme: Theme) => void>();

export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "dark" || value === "light") return value;
  } catch {}
  return "light";
}

export function getCurrentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function subscribeTheme(cb: (theme: Theme) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") {
    root.dataset.theme = "dark";
  } else {
    delete root.dataset.theme;
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  for (const cb of listeners) cb(theme);
}
