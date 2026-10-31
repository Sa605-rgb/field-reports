import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { createRunner, type Runner, type RunnerState } from './runner';

const RunnerContext = createContext<Runner | null>(null);

let shared: Runner | null = null;

export function getRunner(): Runner {
  if (!shared) {
    shared = createRunner();
  }
  return shared;
}

export function RunnerProvider({ children }: { children: ReactNode }) {
  const runner = getRunner();
  useEffect(() => {
    runner.boot();
  }, [runner]);
  return <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
}

export function useRunner(): Runner {
  const runner = useContext(RunnerContext);
  if (!runner) {
    throw new Error('useRunner must be inside RunnerProvider');
  }
  return runner;
}

export function useRunnerState(): RunnerState {
  const runner = useRunner();
  return useSyncExternalStore(runner.subscribe, runner.getState, runner.getState);
}
