import { useEffect, useRef, useState } from 'react';
import { bytesToBase64 } from './readAsset.web';
import type { ImportSource } from './useImporter';

/** Lets people drop a document anywhere on the window. Returns true while dragging over. */
export function useFileDrop(onDrop: (src: ImportSource) => void): boolean {
  const [over, setOver] = useState(false);
  const cb = useRef(onDrop);
  useEffect(() => {
    cb.current = onDrop;
  });

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const bytes = async () => new Uint8Array(await file.arrayBuffer());
      cb.current({ name: file.name, mimeType: file.type, bytes, base64: async () => bytesToBase64(await bytes()) });
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return over;
}
