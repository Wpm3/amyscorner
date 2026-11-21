import { strFromU8, unzipSync } from 'fflate';

export type ZipEntries = Record<string, Uint8Array>;

export function unzip(bytes: Uint8Array): ZipEntries {
  return unzipSync(bytes);
}

/** Case-insensitive, URL-decoded lookup of a zip entry as UTF-8 text. */
export function readText(zip: ZipEntries, path: string): string | undefined {
  const target = safeDecode(path).replace(/^\/+/, '');
  const hit = zip[target] ?? zip[Object.keys(zip).find((k) => k.toLowerCase() === target.toLowerCase()) ?? ''];
  return hit ? strFromU8(hit) : undefined;
}

function safeDecode(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** Resolve `href` relative to the directory of `base` (both zip-internal paths). */
export function resolvePath(base: string, href: string): string {
  const clean = href.split('#')[0];
  const parts = base.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
