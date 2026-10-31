import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../ui/theme';

/** Local open frame. It is not a login, and it does not touch the queue. */
export function SplashScreen() {
  return (
    <View style={styles.page}>
      <Text style={styles.kicker}>FIELD REPORTS</Text>
      <Text style={styles.line}>Saved on this phone until the server accepts it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: colors.ink,
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    paddingBottom: 72,
  },
  kicker: { color: colors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 1.4 },
  line: { color: colors.cream, fontSize: 32, fontWeight: '700', marginTop: 12, lineHeight: 40 },
});
