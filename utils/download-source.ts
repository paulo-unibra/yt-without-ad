import type { DownloadSource } from '../types/video';

export function appDownloadSource(backendUrl: string, videoId: string, data: {
  success?: boolean;
  contentType?: string;
  downloadPath?: string;
  fileSize?: number;
  mediaType?: string;
  container?: string;
  audioBitrate?: number;
}): DownloadSource {
  if (!/^[\w-]{11}$/.test(videoId) || !data.success || data.contentType !== 'progressive') {
    throw new Error('Este áudio não está disponível para baixar.');
  }
  const path = `/api/download/${videoId}?audioFormat=`;
  if (data.mediaType !== 'audio' || !['m4a', 'webm'].includes(data.container ?? '')
    || ![`${path}best`, `${path}m4a`].includes(data.downloadPath ?? '')) {
    throw new Error('Reinicie o backend atualizado com ./start-backend.sh para baixar áudio.');
  }
  return {
    url: `${backendUrl.replace(/\/+$/, '')}${data.downloadPath}`,
    contentType: 'progressive', mediaType: 'audio', container: data.container as 'm4a' | 'webm',
    audioBitrate: Number.isFinite(data.audioBitrate) && data.audioBitrate! > 0 ? data.audioBitrate : undefined,
    fileSize: Number.isSafeInteger(data.fileSize) && data.fileSize! > 0 ? data.fileSize : undefined,
  };
}
