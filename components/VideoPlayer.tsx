import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Platform } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import type { VideoStream } from '../types/video';
import PlaybackSeekBar from './PlaybackSeekBar';

function formatTime(time: number) {
  if (!Number.isFinite(time) || time <= 0) return '0:00';
  const total = Math.floor(time);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = (total % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

interface VideoPlayerProps {
  videoUri: string;
  contentType?: VideoStream['contentType'];
  headers?: VideoStream['headers'];
  onClose?: () => void;
  autoPlay?: boolean;
  onPlaybackEnd?: () => void;
  onPlaybackStart?: () => void;
  audioOnly?: boolean;
  compact?: boolean;
  title?: string;
  artist?: string;
}

export default function VideoPlayer({ videoUri, contentType = 'progressive', headers, onClose, autoPlay = true, onPlaybackEnd, onPlaybackStart, title, artist, audioOnly = false, compact = false }: VideoPlayerProps) {
  const videoView = useRef<VideoView>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openingFullscreen, setOpeningFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const player = useVideoPlayer({ uri: videoUri, contentType, headers, metadata: { title, artist } }, (player) => {
    player.timeUpdateEventInterval = 0.5;
    player.staysActiveInBackground = true;
    player.audioMixingMode = Platform.OS === 'android' ? 'duckOthers' : 'auto';
    player.showNowPlayingNotification = true;
  });
  // Pare a mídia antes de desmontar a view, inclusive ao trocar ou fechar a sessão.
  useLayoutEffect(() => () => { player.pause(); }, [player]);
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [mediaInfo, setMediaInfo] = useState({ duration: 0, isLive: false });
  const { duration, isLive } = mediaInfo;
  const [position, setPosition] = useState(0);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const scrub = useRef({ active: false, wasPlaying: false });
  // O evento nativo de pausa pode chegar depois do próximo gesto.
  const playbackIntent = useRef(autoPlay);
  const [showControls, setShowControls] = useState(true);
  const isLoading = status === 'idle' || status === 'loading';
  const hasError = status === 'error';
  const canSeek = duration > 0 && !isLive && !hasError && (status === 'readyToPlay' || scrubPosition !== null);
  const clampTime = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(duration, value)) : 0;
  const displayedTime = clampTime(scrubPosition ?? position);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!scrub.current.active) setPosition(currentTime);
    const length = player.duration;
    const live = player.isLive;
    const duration = Number.isFinite(length) && length > 0 ? length : 0;
    setMediaInfo((previous) => previous.duration === duration && previous.isLive === live ? previous : { duration, isLive: live });
  });
  useEventListener(player, 'sourceLoad', ({ duration: length }) => {
    setMediaInfo({ duration: Number.isFinite(length) && length > 0 ? length : 0, isLive: player.isLive });
  });

  useEventListener(player, 'playToEnd', () => {
    playbackIntent.current = false;
    setPosition(player.duration);
    setShowControls(true);
    onPlaybackEnd?.();
  });
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (!scrub.current.active) playbackIntent.current = isPlaying;
    if (isPlaying) onPlaybackStart?.();
  });

  useEffect(() => {
    playbackIntent.current = autoPlay;
    if (autoPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [autoPlay, player]);

  useEffect(() => {
    if (!compact && !audioOnly && showControls && isPlaying && !isLoading && scrubPosition === null) {
      const timer = setTimeout(() => {
        setShowControls(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [compact, audioOnly, showControls, isPlaying, isLoading, scrubPosition]);

  const handlePlayPause = () => {
    if (playbackIntent.current) {
      playbackIntent.current = false;
      player.pause();
    } else if (player.duration > 0 && player.currentTime >= player.duration) {
      playbackIntent.current = true;
      player.replay();
      setPosition(0);
    } else {
      playbackIntent.current = true;
      player.play();
    }
  };

  const handleSeek = (seconds: number) => {
    if (player.status !== 'readyToPlay') return;

    const position = player.currentTime;
    const endTime = player.duration > 0 ? player.duration : Infinity;
    const target = Math.max(0, Math.min(endTime, position + seconds));
    player.seekBy(target - player.currentTime);
    setPosition(target);
    setShowControls(true);
  };

  const startScrub = (value: number) => {
    if (!canSeek || scrub.current.active) return;
    scrub.current = { active: true, wasPlaying: playbackIntent.current };
    setScrubPosition(clampTime(value));
    setShowControls(true);
    player.pause();
  };

  const finishScrub = (value: number) => {
    if (!canSeek) return;
    const resume = scrub.current.active ? scrub.current.wasPlaying : playbackIntent.current;
    scrub.current.active = false;
    playbackIntent.current = resume;
    const target = clampTime(value);
    player.seekBy(target - player.currentTime);
    setPosition(target);
    setScrubPosition(null);
    if (resume) player.play();
    else player.pause();
  };

  const cancelScrub = () => {
    if (!scrub.current.active) return;
    const resume = scrub.current.wasPlaying;
    scrub.current.active = false;
    playbackIntent.current = resume;
    setScrubPosition(null);
    if (resume) player.play();
    else player.pause();
  };

  const toggleControls = () => {
    setShowControls((visible) => !visible);
  };

  const enterFullscreen = async () => {
    if (!videoView.current || audioOnly || openingFullscreen) return;
    setOpeningFullscreen(true);
    setFullscreenError(null);
    try {
      await videoView.current.enterFullscreen();
    } catch {
      setFullscreenError('Não foi possível abrir a tela cheia. Tente novamente.');
    } finally {
      setOpeningFullscreen(false);
    }
  };

  if (hasError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#FF0000" />
        <Text style={styles.errorText}>{audioOnly ? 'Erro ao carregar áudio' : 'Erro ao carregar vídeo'}</Text>
        <Text style={styles.errorSubtext}>
          Tente novamente ou abra no YouTube
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        {audioOnly && <View style={styles.audioArtwork} pointerEvents="none"><Ionicons name="musical-notes-outline" size={28} color="#AAAAAA" /></View>}
        <VideoView
          ref={videoView}
          surfaceType="textureView"
          player={player}
          style={audioOnly ? styles.audioEngine : styles.video}
          contentFit="contain"
          nativeControls={Platform.OS === 'web' && isFullscreen}
          fullscreenOptions={{ enable: !audioOnly, orientation: Platform.OS === 'android' ? 'landscape' : 'default', autoExitOnRotate: false }}
          onFullscreenEnter={() => setIsFullscreen(true)}
          onFullscreenExit={() => {
            setIsFullscreen(false);
            setShowControls(true);
            setPosition(player.currentTime);
          }}
        />

        {!audioOnly && !compact && <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={audioOnly ? undefined : toggleControls}
          accessibilityRole="button" accessibilityLabel={showControls ? 'Ocultar controles do vídeo' : 'Mostrar controles do vídeo'}
          accessibilityState={{ expanded: showControls }} />}

        {isLoading && (
          <View style={styles.loadingContainer} pointerEvents="none">
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.loadingText}>{audioOnly ? 'Carregando áudio...' : 'Carregando vídeo...'}</Text>
          </View>
        )}

        {compact && !isLoading && <TouchableOpacity
          style={styles.miniPlayback}
          onPress={handlePlayPause}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pausar mini player' : 'Reproduzir mini player'}
        ><Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#FFFFFF" /></TouchableOpacity>}
        {!compact && showControls && !isLoading && (
          <View style={styles.controlsOverlay} pointerEvents="box-none">
            {onClose && (
              <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar player">
                <Ionicons name="close" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            <View style={styles.centerControls} pointerEvents="box-none">
              <TouchableOpacity onPress={() => handleSeek(-10)} style={styles.controlButton} disabled={!canSeek || scrubPosition !== null}
                accessibilityRole="button" accessibilityLabel="Voltar 10 segundos">
                <Ionicons name="play-back" size={40} color={canSeek ? '#FFFFFF' : '#777777'} />
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePlayPause} style={styles.controlButton} disabled={scrubPosition !== null}
                accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pausar' : 'Reproduzir'}>
                <Ionicons 
                  name={isPlaying ? 'pause' : 'play'} 
                  size={50} 
                  color="#FFFFFF" 
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleSeek(10)} style={styles.controlButton} disabled={!canSeek || scrubPosition !== null}
                accessibilityRole="button" accessibilityLabel="Avançar 10 segundos">
                <Ionicons name="play-forward" size={40} color={canSeek ? '#FFFFFF' : '#777777'} />
              </TouchableOpacity>
            </View>

          </View>
        )}
      </View>
      <View style={[styles.timeline, compact && styles.hidden]}>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(displayedTime)}</Text>
          <View style={styles.timeActions}>
            <Text style={styles.timeText}>{isLive ? 'Ao vivo' : duration ? formatTime(duration) : '--:--'}</Text>
            {!audioOnly && (
              <TouchableOpacity
                style={styles.fullscreenButton}
                onPress={() => { void enterFullscreen(); }}
                disabled={isLoading || openingFullscreen}
                accessibilityRole="button"
                accessibilityLabel="Expandir vídeo para tela cheia"
                accessibilityState={{ disabled: isLoading || openingFullscreen }}
              >
                <Ionicons name="expand-outline" size={24} color={isLoading || openingFullscreen ? '#777777' : '#FFFFFF'} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {fullscreenError && <Text style={styles.fullscreenError} accessibilityLiveRegion="polite">{fullscreenError}</Text>}
        <PlaybackSeekBar
          value={displayedTime}
          duration={duration}
          disabled={!canSeek}
          valueText={`${formatTime(displayedTime)} de ${duration ? formatTime(duration) : 'duração indisponível'}`}
          onStart={startScrub}
          onChange={(value) => {
            if (scrub.current.active) setScrubPosition(clampTime(value));
            else finishScrub(value);
          }}
          onComplete={finishScrub}
          onCancel={cancelScrub}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  miniPlayback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  container: {
    backgroundColor: '#000000',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioEngine: { width: 1, height: 1, position: 'absolute' },
  audioArtwork: { position: 'absolute', left: 24, top: 20 },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'space-between',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    zIndex: 10,
    minWidth: 48,
    minHeight: 48,
  },
  centerControls: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  controlButton: {
    padding: 16,
  },
  timeline: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#0F0F0F' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  timeActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fullscreenButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  fullscreenError: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  timeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
