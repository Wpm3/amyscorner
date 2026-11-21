import { parseDocument } from 'htmlparser2';
import { findOne } from 'domutils';
import type { ChildNode, Element } from 'domhandler';
import type { Block, ParsedDocument } from '../text/blocks';
import { finalizeBlocks } from '../text/clean';

const BLOCK_TAGS: Record<string, Block['kind']> = {
  p: 'paragraph',
  div: 'paragraph',
  section: 'paragraph',
  article: 'paragraph',
  li: 'list',
  dd: 'paragraph',
  dt: 'paragraph',
  blockquote: 'quote',
  pre: 'code',
  td: 'paragraph',
  th: 'paragraph',
  figcaption: 'paragraph',
  caption: 'paragraph',
};
const HEADINGS = /^h([1-6])$/;
const SKIP = new Set(['script', 'style', 'head', 'nav', 'noscript', 'svg', 'math', 'template', 'button', 'form', 'iframe']);

/**
 * Converts (X)HTML into reading blocks. Nested block elements are flattened:
 * text belonging directly to a container becomes its own block between children.
 */
export function htmlToBlocks(html: string): ParsedDocument {
  const doc = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, xmlMode: false });
  const blocks: Block[] = [];
  let title: string | undefined;

  const walk = (nodes: ChildNode[], kind: Block['kind'], level?: number) => {
    let buffer = '';
    const flush = () => {
      if (buffer.trim()) blocks.push({ kind, text: buffer, ...(level ? { level } : {}) });
      buffer = '';
    };
    for (const node of nodes) {
      if (node.type === 'text') {
        buffer += node.data;
        continue;
      }
      if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') continue;
      const el = node as Element;
      const name = el.name.toLowerCase().replace(/^.*:/, '');
      if (SKIP.has(name) || isNoise(el)) continue;
      if (name === 'br') {
        buffer += kind === 'code' ? '\n' : ' ';
        continue;
      }
      if (name === 'img') {
        continue;
      }
      const heading = HEADINGS.exec(name);
      if (heading) {
        flush();
        blocks.push({ kind: 'heading', level: Number(heading[1]), text: textOf(el) });
        continue;
      }
      if (name === 'pre') {
        flush();
        blocks.push({ kind: 'code', text: textOf(el) });
        continue;
      }
      const blockKind = BLOCK_TAGS[name];
      if (blockKind || name === 'ul' || name === 'ol' || name === 'table' || name === 'tr' || name === 'body' || name === 'html' || name === 'main' || name === 'header' || name === 'footer' || name === 'aside' || name === 'dl' || name === 'figure' || name === 'tbody' || name === 'thead') {
        flush();
        walk(el.children, blockKind === 'list' || blockKind === 'quote' ? blockKind : kind === 'quote' ? 'quote' : blockKind ?? 'paragraph');
        continue;
      }
      // Inline element: keep descending, appending text into the current buffer.
      buffer += inlineText(el);
    }
    flush();
  };

  // Inline elements may themselves contain block elements in sloppy HTML.
  const inlineText = (el: Element): string => {
    if (el.children.some((c) => c.type === 'tag' && (BLOCK_TAGS[(c as Element).name] || HEADINGS.test((c as Element).name)))) {
      walk(el.children, 'paragraph');
      return '';
    }
    return textOf(el);
  };

  const titleEl = findOne((e) => e.name === 'title', doc.children, true);
  if (titleEl) title = textOf(titleEl).trim() || undefined;
  walk(doc.children, 'paragraph');
  return { title, blocks: finalizeBlocks(blocks) };
}

function isNoise(el: Element): boolean {
  const type = el.attribs?.['epub:type'] ?? el.attribs?.['role'] ?? '';
  if (/\b(toc|landmarks|page-list|pagebreak|doc-pagebreak|doc-toc)\b/.test(type)) return true;
  if (el.attribs?.hidden !== undefined || /display:\s*none/.test(el.attribs?.style ?? '')) return true;
  return false;
}

function textOf(node: ChildNode): string {
  if (node.type === 'text') return node.data;
  if (node.type === 'tag') {
    const el = node as Element;
    const name = el.name.toLowerCase();
    if (SKIP.has(name)) return '';
    if (name === 'br') return ' ';
    // Footnote reference markers like <sup><a href="#fn1">1</a></sup> are noise mid-sentence.
    if (name === 'sup' && /^\s*\[?\d+\]?\s*$/.test(el.children.map(textOf).join(''))) return '';
    return el.children.map(textOf).join('');
  }
  return '';
}
