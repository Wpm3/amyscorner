import Storage from './kv';

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await Storage.getItemAsync(key);
    return raw ? { ...fallbackShape(fallback), ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function fallbackShape<T>(fallback: T): T {
  return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : ({} as T);
}

export async function getJsonArray<T>(key: string): Promise<T[]> {
  try {
    const raw = await Storage.getItemAsync(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  await Storage.setItemAsync(key, JSON.stringify(value));
}

export async function removeKey(key: string): Promise<void> {
  await Storage.removeItemAsync(key);
}
