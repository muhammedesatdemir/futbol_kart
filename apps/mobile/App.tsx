// gesture-handler import'u uygulamanın EN ÜSTÜNDE olmalı (Reanimated/RNGH kuralı).
import 'react-native-gesture-handler';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeroScreen } from './src/screens/HeroScreen';
import { GameScreen } from './src/screens/GameScreen';
import { GameSessionProvider } from './src/lib/GameSessionProvider';
import { useSessionStore } from './src/lib/stores';

// FAZ 3 — Offline VS Düello. Basit state toggle (expo-router Faz 5'te değerlendirilir).
type Screen = 'hero' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('hero');
  const init = useSessionStore((s) => s.init);

  const startGame = () => {
    // Yeni oturum: rastgele seed yerine sabit-ish (Math.random RN'de mevcut).
    const id = Math.random().toString(36).slice(2, 10);
    init(id, id); // gameId = seed (deterministik soru sırası bu seed'den)
    setScreen('game');
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GameSessionProvider>
          <StatusBar style="light" />
          {screen === 'hero' ? (
            <HeroScreen onPlay={startGame} />
          ) : (
            <GameScreen onExit={() => setScreen('hero')} />
          )}
        </GameSessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
