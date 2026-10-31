import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { statusLine } from '../engine/status';
import type { LocalReport } from '../engine/types';
import { useRunner, useRunnerState } from '../state/QueueContext';
import type { RootStackParamList } from '../navigation';
import { BigButton, EmptyLine, SectionTitle } from '../ui/bits';
import { FaultPanel } from '../ui/FaultPanel';
import { colors, toneColor } from '../ui/theme';
import { useNow } from '../ui/useNow';

function clock(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const runner = useRunner();
  const state = useRunnerState();
  const [resetting, setResetting] = useState(false);
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
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{state.online ? 'CONNECTED' : 'NO SIGNAL'}</Text>
        <Text style={styles.headline}>{waiting === 0 ? 'Nothing is waiting' : `${waiting} waiting on this phone`}</Text>
        <Text style={styles.serverLine}>{serverLine}</Text>
      </View>
      {state.readError ? <Text style={styles.error}>{state.readError}</Text> : null}
      <BigButton label="New report" onPress={() => navigation.navigate('Compose')} />
      <SectionTitle>ON THIS PHONE</SectionTitle>
      {state.reports.length === 0 ? (
        <EmptyLine>Nothing is saved on this phone.</EmptyLine>
      ) : (
        state.reports.map(report => (
          <PhoneCard key={report.id} report={report} online={state.online} now={now} onPress={() => navigation.navigate('LocalReport', { id: report.id })} />
        ))
      )}
      <SectionTitle>ON THE SERVER</SectionTitle>
      <Text style={styles.hint}>Fetched from the server. This is not the phone queue. Pull is the refresh button below.</Text>
      <BigButton label={state.refreshing ? 'Refreshing…' : 'Refresh server list'} tone="ghost" disabled={state.refreshing} onPress={() => runner.refreshServer()} />
      {state.serverReports.length === 0 ? (
        <EmptyLine>
          {state.serverError && !state.serverLoadedAt
            ? 'The server list is empty because it could not be loaded.'
            : 'The server has no reports. A report you just saved is still only on this phone until the upload finishes.'}
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
            </Pressable>
          ))
      )}
      <FaultPanel />
      <View style={styles.resetWrap}>
        <BigButton label={resetting ? 'Clearing…' : 'Clear this phone'} tone="ghost" disabled={resetting} onPress={confirmReset} />
      </View>
    </ScrollView>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40 },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  kicker: { color: '#D9C7A2', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  headline: { color: '#FFFDF8', fontSize: 28, fontWeight: '700', marginTop: 8 },
  serverLine: { color: '#E7E1D6', marginTop: 8, fontSize: 15, lineHeight: 21 },
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
  resetWrap: { marginTop: 16 },
});
