import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaybackSessionProvider, usePlaybackSession } from '../contexts/playback-session';
import PersistentPlayer from '../components/PersistentPlayer';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { migrateSavedLibrary } from '../services/database';

export default function RootLayout() {
  useEffect(() => { void migrateSavedLibrary(); }, []);
  return <SafeAreaProvider><PlaybackSessionProvider><RootNavigation /></PlaybackSessionProvider></SafeAreaProvider>;
}

function RootNavigation() {
  const session = usePlaybackSession();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: '#0F0F0F' }}>
      <View style={{ flex: 1, paddingBottom: session.id && session.minimized ? 72 + insets.bottom : 0 }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: '#0F0F0F',
            },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: '#0F0F0F',
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: 'YT Without Ads',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="search"
            options={{
              title: 'Pesquisar',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="favorites"
            options={{
              title: 'Favoritos',
              headerShown: true,
            }}
          />
          <Stack.Screen name="playlists" options={{ title: 'Playlists', headerShown: true }} />
          <Stack.Screen name="downloads" options={{ title: 'Downloads', headerShown: true }} />
          <Stack.Screen
            name="video/[id]"
            options={{
              title: '',
              headerShown: false,
              animation: 'none',
            }}
          />
        </Stack>
      </View>
      {session.id && <PersistentPlayer id={session.id} />}
    </View>
  );
}
