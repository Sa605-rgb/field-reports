import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { statusLine } from '../engine/status';
import type { LocalReport } from '../engine/types';
import { useRunner, useRunnerState } from '../state/QueueContext';
import type { RootStackParamList } from '../navigation';
import { BigButton, EmptyLine, SectionTitle } from '../ui/bits';
import { Composer } from './ComposeScreen';
import { FaultPanel } from '../ui/FaultPanel';
import { colors, toneColor } from '../ui/theme';
import { useNow } from '../ui/useNow';

type Panel = 'new' | 'phone' | 'server';

function clock(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Dock({ panel, pulse, onChange }: { panel: Panel; pulse: number; onChange: (next: Panel) => void }) {
  const lift = useRef(new Animated.Value(18)).current;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 8 }).start();
  }, [lift]);
  useEffect(() => {
    if (pulse === 0) {
      return;
    }
    pop.setValue(0.86);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [pop, pulse]);

  const items: { id: Panel; label: string }[] = [
    { id: 'new', label: 'New' },
    { id: 'phone', label: 'On this phone' },
    { id: 'server', label: 'On the server' },
  ];

  return (
    <Animated.View style={[styles.dock, { transform: [{ translateY: lift }] }]}>
      {items.map(item => {
        const on = panel === item.id;
        const button = (
          <Pressable accessibilityRole="button" onPress={() => onChange(item.id)} style={[styles.dockItem, on && styles.dockOn]}>
            <Text style={[styles.dockLabel, on && styles.dockLabelOn]}>{item.label}</Text>
          </Pressable>
        );
        if (item.id !== 'phone') {
          return <View key={item.id} style={styles.dockSlot}>{button}</View>;
        }
        return (
          <Animated.View key={item.id} style={[styles.dockSlot, { transform: [{ scale: pop }] }]}>
            {button}
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const runner = useRunner();
  const state = useRunnerState();
  const [resetting, setResetting] = useState(false);
  const [panel, setPanel] = useState<Panel>('new');
  const [pulse, setPulse] = useState(0);
  const now = useNow();
  const waiting = state.reports.filter(report => report.status !== 'uploaded').length;
  const serverLine = !state.serverLoadedAt
    ? state.refreshing
      ? 'Asking the server…'
      : state.serverError ?? 'Server list not loaded yet.'
    : state.serverError
      ? `${state.serverError} Last copy at ${clock(state.serverLoadedAt)}.`
      : `${state.serverReports.length} fetched from the server.`;

  function confirmReset() {
    Alert.alert(
      'Clear this phone?',
      'This removes reports saved on this phone, including ones still waiting to upload. Reports already on the server stay there.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear this phone',
          style: 'destructive',
          onPress: () => {
            setResetting(true);
            runner.resetPhone().finally(() => setResetting(false));
          },
        },
      ],
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>{state.online ? 'CONNECTED' : 'NO SIGNAL'}</Text>
          <Text style={styles.headline}>{waiting === 0 ? 'All clear' : `${waiting} still on this phone`}</Text>
          <Text style={styles.serverLine}>{serverLine}</Text>
        </View>
        {state.readError ? <Text style={styles.error}>{state.readError}</Text> : null}
        {panel === 'new' ? (
          <>
            <Composer
              embedded
              onSaved={() => {
                setPanel('phone');
                setPulse(value => value + 1);
              }}
            />
            <FaultPanel />
          </>
        ) : null}
        {panel === 'phone' ? (
          <>
            <SectionTitle>ON THIS PHONE</SectionTitle>
            {state.reports.length === 0 ? (
              <EmptyLine>Nothing saved on this phone yet.</EmptyLine>
            ) : (
              state.reports.map(report => (
                <PhoneCard key={report.id} report={report} online={state.online} now={now} onPress={() => navigation.navigate('LocalReport', { id: report.id })} />
              ))
            )}
            <View style={styles.resetWrap}>
              <BigButton label={resetting ? 'Clearing…' : 'Clear this phone'} tone="ghost" disabled={resetting} onPress={confirmReset} />
              <Text style={styles.hint}>This deletes the queue on the phone. Reports already on the server stay there.</Text>
            </View>
          </>
        ) : null}
        {panel === 'server' ? (
          <>
            <SectionTitle>ON THE SERVER</SectionTitle>
            <Text style={styles.hint}>Fetched from the server. This is not the phone list.</Text>
            <BigButton label={state.refreshing ? 'Refreshing…' : 'Refresh server list'} tone="ghost" disabled={state.refreshing} onPress={() => runner.refreshServer()} />
            {state.serverReports.length === 0 ? (
              <EmptyLine>
                {state.serverError && !state.serverLoadedAt
                  ? 'The server list is empty because it could not be loaded.'
                  : 'Nothing here yet. A saved report stays on this phone until the server accepts it.'}
              </EmptyLine>
            ) : (
              [...state.serverReports]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map(report => (
                  <Pressable key={report.id} style={styles.card} onPress={() => navigation.navigate('ServerReport', { id: report.id })}>
                    <Text style={styles.cardTitle}>{report.description}</Text>
                    <Text style={styles.cardDetail}>
                      {report.complete
                        ? `All ${report.images.length} photos arrived.`
                        : `${report.images.filter(image => image.stored).length} of ${report.images.length} photos arrived.`}
                    </Text>
                    <View style={styles.thumbs}>
                      {report.images
                        .filter(image => image.stored)
                        .slice(0, 4)
                        .map(image => (
                          <Image key={image.id} source={{ uri: image.url }} style={styles.thumb} />
                        ))}
                    </View>
                  </Pressable>
                ))
            )}
          </>
        ) : null}
      </ScrollView>
      <Dock panel={panel} pulse={pulse} onChange={setPanel} />
    </View>
  );
}

function PhoneCard({
  report,
  online,
  now,
  onPress,
}: {
  report: LocalReport;
  online: boolean;
  now: number;
  onPress: () => void;
}) {
  const line = statusLine(report, online, now);
  const tone = toneColor[line.tone];
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pillText, { color: tone.fg }]}>{line.title}</Text>
      </View>
      <Text style={styles.cardTitle}>{report.description}</Text>
      <Text style={styles.cardDetail}>{line.detail}</Text>
      <View style={styles.thumbs}>
        {report.images.slice(0, 4).map(image => (
          <Image key={image.id} source={{ uri: image.fileUri }} style={styles.thumb} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { padding: 20, paddingBottom: 28 },
  dock: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  dockSlot: { flex: 1 },
  dockItem: { width: '100%', minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dockOn: { backgroundColor: colors.ink },
  dockLabel: { color: colors.ink, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  dockLabelOn: { color: colors.cream },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  kicker: { color: colors.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  headline: { color: colors.cream, fontSize: 30, fontWeight: '700', marginTop: 8, letterSpacing: -0.4, lineHeight: 36 },
  serverLine: { color: colors.cream, marginTop: 8, fontSize: 15, lineHeight: 22 },
  error: { color: colors.stop, marginBottom: 12 },
  hint: { color: colors.muted, marginBottom: 10, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginTop: 10,
  },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontWeight: '700', fontSize: 13 },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', marginTop: 8 },
  cardDetail: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  thumbs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.line },
  resetWrap: { marginTop: 16 },
});
