// gesture-handler import'u uygulamanın EN ÜSTÜNDE olmalı (Reanimated/RNGH kuralı).
import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeroScreen } from './src/screens/HeroScreen';

// FAZ 1 — "his" prototipi. Şimdilik tek ekran: HeroScreen. Navigasyon (expo-router)
// Faz 3'te eklenecek; şu an amaç native oyun hissini tek ekranda kanıtlamak.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <HeroScreen
          onPlay={() => {
            // Faz 3'te ModeSelect ekranına gidecek.
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
