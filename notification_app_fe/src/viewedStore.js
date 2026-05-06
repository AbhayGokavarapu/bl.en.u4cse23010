const STORAGE_KEY = "affordmed.viewedNotificationIds";

export function readViewedIds() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function writeViewedIds(viewedIds) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...viewedIds]));
}

