import type { ParsedDocument } from '../text/blocks';
import { htmlToBlocks } from './html';

/** FictionBook 2: map its XML onto HTML-ish tags and reuse the HTML walker. */
export function parseFb2(xmlText: string): ParsedDocument {
  const title = /<book-title>([^<]*)<\/book-title>/.exec(xmlText)?.[1];
  const body = xmlText.replace(/<binary[\s\S]*?<\/binary>/g, '').replace(/<description>[\s\S]*?<\/description>/, '');
  const html = body
    .replace(/<title>/g, '<h2>')
    .replace(/<\/title>/g, '</h2>')
    .replace(/<subtitle>/g, '<h3>')
    .replace(/<\/subtitle>/g, '</h3>')
    .replace(/<(\/?)(epigraph|cite)\b/g, '<$1blockquote')
    .replace(/<(\/?)v>/g, '<$1p>')
    .replace(/<empty-line\s*\/>/g, '');
  const parsed = htmlToBlocks(html);
  return { ...parsed, title: title ?? parsed.title };
}
