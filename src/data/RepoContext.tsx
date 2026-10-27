import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { sortCategories } from '../domain/categories';
import { createDexieRepositories } from './dexie/dexieRepositories';
import type { Repositories } from './repositories';

const RepoContext = createContext<Repositories | null>(null);

/** Swap the `repositories` prop (e.g. for a synced or in-memory implementation) without touching any UI. */
export function RepoProvider({ repositories, children }: { repositories?: Repositories; children: ReactNode }) {
  const repos = useMemo(() => repositories ?? createDexieRepositories(), [repositories]);
  useEffect(() => void repos.seed(), [repos]);
  return <RepoContext.Provider value={repos}>{children}</RepoContext.Provider>;
}

export function useRepos(): Repositories {
  const repos = useContext(RepoContext);
  if (!repos) throw new Error('useRepos must be used inside <RepoProvider>');
  return repos;
}

// useLiveQuery re-runs whenever the underlying Dexie tables change, so lists stay reactive.
export const useExpenses = () => {
  const { expenses } = useRepos();
  return useLiveQuery(() => expenses.list(), [expenses]);
};

export const useAccounts = () => {
  const { accounts } = useRepos();
  return useLiveQuery(() => accounts.list(), [accounts]);
};

/** In display order (see sortCategories), hidden ones included: pickers filter them with `pickable`. */
export const useCategories = () => {
  const { categories } = useRepos();
  return useLiveQuery(() => categories.list().then(sortCategories), [categories]);
};

export const useRecurring = () => {
  const { recurring } = useRepos();
  return useLiveQuery(() => recurring.list(), [recurring]);
};

export const useRules = () => {
  const { rules } = useRepos();
  return useLiveQuery(() => rules.list(), [rules]);
};
