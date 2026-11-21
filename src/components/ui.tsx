import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSettings } from '../store/settings';
import { fontFamily } from '../theme/fonts';

/** Large-target button (≥48dp) using the current theme. */
export function Button({
  label,
  onPress,
  kind = 'secondary',
  accessibilityHint,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost';
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { theme, settings } = useSettings();
  const bg = kind === 'primary' ? theme.accent : kind === 'secondary' ? theme.surface : 'transparent';
  const fg = kind === 'primary' ? theme.background : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: theme.border, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
        kind === 'ghost' && { borderWidth: 0 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg, fontFamily: fontFamily(settings.font, true) }]}>{label}</Text>
    </Pressable>
  );
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const { theme, settings } = useSettings();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label}: ${o.label}`}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.highlight : theme.surface },
            ]}
          >
            <Text style={{ color: theme.text, fontFamily: fontFamily(settings.font, selected), fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − value + control for numeric settings. */
export function Stepper({
  label,
  value,
  display,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  display?: string;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  const { theme, settings } = useSettings();
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: display ?? String(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? step : -step)))}
    >
      <StepButton label="−" onPress={() => onChange(clamp(value - step))} disabled={value <= min} />
      <Text style={[styles.stepValue, { color: theme.text, fontFamily: fontFamily(settings.font, true) }]}>{display ?? value}</Text>
      <StepButton label="+" onPress={() => onChange(clamp(value + step))} disabled={value >= max} />
    </View>
  );
}

function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  const { theme } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      importantForAccessibility="no"
      style={[styles.stepButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: disabled ? 0.4 : 1 }]}
    >
      <Text style={{ color: theme.text, fontSize: 24, lineHeight: 28 }}>{label}</Text>
    </Pressable>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const { theme, settings } = useSettings();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityHint={hint}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: theme.text, fontSize: 17, fontFamily: fontFamily(settings.font) }}>{label}</Text>
        {hint ? <Text style={{ color: theme.muted, fontSize: 14, marginTop: 2, fontFamily: fontFamily(settings.font) }}>{hint}</Text> : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? theme.accent : theme.placeholder }]}>
        <View style={[styles.thumb, { backgroundColor: theme.background, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { theme, settings } = useSettings();
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: theme.muted, fontFamily: fontFamily(settings.font, true) }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17 },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 17, minWidth: 64, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 6 },
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  thumb: { width: 24, height: 24, borderRadius: 12 },
  section: { fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', marginTop: 28, marginBottom: 10 },
});
