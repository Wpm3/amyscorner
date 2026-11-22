import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ParagraphView } from '../components/ParagraphView';
import { Button, SectionTitle, Segmented, Stepper, Toggle } from '../components/ui';
import { useSettings } from '../store/settings';
import type { Block } from '../text/blocks';
import { segmentBlock } from '../text/paragraph';
import { FONT_LABELS, fontFamily, type FontChoice } from '../theme/fonts';
import { THEMES, type ThemeName } from '../theme/themes';

const PREVIEW: Block = {
  kind: 'paragraph',
  text: "Reading gets easier when there is less to look at. I think that, on a good day, it's good to be interesting, but it's better to be kind. The next sentence waits until you tap.",
};

export default function SettingsScreen() {
  const { settings, theme, update, reset } = useSettings();
  const insets = useSafeAreaInsets();
  const sentences = useMemo(() => segmentBlock(PREVIEW), []);
  const label = { color: theme.text, fontFamily: fontFamily(settings.font), fontSize: 17, marginBottom: 8 };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.border }]}>
        <Button label="‹ Done" kind="ghost" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={{ color: theme.text, fontFamily: fontFamily(settings.font, true), fontSize: 20 }}>Settings</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={[styles.preview, { backgroundColor: theme.background, borderColor: theme.border }]} accessibilityLabel="Preview of reading view">
          <ParagraphView block={PREVIEW} sentences={sentences} revealed={2} settings={settings} theme={theme} />
        </View>

        <SectionTitle>Look</SectionTitle>
        <Text style={label}>Theme</Text>
        <Segmented<ThemeName> label="Theme" value={settings.theme} onChange={(v) => update({ theme: v })}
          options={(Object.keys(THEMES) as ThemeName[]).map((k) => ({ value: k, label: THEMES[k].label }))} />
        <Text style={[label, styles.gap]}>Font</Text>
        <Segmented<FontChoice> label="Font" value={settings.font} onChange={(v) => update({ font: v })}
          options={(Object.keys(FONT_LABELS) as FontChoice[]).map((k) => ({ value: k, label: FONT_LABELS[k] }))} />
        <Text style={[label, styles.gap]}>Text size</Text>
        <Stepper label="Text size" value={settings.fontSize} step={1} min={14} max={36} onChange={(v) => update({ fontSize: v })} />
        <Text style={[label, styles.gap]}>Line spacing</Text>
        <Stepper label="Line spacing" value={settings.lineHeight} display={settings.lineHeight.toFixed(1)} step={0.1} min={1.3} max={2.4} onChange={(v) => update({ lineHeight: v })} />
        <Toggle label="Extra letter spacing" value={settings.extraSpacing} onChange={(v) => update({ extraSpacing: v })} hint="Wider gaps between letters can reduce crowding." />

        <SectionTitle>Revealing</SectionTitle>
        <Text style={label}>Text you haven’t reached yet</Text>
        <Segmented label="Unrevealed text" value={settings.unrevealed} onChange={(v) => update({ unrevealed: v })}
          options={[{ value: 'faded', label: 'Faint' }, { value: 'bars', label: 'Bars' }, { value: 'hidden', label: 'Blank' }]} />
        <Text style={[label, styles.gap]}>Sentences you’ve already read</Text>
        <Segmented label="Already read" value={settings.pastOpacity} onChange={(v) => update({ pastOpacity: v })}
          options={[{ value: 1, label: 'Full' }, { value: 0.65, label: 'Softer' }, { value: 0.45, label: 'Faint' }]} />
        <Toggle label="Highlight current sentence" value={settings.highlightCurrent} onChange={(v) => update({ highlightCurrent: v })} />
        <Toggle label="Show only the current sentence" value={settings.focusSentence} onChange={(v) => update({ focusSentence: v })}
          hint="Hides every other sentence. You can also use the eye button while reading." />
        <Toggle label="Reveal first sentence automatically" value={settings.autoRevealFirst} onChange={(v) => update({ autoRevealFirst: v })}
          hint="Off: each new paragraph starts fully hidden." />

        <Toggle label="Skip copyright, contents and back matter" value={settings.skipFrontBack} onChange={(v) => update({ skipFrontBack: v })}
          hint="Books open where the story starts and stop before the index or about-the-author pages. Use ☰ Contents to read skipped parts." />

        <SectionTitle>Sentence structure</SectionTitle>
        <Toggle
          label="Break sentences into clauses"
          value={settings.clauseMode !== 'off'}
          onChange={(v) => update({ clauseMode: v ? 'tint' : 'off' })}
          hint="Colours each part of the sentence you're reading. Interruptions like “on a good day” get their own colour, and the clause around them keeps one colour."
        />
        {settings.clauseMode !== 'off' && (
          <>
            <Text style={[label, styles.gap]}>Show clauses as</Text>
            <Segmented label="Show clauses as" value={settings.clauseMode} onChange={(v) => update({ clauseMode: v })}
              options={[{ value: 'tint', label: 'Colours' }, { value: 'cascade', label: 'One per line' }]} />
          </>
        )}
        <Toggle label="Bold word beginnings" value={settings.fixationBold} onChange={(v) => update({ fixationBold: v })}
          hint="Some people like it; research hasn’t shown a speed benefit." />

        <SectionTitle>Controls</SectionTitle>
        <Segmented label="Tapping" value={settings.tapLayout} onChange={(v) => update({ tapLayout: v })}
          options={[{ value: 'zones', label: 'Left = back, right = next' }, { value: 'anywhere', label: 'Tap anywhere = next' }]} />
        <Toggle label="Haptic feedback" value={settings.haptics} onChange={(v) => update({ haptics: v })} />

        <SectionTitle>Listening</SectionTitle>
        <Toggle label="Read each sentence aloud" value={settings.speakOnReveal} onChange={(v) => update({ speakOnReveal: v })}
          hint="Speaks every sentence as you reveal it." />
        <Text style={[label, styles.gap]}>Speech speed</Text>
        <Stepper label="Speech speed" value={settings.speechRate} display={`${settings.speechRate.toFixed(1)}×`} step={0.1} min={0.5} max={2} onChange={(v) => update({ speechRate: v })} />

        <SectionTitle>Focus & progress</SectionTitle>
        <Toggle label="Show sentence dots" value={settings.showSentenceCounter} onChange={(v) => update({ showSentenceCounter: v })} hint="How many sentences are in this paragraph." />
        <Text style={[label, styles.gap]}>Progress bars</Text>
        <Segmented label="Progress bars" value={settings.progressBars} onChange={(v) => update({ progressBars: v })}
          options={[{ value: 'both', label: 'Chapter + book' }, { value: 'document', label: 'Book only' }, { value: 'off', label: 'Off' }]} />
        <Text style={{ color: theme.muted, fontFamily: fontFamily(settings.font), fontSize: 14, marginTop: 8 }}>
          The chapter bar only appears when the document really has chapters.
        </Text>
        <Text style={[label, styles.gap]}>Break reminder</Text>
        <Segmented label="Break reminder" value={settings.breakReminderMinutes} onChange={(v) => update({ breakReminderMinutes: v })}
          options={[{ value: 0, label: 'Off' }, { value: 15, label: '15 min' }, { value: 25, label: '25 min' }, { value: 45, label: '45 min' }]} />

        <View style={{ marginTop: 32 }}>
          <Button label="Reset to defaults" onPress={reset} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  preview: { padding: 16, borderRadius: 14, borderWidth: 1 },
  gap: { marginTop: 18 },
});
