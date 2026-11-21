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
import { useReaderKeys } from '../../hooks/useReaderKeys';
import { Button } from '../../components/ui';
import { getPosition, loadBook, savePosition } from '../../store/library';
import { useSettings } from '../../store/settings';
import type { Book } from '../../text/blocks';
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
    ? 'Click the right side, or press → / Space, to reveal the next sentence. Click the left side, or press ←, to go back. Press A to show the whole paragraph.'
    : 'Tap the right side to reveal the next sentence. Tap the left side to go back. Press and hold to show the whole paragraph.';
}

const RECAP_AFTER_MS = 12 * 60 * 60 * 1000;

export default function Reader() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, theme } = useSettings();
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

  const segCache = useRef(new Map<number, Sentence[]>());
  const lastTap = useRef(0);
  const sessionStart = useRef(Date.now());
  const fade = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [contentH, setContentH] = useState(0);
  const [viewH, setViewH] = useState(0);

  const sentencesOf = useCallback(
    (i: number): Sentence[] => {
      if (!book) return [];
      let s = segCache.current.get(i);
      if (!s) {
        s = segmentBlock(book.blocks[i]);
        segCache.current.set(i, s);
      }
      return s;
    },
    [book],
  );
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
        segCache.current.clear();
        const saved = await getPosition(b.id);
        const counter = (i: number) => segmentBlock(b.blocks[i]).length;
        const start = clampPosition(saved, counter, b.blocks.length);
        setBook(b);
        setPos(start.block === 0 && start.revealed === 0 && settings.autoRevealFirst ? { block: 0, revealed: 1 } : start);
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

  // Gentle break reminder.
  useEffect(() => {
    if (!settings.breakReminderMinutes) return;
    const t = setInterval(() => {
      if (Date.now() - sessionStart.current > settings.breakReminderMinutes * 60_000) setBreakDue(true);
    }, 30_000);
    return () => clearInterval(t);
  }, [settings.breakReminderMinutes]);

  const sentences = book ? sentencesOf(pos.block) : [];

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
    const r = stepForward(pos, count, book.blocks.length, settings.autoRevealFirst);
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
  }, [book, pos, count, settings.autoRevealFirst, settings.haptics, animateIn]);

  const back = useCallback(() => {
    if (!book) return;
    setFinished(false);
    setListening(false);
    Speech.stop();
    const r = stepBack(pos, count, settings.autoRevealFirst);
    if (r.event === 'start') return;
    if (r.event === 'prevParagraph') animateIn();
    if (settings.haptics && HAS_HAPTICS) Haptics.selectionAsync().catch(() => {});
    setPos(r.pos);
  }, [book, pos, count, settings.autoRevealFirst, settings.haptics, animateIn]);

  const revealAll = useCallback(() => {
    if (!book) return;
    if (settings.haptics && HAS_HAPTICS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPos((p) => ({ ...p, revealed: count(p.block) }));
  }, [book, count, settings.haptics]);

  // Speak the newly revealed sentence (read-aloud), or drive Listen mode.
  const nextRef = useRef(next);
  nextRef.current = next;
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

  useReaderKeys({ next, back, revealAll, toggleListen, exit: () => router.back() });

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
  const columnWidth = Math.min(width - 40, settings.fontSize * 34);
  const isFirstEver = pos.block === 0 && pos.revealed === 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Top bar: minimal, low-contrast chrome. */}
      <View style={styles.topBar}>
        <Button label="‹ Library" kind="ghost" onPress={() => router.back()} />
        <Text numberOfLines={1} style={[muted, styles.bookTitle]}>{book.title}</Text>
        <Button label={listening ? '■ Stop' : '▶ Listen'} kind="ghost" onPress={toggleListen} accessibilityHint="Reads and reveals sentences aloud" />
        <Button label="Aa" kind="ghost" onPress={() => router.push('/settings')} accessibilityHint="Reading settings" />
      </View>
      {settings.showBookProgress && (
        <View style={[styles.bookProgress, { backgroundColor: theme.placeholder }]} accessibilityLabel={`Book progress ${Math.round(((pos.block + 1) / book.blocks.length) * 100)} percent`}>
          <View style={{ height: 3, backgroundColor: theme.accent, width: `${((pos.block + 1) / book.blocks.length) * 100}%` }} />
        </View>
      )}

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
                  <Text style={[muted, { fontSize: settings.fontSize }]}>Nice work. Tap the left side to look back, or return to your library.</Text>
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, minHeight: 52 },
  bookTitle: { flex: 1, fontSize: 15, textAlign: 'center' },
  bookProgress: { height: 3, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
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
