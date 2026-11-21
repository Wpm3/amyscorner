import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

/** iOS/Android: read a picked file from the app cache copy. */
export async function readAssetBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  return new File(asset.uri).bytes();
}

export async function readAssetBase64(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).base64();
}

export function cleanupAsset(asset: DocumentPickerAsset): void {
  try {
    new File(asset.uri).delete();
  } catch {
    /* cache copy; ignore */
  }
}
