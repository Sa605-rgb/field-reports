import { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RootStackParamList } from './src/navigation';
import { ComposeScreen } from './src/screens/ComposeScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LocalReportScreen } from './src/screens/LocalReportScreen';
import { ServerReportScreen } from './src/screens/ServerReportScreen';
import { getRunner, RunnerProvider } from './src/state/QueueContext';
import { colors } from './src/ui/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

function Gate() {
  useEffect(() => {
    const runner = getRunner();
    const unsubscribe = NetInfo.addEventListener(state => {
      runner.setOnline(state.isConnected !== false);
    });
    const appState = AppState.addEventListener('change', next => {
      if (next === 'active') {
        runner.kick();
        runner.refreshServer();
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.paper },
      }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Field reports' }} />
      <Stack.Screen name="Compose" component={ComposeScreen} options={{ title: 'New report' }} />
      <Stack.Screen name="LocalReport" component={LocalReportScreen} options={{ title: 'On this phone' }} />
      <Stack.Screen name="ServerReport" component={ServerReportScreen} options={{ title: 'On the server' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <RunnerProvider>
        <NavigationContainer>
          <Gate />
        </NavigationContainer>
      </RunnerProvider>
    </SafeAreaProvider>
  );
}
