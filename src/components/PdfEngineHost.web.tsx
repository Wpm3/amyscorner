import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { PDF_EXTRACTOR_HTML } from '../parsers/pdf/extractorHtml.generated';
import type { PdfEngineHandle, PdfEngineHostProps } from './PdfEngineHost';

export type { PdfEngineHandle, PdfEngineHostProps } from './PdfEngineHost';

/** Web / Windows desktop: pdf.js runs inside a hidden same-origin iframe. */
export const PdfEngineHost = forwardRef<PdfEngineHandle, PdfEngineHostProps>(function PdfEngineHost({ onMessage, onError }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handlers = useRef({ onMessage, onError });
  handlers.current = { onMessage, onError };

  useImperativeHandle(ref, () => ({
    postMessage(data: string) {
      frame.current?.contentWindow?.postMessage(data, '*');
    },
  }));

  useEffect(() => {
    const listener = (ev: MessageEvent) => {
      if (ev.source !== frame.current?.contentWindow) return;
      const d = ev.data as { __unfoldPdf?: boolean; payload?: string };
      if (d && d.__unfoldPdf && typeof d.payload === 'string') handlers.current.onMessage(d.payload);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return createElement('iframe', {
    ref: frame,
    srcDoc: PDF_EXTRACTOR_HTML,
    title: 'PDF engine',
    'aria-hidden': true,
    tabIndex: -1,
    style: { width: 1, height: 1, border: 0, opacity: 0 },
    onError: () => handlers.current.onError('PDF engine failed to start.'),
  });
});
