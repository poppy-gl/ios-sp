import { create } from 'zustand';

import {
  DOWNLOAD_UNAVAILABLE_MESSAGE,
  createDownloadTask as createReservedDownloadTask,
  pauseDownload as pauseReservedDownload,
  resumeDownload as resumeReservedDownload,
  type CreateDownloadTaskInput,
  type DownloadTask,
  type DownloadTaskResult,
} from '@/services/downloadService';

type DownloadState = {
  tasks: DownloadTask[];
  statusMessage: string;
  createDownloadTask: (input: CreateDownloadTaskInput) => DownloadTaskResult;
  pauseDownload: (taskId: string) => DownloadTaskResult;
  resumeDownload: (taskId: string) => DownloadTaskResult;
};

export const useDownloadStore = create<DownloadState>()(() => ({
  tasks: [],
  statusMessage: DOWNLOAD_UNAVAILABLE_MESSAGE,
  createDownloadTask: (input) => createReservedDownloadTask(input),
  pauseDownload: () => pauseReservedDownload(),
  resumeDownload: () => resumeReservedDownload(),
}));
