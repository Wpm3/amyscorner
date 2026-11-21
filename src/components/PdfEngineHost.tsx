import { forwardRef, type ComponentType, type Ref } from 'react';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';
import { PDF_EXTRACTOR_HTML } from '../parsers/pdf/extractorHtml.generated';

export interface PdfEngineHandle {
  postMessage(data: string): void;
}

export interface PdfEngineHostProps {
  onMessage: (data: string) => void;
  onError: (message: string) => void;
}

// react-native-webview's class typings collapse to `never` props under React 19 types; use a narrow alias.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<PdfEngineHandle> }>;

/** iOS/Android: pdf.js runs inside an invisible WebView. */
export const PdfEngineHost = forwardRef<PdfEngineHandle, PdfEngineHostProps>(function PdfEngineHost({ onMessage, onError }, ref) {
  return (
    <WebView
      ref={ref}
      source={{ html: PDF_EXTRACTOR_HTML, baseUrl: 'https://localhost/' }}
      originWhitelist={['*']}
      javaScriptEnabled
      onMessage={(e) => onMessage(e.nativeEvent.data)}
      onError={(ev: { nativeEvent: { description?: string } }) => onError(ev.nativeEvent.description || 'PDF engine failed to start.')}
    />
  );
});
