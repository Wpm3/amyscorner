/** A positioned run of text from pdf.js getTextContent(), in top-left page coordinates. */
export interface PdfTextItem {
  str: string;
  x: number;
  /** Baseline y measured from the TOP of the page. */
  y: number;
  w: number;
  /** Font size / glyph height. */
  h: number;
}

export interface PdfPage {
  width: number;
  height: number;
  items: PdfTextItem[];
}
