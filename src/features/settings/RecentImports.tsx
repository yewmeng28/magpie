import { useToast } from '../../app/toast';
import { useAccounts, useExpenses, useRepos } from '../../data/RepoContext';
import type { Expense } from '../../domain/types';

const monthYear = (day: string) => {
  const [y, m] = day.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' });
};

/** The last few statement imports, each removable in one tap (with Undo) if it went wrong. */
export function RecentImports() {
  const repos = useRepos();
  const toast = useToast();
  const expenses = useExpenses() ?? [];
  const accounts = useAccounts() ?? [];

  const imports = new Map<string, Expense[]>();
  for (const e of expenses) if (e.importId) imports.set(e.importId, [...(imports.get(e.importId) ?? []), e]);
  const recent = [...imports]
    .map(([id, list]) => ({ id, list, added: Math.max(...list.map((e) => e.createdAt)) }))
    .sort((a, b) => b.added - a.added)
    .slice(0, 5);
  if (!recent.length) return null;

  return (
    <section className="panel">
      <h3>Recent imports</h3>
      <ul className="accounts">
        {recent.map(({ id, list }) => {
          const dates = list.map((e) => e.date).sort();
          const [from, to] = [monthYear(dates[0]), monthYear(dates[dates.length - 1])];
          const cards = [...new Set(list.map((e) => accounts.find((a) => a.id === e.accountId)?.name ?? 'No card'))];
          return (
            <li key={id}>
              <span className="merchant">
                {cards.join(', ')}
                <small>
                  {list.length} expenses · {from === to ? from : `${from} – ${to}`}
                </small>
              </span>
              <button
                onClick={async () => {
                  const removed = await repos.imports.remove(id);
                  toast(`Removed ${removed.length} imported expenses.`, () => repos.imports.commit(removed, []));
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
