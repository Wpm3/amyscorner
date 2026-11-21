import type { Block, ParsedDocument } from '../text/blocks';
import { finalizeBlocks } from '../text/clean';

/** Lightweight Markdown → blocks. Handles headings, quotes, lists, fences, paragraphs. */
export function parseMarkdown(md: string): ParsedDocument {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let kind: Block['kind'] = 'paragraph';
  let inFence = false;
  let fence: string[] = [];

  const flush = () => {
    if (para.length) blocks.push({ kind, text: stripInline(para.join(' ')) });
    para = [];
    kind = 'paragraph';
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      if (inFence) {
        blocks.push({ kind: 'code', text: fence.join('\n') });
        fence = [];
        inFence = false;
      } else {
        flush();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(raw);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: stripInline(heading[2]) });
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flush();
      continue;
    }
    const list = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (list) {
      flush();
      kind = 'list';
      para.push(list[1]);
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      if (kind !== 'quote') flush();
      kind = 'quote';
      para.push(quote[1]);
      continue;
    }
    para.push(line.trim());
  }
  flush();
  if (inFence && fence.length) blocks.push({ kind: 'code', text: fence.join('\n') });
  const firstHeading = blocks.find((b) => b.kind === 'heading');
  return { title: firstHeading?.text, blocks: finalizeBlocks(blocks) };
}

function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, '$1$2');
}
