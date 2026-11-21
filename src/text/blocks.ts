export type BlockKind = 'heading' | 'paragraph' | 'quote' | 'list' | 'code';

export interface Block {
  kind: BlockKind;
  text: string;
  /** Heading level 1-6 when kind === 'heading'. */
  level?: number;
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

export interface ParsedDocument {
  title?: string;
  author?: string;
  blocks: Block[];
}

export interface Book extends ParsedDocument {
  id: string;
  title: string;
  format: BookFormat;
  addedAt: number;
}
