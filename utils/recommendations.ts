import type { Video } from '../types/video';

interface SearchCriteria {
  q?: string;
  channelId?: string;
}

interface RecommendationSource {
  search(criteria: SearchCriteria): Promise<string[]>;
  category?(categoryId: string): Promise<string[]>;
  getDetails(ids: string[]): Promise<Video[]>;
}

export function buildRelatedQuery(video: Video): string {
  return video.title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(' ') || video.channelTitle;
}

export function getRelatedQueue(videos: Video[], currentId: string, playedIds: readonly string[]): Video[] {
  const excluded = new Set([currentId, ...playedIds]);
  return videos.filter((video) => {
    if (excluded.has(video.id)) return false;
    excluded.add(video.id);
    return true;
  });
}

function cleanQuery(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

const normalized = (value: string) => cleanQuery(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const genres = [
  'sertanejo', 'pagode', 'samba', 'forró', 'piseiro', 'gospel', 'funk', 'axé',
  'bossa nova', 'mpb', 'reggae', 'hip hop', 'rap', 'rock', 'jazz', 'blues',
  'classical', 'electronic', 'country', 'pop',
];

export function buildRelatedSearches(video: Video): SearchCriteria[] {
  const music = video.categoryId === '10' || /(?:VEVO| - Topic)$/i.test(video.channelTitle);
  const channel = cleanQuery(video.channelTitle.replace(/(?:\s*-\s*Topic|VEVO|\s*Official|\s*Oficial)$/i, ''));
  // O prefixo de "Artista - Música" é apenas uma heurística, restrita a música.
  const artist = music ? cleanQuery(video.title.split(/\s+[-–—]\s+/).length > 1
    ? video.title.split(/\s+[-–—]\s+/)[0] : channel) : '';
  const searches: SearchCriteria[] = [{ q: artist || buildRelatedQuery(video) }];
  const metadata = [...(video.tags ?? []), ...(video.topicCategories ?? []).map((topic) => topic.split('/').at(-1)?.replace(/_/g, ' ') ?? '')];
  const genre = music ? genres.find((name) => metadata.some((tag) =>
    (` ${normalized(tag)} `).includes(` ${normalized(name)} `))) : undefined;
  const topic = genre || metadata.map(cleanQuery).find((tag) => tag && !/^(music|entertainment|lifestyle)$/i.test(tag)
    && !video.title.toLowerCase().includes(tag.toLowerCase()) && tag.toLowerCase() !== artist.toLowerCase());
  if (topic) searches.push({ q: music ? `${topic} música` : topic });
  if (video.channelId) searches.push({ channelId: video.channelId });
  return searches;
}

// Dá espaço a outros canais antes de completar a lista com resultados repetidos.
export function diversifyVideos(videos: readonly Video[], limit = 12): Video[] {
  const counts = new Map<string, number>();
  const selected: Video[] = [];
  const deferred: Video[] = [];
  for (const video of videos) {
    const key = video.channelId || video.channelTitle || video.id;
    const count = counts.get(key) ?? 0;
    if (count >= 2) deferred.push(video);
    else { selected.push(video); counts.set(key, count + 1); }
  }
  return [...selected, ...deferred].slice(0, limit);
}

export async function findRelatedVideos(video: Video, source: RecommendationSource, signal?: AbortSignal): Promise<Video[]> {
  if (signal?.aborted) return [];
  const requests = buildRelatedSearches(video).map((criteria) => source.search(criteria));
  if (video.categoryId && source.category) requests.push(source.category(video.categoryId));
  const results = await Promise.allSettled(requests);
  if (signal?.aborted) return [];
  if (results.every((result) => result.status === 'rejected')) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  const groups = results.map((result) => result.status === 'fulfilled' ? result.value : []);
  const ids = new Set<string>();
  // Intercala artista/assunto, gênero, canal e descoberta na categoria.
  for (let index = 0; index < Math.max(0, ...groups.map((group) => group.length)); index++) {
    for (const group of groups) {
      const id = group[index];
      if (id && /^[\w-]{11}$/.test(id) && id !== video.id) ids.add(id);
    }
  }
  const orderedIds = [...ids].slice(0, 48);
  if (!orderedIds.length) {
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return [];
  }
  const details = await source.getDetails(orderedIds);
  if (signal?.aborted) return [];
  const byId = new Map(details.map((item) => [item.id, item]));
  return diversifyVideos(orderedIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []));
}

interface AutoplayOptions {
  currentId: string;
  endedVideoId: string | null;
  recommendationsFor: string;
  videos: Video[];
  playedIds: readonly string[];
  enabled: boolean;
  isFocused: boolean;
}

export function getAutoplayTarget(options: AutoplayOptions): Video | null {
  if (!options.enabled || !options.isFocused || options.endedVideoId !== options.currentId || options.recommendationsFor !== options.currentId) {
    return null;
  }
  return getRelatedQueue(options.videos, options.currentId, options.playedIds)[0] ?? null;
}
