import { DownloadQueue } from '../utils/download-queue';
import { downloadService } from './downloads';

export const downloadQueue = new DownloadQueue({
  getPlayable: id => downloadService.getPlayable(id),
  start: video => downloadService.start(video),
  cancel: id => downloadService.cancel(id),
});
