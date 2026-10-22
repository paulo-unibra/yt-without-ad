import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, useWindowDimensions } from 'react-native';

export default function AppLoadingScreen({ onReady }: { onReady?: () => void }) {
  const { width } = useWindowDimensions();
  const logoWidth = Math.min(240, (width || 320) * 0.72);
  const [imageReady, setImageReady] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  useEffect(() => { if (imageReady && layoutReady) onReady?.(); }, [imageReady, layoutReady, onReady]);
  return <View style={styles.container} onLayout={() => setLayoutReady(true)} testID="app-loading-screen">
    <Image source={require('../assets/images/logo-yt.png')} style={{ width: logoWidth, height: logoWidth * 1043 / 1508 }} resizeMode="contain"
      accessibilityLabel="Logo YT Without Ads" onLoadEnd={() => setImageReady(true)} />
    <ActivityIndicator style={styles.indicator} size="small" color="#FFFFFF" accessibilityLabel="Carregando aplicativo" />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', top: '50%', marginTop: 120 },
});
