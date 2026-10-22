export function parseYouTubePlaybackMessage(message: string, videoId: string): 'ended' | 'playing' | null {
  try {
    const data = JSON.parse(message);
    if (data?.videoId !== videoId) return null;
    return data.type === 'ended' || data.type === 'playing' ? data.type : null;
  } catch {
    return null;
  }
}

export function createYouTubeEmbedHtml(videoId: string, autoPlay: boolean): string {
  const encodedId = JSON.stringify(videoId).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { margin: 0; padding: 0; overflow: hidden; }
          body { background-color: #000; }
          #player { position: absolute; inset: 0; width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="player"></div>
        <script>
          var videoId = ${encodedId};
          var ended = false;
          var tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          var firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

          function postPlaybackEvent(type) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, videoId: videoId }));
            }
          }

          function onYouTubeIframeAPIReady() {
            new YT.Player('player', {
              videoId: videoId,
              playerVars: { playsinline: 1, autoplay: ${autoPlay ? 1 : 0}, controls: 1, rel: 0, fs: 1 },
              events: {
                onReady: function(event) {
                  if (${autoPlay}) event.target.playVideo();
                },
                onStateChange: function(event) {
                  if (event.data === YT.PlayerState.PLAYING) {
                    ended = false;
                    postPlaybackEvent('playing');
                  } else if (event.data === YT.PlayerState.ENDED && !ended) {
                    ended = true;
                    postPlaybackEvent('ended');
                  }
                }
              }
            });
          }
        </script>
      </body>
    </html>`;
}
