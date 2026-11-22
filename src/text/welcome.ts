import { parseMarkdown } from '../parsers/markdown';

/** A short built-in guide so the app has something to read on first launch. */
export const WELCOME_MARKDOWN = `# Welcome to Unfold

This app shows you one paragraph at a time. Each sentence starts hidden, and you reveal it when you are ready. Tap the right side of the screen to show the next sentence. Tap the left side to go back.

When you finish a paragraph, the next tap brings in a fresh one. Its text starts hidden again, so there is only ever one small piece to focus on. You can always go back and reread; earlier sentences stay visible, just a little softer.

The sentence you are reading gets a soft highlight. Long sentences are broken into clauses, and every other clause is tinted, so you can see where one idea ends and the next one begins.

When a phrase interrupts a sentence, like this one does, it gets its own colour, and the sentence around it keeps a single colour, so you can follow the main thought.

Tap the eye button at the top to hide every sentence except the one you are reading. Tap it again to bring the rest back.

If colours are not enough, open Settings and choose to show each clause on its own line. Each clause then sits on its own line, and follow-on clauses are indented, which makes the shape of a sentence easy to see at a glance.

## Making it yours

Everything is adjustable: the font, the size, the line spacing, extra letter spacing, and the colour theme. The default cream background and Atkinson Hyperlegible font were chosen because they are easy on the eyes for long sessions.

You can turn on read-aloud, which speaks each sentence as it appears. Listen mode goes further: it reads and reveals the paragraph for you, one sentence at a time.

A gentle reminder will suggest a short break every twenty-five minutes. You can change the interval or switch it off. Your place is saved on every tap, so you can stop at any moment and pick up at the exact sentence later.

## Adding your own reading

Go back to the library and tap Import. You can open PDF, EPUB, Word (.docx), OpenDocument (.odt), RTF, HTML, Markdown, FB2 and plain text files. You can also paste text straight from another app.

Unfold finds where the real text begins. Copyright pages, contents lists, dedications and title pages are skipped, and reading stops before the index or the about-the-author pages. If a page break cut a paragraph in two, the pieces are joined back together. Tap the ☰ button to open the table of contents, jump to any chapter, or read a skipped section anyway.

Scanned PDFs that are only pictures of pages have no text to read, so they cannot be opened yet. Everything else is processed on your phone and never uploaded anywhere.

Happy reading. Take it one sentence at a time.
`;

export const welcomeDocument = () => parseMarkdown(WELCOME_MARKDOWN);
