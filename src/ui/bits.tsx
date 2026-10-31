import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

export function BigButton({
  label,
  onPress,
  disabled,
  tone = 'ink',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'ink' | 'ghost';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'ghost' ? styles.ghost : styles.ink,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.label, tone === 'ghost' && styles.ghostLabel]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function EmptyLine({ children }: { children: string }) {
  return <Text style={styles.empty}>{children}</Text>;
}

export function ProgressBar({ value }: { value: number }) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%` as const;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ink: { backgroundColor: colors.ink },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  label: { color: colors.cream, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  ghostLabel: { color: colors.ink },
  section: {
    marginTop: 22,
    marginBottom: 8,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  track: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: { height: 8, backgroundColor: colors.move },
});
