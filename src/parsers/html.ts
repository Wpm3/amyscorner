import { parseDocument } from 'htmlparser2';
import { findOne } from 'domutils';
import type { ChildNode, Element } from 'domhandler';
import type { Block, Matter, ParsedDocument } from '../text/blocks';
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
export interface HtmlOptions {
  /** Prefix for element-id anchors ("OEBPS/ch1.xhtml" → "OEBPS/ch1.xhtml#id"). */
  anchorPrefix?: string;
}

// EPUB 3 structural semantics (epub:type) and DPUB-ARIA roles.
const FRONT_TYPES = /\b(frontmatter|titlepage|halftitlepage|copyright-page|dedication|epigraph|imprint|imprimatur|cover|seriespage|loi|lot|doc-dedication|doc-epigraph|doc-cover)\b/;
const BACK_TYPES = /\b(backmatter|index|doc-index|glossary|doc-glossary|bibliography|doc-bibliography|endnotes|doc-endnotes|rearnotes|colophon|doc-colophon|credits|doc-credits|contributors|other-credits|errata|doc-errata|afterword-ads)\b/;
const TOC_TYPES = /\b(toc|doc-toc)\b/;

function matterOf(el: Element, inherited: Matter | undefined): Matter | undefined {
  const t = `${el.attribs?.['epub:type'] ?? ''} ${el.attribs?.role ?? ''}`;
  if (/\bbodymatter\b/.test(t)) return undefined;
  if (TOC_TYPES.test(t)) return 'toc';
  if (FRONT_TYPES.test(t)) return 'front';
  if (BACK_TYPES.test(t)) return 'back';
  return inherited;
}

function idsIn(node: ChildNode, out: string[]): void {
  if (node.type !== 'tag') return;
  const el = node as Element;
  const id = el.attribs?.id ?? (el.name === 'a' ? el.attribs?.name : undefined);
  if (id) out.push(id);
  for (const c of el.children) idsIn(c, out);
}

export function htmlToBlocks(html: string, opts: HtmlOptions = {}): ParsedDocument {
  const doc = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, xmlMode: false });
  const blocks: Block[] = [];
  let title: string | undefined;
  let pendingAnchors: string[] = [];
  const anchorName = (id: string) => (opts.anchorPrefix !== undefined ? `${opts.anchorPrefix}#${id}` : `#${id}`);
  const noteIds = (el: Element) => {
    const ids: string[] = [];
    idsIn(el, ids);
    pendingAnchors.push(...ids.map(anchorName));
  };
  const push = (b: Block) => {
    if (pendingAnchors.length) {
      b.anchors = pendingAnchors;
      pendingAnchors = [];
    }
    blocks.push(b);
  };

  const walk = (nodes: ChildNode[], kind: Block['kind'], level?: number, matter?: Matter) => {
    let buffer = '';
    const flush = () => {
      if (buffer.trim()) push({ kind, text: buffer, ...(level ? { level } : {}), ...(matter ? { matter } : {}) });
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
      const m = matterOf(el, matter);
      const own = el.attribs?.id ?? (name === 'a' ? el.attribs?.name : undefined);
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
        noteIds(el);
        push({ kind: 'heading', level: Number(heading[1]), text: textOf(el), ...(m ? { matter: m } : {}) });
        continue;
      }
      if (name === 'pre') {
        flush();
        noteIds(el);
        push({ kind: 'code', text: textOf(el), ...(m ? { matter: m } : {}) });
        continue;
      }
      const blockKind = BLOCK_TAGS[name];
      if (blockKind || name === 'ul' || name === 'ol' || name === 'table' || name === 'tr' || name === 'body' || name === 'html' || name === 'main' || name === 'header' || name === 'footer' || name === 'aside' || name === 'dl' || name === 'figure' || name === 'tbody' || name === 'thead') {
        flush();
        if (own) pendingAnchors.push(anchorName(own));
        walk(el.children, blockKind === 'list' || blockKind === 'quote' ? blockKind : kind === 'quote' ? 'quote' : blockKind ?? 'paragraph', undefined, m);
        continue;
      }
      // Inline element: keep descending, appending text into the current buffer.
      if (!buffer.trim()) noteIds(el);
      buffer += inlineText(el, m);
    }
    flush();
  };

  // Inline elements may themselves contain block elements in sloppy HTML.
  const inlineText = (el: Element, m?: Matter): string => {
    if (el.children.some((c) => c.type === 'tag' && (BLOCK_TAGS[(c as Element).name] || HEADINGS.test((c as Element).name)))) {
      walk(el.children, 'paragraph', undefined, m);
      return '';
    }
    return textOf(el);
  };

  const titleEl = findOne((e) => e.name === 'title', doc.children, true);
  if (titleEl) title = textOf(titleEl).trim() || undefined;
  walk(doc.children, 'paragraph');
  const out = finalizeBlocks(blocks);
  // Anchors after the last block (e.g. an empty trailing <div id>) belong to it.
  if (pendingAnchors.length && out.length) out[out.length - 1].anchors = [...(out[out.length - 1].anchors ?? []), ...pendingAnchors];
  return { title, blocks: out };
}

function isNoise(el: Element): boolean {
  const type = el.attribs?.['epub:type'] ?? el.attribs?.['role'] ?? '';
  if (/\b(landmarks|page-list|pagebreak|doc-pagebreak)\b/.test(type)) return true;
  // Footnote markers and the notes themselves interrupt the text flow.
  if (/\b(noteref|doc-noteref|footnote|doc-footnote|endnote|doc-endnote|rearnote)\b/.test(type)) return true;
  // An EPUB's own navigation document (the TOC is read separately from the package).
  if (el.name === 'nav' && /\b(toc|doc-toc)\b/.test(type)) return true;
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
