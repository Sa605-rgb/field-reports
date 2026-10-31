import { fetchReports, createTransport } from '../api/http';
import { pumpOnce } from '../engine/engine';
import { recover } from '../engine/policy';
import type { LocalReport, ServerReport } from '../engine/types';
import { readQueue, removeFile, removeReportFiles, saveQueue } from '../storage/files';

export type RunnerState = {
  reports: LocalReport[];
  online: boolean;
  ready: boolean;
  readError: string | null;
  serverReports: ServerReport[];
  serverError: string | null;
  serverLoadedAt: number | null;
  refreshing: boolean;
  progress: Record<string, number>;
};

type Listener = () => void;

const transport = createTransport();

export function createRunner() {
  let state: RunnerState = {
    reports: [],
    online: true,
    ready: false,
    readError: null,
    serverReports: [],
    serverError: null,
    serverLoadedAt: null,
    refreshing: false,
    progress: {},
  };
  const listeners = new Set<Listener>();
  let pumping = false;
  let again = false;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let lock: Promise<void> = Promise.resolve();

  function emit() {
    listeners.forEach(listener => listener());
  }

  function exclusive(job: () => Promise<void>): Promise<void> {
    const run = lock.then(job, job);
    lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function remember(reports: LocalReport[]) {
    const extras = state.reports.filter(report => !reports.some(item => item.id === report.id));
    state = { ...state, reports: [...reports, ...extras] };
  }

  async function kick() {
    if (pumping) {
      again = true;
      return;
    }
    pumping = true;
    try {
      do {
        again = false;
        const before = new Set(state.reports.filter(report => report.status === 'uploaded').map(report => report.id));
        const outcome = await pumpOnce(state.reports, {
          now: () => Date.now(),
          online: () => state.online,
          transport,
          persist: reports =>
            exclusive(async () => {
              remember(reports);
              await saveQueue(state.reports);
              emit();
            }),
          onProgress: (_reportId, imageId, bytesSent) => {
            state = { ...state, progress: { ...state.progress, [imageId]: bytesSent } };
            emit();
          },
        });
        await exclusive(async () => {
          remember(outcome.reports);
          emit();
        });
        const finished = outcome.reports.some(report => report.status === 'uploaded' && !before.has(report.id));
        if (finished) {
          refreshServer();
        }
        if (outcome.action === 'wait' && outcome.waitMs != null) {
          if (waitTimer) {
            clearTimeout(waitTimer);
          }
          waitTimer = setTimeout(() => {
            kick();
          }, outcome.waitMs + 50);
        }
        if (outcome.action !== 'progress' && !again) {
          break;
        }
      } while (true);
    } finally {
      pumping = false;
      if (again) {
        kick();
      }
    }
  }

  async function refreshServer() {
    state = { ...state, refreshing: true };
    emit();
    try {
      const reports = await fetchReports();
      state = {
        ...state,
        refreshing: false,
        serverReports: reports,
        serverError: null,
        serverLoadedAt: Date.now(),
      };
    } catch {
      state = {
        ...state,
        refreshing: false,
        serverError: state.serverLoadedAt
          ? 'Could not refresh. Showing the last copy from the server.'
          : 'Could not reach the server. Nothing here is the phone queue.',
      };
    }
    emit();
  }

  return {
    getState: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async boot() {
      try {
        const loaded = recover(await readQueue());
        state = { ...state, reports: loaded, ready: true, readError: null };
        await saveQueue(loaded);
      } catch {
        state = {
          ...state,
          ready: true,
          readError: 'The saved queue could not be read. Nothing new was deleted.',
        };
      }
      emit();
      kick();
      refreshServer();
    },
    setOnline(online: boolean) {
      if (state.online === online) {
        return;
      }
      state = { ...state, online };
      emit();
      if (online) {
        kick();
      }
    },
    kick,
    refreshServer,
    async addReport(report: LocalReport) {
      await exclusive(async () => {
        if (state.reports.some(item => item.id === report.id)) {
          return;
        }
        state = { ...state, reports: [report, ...state.reports] };
        await saveQueue(state.reports);
        emit();
      });
      kick();
    },
    async resetPhone() {
      const doomed = state.reports.map(report => report.id);
      const drafts = state.reports.flatMap(report => report.images.map(image => image.fileUri));
      await exclusive(async () => {
        state = { ...state, reports: [], progress: {} };
        await saveQueue([]);
        emit();
      });
      await Promise.all([
        ...doomed.map(id => removeReportFiles(id)),
        ...drafts.map(uri => removeFile(uri).catch(() => undefined)),
      ]);
    },
  };
}

export type Runner = ReturnType<typeof createRunner>;
