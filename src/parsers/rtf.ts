import type { ParsedDocument } from '../text/blocks';
import { parseTxt } from './txt';

const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr',
  'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles',
  'datastore', 'footnote', 'object', 'fldinst',
]);

/** Minimal RTF → text: honours \par, \line, \tab, \'hh and \uN escapes; drops metadata groups. */
export function rtfToText(rtf: string): string {
  let out = '';
  const stack: boolean[] = [];
  let skipping = false;
  let ucSkip = 1;
  let pendingSkip = 0;
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i];
    if (c === '{') {
      stack.push(skipping);
      if (rtf[i + 1] === '\\' && rtf[i + 2] === '*') skipping = true;
      continue;
    }
    if (c === '}') {
      skipping = stack.pop() ?? false;
      continue;
    }
    if (c === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        if (!skipping) out += next;
        i++;
        continue;
      }
      if (next === "'") {
        const hex = rtf.slice(i + 2, i + 4);
        if (pendingSkip > 0) pendingSkip--;
        else if (!skipping) out += String.fromCharCode(parseInt(hex, 16));
        i += 3;
        continue;
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1));
      if (!m) {
        i++;
        continue;
      }
      i += m[0].length;
      const word = m[1];
      const arg = m[2] ? Number(m[2]) : undefined;
      if (SKIP_DESTINATIONS.has(word)) skipping = true;
      if (skipping) continue;
      if (word === 'par' || word === 'sect' || word === 'page') out += '\n\n';
      else if (word === 'line') out += '\n';
      else if (word === 'tab') out += ' ';
      else if (word === 'emdash') out += '—';
      else if (word === 'endash') out += '–';
      else if (word === 'lquote') out += '‘';
      else if (word === 'rquote') out += '’';
      else if (word === 'ldblquote') out += '“';
      else if (word === 'rdblquote') out += '”';
      else if (word === 'uc' && arg !== undefined) ucSkip = arg;
      else if (word === 'u' && arg !== undefined) {
        out += String.fromCharCode(arg < 0 ? arg + 65536 : arg);
        pendingSkip = ucSkip;
      }
      continue;
    }
    if (c === '\r' || c === '\n') continue;
    if (skipping) continue;
    if (pendingSkip > 0) {
      pendingSkip--;
      continue;
    }
    out += c;
  }
  return out;
}

export function parseRtf(rtf: string): ParsedDocument {
  return parseTxt(rtfToText(rtf));
}
