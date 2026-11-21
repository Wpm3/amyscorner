import { strFromU8 } from 'fflate';
import type { BookFormat, ParsedDocument } from '../text/blocks';
import { parseDocx, parseOdt } from './docx';
import { parseEpub } from './epub';
import { parseFb2 } from './fb2';
import { htmlToBlocks } from './html';
import { parseMarkdown } from './markdown';
import { parseRtf } from './rtf';
import { parseTxt } from './txt';

export const SUPPORTED_EXTENSIONS = ['pdf', 'epub', 'docx', 'odt', 'txt', 'text', 'md', 'markdown', 'html', 'htm', 'xhtml', 'rtf', 'fb2'];

export function detectFormat(name: string, mime?: string | null): BookFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'epub':
      return 'epub';
    case 'docx':
      return 'docx';
    case 'odt':
      return 'odt';
    case 'txt':
    case 'text':
      return 'txt';
    case 'md':
    case 'markdown':
      return 'md';
    case 'html':
    case 'htm':
    case 'xhtml':
      return 'html';
    case 'rtf':
      return 'rtf';
    case 'fb2':
      return 'fb2';
  }
  if (mime?.includes('pdf')) return 'pdf';
  if (mime?.includes('epub')) return 'epub';
  if (mime?.includes('wordprocessingml')) return 'docx';
  if (mime?.includes('html')) return 'html';
  if (mime?.startsWith('text/')) return 'txt';
  return null;
}

/** Decode bytes as UTF-8, falling back to Latin-1 when the input is not valid UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const slice = bytes.subarray(start);
  try {
    const s = strFromU8(slice);
    if (!s.includes('�')) return s;
  } catch {
    /* fall through */
  }
  return strFromU8(slice, true);
}

/** Parse every non-PDF format. PDFs go through the WebView extractor (see parsers/pdf). */
export function parseBytes(format: Exclude<BookFormat, 'pdf' | 'paste'>, bytes: Uint8Array): ParsedDocument {
  switch (format) {
    case 'epub':
      return parseEpub(bytes);
    case 'docx':
      return parseDocx(bytes);
    case 'odt':
      return parseOdt(bytes);
    case 'txt':
      return parseTxt(decodeText(bytes));
    case 'md':
      return parseMarkdown(decodeText(bytes));
    case 'html':
      return htmlToBlocks(decodeText(bytes));
    case 'rtf':
      return parseRtf(decodeText(bytes));
    case 'fb2':
      return parseFb2(decodeText(bytes));
  }
}
