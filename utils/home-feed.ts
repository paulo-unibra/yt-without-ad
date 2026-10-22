import type { SearchResult, Video } from '../types/video';
import { diversifyVideos } from './recommendations.ts';

interface HomeFeedSource {
  related(video: Video, signal?: AbortSignal): Promise<Video[]>;
  trending(signal?: AbortSignal): Promise<SearchResult>;
}

export interface HomeFeed {
  personalized: Video[];
  popular: Video[];
  nextPageToken?: string;
  hasHistory: boolean;
  personalizedError: boolean;
  popularError: boolean;
}

const validId = (id: string) => /^[\w-]{11}$/.test(id);
const channelKey = (video: Video) => video.channelId || video.channelTitle || video.id;

export function unseenVideos(videos: readonly Video[], excluded: readonly string[]): Video[] {
  const seen = new Set(excluded);
  return videos.filter((video) => {
    if (!validId(video.id) || seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  });
}

// O histórico é ordenado do acesso mais recente para o mais antigo.
export function selectHistorySeeds(history: readonly Video[]): Video[] {
  const recent = unseenVideos(history, []).slice(0, 50);
  if (!recent.length) return [];
  const channels = new Map<string, { video: Video; score: number }>();
  recent.forEach((video, index) => {
    const key = channelKey(video);
    const previous = channels.get(key);
    channels.set(key, {
      video: previous?.video ?? video,
      score: (previous?.score ?? 0) + 1 + (recent.length - index) / recent.length,
    });
  });
  const seeds = [recent[0]];
  // Equilibra o último interesse com os canais mais frequentes, sem buscar
  // vários títulos do mesmo canal a cada volta à página inicial.
  for (const { video } of [...channels.values()].sort((a, b) => b.score - a.score)) {
    if (seeds.every((seed) => channelKey(seed) !== channelKey(video))) seeds.push(video);
    if (seeds.length === 3) break;
  }
  return seeds;
}

export async function loadHomeFeed(history: readonly Video[], source: HomeFeedSource, signal?: AbortSignal): Promise<HomeFeed> {
  const seeds = selectHistorySeeds(history);
  const empty: HomeFeed = {
    personalized: [], popular: [], hasHistory: seeds.length > 0,
    personalizedError: false, popularError: false,
  };
  if (signal?.aborted) return empty;
  // Falhas de uma fonte não impedem a exibição das outras.
  const [popular, ...related] = await Promise.allSettled([
    source.trending(signal),
    ...seeds.map((seed) => source.related(seed, signal)),
  ]);
  if (signal?.aborted) return empty;
  const watched = history.map((video) => video.id);
  const groups = related.map((result) => result.status === 'fulfilled'
    ? unseenVideos(result.value as Video[], watched) : []);
  const candidates: Video[] = [];
  // Intercala os interesses para um único canal não ocupar toda a seção.
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index++) {
    groups.forEach((group) => { if (group[index]) candidates.push(group[index]); });
  }
  const personalized = diversifyVideos(unseenVideos(candidates, watched));
  const trending = popular.status === 'fulfilled' ? popular.value as SearchResult : null;
  return {
    personalized,
    popular: unseenVideos(trending?.videos ?? [], [...watched, ...personalized.map((video) => video.id)]),
    nextPageToken: trending?.nextPageToken,
    hasHistory: seeds.length > 0,
    personalizedError: !personalized.length && related.some((result) => result.status === 'rejected'),
    popularError: popular.status === 'rejected',
  };
}
