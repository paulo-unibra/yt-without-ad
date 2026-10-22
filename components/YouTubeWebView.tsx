import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { createYouTubeEmbedHtml, parseYouTubePlaybackMessage } from '../utils/youtube-embed';

interface YouTubeWebViewProps {
  videoId: string;
  autoPlay?: boolean;
  onPlaybackEnd?: () => void;
  onPlaybackStart?: () => void;
}

export default function YouTubeWebView({ videoId, autoPlay = true, onPlaybackEnd, onPlaybackStart }: YouTubeWebViewProps) {
  const source = useMemo(() => ({ html: createYouTubeEmbedHtml(videoId, autoPlay) }), [videoId, autoPlay]);

  return (
    <View style={styles.container}>
      <WebView
        source={source}
        style={styles.webview}
        onMessage={({ nativeEvent }) => {
          const type = parseYouTubePlaybackMessage(nativeEvent.data, videoId);
          if (type === 'ended') onPlaybackEnd?.();
          else if (type === 'playing') onPlaybackStart?.();
        }}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
