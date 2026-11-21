import { createContext, useCallback, useContext, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { pdfPagesToBlocks } from '../parsers/pdf/layout';
import type { PdfPage } from '../parsers/pdf/types';
import { PDF_EXTRACTOR_HTML } from '../parsers/pdf/extractorHtml.generated';
import type { ParsedDocument } from '../text/blocks';

interface WebViewHandle {
  postMessage(data: string): void;
}
// react-native-webview's class typings collapse to `never` props under React 19 types; use a narrow alias.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

type Progress = (done: number, total: number) => void;

interface Job {
  id: string;
  base64: string;
  pages: PdfPage[];
  title?: string;
  author?: string;
  onProgress?: Progress;
  resolve: (doc: ParsedDocument) => void;
  reject: (err: Error) => void;
}

const PdfContext = createContext<((base64: string, onProgress?: Progress) => Promise<ParsedDocument>) | null>(null);

/**
 * Hosts an invisible WebView running pdf.js (bundled, fully offline). The WebView
 * is only mounted while a PDF is being imported, so it costs nothing otherwise.
 */
export function PdfExtractorProvider({ children }: { children: ReactNode }) {
  const webRef = useRef<WebViewHandle>(null);
  const jobRef = useRef<Job | null>(null);
  const readyRef = useRef(false);
  const [active, setActive] = useState(false);

  const send = useCallback(() => {
    const job = jobRef.current;
    if (!job || !readyRef.current || !webRef.current) return;
    webRef.current.postMessage(JSON.stringify({ type: 'extract', id: job.id, base64: job.base64 }));
    job.base64 = ''; // free memory once handed over
  }, []);

  const finish = useCallback(() => {
    jobRef.current = null;
    readyRef.current = false;
    setActive(false);
  }, []);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      const job = jobRef.current;
      if (msg.type === 'ready') {
        readyRef.current = true;
        send();
        return;
      }
      if (!job || (msg.id && msg.id !== job.id)) return;
      switch (msg.type) {
        case 'meta':
          job.title = msg.title ?? undefined;
          job.author = msg.author ?? undefined;
          job.onProgress?.(0, msg.total);
          break;
        case 'pages':
          job.pages.push(...msg.pages);
          job.onProgress?.(msg.done, msg.total);
          break;
        case 'done': {
          const doc = pdfPagesToBlocks(job.pages);
          finish();
          if (!doc.blocks.length) job.reject(new Error('This PDF has no text layer (it may be a scanned image).'));
          else job.resolve({ ...doc, title: job.title, author: job.author });
          break;
        }
        case 'error':
          finish();
          job.reject(new Error(msg.message || 'Could not read this PDF.'));
          break;
      }
    },
    [finish, send],
  );

  const extract = useCallback(
    (base64: string, onProgress?: Progress) =>
      new Promise<ParsedDocument>((resolve, reject) => {
        if (jobRef.current) {
          reject(new Error('Another PDF is still being imported.'));
          return;
        }
        jobRef.current = { id: String(Date.now()), base64, pages: [], onProgress, resolve, reject };
        if (active && readyRef.current) send();
        else setActive(true);
      }),
    [active, send],
  );

  return (
    <PdfContext.Provider value={extract}>
      {children}
      {active && (
        <View style={styles.hidden} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <WebView
            ref={webRef}
            source={{ html: PDF_EXTRACTOR_HTML, baseUrl: 'https://localhost/' }}
            originWhitelist={['*']}
            javaScriptEnabled
            onMessage={onMessage}
            onError={(ev: { nativeEvent: { description?: string } }) => {
              const job = jobRef.current;
              finish();
              job?.reject(new Error(ev.nativeEvent.description || 'PDF engine failed to start.'));
            }}
          />
        </View>
      )}
    </PdfContext.Provider>
  );
}

export function usePdfExtractor() {
  const ctx = useContext(PdfContext);
  if (!ctx) throw new Error('usePdfExtractor must be used inside PdfExtractorProvider');
  return ctx;
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
