// Import only the Ionicons set, so other icon fonts aren't bundled.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ParagraphView } from '../../components/ParagraphView';
import { ProgressMeters } from '../../components/ProgressMeters';
import { currentTocIndex, TocPanel } from '../../components/TocPanel';
import { useReaderKeys } from '../../hooks/useReaderKeys';
import { Button } from '../../components/ui';
import { getPosition, loadBook, savePosition } from '../../store/library';
import { useSettings } from '../../store/settings';
import type { Book, TocEntry } from '../../text/blocks';
import { blockOffsets, detectChapters, readingProgress } from '../../text/chapters';
import { clampPosition, stepBack, stepForward, type Position } from '../../text/navigation';
import { segmentBlock, type Sentence } from '../../text/paragraph';
import { withAlpha } from '../../theme/color';
import { fontFamily } from '../../theme/fonts';

const TAP_DEBOUNCE_MS = 180;
const HAS_HAPTICS = Platform.OS === 'ios' || Platform.OS === 'android';
const BACK_ZONE = 0.35; // left 35% of the screen goes back
function hintText(layout: 'zones' | 'anywhere'): string {
  const desktop = Platform.OS === 'web';
  const tap = desktop ? 'Click' : 'Tap';
  if (layout === 'anywhere') return `${tap} anywhere${desktop ? ' (or press Space)' : ''} to reveal the next sentence. Press and hold to show the whole paragraph.`;
  return desktop
    ? 'Click the right side, or press → / Space, to reveal the next sentence. Click the left side, or press ←, to go back. Press ? to see all keyboard shortcuts.'
    : 'Tap the right side to reveal the next sentence. Tap the left side to go back. Press and hold to show the whole paragraph.';
}

const KEYS: [string, string][] = [
  ['→  Space  Enter', 'Next sentence'],
  ['←  Backspace', 'Previous sentence'],
  ['A', 'Show the whole paragraph'],
  ['L', 'Listen (read aloud)'],
  ['F11', 'Full screen'],
  ['Ctrl +  /  Ctrl −', 'Bigger / smaller'],
  ['C', 'Table of contents'],
  ['H', 'Hide / show other sentences'],
  ['?  or  F1', 'Show these shortcuts'],
  ['Esc', 'Back to library'],
];

/** Sentence segmentation, computed lazily and cached per book object (outside React state). */
const segmentCache = new WeakMap<Book, Map<number, Sentence[]>>();
function sentencesFor(book: Book, i: number): Sentence[] {
  let perBook = segmentCache.get(book);
  if (!perBook) {
    perBook = new Map();
    segmentCache.set(book, perBook);
  }
  let s = perBook.get(i);
  if (!s) {
    s = segmentBlock(book.blocks[i]);
    perBook.set(i, s);
  }
  return s;
}

const WIDE = 900; // docked sidebar at this window width and up
const SIDEBAR = 320;
const RECAP_AFTER_MS = 12 * 60 * 60 * 1000;

// Keep the screen on while reading (phones). Browsers/desktop reject wake locks often, so skip there.
const useReaderAwake: () => void = Platform.OS === 'web' ? () => {} : useKeepAwake;

export default function Reader() {
  useReaderAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, theme, update } = useSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Position>({ block: 0, revealed: 0 });
  const [recap, setRecap] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [listening, setListening] = useState(false);
  const [breakDue, setBreakDue] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  const lastTap = useRef(0);
  const sessionStart = useRef(0);
  const [fade] = useState(() => new Animated.Value(1));
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [contentH, setContentH] = useState(0);
  const [viewH, setViewH] = useState(0);

  const sentencesOf = useCallback((i: number): Sentence[] => (book ? sentencesFor(book, i) : []), [book]);
  const count = useCallback((i: number) => sentencesOf(i).length, [sentencesOf]);

  // Load the book and restore the exact sentence position.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await loadBook(String(id));
        if (!alive) return;
        if (!b) {
          setError('This book could not be found.');
          return;
        }
        const saved = await getPosition(b.id);
        const counter = (i: number) => segmentBlock(b.blocks[i]).length;
        // First open: jump straight past the front matter to where the text begins.
        const start = saved.updatedAt ? clampPosition(saved, counter, b.blocks.length) : { block: b.content.start, revealed: 0 };
        setBook(b);
        setPos(start.revealed === 0 && settings.autoRevealFirst ? { block: start.block, revealed: 1 } : start);
        // "Where was I?" — after a long gap, show the last thing read before resuming.
        if (saved.updatedAt && Date.now() - saved.updatedAt > RECAP_AFTER_MS && (start.block > 0 || start.revealed > 0)) {
          const prevBlock = start.revealed > 0 ? start.block : start.block - 1;
          const sents = segmentBlock(b.blocks[prevBlock]);
          const upto = start.revealed > 0 ? start.revealed : sents.length;
          setRecap(sents.slice(Math.max(0, upto - 2), upto).map((s) => s.text).join(' '));
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // Persist position on every change (cheap kv write).
  useEffect(() => {
    if (book) savePosition(book.id, pos).catch(() => {});
  }, [book, pos]);

  // Gentle break reminder (the session clock starts when the reader opens).
  useEffect(() => {
    sessionStart.current = Date.now();
  }, []);
  useEffect(() => {
    if (!settings.breakReminderMinutes) return;
    const t = setInterval(() => {
      if (Date.now() - sessionStart.current > settings.breakReminderMinutes * 60_000) setBreakDue(true);
    }, 30_000);
    return () => clearInterval(t);
  }, [settings.breakReminderMinutes]);

  const sentences = book ? sentencesOf(pos.block) : [];
  // Text offsets (progress by amount of text) and verified chapters, once per book.
  const offsets = useMemo(() => (book ? blockOffsets(book.blocks) : [0]), [book]);
  const chapterInfo = useMemo(() => (book ? detectChapters(book) : null), [book]);

  // Reading bounds: the detected content (front/back matter skipped), unless the
  // reader turned that off or deliberately jumped into a skipped section.
  const bounds = useMemo(() => {
    if (!book) return { start: 0, end: 0 };
    const all = { start: 0, end: book.blocks.length };
    const c = book.content;
    if (!settings.skipFrontBack || !c || pos.block < c.start || pos.block >= c.end) return all;
    return { start: c.start, end: c.end };
  }, [book, settings.skipFrontBack, pos.block]);

  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      Speech.stop();
      Speech.speak(text, { rate: settings.speechRate, onDone, onStopped: undefined });
    },
    [settings.speechRate],
  );

  const animateIn = useCallback(() => {
    if (reduceMotion) return;
    fade.setValue(0.2);
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [fade, reduceMotion]);

  const next = useCallback(() => {
    if (!book) return;
    setRecap(null);
    const r = stepForward(pos, count, bounds.end, settings.autoRevealFirst);
    if (r.event === 'end') {
      setFinished(true);
      setListening(false);
      if (settings.haptics && HAS_HAPTICS) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    if (r.event === 'newParagraph') {
      animateIn();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      if (settings.haptics && HAS_HAPTICS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else if (settings.haptics && HAS_HAPTICS) {
      Haptics.selectionAsync().catch(() => {});
    }
    setPos(r.pos);
  }, [book, pos, count, bounds.end, settings.autoRevealFirst, settings.haptics, animateIn]);

  const back = useCallback(() => {
    if (!book) return;
    setFinished(false);
    setListening(false);
    Speech.stop();
    const r = stepBack(pos, count, settings.autoRevealFirst, bounds.start);
    if (r.event === 'start') return;
    if (r.event === 'prevParagraph') animateIn();
    if (settings.haptics && HAS_HAPTICS) Haptics.selectionAsync().catch(() => {});
    setPos(r.pos);
  }, [book, pos, count, bounds.start, settings.autoRevealFirst, settings.haptics, animateIn]);

  const jumpTo = useCallback(
    (entry: TocEntry) => {
      setFinished(false);
      setRecap(null);
      setListening(false);
      Speech.stop();
      animateIn();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setPos({ block: entry.block, revealed: settings.autoRevealFirst ? 1 : 0 });
      if (width < WIDE) setTocOpen(false);
    },
    [animateIn, settings.autoRevealFirst, width],
  );

  const revealAll = useCallback(() => {
    if (!book) return;
    if (settings.haptics && HAS_HAPTICS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPos((p) => ({ ...p, revealed: count(p.block) }));
  }, [book, count, settings.haptics]);

  // Speak the newly revealed sentence (read-aloud), or drive Listen mode.
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });
  useEffect(() => {
    if (!book || pos.revealed === 0) {
      if (listening) {
        const t = setTimeout(() => nextRef.current(), 350);
        return () => clearTimeout(t);
      }
      return;
    }
    const current = sentences[pos.revealed - 1];
    if (!current) return;
    if (listening) speak(current.text, () => nextRef.current());
    else if (settings.speakOnReveal) speak(current.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, listening]);

  // Keep the current sentence in view for paragraphs taller than the screen.
  useEffect(() => {
    if (contentH <= viewH || !sentences.length || pos.revealed === 0) return;
    const frac = (pos.revealed - 1) / sentences.length;
    scrollRef.current?.scrollTo({ y: Math.max(0, frac * contentH - viewH * 0.3), animated: !reduceMotion });
  }, [pos.revealed, contentH, viewH, sentences.length, reduceMotion]);

  const onTap = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastTap.current < TAP_DEBOUNCE_MS) return;
    lastTap.current = now;
    if (listening) {
      setListening(false);
      Speech.stop();
      return;
    }
    if (settings.tapLayout === 'zones' && e.nativeEvent.pageX < width * BACK_ZONE) back();
    else next();
  };

  const toggleListen = () => {
    if (listening) {
      setListening(false);
      Speech.stop();
    } else {
      setListening(true);
      const current = sentences[pos.revealed - 1];
      if (pos.revealed > 0 && pos.revealed <= sentences.length && current) speak(current.text, () => nextRef.current());
      else next();
    }
  };

  const [showKeys, setShowKeys] = useState(false);
  useReaderKeys({
    next,
    back,
    revealAll,
    toggleListen,
    showHelp: () => setShowKeys((v) => !v),
    toggleFocus: () => update({ focusSentence: !settings.focusSentence }),
    toggleContents: () => setTocOpen((v) => !v),
    exit: () => (showKeys ? setShowKeys(false) : tocOpen ? setTocOpen(false) : router.back()),
  });

  const font = fontFamily(settings.font);
  const muted = { color: theme.muted, fontFamily: font };

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[muted, { fontSize: 18, marginBottom: 16 }]}>{error}</Text>
        <Button label="Back to library" onPress={() => router.back()} />
      </View>
    );
  }
  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const block = book.blocks[pos.block];
  const revealedText = sentences.slice(0, pos.revealed).map((s) => s.text).join(' ');
  const hasToc = (book.toc?.length ?? 0) >= 2;
  const narrow = width < 560; // phone widths: compact top-bar buttons so the title stays readable
  const docked = hasToc && tocOpen && width >= WIDE;
  const columnWidth = Math.min(width - (docked ? SIDEBAR : 0) - 40, settings.fontSize * 34);
  const isFirstEver = pos.block === (book.content?.start ?? 0) && pos.revealed === 0;
  const tocIndex = hasToc ? currentTocIndex(book.toc, pos.block) : -1;
  const chapter = tocIndex >= 0 ? book.toc[tocIndex].title : null;
  // How much of the current paragraph has been read: revealed sentences by length.
  const totalChars = sentences.reduce((n, x) => n + x.text.length, 0);
  const readChars = sentences.slice(0, pos.revealed).reduce((n, x) => n + x.text.length, 0);
  const progress = finished
    ? { document: 1, chapter: null }
    : readingProgress(offsets, { block: pos.block, fraction: totalChars ? readChars / totalChars : 0 }, bounds, chapterInfo?.chapters ?? null);
  const isBook = ['epub', 'pdf', 'fb2'].includes(book.format);
  const skippedEnd = settings.skipFrontBack && book.content && book.content.end < book.blocks.length;

  const tocPanel = hasToc ? <TocPanel toc={book.toc} currentIndex={tocIndex} onSelect={jumpTo} onClose={() => setTocOpen(false)} /> : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Top bar: minimal, low-contrast chrome. */}
      <View style={styles.topBar}>
        <Button label={narrow ? '‹' : '‹ Library'} kind="ghost" onPress={() => router.back()} accessibilityHint="Back to library" />
        {hasToc && (
          <Button
            label="☰"
            kind="ghost"
            onPress={() => setTocOpen((v) => !v)}
            accessibilityHint={tocOpen ? 'Hide table of contents' : 'Show table of contents'}
          />
        )}
        <View style={styles.titleBox}>
          <Text numberOfLines={1} style={[muted, styles.bookTitle]}>{book.title}</Text>
          {chapter && chapter !== book.title && (
            <Text numberOfLines={1} style={[muted, styles.chapterTitle, { color: withAlpha(theme.muted, 0.85) }]}>{chapter}</Text>
          )}
        </View>
        <Button
          label={narrow ? (listening ? '■' : '▶') : listening ? '■ Stop' : '▶ Listen'}
          kind="ghost"
          onPress={toggleListen}
          accessibilityHint="Reads and reveals sentences aloud"
        />
        {Platform.OS === 'web' && !narrow && (
          <Button label="⌨" kind="ghost" onPress={() => setShowKeys((v) => !v)} accessibilityHint="Keyboard shortcuts" />
        )}
        <Pressable
          onPress={() => update({ focusSentence: !settings.focusSentence })}
          accessibilityRole="switch"
          accessibilityLabel="Show only the current sentence"
          accessibilityState={{ checked: settings.focusSentence }}
          aria-checked={settings.focusSentence}
          accessibilityHint={settings.focusSentence ? 'Shows the other sentences again' : 'Hides every sentence except the one you are reading'}
          hitSlop={6}
          style={({ pressed }) => [styles.iconBtn, settings.focusSentence && { backgroundColor: theme.highlight }, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name={settings.focusSentence ? 'eye-off-outline' : 'eye-outline'} size={24} color={theme.text} />
        </Pressable>
        <Button label="Aa" kind="ghost" onPress={() => router.push('/settings')} accessibilityHint="Reading settings" />
      </View>
      <View style={styles.body}>
      {docked && <View style={{ width: SIDEBAR }}>{tocPanel}</View>}
      <View style={styles.main}>

      {breakDue && (
        <View style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLiveRegion="polite">
          <Text style={{ color: theme.text, fontFamily: font, fontSize: 16, flex: 1 }}>
            You’ve been reading for a while. A short stretch or a sip of water can help.
          </Text>
          <Button label="Thanks" kind="ghost" onPress={() => { sessionStart.current = Date.now(); setBreakDue(false); }} />
        </View>
      )}

      <Pressable
        style={styles.tapArea}
        onPress={onTap}
        onLongPress={revealAll}
        delayLongPress={450}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={
          block.kind === 'heading' && pos.revealed > 0
            ? `Heading: ${revealedText}`
            : revealedText || `New paragraph, ${sentences.length} ${sentences.length === 1 ? 'sentence' : 'sentences'}, hidden`
        }
        accessibilityValue={{ text: `Sentence ${pos.revealed} of ${sentences.length}` }}
        accessibilityHint="Swipe up for the next sentence, down to go back."
        accessibilityActions={[{ name: 'increment', label: 'Next sentence' }, { name: 'decrement', label: 'Previous sentence' }, { name: 'activate', label: 'Next sentence' }, { name: 'longpress', label: 'Reveal whole paragraph' }]}
        onAccessibilityAction={(e) => {
          const a = e.nativeEvent.actionName;
          if (a === 'increment' || a === 'activate') next();
          else if (a === 'decrement') back();
          else if (a === 'longpress') revealAll();
        }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, { minHeight: '100%' }]}
          onContentSizeChange={(_, h) => setContentH(h)}
          onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          showsVerticalScrollIndicator={contentH > viewH}
        >
          {/* Pressable inside the ScrollView so taps register but scrolling still works. */}
          <Pressable onPress={onTap} onLongPress={revealAll} delayLongPress={450} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.inner}>
            {recap && (
              <View style={[styles.recap, { borderColor: theme.border, backgroundColor: theme.surface, width: columnWidth }]}>
                <Text style={[muted, { fontSize: 14, marginBottom: 6 }]}>WHERE YOU LEFT OFF</Text>
                <Text style={{ color: withAlpha(theme.text, 0.8), fontFamily: font, fontSize: Math.round(settings.fontSize * 0.85), lineHeight: Math.round(settings.fontSize * 0.85 * settings.lineHeight) }}>
                  …{recap}
                </Text>
              </View>
            )}
            <Animated.View style={{ width: columnWidth, opacity: fade }}>
              {finished ? (
                <View>
                  <Text style={{ color: theme.text, fontFamily: fontFamily(settings.font, true), fontSize: settings.fontSize * 1.3, marginBottom: 12 }}>You reached the end.</Text>
                  <Text style={[muted, { fontSize: settings.fontSize }]}>
                    Nice work. Tap the left side to look back, or return to your library.
                    {skippedEnd && hasToc ? ' Extra pages after the story (like the index or about the author) were skipped — open ☰ Contents to read them.' : ''}
                  </Text>
                </View>
              ) : (
                <ParagraphView block={block} sentences={sentences} revealed={pos.revealed} settings={settings} theme={theme} />
              )}
            </Animated.View>
            {isFirstEver && !recap && (
              <Text style={[muted, styles.hint, { width: columnWidth }]}>
                {hintText(settings.tapLayout)}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </Pressable>

      {/* Progress: chapter (only when the document verifiably has chapters), then the whole document. */}
      {settings.progressBars !== 'off' && (
        <ProgressMeters
          chapter={progress.chapter}
          chapterWord={chapterInfo?.kind === 'section' ? 'Section' : 'Chapter'}
          document={progress.document}
          documentWord={isBook ? 'Book' : 'Document'}
          showChapter={settings.progressBars === 'both'}
        />
      )}
      {/* Bottom bar: explicit large buttons (also usable one-handed / with switch access). */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <Button label="‹" kind="ghost" onPress={back} style={styles.navBtn} accessibilityHint="Previous sentence" />
        <View style={styles.dots} accessibilityLabel={`Sentence ${pos.revealed} of ${sentences.length}`}>
          {settings.showSentenceCounter && !finished &&
            sentences.slice(0, 24).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i < pos.revealed ? theme.accent : 'transparent', borderColor: withAlpha(theme.muted, 0.6) },
                ]}
              />
            ))}
          {settings.showSentenceCounter && sentences.length > 24 && <Text style={[muted, { fontSize: 13 }]}>+{sentences.length - 24}</Text>}
        </View>
        <Button label="›" kind="ghost" onPress={next} style={styles.navBtn} accessibilityHint="Next sentence" />
      </View>
      </View>
      </View>
      {hasToc && tocOpen && !docked && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setTocOpen(false)} accessibilityRole="button" accessibilityLabel="Close contents" />
          <View style={[styles.drawer, { width: Math.min(width * 0.86, 380), paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: theme.surface }]}>
            {tocPanel}
          </View>
        </View>
      )}
      {showKeys && (
        <Pressable style={styles.keysBackdrop} onPress={() => setShowKeys(false)} accessibilityRole="button" accessibilityLabel="Close keyboard shortcuts">
          <View style={[styles.keysPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontFamily: fontFamily(settings.font, true), fontSize: 20, marginBottom: 12 }}>
              Keyboard shortcuts
            </Text>
            {KEYS.map(([keys, what]) => (
              <View key={keys} style={styles.keyRow}>
                <Text style={{ color: theme.text, fontFamily: fontFamily(settings.font, true), fontSize: 16, width: 170 }}>{keys}</Text>
                <Text style={{ color: theme.text, fontFamily: font, fontSize: 16, flex: 1 }}>{what}</Text>
              </View>
            ))}
            <Text style={{ color: theme.muted, fontFamily: font, fontSize: 14, marginTop: 12 }}>Click anywhere or press Esc to close.</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keysBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  keysPanel: { width: '100%', maxWidth: 460, padding: 20, borderRadius: 16, borderWidth: 1 },
  keyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, minHeight: 52 },
  titleBox: { flex: 1, alignItems: 'center' },
  iconBtn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontSize: 15, textAlign: 'center' },
  chapterTitle: { fontSize: 13, textAlign: 'center', marginTop: 1 },
  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  drawerBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  banner: { flexDirection: 'row', alignItems: 'center', margin: 12, padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  tapArea: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  recap: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 28 },
  hint: { marginTop: 32, fontSize: 15, lineHeight: 22 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  navBtn: { minWidth: 64, minHeight: 56 },
  dots: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
});
