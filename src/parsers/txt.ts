import type { Block, ParsedDocument } from '../text/blocks';
import { finalizeBlocks } from '../text/clean';

/**
 * Plain text: paragraphs are separated by blank lines. If a file has no blank
 * lines at all (one paragraph per line), fall back to splitting on newlines.
 * Hard-wrapped text (lines broken at ~70 chars inside a paragraph) is re-joined.
 */
export function parseTxt(text: string): ParsedDocument {
  const normalized = text.replace(/\r\n?/g, '\n');
  const hasBlankLines = /\n[ \t]*\n/.test(normalized);
  const chunks = hasBlankLines ? normalized.split(/\n[ \t]*\n+/) : normalized.split('\n');
  const blocks: Block[] = chunks.map((chunk) => ({ kind: 'paragraph', text: joinWrapped(chunk) }));
  return { blocks: finalizeBlocks(blocks) };
}

function joinWrapped(chunk: string): string {
  return chunk
    .split('\n')
    .map((l) => l.trim())
    .reduce((acc, line) => {
      if (!acc) return line;
      if (/[A-Za-z]-$/.test(acc) && /^[a-z]/.test(line)) return acc.slice(0, -1) + line;
      return acc + ' ' + line;
    }, '');
}
