import { authHeaders } from './auth';
import axios from "axios";
import { Platform } from "react-native";
import { YOUTUBE_API_BASE_URL, YOUTUBE_API_KEY } from "../constants/youtube";
import { SearchResult, Video, VideoStream, DownloadSource } from "../types/video";
import { getBackendUrl } from "../constants/backend";
import { findRelatedVideos } from "../utils/recommendations";
import { downloadErrorDetails, logDownload } from '../utils/download-diagnostics';
import { appDownloadSource } from "../utils/download-source";

export class YouTubeService {
  private apiKey: string;
  private baseUrl: string;
  private failedInstances: Set<string> = new Set();
  private lastCheckTime = 0;
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
  private relatedCache = new Map<string, { videos: Video[]; expiresAt: number }>();

  constructor() {
    this.apiKey = YOUTUBE_API_KEY;
    this.baseUrl = YOUTUBE_API_BASE_URL;
  }

  private resetFailedInstancesIfNeeded() {
    const now = Date.now();
    if (now - this.lastCheckTime > this.CHECK_INTERVAL) {
      this.failedInstances.clear();
      this.lastCheckTime = now;
    }
  }

  async search(query: string, pageToken?: string): Promise<SearchResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: "snippet",
          q: query,
          type: "video",
          maxResults: 20,
          pageToken,
          key: this.apiKey,
        },
      });

      const videoIds = response.data.items
        .map((item: any) => item.id.videoId)
        .join(",");
      const videosData = await this.getVideoDetails(videoIds);

      return {
        videos: videosData,
        nextPageToken: response.data.nextPageToken,
      };
    } catch (error) {
      console.error("Error searching videos:", error);
      throw error;
    }
  }

  async getTrending(pageToken?: string, signal?: AbortSignal): Promise<SearchResult> {
    const response = await axios.get(`${this.baseUrl}/videos`, {
      signal,
      timeout: 10000,
      params: {
        part: "snippet,contentDetails,statistics,topicDetails",
        chart: "mostPopular",
        regionCode: "BR",
        maxResults: 20,
        pageToken,
        key: this.apiKey,
      },
    });

    const videos: Video[] = response.data.items.map((item: any) => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.high.url,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      publishedAt: item.snippet.publishedAt,
      categoryId: item.snippet.categoryId,
      tags: item.snippet.tags,
      topicCategories: item.topicDetails?.topicCategories,
      duration: item.contentDetails?.duration,
      viewCount: item.statistics?.viewCount,
      likeCount: item.statistics?.likeCount,
    }));

    return {
      videos,
      nextPageToken: response.data.nextPageToken,
    };
  }

  async getVideoDetails(videoIds: string, signal?: AbortSignal): Promise<Video[]> {
    if (!videoIds) return [];
    try {
      const response = await axios.get(`${this.baseUrl}/videos`, {
        signal,
        timeout: 10000,
        params: {
          part: "snippet,contentDetails,statistics,topicDetails",
          id: videoIds,
          key: this.apiKey,
        },
      });

      return response.data.items.map((item: any) => ({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high.url,
        channelTitle: item.snippet.channelTitle,
        channelId: item.snippet.channelId,
        publishedAt: item.snippet.publishedAt,
        categoryId: item.snippet.categoryId,
        tags: item.snippet.tags,
        topicCategories: item.topicDetails?.topicCategories,
        duration: item.contentDetails?.duration,
        viewCount: item.statistics?.viewCount,
        likeCount: item.statistics?.likeCount,
      }));
    } catch (error) {
      console.error("Error getting video details:", error);
      throw error;
    }
  }

  async getRelatedVideos(video: Video, signal?: AbortSignal): Promise<Video[]> {
    if (signal?.aborted) return [];
    const cached = this.relatedCache.get(video.id);
    if (cached && cached.expiresAt > Date.now()) return cached.videos;

    // Histórico e favoritos antigos podem não conter os novos metadados.
    const seed = video.categoryId ? video : (await this.getVideoDetails(video.id, signal))[0] ?? video;
    const videos = await findRelatedVideos(seed, {
      search: async (criteria) => {
        const response = await axios.get(`${this.baseUrl}/search`, {
          signal,
          timeout: 10000,
          params: {
            part: "snippet",
            type: "video",
            maxResults: 12,
            order: "relevance",
            videoEmbeddable: "true",
            ...criteria,
            key: this.apiKey,
          },
        });
        return (response.data.items ?? []).map((item: { id: { videoId: string } }) => item.id.videoId);
      },
      category: async (categoryId) => {
        const { data } = await axios.get(`${this.baseUrl}/videos`, {
          signal, timeout: 10000,
          params: { part: "id", chart: "mostPopular", regionCode: "BR", videoCategoryId: categoryId, maxResults: 12, key: this.apiKey },
        });
        return (data.items ?? []).map((item: { id: string }) => item.id);
      },
      getDetails: (ids) => this.getVideoDetails(ids.join(","), signal),
    }, signal);

    if (!signal?.aborted) {
      if (this.relatedCache.size >= 20) {
        const firstId = this.relatedCache.keys().next().value;
        if (firstId) this.relatedCache.delete(firstId);
      }
      this.relatedCache.set(video.id, { videos, expiresAt: Date.now() + this.CHECK_INTERVAL });
    }
    return videos;
  }

  async getDownloadSource(videoId: string, signal: AbortSignal, downloadId?: string): Promise<DownloadSource> {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      logDownload('app', videoId, downloadId, 'backend_nao_configurado', {}, 'error');
      throw new Error('Configure o backend para baixar vídeos.');
    }
    logDownload('app', videoId, downloadId, 'solicitando_preparacao', { backendHost: new URL(backendUrl).host, audioFormat: Platform.OS === 'ios' ? 'm4a' : 'best', timeoutMs: 35000 });
    try {
      const { data } = await axios.get(`${backendUrl}/api/download-source/${videoId}`, { signal, timeout: 35000, headers: { ...authHeaders(), ...(downloadId ? { 'X-Download-Id': downloadId } : {}) }, params: { audioFormat: Platform.OS === 'ios' ? 'm4a' : 'best' } });
      logDownload('app', videoId, downloadId, 'preparacao_recebida', { success: data.success, container: data.container, audioBitrate: data.audioBitrate, fileSize: data.fileSize });
      const source = appDownloadSource(backendUrl, videoId, data);
      return { ...source, headers: { ...source.headers, ...authHeaders() } };
    } catch (error) {
      logDownload('app', videoId, downloadId, signal.aborted ? 'preparacao_cancelada' : 'preparacao_falhou', downloadErrorDetails(error), signal.aborted ? 'info' : 'error');
      if (signal.aborted) throw error;
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error;
        if (typeof message === 'string') throw new Error(message);
        throw new Error('Não foi possível preparar o download. Verifique a conexão e se o backend está rodando.');
      }
      throw error;
    }
  }

  async getVideoStream(videoId: string, signal?: AbortSignal): Promise<VideoStream | null> {
    const backendUrl = getBackendUrl();
    if (signal?.aborted) return null;

    if (backendUrl) {
      try {
        const response = await axios.get(`${backendUrl}/api/stream/${videoId}`, {
          headers: authHeaders(),
          // O backend limita a extração a 30s; 5s interrompia pedidos válidos.
          timeout: 35000,
          signal,
        });

        if (response.data.success && typeof response.data.url === "string") {
          console.log(`✅ Stream from ${backendUrl} (${response.data.quality})`);
          return {
            url: response.data.url,
            contentType: response.data.contentType === "hls" ? "hls" : "progressive",
            headers: response.data.headers,
          };
        }
        console.warn(`⚠️ Backend ${backendUrl}: resposta sem stream reproduzível`);
      } catch (error) {
        if (signal?.aborted || axios.isCancel(error)) return null;

        let reason = "erro inesperado";
        if (axios.isAxiosError(error)) {
          if (error.response) {
            const detail = error.response.data?.error;
            reason = `HTTP ${error.response.status}${typeof detail === "string" ? ` — ${detail.slice(0, 300)}` : ""}`;
          } else if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "")) {
            reason = "tempo limite de 35s excedido";
          } else {
            reason = `${error.code ?? "erro de rede"}. Verifique se ./start-backend.sh está rodando e se o dispositivo acessa ${backendUrl}/`;
          }
        }
        console.warn(`⚠️ Backend ${backendUrl}: ${reason}`);
      }
    } else {
      console.warn("⚠️ Backend não configurado. Defina EXPO_PUBLIC_BACKEND_URL em .env.local.");
    }

    // Fallback para Invidious
    this.resetFailedInstancesIfNeeded();

    // Instâncias públicas são apenas uma alternativa; podem estar indisponíveis.
    const allInstances = [
      "https://invidious.fdn.fr",
      "https://inv.riverside.rocks",
      "https://invidious.sethforprivacy.com",
      "https://invidious.projectsegfau.lt",
      "https://inv.bp.projectsegfau.lt",
      "https://y.com.sb",
      "https://invidious.nerdvpn.de",
      "https://inv.nadeko.net",
      "https://invidious.privacyredirect.com",
      "https://invidious.protokolla.fi",
      "https://yewtu.be",
      "https://invidious.io.lol",
      "https://invidious.flokinet.to",
      "https://inv.tux.pizza",
      "https://vid.puffyan.us",
      "https://invidious.slipfox.xyz",
    ];

    // Filtra instâncias que falharam recentemente
    const instancesToTry = allInstances.filter(
      (instance) => !this.failedInstances.has(instance),
    );

    // Se todas falharam, reseta e tenta novamente
    if (instancesToTry.length === 0) {
      this.failedInstances.clear();
      instancesToTry.push(...allInstances);
    }

    // Tenta até 3 instâncias aleatórias para distribuir carga
    const shuffled = [...instancesToTry].sort(() => Math.random() - 0.5);
    const instancesToCheck = shuffled.slice(0, 3);

    for (const instance of instancesToCheck) {
      if (signal?.aborted) return null;
      try {
        const response = await axios.get(
          `${instance}/api/v1/videos/${videoId}`,
          {
            timeout: 5000,
            signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            },
          },
        );

        // Busca formatos de vídeo com áudio incluído (formatStreams)
        const formatStreams = response.data.formatStreams || [];
        const legacyFormat =
          formatStreams.find(
            (f: any) => f.qualityLabel === "360p" || f.qualityLabel === "480p",
          ) ||
          formatStreams.find((f: any) => f.type?.includes("video/mp4")) ||
          formatStreams[0];

        if (legacyFormat?.url) {
          console.log(`✅ Stream URL obtained from ${instance}`);
          return {
            url: legacyFormat.url,
            contentType: legacyFormat.url.includes(".m3u8") ? "hls" : "progressive",
          };
        }

        // Formatos adaptivos separam áudio e vídeo e não servem a este player.
        this.failedInstances.add(instance);
        console.log(`⚠️ ${instance}: nenhum formato com áudio e vídeo`);
      } catch (error) {
        if (signal?.aborted || axios.isCancel(error)) return null;
        this.failedInstances.add(instance);
        console.log(`❌ ${instance} unavailable`);
      }
    }

    console.warn("⚠️ No direct stream available, using YouTube embed fallback");
    return null;
  }

  async getVideoStreamUrl(videoId: string): Promise<string> {
    return (await this.getVideoStream(videoId))?.url ?? "";
  }
}

export const youtubeService = new YouTubeService();
