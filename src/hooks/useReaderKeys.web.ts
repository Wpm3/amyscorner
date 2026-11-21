import { useEffect, useRef } from 'react';
import type { ReaderKeyHandlers } from './useReaderKeys';

/**
 * Desktop shortcuts:
 *   → / Space / Enter / J / PageDown  next sentence
 *   ← / Backspace / K / PageUp        previous sentence
 *   A                                 reveal whole paragraph
 *   L                                 listen (read aloud)
 *   Esc                               back to library
 *   ? / F1                            keyboard shortcuts
 *   C                                 table of contents
 */
export function useReaderKeys(h: ReaderKeyHandlers): void {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key;
      // Let Space/Enter activate a focused button instead of also turning the page.
      if ((k === ' ' || k === 'Enter') && t?.closest?.('button,[role="button"],[role="switch"],[role="radio"],a[href]')) return;
      let handled = true;
      if (k === 'ArrowRight' || k === ' ' || k === 'Enter' || k === 'j' || k === 'PageDown' || k === 'ArrowDown') ref.current.next();
      else if (k === 'ArrowLeft' || k === 'Backspace' || k === 'k' || k === 'PageUp' || k === 'ArrowUp') ref.current.back();
      else if (k === 'a') ref.current.revealAll();
      else if (k === 'l') ref.current.toggleListen();
      else if (k === '?' || k === 'F1') ref.current.showHelp();
      else if (k === 'c') ref.current.toggleContents();
      else if (k === 'Escape') ref.current.exit();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
