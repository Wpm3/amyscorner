export interface Position {
  block: number;
  /** Number of sentences revealed in the current block. */
  revealed: number;
}

export type StepEvent = 'reveal' | 'newParagraph' | 'end' | 'back' | 'prevParagraph' | 'start';

/** Sentence count for a block index. */
type Count = (block: number) => number;

/**
 * Forward tap: reveal the next sentence; once a paragraph is fully revealed,
 * load the next paragraph with its text hidden (or its first sentence shown
 * when `autoRevealFirst` is on). `endBlock` is exclusive: reading stops there
 * (the end of the book, or where the back matter begins).
 */
export function stepForward(pos: Position, count: Count, endBlock: number, autoRevealFirst: boolean): { pos: Position; event: StepEvent } {
  const n = count(pos.block);
  if (pos.revealed < n) return { pos: { block: pos.block, revealed: pos.revealed + 1 }, event: 'reveal' };
  if (pos.block >= endBlock - 1) return { pos, event: 'end' };
  return { pos: { block: pos.block + 1, revealed: autoRevealFirst ? 1 : 0 }, event: 'newParagraph' };
}

/**
 * Back tap: hide the most recent sentence; from the start of a paragraph go to
 * the previous paragraph, fully revealed so it can be reread. `startBlock` is
 * where reading begins (0, or the first block after the front matter).
 */
export function stepBack(pos: Position, count: Count, autoRevealFirst: boolean, startBlock = 0): { pos: Position; event: StepEvent } {
  const floor = autoRevealFirst ? 1 : 0;
  if (pos.revealed > floor) return { pos: { block: pos.block, revealed: pos.revealed - 1 }, event: 'back' };
  if (pos.block <= startBlock) return { pos, event: 'start' };
  const prev = pos.block - 1;
  return { pos: { block: prev, revealed: count(prev) }, event: 'prevParagraph' };
}

/** Clamp a stored position against the current book (e.g. after re-segmenting). */
export function clampPosition(pos: Position, count: Count, totalBlocks: number): Position {
  if (totalBlocks === 0) return { block: 0, revealed: 0 };
  const block = Math.min(Math.max(0, pos.block | 0), totalBlocks - 1);
  return { block, revealed: Math.min(Math.max(0, pos.revealed | 0), count(block)) };
}
