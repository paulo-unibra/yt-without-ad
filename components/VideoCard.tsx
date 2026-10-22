import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Video } from '../types/video';
import { Ionicons } from '@expo/vector-icons';

interface VideoCardProps {
  video: Video;
  compact?: boolean;
  onPress?: () => void;
}

export default function VideoCard({ video, compact = false, onPress }: VideoCardProps) {
  const router = useRouter();

  const formatViews = (views?: string) => {
    if (!views) return '';
    const num = parseInt(views);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M visualizações`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K visualizações`;
    return `${num} visualizações`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'agora';
    if (diffInSeconds < 3600) return `há ${Math.floor(diffInSeconds / 60)} minutos`;
    if (diffInSeconds < 86400) return `há ${Math.floor(diffInSeconds / 3600)} horas`;
    if (diffInSeconds < 2592000) return `há ${Math.floor(diffInSeconds / 86400)} dias`;
    if (diffInSeconds < 31536000) return `há ${Math.floor(diffInSeconds / 2592000)} meses`;
    return `há ${Math.floor(diffInSeconds / 31536000)} anos`;
  };

  const handlePress = () => {
    if (onPress) onPress();
    else router.push(`/video/${video.id}`);
  };

  return (
    <TouchableOpacity
      style={[styles.container, compact && styles.compactContainer]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Reproduzir ${video.title}`}
    >
      {video.thumbnail ? (
        <Image source={{ uri: video.thumbnail }} style={[styles.thumbnail, compact && styles.compactThumbnail]} />
      ) : (
        <View style={[styles.thumbnail, compact && styles.compactThumbnail, styles.placeholder]}>
          <Ionicons name="videocam-outline" size={32} color="#AAAAAA" />
        </View>
      )}
      <View style={[styles.infoContainer, compact && styles.compactInfo]}>
        <Text style={[styles.title, compact && styles.compactTitle]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={styles.channel} numberOfLines={1}>
          {video.channelTitle}
        </Text>
        <Text style={styles.metadata} numberOfLines={1}>
          {formatViews(video.viewCount)} • {formatDate(video.publishedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  compactContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  compactThumbnail: {
    width: '40%',
    maxWidth: 160,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  compactInfo: {
    flex: 1,
    minWidth: 0,
    padding: 0,
  },
  compactTitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  container: {
    backgroundColor: '#0F0F0F',
    marginBottom: 16,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1F1F1F',
  },
  infoContainer: {
    padding: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  channel: {
    color: '#AAAAAA',
    fontSize: 14,
    marginBottom: 4,
  },
  metadata: {
    color: '#AAAAAA',
    fontSize: 12,
  },
});
