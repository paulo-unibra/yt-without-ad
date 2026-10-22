export interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  categoryId?: string;
  tags?: string[];
  topicCategories?: string[];
  duration?: string;
  viewCount?: string;
  likeCount?: string;
  url?: string;
}

export interface SearchResult {
  videos: Video[];
  nextPageToken?: string;
}

export interface VideoStream {
  url: string;
  contentType: 'progressive' | 'hls';
  headers?: Record<string, string>;
}

export interface DownloadSource extends VideoStream {
  mediaType: 'audio';
  container: 'm4a' | 'webm';
  audioBitrate?: number;
  fileSize?: number;
}

export interface DownloadedVideo extends Video {
  mediaType?: 'audio';
  container?: 'm4a' | 'webm';
  audioBitrate?: number;
  localUri: string;
  downloadedAt: string;
  fileSize: number;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  videos: Video[];
}
