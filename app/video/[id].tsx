import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePlaybackSession } from '../../contexts/playback-session';

// A rota abre a sessão; o player permanece montado no layout raiz ao navegar.
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { open } = usePlaybackSession();
  useEffect(() => { open(id); }, [id, open]);
  return <View style={{ flex: 1, backgroundColor: '#0F0F0F' }} />;
}
