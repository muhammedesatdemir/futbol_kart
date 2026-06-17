// gesture-handler import'u uygulamanın EN ÜSTÜNDE olmalı (Reanimated/RNGH kuralı).
import 'react-native-gesture-handler';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeroScreen } from './src/screens/HeroScreen';
import { FxGalleryScreen } from './src/screens/FxGalleryScreen';

// FAZ 1-2 — tek ekran + geçici efekt galerisi. Gerçek navigasyon (expo-router)
// Faz 3'te eklenecek; şimdilik basit state toggle yeterli.
type Screen = 'hero' | 'fx';

export default function App() {
  const [screen, setScreen] = useState<Screen>('hero');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {screen === 'hero' ? (
          <HeroScreen
            onPlay={() => {
              // Faz 3'te ModeSelect ekranına gidecek.
            }}
            onHowTo={() => setScreen('fx')}
          />
        ) : (
          <FxGalleryScreen onBack={() => setScreen('hero')} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
