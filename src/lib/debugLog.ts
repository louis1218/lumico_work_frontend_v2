// A small on-phone log, kept in localStorage so it survives a reload. Shown at /debug.
// Lets a problem in the field be read off the phone without a computer.
const KEY = "lumico:debuglog";
const MAX = 150;

const stamp = () => new Date().toLocaleTimeString([], { hour12: false });

export function readLog(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function log(message: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...readLog(), `${stamp()} ${message}`].slice(-MAX)));
  } catch {
    /* storage full or blocked: logging must never break the app */
  }
}

export function clearLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
