import type { Block } from './blocks';

const SOFT_HYPHEN = /­/g;
const ZERO_WIDTH = /[​-‍﻿]/g;

/** Collapse whitespace, strip invisible characters, normalise quotes spacing. */
export function cleanText(input: string): string {
  return input
    .replace(SOFT_HYPHEN, '')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop empty blocks and clean all text. */
export function finalizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let carried: string[] = [];
  for (const b of blocks) {
    const text = b.kind === 'code' ? b.text.replace(/\s+$/g, '') : cleanText(b.text);
    // Skip empty blocks and stray punctuation-only fragments (e.g. a lone "." or "|"),
    // passing any link anchors they carried on to the next kept block.
    if (!text || (text.length < 4 && !/[A-Za-z0-9\u00C0-\u024F\u0370-\u1FFF\u3040-\u9FFF\uAC00-\uD7AF]/.test(text))) {
      if (b.anchors) carried.push(...b.anchors);
      continue;
    }
    const kept: Block = { ...b, text };
    if (carried.length) {
      kept.anchors = [...carried, ...(b.anchors ?? [])];
      carried = [];
    }
    out.push(kept);
  }
  if (carried.length && out.length) out[out.length - 1].anchors = [...(out[out.length - 1].anchors ?? []), ...carried];
  return out;
}
