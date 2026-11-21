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
  const blocks: Block[] = chunks.map((chunk) => {
    const text = joinWrapped(chunk.replace(/\f/g, '\n'));
    return isTextHeading(text) ? { kind: 'heading', level: 2, text } : { kind: 'paragraph', text };
  });
  return { blocks: finalizeBlocks(blocks) };
}

const CHAPTER_WORD =
  /^(chapter|part|book|section|volume|act|scene|canto|letter|prologue|epilogue|introduction|preface|foreword|afterword|contents|table of contents|appendix|index|acknowledg(e)?ments?|about the author)\b/i;

/** Plain-text headings: "CHAPTER IV.", "Part Two: The Sea", "PROLOGUE", "IV." on their own. */
export function isTextHeading(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 10) return false;
  if (/^[IVXLC]{1,7}\.?$/.test(text)) return true;
  // A contents list squeezed onto one line ("CHAPTER I … CHAPTER II …") is not a heading.
  if ((text.match(/\b(chapter|part|book)\s+[\divxlc]+\b/gi) ?? []).length >= 2) return false;
  if (CHAPTER_WORD.test(text) && !/[,;]$/.test(text) && !/[.!?]["”’]?$/.test(text.replace(/^(chapter|part|book|section|volume|act|scene|canto|letter)\s+[\divxlc]+\.?/i, '').trim() || 'x')) return true;
  // A short ALL-CAPS line (at least two letters, no sentence punctuation mid-line).
  const letters = text.replace(/[^A-Za-z]/g, '');
  return words.length <= 8 && letters.length >= 3 && letters === letters.toUpperCase() && !/[,;]/.test(text) && !/[a-z]/.test(text);
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
