import React, { useCallback, useRef, useState } from 'react';
import { View, SectionList, StyleSheet, RefreshControl, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import VideoCard from '../components/VideoCard';
import { youtubeService } from '../services/youtube';
import { storageService } from '../services/storage';
import { Video } from '../types/video';
import { HomeFeed, loadHomeFeed, unseenVideos } from '../utils/home-feed';
import { useSavedVideos } from '../hooks/use-saved-videos';
import BatchDownloadAction from '../components/BatchDownloadAction';

const initialFeed: HomeFeed = {
  personalized: [], popular: [], hasHistory: false,
  personalizedError: false, popularError: false,
};

export default function Home() {
  const router = useRouter();
  const saved = useSavedVideos();
  const [feed, setFeed] = useState(initialFeed);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const historySignature = useRef<string | null>(null);
  const watchedIds = useRef<string[]>([]);
  const feedRequest = useRef<AbortController | null>(null);
  const pageRequest = useRef<AbortController | null>(null);

  const reload = useCallback(async (force = false, refresh = false) => {
    feedRequest.current?.abort();
    pageRequest.current?.abort();
    pageRequest.current = null;
    setLoadingMore(false);
    const controller = new AbortController();
    feedRequest.current = controller;
    if (refresh) setRefreshing(true);
    try {
      const history = await storageService.getWatchHistory();
      if (controller.signal.aborted) return;
      const signature = JSON.stringify(history.map((video) => [video.id, video.title, video.channelId]));
      if (!force && signature === historySignature.current) return;
      setLoading(true);
      setPageError(false);
      const result = await loadHomeFeed(history, {
        related: (video, signal) => youtubeService.getRelatedVideos(video, signal),
        trending: (signal) => youtubeService.getTrending(undefined, signal),
      }, controller.signal);
      if (controller.signal.aborted) return;
      watchedIds.current = history.map((video) => video.id);
      historySignature.current = signature;
      setFeed(result);
      setHasLoaded(true);
    } finally {
      if (feedRequest.current === controller && !controller.signal.aborted) {
        feedRequest.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => {
      feedRequest.current?.abort();
      pageRequest.current?.abort();
    };
  }, [reload]));

  const loadMore = async () => {
    if (!feed.nextPageToken || loading || refreshing || pageRequest.current) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setPageError(false);
    try {
      const result = await youtubeService.getTrending(feed.nextPageToken, controller.signal);
      if (controller.signal.aborted) return;
      setFeed((previous) => ({
        ...previous,
        popular: [...previous.popular, ...unseenVideos(result.videos, [
          ...watchedIds.current,
          ...previous.personalized.map((video) => video.id),
          ...previous.popular.map((video) => video.id),
        ])],
        nextPageToken: result.nextPageToken,
      }));
    } catch {
      if (!controller.signal.aborted) setPageError(true);
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        setLoadingMore(false);
      }
    }
  };

  const retryFeed = () => { void saved.refresh(); void reload(true, true); };
  const sections: { key: string; title: string; description: string; data: Video[]; error: boolean }[] = [
    { key: 'saved', title: 'Vídeos salvos', description: 'Sua lista é recuperada automaticamente, sem login.', data: saved.items, error: saved.error },
    ...(feed.hasHistory ? [{
      key: 'personalized', title: 'Para você',
      description: 'Com base no que você assistiu neste app.',
      data: feed.personalized, error: feed.personalizedError,
    }] : []),
    {
      key: 'popular', title: 'Em alta',
      description: feed.hasHistory ? 'Vídeos populares no Brasil.' : 'Assista a alguns vídeos para receber sugestões para você.',
      data: feed.popular, error: feed.popularError,
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.offlineButton}
          onPress={() => router.push('/downloads')}
          accessibilityRole="button"
          accessibilityLabel="Abrir downloads offline"
        >
          <Ionicons name="cloud-download-outline" size={24} color="#FFFFFF" />
          <Text style={styles.offlineLabel}>Offline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/playlists')}
          accessibilityRole="button" accessibilityLabel="Abrir playlists">
          <Ionicons name="list-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/search')}
          accessibilityRole="button" accessibilityLabel="Pesquisar vídeos">
          <Ionicons name="search" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/favorites')}
          accessibilityRole="button" accessibilityLabel="Abrir favoritos">
          <Ionicons name="heart" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading && !hasLoaded && saved.loading && !saved.items.length ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#FFFFFF" accessibilityLabel="Carregando vídeos" />
          <Text style={styles.message}>Carregando vídeos...</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item, section }) => <View style={section.key === 'saved' ? styles.savedRow : undefined}><VideoCard video={item} compact={section.key === 'saved'} /></View>}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
              <Text style={styles.description}>{section.description}</Text>
              {section.key === 'saved' && saved.items.length > 0 && <BatchDownloadAction videos={saved.items} title="Vídeos salvos" />}
            </View>
          )}
          renderSectionFooter={({ section }) => section.data.length === 0 ? (
            <View style={styles.sectionEmpty}>
              {(section.key === 'saved' ? saved.loading : loading) ? <ActivityIndicator color="#FFFFFF" accessibilityLabel={`Carregando ${section.title}`} /> : <>
              <Text style={styles.message} accessibilityLiveRegion="polite">
                {section.error ? 'Não foi possível carregar estes vídeos. Verifique sua conexão.'
                  : section.key === 'saved' ? 'Salve um vídeo em uma playlist ou nos favoritos para encontrá-lo aqui.'
                  : section.key === 'personalized' ? 'Ainda não encontramos novas sugestões para o seu histórico.'
                    : 'Nenhum vídeo disponível no momento.'}
              </Text>
              {(section.key !== 'saved' || section.error) && <TouchableOpacity style={styles.retryButton} onPress={section.key === 'saved' ? () => { void saved.refresh(); } : retryFeed} disabled={section.key === 'saved' ? saved.loading : loading}
                accessibilityRole="button" accessibilityLabel={`Tentar novamente: ${section.title}`}>
                <Text style={styles.retryText}>{loading ? 'Atualizando...' : 'Tentar novamente'}</Text>
              </TouchableOpacity>}
              </>}
            </View>
          ) : null}
          refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={retryFeed} tintColor="#FF0000" />}
          onEndReached={() => { if (!pageError) void loadMore(); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator style={styles.footer} color="#FFFFFF" accessibilityLabel="Carregando mais vídeos" />
          ) : pageError ? (
            <View style={styles.sectionEmpty}>
              <Text style={styles.message}>Não foi possível carregar mais vídeos.</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => { void loadMore(); }} accessibilityRole="button">
                <Text style={styles.retryText}>Carregar mais vídeos</Text>
              </TouchableOpacity>
            </View>
          ) : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  savedRow: { paddingHorizontal: 16 },
  offlineButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginRight: 'auto' },
  offlineLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    padding: 16, gap: 16, borderBottomWidth: 1, borderBottomColor: '#303030',
  },
  iconButton: { padding: 12, minWidth: 48, minHeight: 48 },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16, gap: 6 },
  sectionTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  description: { color: '#AAAAAA', fontSize: 14, lineHeight: 21 },
  message: { color: '#AAAAAA', fontSize: 14, lineHeight: 21 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  sectionEmpty: { paddingHorizontal: 16, paddingBottom: 24, alignItems: 'flex-start', gap: 12 },
  retryButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: '#555555', borderRadius: 8 },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  footer: { padding: 24 },
});
