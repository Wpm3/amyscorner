export interface ReaderKeyHandlers {
  next: () => void;
  back: () => void;
  revealAll: () => void;
  exit: () => void;
  toggleListen: () => void;
  showHelp: () => void;
}

/** Keyboard shortcuts exist on desktop/web only. */
export function useReaderKeys(_h: ReaderKeyHandlers): void {}
