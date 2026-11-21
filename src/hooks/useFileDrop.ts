import type { ImportSource } from './useImporter';

/** Drag-and-drop import only exists on desktop/web; no-op on phones. */
export function useFileDrop(_onDrop: (src: ImportSource) => void): boolean {
  return false;
}
