export type BlockKind = 'heading' | 'paragraph' | 'quote' | 'list' | 'code';

/** Front matter (copyright, contents…), back matter (index, about the author…). */
export type Matter = 'front' | 'toc' | 'back';

export interface Block {
  kind: BlockKind;
  text: string;
  /** Heading level 1-6 when kind === 'heading'. */
  level?: number;
  /** PDF: zero-based page the block starts on. */
  page?: number;
  /** Explicit structural hint from the source format (EPUB epub:type, Word TOC field…). */
  matter?: Matter;
  /**
   * Link targets that point at this block (EPUB "file.xhtml#id", Word bookmarks…).
   * Used only while building the table of contents; not stored with the book.
   */
  anchors?: string[];
}

export type BookFormat =
  | 'pdf'
  | 'epub'
  | 'docx'
  | 'odt'
  | 'txt'
  | 'md'
  | 'html'
  | 'rtf'
  | 'fb2'
  | 'paste';

/** A table-of-contents entry as found in the source, before it is mapped to blocks. */
export interface RawTocEntry {
  title: string;
  level: number;
  /** One of these locates the entry; resolution tries them in this order. */
  anchor?: string;
  page?: number | null;
}

export interface TocEntry {
  title: string;
  level: number;
  /** Index into Book.blocks. */
  block: number;
  /** True when the entry is front/back matter that reading skips by default. */
  skipped?: boolean;
}

/** Where the actual reading content lives: blocks[start] … blocks[end - 1]. */
export interface ContentRange {
  start: number;
  end: number;
  /** How the range was found, for the UI ("Skipped copyright and contents"). */
  source: 'toc' | 'landmarks' | 'markers' | 'heuristic' | 'none';
}

export interface ParsedDocument {
  title?: string;
  author?: string;
  blocks: Block[];
  /** Built-in table of contents (EPUB nav/NCX, PDF bookmarks, Word TOC…). */
  toc?: RawTocEntry[];
  /** EPUB landmarks / guide: anchor where the body text starts. */
  bodyStartAnchor?: string;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  addedAt: number;
  blocks: Block[];
  toc: TocEntry[];
  content: ContentRange;
  /** Structure-detection version, so older imports can be re-analysed. */
  structureVersion?: number;
}
