const VIDEO_FIELDS = ['id', 'title', 'description', 'thumbnail', 'channelTitle', 'channelId', 'publishedAt',
  'categoryId', 'tags', 'topicCategories', 'duration', 'viewCount', 'likeCount'];
function savedVideo(video) {
  return Object.fromEntries(VIDEO_FIELDS.filter(key => video[key] !== undefined).map(key => [key, video[key]]));
}
function mergeVideos(previous = [], incoming = []) {
  const videos = new Map(previous.map(video => [video.id, video]));
  for (const video of incoming) videos.set(video.id, video);
  return [...videos.values()];
}
function mergeDocument(key, previous = [], incoming = []) {
  if (key === 'playlists') {
    const playlists = new Map(previous.map(item => [item.id, item]));
    for (const item of incoming) {
      const old = playlists.get(item.id);
      playlists.set(item.id, { ...old, ...item, videos: mergeVideos(old?.videos, item.videos) });
    }
    return [...playlists.values()];
  }
  if (key === 'search_history') return [...new Set([...incoming, ...previous])].slice(0, 20);
  if (key === 'watch_history') return mergeVideos(incoming, previous.filter(item => !incoming.some(video => video.id === item.id))).slice(0, 50);
  return mergeVideos(previous, incoming);
}
function catalogVideos(key, value) {
  if (key === 'playlists') return value.flatMap(item => item.videos).map(savedVideo);
  return ['favorites', 'downloaded_videos', 'saved_videos'].includes(key) ? value.map(savedVideo) : [];
}
module.exports = { savedVideo, mergeVideos, mergeDocument, catalogVideos };
