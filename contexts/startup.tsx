import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import AppLoadingScreen from '../components/AppLoadingScreen';

const StartupContext = createContext<() => void>(() => undefined);
const hideNativeSplash = () => { void SplashScreen.hideAsync().catch(() => undefined); };

export function StartupProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const complete = useCallback(() => setLoading(false), []);
  useEffect(() => {
    if (!loading) { hideNativeSplash(); return; }
    // Uma falha inesperada de inicialização não deve bloquear a navegação.
    const timeout = setTimeout(complete, 15000);
    return () => clearTimeout(timeout);
  }, [loading, complete]);
  return <StartupContext.Provider value={complete}>
    <View style={styles.container}>
      <View style={styles.container} pointerEvents={loading ? 'none' : 'auto'}
        {...(Platform.OS === 'web' ? { inert: loading } : {})}
        aria-hidden={loading}
        accessibilityElementsHidden={loading} importantForAccessibility={loading ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {loading && <View style={styles.overlay} accessibilityViewIsModal testID="app-startup-overlay">
        <AppLoadingScreen onReady={hideNativeSplash} />
      </View>}
    </View>
  </StartupContext.Provider>;
}

export const useCompleteStartup = () => useContext(StartupContext);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10000, backgroundColor: '#0F0F0F' },
});
