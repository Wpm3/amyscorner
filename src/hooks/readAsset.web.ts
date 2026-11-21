import type { DocumentPickerAsset } from 'expo-document-picker';

/** Web / Windows desktop: the picker hands us a browser File (or a blob: URL). */
export async function readAssetBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  const buf = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
  return new Uint8Array(buf);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export async function readAssetBase64(asset: DocumentPickerAsset): Promise<string> {
  return bytesToBase64(await readAssetBytes(asset));
}

export function cleanupAsset(asset: DocumentPickerAsset): void {
  if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri);
}
