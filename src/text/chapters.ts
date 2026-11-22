import type { Block, Book } from './blocks';
import { classifyTitle } from './structure';

/**
 * Chapters and reading progress.
 *
 * A document is only treated as having chapters after checking: at least two
 * sections inside the reading range, each holding real text, that divide the
 * document from (near) its start. Tables of contents that came from the file
 * itself or a printed contents page are trusted more than ones guessed from
 * headings, which must also pass size checks.
 */

export interface Chapter {
  title: string;
  /** First block (inclusive). */
  start: number;
  /** End block (exclusive). */
  end: number;
}

export interface ChapterInfo {
  /** "chapter" when the divisions look like chapters, "section" for other headed sections. */
  kind: 'chapter' | 'section';
  chapters: Chapter[];
}

export interface ChapterProgress {
  index: number;
  total: number;
  title: string;
  fraction: number;
}

/** "Part One", "Book II", "Volume 3": containers whose children are the chapters. */
const CONTAINER = /^(part|book|volume)\s+([\divxlc]+|[a-z]+)\b/i;
/** Titles that read as chapters, beyond what classifyTitle already recognises. */
const CHAPTERISH = /^(chapter|part|book|act|canto|letter|lesson|unit|prologue|epilogue|interlude|afterword|appendix)\b|^(\d{1,3}|[ivxlc]{1,7})([.:)\s]|$)/i;

const looksLikeChapter = (title: string) => CHAPTERISH.test(title.trim()) || classifyTitle(title) === 'start';

export function detectChapters(book: Pick<Book, 'blocks' | 'toc' | 'content' | 'tocSource'>): ChapterInfo | null {
  const start = book.content?.start ?? 0;
  const end = book.content?.end ?? book.blocks.length;
  const span = end - start;
  if (span <= 0) return null;
  const source = book.tocSource ?? 'headings';
  if (source === 'none') return null;
  const guessed = source === 'headings';

  // Entries that sit inside the text being read.
  const entries = (book.toc ?? []).filter((e) => !e.skipped && e.block >= start && e.block < end);
  if (entries.length < 2) return null;

  // Pick the level that holds the chapters: normally the top level, but one
  // deeper when the top level is just "Part One / Part Two" containers.
  const minLevel = Math.min(...entries.map((e) => e.level));
  const top = entries.filter((e) => e.level === minLevel);
  const deeper = entries.filter((e) => e.level === minLevel + 1);
  const useDeeper = deeper.length >= 2 && (top.length < 2 || top.every((e) => CONTAINER.test(e.title.trim())));
  const level = useDeeper ? minLevel + 1 : minLevel;
  const chosen = entries
    .filter((e) => e.level === level || (useDeeper && e.level < level && !CONTAINER.test(e.title.trim())))
    .sort((a, b) => a.block - b.block)
    .filter((e, i, arr) => i === 0 || e.block !== arr[i - 1].block);
  if (chosen.length < 2) return null;

  const chapters: Chapter[] = chosen.map((e, i) => ({ title: e.title, start: e.block, end: i + 1 < chosen.length ? chosen[i + 1].block : end }));

  // Text before the first chapter: absorb a little (a part title, an epigraph);
  // a lot means the headings don't really divide this document.
  const lead = chapters[0].start - start;
  if (lead > 0) {
    if (lead <= Math.max(2, span * 0.15)) chapters[0] = { ...chapters[0], start };
    else if (guessed) return null;
    else chapters.unshift({ title: 'Opening', start, end: chapters[0].start });
  }

  if (guessed) {
    // Headings that label almost every paragraph are labels, not chapters.
    const avg = span / chapters.length;
    if (avg < 3 || chapters.some((c) => c.end - c.start < 2)) return null;
  }

  const chapterLike = chosen.filter((e) => looksLikeChapter(e.title)).length;
  const kind = !guessed || chapterLike * 2 >= chosen.length ? 'chapter' : 'section';
  return { kind, chapters };
}

/** Cumulative text length before each block (length n + 1), so progress tracks reading time. */
export function blockOffsets(blocks: Block[]): number[] {
  const out = [0];
  for (const b of blocks) out.push(out[out.length - 1] + Math.max(1, b.text.length));
  return out;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * Progress through the reading range and the current chapter.
 * `pos.fraction` is how much of the current block has been read (revealed sentences).
 */
export function readingProgress(
  offsets: number[],
  pos: { block: number; fraction: number },
  range: { start: number; end: number },
  chapters: Chapter[] | null,
): { document: number; chapter: ChapterProgress | null } {
  const last = offsets.length - 1;
  const at = (block: number) => offsets[Math.min(Math.max(0, block), last)];
  const here =
    pos.block >= last ? offsets[last] : at(pos.block) + clamp01(pos.fraction) * (at(pos.block + 1) - at(pos.block));

  const document = clamp01((here - at(range.start)) / Math.max(1, at(range.end) - at(range.start)));

  let chapter: ChapterProgress | null = null;
  const index = chapters ? chapters.findIndex((c) => pos.block >= c.start && pos.block < c.end) : -1;
  if (chapters && index >= 0) {
    const c = chapters[index];
    chapter = {
      index,
      total: chapters.length,
      title: c.title,
      fraction: clamp01((here - at(c.start)) / Math.max(1, at(c.end) - at(c.start))),
    };
  }
  return { document, chapter };
}
