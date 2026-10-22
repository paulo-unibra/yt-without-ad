import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Switch,
  Animated,
  PanResponder,
  Keyboard,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlaybackSession } from '../contexts/playback-session';
import { shouldCaptureMiniPlayerDrag, shouldMinimizePlayer } from '../utils/mini-player-gesture';
import { Ionicons } from '@expo/vector-icons';
import VideoPlayer from './VideoPlayer';
import YouTubeWebView from './YouTubeWebView';
import VideoCard from './VideoCard';
import DownloadAction from './DownloadAction';
import SavePlaylistAction from './SavePlaylistAction';
import SearchBar from './SearchBar';
import SleepTimer from './SleepTimer';
import { useSleepTimer } from '../hooks/use-sleep-timer';
import { formatSleepTime } from '../utils/sleep-timer';
import { useDownloads } from '../hooks/use-downloads';
import { downloadService, offlineSupported } from '../services/downloads';
import { youtubeService } from '../services/youtube';
import { storageService } from '../services/storage';
import { Video, VideoStream } from '../types/video';
import { getRelatedQueue, getAutoplayTarget } from '../utils/recommendations';

interface RelatedState {
  videoId: string;
  videos: Video[];
  loading: boolean;
  error: boolean;
}

export default function PersistentPlayer({ id }: { id: string }) {
  const { minimized, minimize: minimizeSession, close: closeSession, play } = usePlaybackSession();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const [dragY] = useState(() => new Animated.Value(0));
  const scrollView = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!pathname.startsWith('/video/')) minimizeSession();
  }, [pathname, minimizeSession]);

  useEffect(() => {
    if (minimized) scrollView.current?.scrollTo({ y: 0, animated: false });
  }, [minimized]);

  const leaveVideoRoute = useCallback(() => {
    if (!pathname.startsWith('/video/')) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [pathname, router]);
  const minimize = useCallback(() => {
    dragY.setValue(0);
    minimizeSession();
    leaveVideoRoute();
  }, [dragY, minimizeSession, leaveVideoRoute]);
  const close = () => { closeSession(); leaveVideoRoute(); };
  const sleepTimer = useSleepTimer(close);
  const checkSleepTimer = sleepTimer.check;
  const restore = () => router.push({ pathname: '/video/[id]', params: { id } });
  const drag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => !minimized && shouldCaptureMiniPlayerDrag(gesture.dx, gesture.dy),
    onPanResponderMove: (_event, gesture) => dragY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (shouldMinimizePlayer(gesture.dy, gesture.vy)) minimize();
      else Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start(),
  }), [minimized, dragY, minimize]);
  const downloads = useDownloads();
  const [video, setVideo] = useState<Video | null>(null);
  const [stream, setStream] = useState<VideoStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [usingOffline, setUsingOffline] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [related, setRelated] = useState<RelatedState>({ videoId: '', videos: [], loading: false, error: false });
  const [autoNext, setAutoNext] = useState(true);
  const [endedVideoId, setEndedVideoId] = useState<string | null>(null);
  const [playedIds, setPlayedIds] = useState<string[]>([id]);
  const [relatedAttempt, setRelatedAttempt] = useState(0);
  const transition = useRef<string | null>(null);

  const playVideo = useCallback((videoId: string) => {
    if (videoId === id || transition.current) return;
    transition.current = videoId;
    setPlayedIds((previous) => [...new Set([...previous, id, videoId])]);
    setEndedVideoId(null);
    // Mantém a mesma tela e a preferência de reprodução, sem empilhar rotas.
    play(videoId);
    scrollView.current?.scrollTo({ y: 0, animated: false });
    if (!minimized) router.setParams({ id: videoId });
  }, [id, router, play, minimized]);

  const relatedVideos = related.videoId === id ? getRelatedQueue(related.videos, id, playedIds) : [];
  const nextVideo = getAutoplayTarget({
    currentId: id,
    endedVideoId,
    recommendationsFor: related.videoId,
    videos: related.videos,
    playedIds,
    enabled: autoNext,
    isFocused: true,
  });

  useEffect(() => {
    if (nextVideo && !checkSleepTimer()) playVideo(nextVideo.id);
  }, [nextVideo, playVideo, checkSleepTimer]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    transition.current = null;

    const loadVideoData = async () => {
      setLoading(true);
      setPlayedIds((previous) => [...new Set([...previous, id])]);
      setVideo(null);
      setStream(null);
      setIsFavorite(false);
      setLoadingStream(false);
      setUsingOffline(false);
      setLoadError(null);
      setEndedVideoId(null);

      try {
        const savedVideo = await downloadService.getPlayable(id);
        if (!active) return;
        if (savedVideo) {
          setVideo(savedVideo);
          setUsingOffline(true);
          setStream({ url: savedVideo.localUri, contentType: 'progressive' });
          const favorite = await storageService.isFavorite(id);
          if (!active) return;
          setIsFavorite(favorite);
          await storageService.addToWatchHistory(savedVideo);
          return;
        }

        const [videoData] = await youtubeService.getVideoDetails(id, controller.signal);
        if (!active || !videoData) return;
        setVideo(videoData);

        await storageService.addToWatchHistory(videoData);
        if (!active) return;

        const favorite = await storageService.isFavorite(id);
        if (!active) return;
        setIsFavorite(favorite);

        setLoadingStream(true);
        setLoading(false);
        const videoStream = await youtubeService.getVideoStream(id, controller.signal);
        if (!active) return;

        if (videoStream) {
          setStream(videoStream);
          console.log('✅ Using direct video stream');
        }
      } catch (error) {
        if (active) setLoadError('Não foi possível abrir este vídeo. Para ouvir sem internet, escolha um vídeo já baixado em Downloads.');
        if (!controller.signal.aborted) console.error('Error loading video:', error);
      } finally {
        if (active) {
          setLoadingStream(false);
          setLoading(false);
        }
      }
    };

    void loadVideoData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [id]);

  useEffect(() => {
    if (!video || video.id !== id) return;
    const currentVideo = video;
    let active = true;
    const controller = new AbortController();

    const loadRelated = async () => {
      setRelated({ videoId: currentVideo.id, videos: [], loading: true, error: false });
      try {
        const videos = usingOffline ? downloads.items : await youtubeService.getRelatedVideos(currentVideo, controller.signal);
        if (active) setRelated({ videoId: currentVideo.id, videos, loading: false, error: false });
      } catch {
        if (active) setRelated({ videoId: currentVideo.id, videos: [], loading: false, error: true });
      }
    };

    void loadRelated();
    return () => {
      active = false;
      controller.abort();
    };
  }, [video, id, relatedAttempt, usingOffline, downloads.items]);

  const handlePlaybackEnd = () => setEndedVideoId(id);
  const handlePlaybackStart = () => setEndedVideoId(null);

  const handleToggleFavorite = async () => {
    if (!video) return;

    try {
      if (isFavorite) {
        await storageService.removeFromFavorites(video.id);
        setIsFavorite(false);
      } else {
        await storageService.addToFavorites(video);
        setIsFavorite(true);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleOpenVideo = async () => {
    if (!video) return;
    const url = `https://www.youtube.com/watch?v=${video.id}`;
    await Linking.openURL(url);
  };

  const formatViews = (views?: string) => {
    if (!views) return '';
    const num = parseInt(views);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Animated.View style={[
      styles.container,
      minimized ? [styles.miniContainer, { bottom: insets.bottom }] : [styles.expandedContainer, { top: insets.top }],
      { transform: [{ translateY: dragY }] },
    ]}>
      <View style={[styles.playerHeader, minimized && styles.hidden]} {...drag.panHandlers}>
        <TouchableOpacity onPress={minimize} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Minimizar vídeo">
          <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          <Text style={styles.headerLabel}>Minimizar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={close} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Encerrar reprodução">
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={minimized ? styles.hidden : undefined}>
        <SearchBar onSearch={(query) => {
          Keyboard.dismiss();
          minimizeSession();
          router.replace({ pathname: '/search', params: { q: query } });
        }} />
      </View>
      <ScrollView ref={scrollView} style={[styles.scrollView, minimized && styles.miniMedia]} scrollEnabled={!minimized}>
        <View {...drag.panHandlers}>
          {loading || loadingStream ? (
            <View style={styles.thumbnailContainer}>
              <ActivityIndicator size={minimized ? 'small' : 'large'} color="#FF0000" />
            </View>
          ) : !video ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{loadError ?? 'Vídeo não encontrado'}</Text>
              <TouchableOpacity onPress={close} style={styles.backButton} accessibilityRole="button">
                <Text style={styles.backButtonText}>Voltar</Text>
              </TouchableOpacity>
            </View>
          ) : stream ? (
            <VideoPlayer
              key={`${id}:${stream.url}`}
              videoUri={stream.url}
              contentType={stream.contentType}
              headers={stream.headers}
              compact={minimized}
              audioOnly={usingOffline && 'mediaType' in video && video.mediaType === 'audio'}
              title={video.title}
              artist={video.channelTitle}
              autoPlay={true}
              onPlaybackEnd={handlePlaybackEnd}
              onPlaybackStart={handlePlaybackStart}
            />
          ) : (
            <YouTubeWebView
              key={id}
              videoId={id}
              autoPlay={true}
              onPlaybackEnd={handlePlaybackEnd}
              onPlaybackStart={handlePlaybackStart}
            />
          )}
        </View>
        {video && <View style={minimized ? styles.hidden : undefined}>
          {usingOffline && (
            <View style={styles.offlineStatus}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.offlineStatusText}>Reproduzindo do aparelho · Sem usar internet</Text>
            </View>
          )}

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{video.title}</Text>
          
            <View style={styles.statsContainer}>
              <Text style={styles.stats}>
                {video.viewCount ? `${formatViews(video.viewCount)} visualizações • ` : ''}{formatDate(video.publishedAt)}
              </Text>
            </View>
          </View>

          <SleepTimer {...sleepTimer} />
          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.actionButton} onPress={handleToggleFavorite}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorite ? '#FF0000' : '#FFFFFF'}
              />
              <Text style={styles.actionText}>
                {isFavorite ? 'Favorito' : 'Favoritar'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleOpenVideo}>
              <Ionicons name="play-circle-outline" size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>Assistir</Text>
            </TouchableOpacity>
            <SavePlaylistAction video={video} />
            <DownloadAction video={video} />
          </View>
          {!offlineSupported && <Text style={styles.downloadNotice}>Para baixar e ouvir offline, use o app Android ou iOS.</Text>}
          {downloads.jobs[id] && downloads.jobs[id].phase !== 'error' && <Text style={styles.downloadNotice}>Mantenha o app aberto até o download terminar.</Text>}
          {downloads.jobs[id]?.error && <Text style={styles.downloadNotice} accessibilityLiveRegion="polite">{downloads.jobs[id].error}</Text>}

          <View style={styles.channelContainer}>
            <View style={styles.channelInfo}>
              <Text style={styles.channelName}>{video.channelTitle}</Text>
            </View>
          </View>

          <View style={styles.relatedSection}>
            <View style={styles.autoplayRow}>
              <View style={styles.autoplayInfo}>
                <Text style={styles.autoplayTitle}>Reprodução automática</Text>
                <Text style={styles.autoplayDescription}>
                  {autoNext ? 'O primeiro da lista começa ao terminar.' : 'Escolha o próximo vídeo abaixo.'}
                </Text>
              </View>
              <Switch
                value={autoNext}
                onValueChange={setAutoNext}
                trackColor={{ false: '#505050', true: '#B91C1C' }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Reprodução automática do próximo vídeo"
              />
            </View>

            <Text style={styles.relatedTitle}>{usingOffline ? 'Mais downloads' : 'Vídeos relacionados'}</Text>
            {related.videoId !== id || related.loading ? (
              <View style={styles.relatedStatus}>
                <ActivityIndicator color="#FF0000" />
                <Text style={styles.relatedStatusText}>{usingOffline ? 'Abrindo biblioteca...' : 'Buscando sugestões...'}</Text>
              </View>
            ) : related.error ? (
              <View style={styles.relatedStatus}>
                <Text style={styles.relatedStatusText}>Não foi possível carregar as sugestões.</Text>
                <TouchableOpacity
                  onPress={() => setRelatedAttempt((attempt) => attempt + 1)}
                  style={styles.retryButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.descriptionToggleText}>Tentar novamente</Text>
                </TouchableOpacity>
              </View>
            ) : relatedVideos.length === 0 ? (
              <Text style={styles.relatedStatusText}>{usingOffline ? 'Você já ouviu todos os vídeos baixados desta sequência.' : 'Sem novas sugestões para este vídeo.'}</Text>
            ) : relatedVideos.map((relatedVideo) => (
              <VideoCard
                key={relatedVideo.id}
                video={usingOffline ? { ...relatedVideo, thumbnail: '' } : relatedVideo}
                compact
                onPress={() => playVideo(relatedVideo.id)}
              />
            ))}
          </View>
        </View>}
      </ScrollView>
      {minimized && <>
        <TouchableOpacity style={styles.miniInfo} onPress={restore} accessibilityRole="button" accessibilityLabel={`Reabrir ${video?.title ?? 'vídeo'}`}>
          <Text style={styles.miniTitle} numberOfLines={1}>{video?.title ?? (loading ? 'Carregando...' : 'Vídeo indisponível')}</Text>
          <View style={styles.miniSubtitle}>
            <Ionicons name="chevron-up" size={16} color="#AAAAAA" />
            <Text style={styles.miniChannel} numberOfLines={1}>{sleepTimer.active ? `Sono · ${formatSleepTime(sleepTimer.remaining)}` : video?.channelTitle || 'Abrir vídeo'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniClose} onPress={close} accessibilityRole="button" accessibilityLabel="Encerrar reprodução">
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  expandedContainer: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20 },
  miniContainer: { position: 'absolute', left: 0, right: 0, height: 72, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#505050', zIndex: 20 },
  hidden: { display: 'none' },
  playerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 48, backgroundColor: '#0F0F0F' },
  headerButton: { minWidth: 48, minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLabel: { color: '#FFFFFF', fontSize: 14 },
  miniMedia: { width: 112, height: 63, flexGrow: 0, flexShrink: 0, flexBasis: 112 },
  miniInfo: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 64, paddingHorizontal: 12, gap: 5 },
  miniTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  miniSubtitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniChannel: { flex: 1, color: '#AAAAAA', fontSize: 12 },
  miniClose: { minWidth: 48, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  offlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  offlineStatusText: { flex: 1, color: '#AAAAAA', fontSize: 12, lineHeight: 18 },
  downloadNotice: { color: '#AAAAAA', fontSize: 13, lineHeight: 20, paddingHorizontal: 16, paddingVertical: 12 },
  relatedSection: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#303030',
  },
  autoplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  autoplayInfo: {
    flex: 1,
  },
  autoplayTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  autoplayDescription: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  relatedTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  relatedStatus: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  relatedStatusText: {
    color: '#AAAAAA',
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  descriptionToggleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#0F0F0F',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    padding: 32,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#FF0000',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1F1F1F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#303030',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stats: {
    color: '#AAAAAA',
    fontSize: 14,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#303030',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  channelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#303030',
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
