import { useToast } from '../../app/toast';
import { useAccounts, useCategories, useExpenses, useRecurring, useRepos } from '../../data/RepoContext';
import { describeCategory } from '../../domain/chartData';
import { localDay } from '../../domain/expenses';
import { formatMoney } from '../../domain/money';
import { dayLabel, detectRecurring, EVERY_LABEL, fromCandidate, nextDate, type Candidate } from '../../domain/recurring';

/** Recurring payments, and expenses that look like they repeat, ready to add in one tap. */
export function RecurringPanel() {
  const repos = useRepos();
  const toast = useToast();
  const recurring = useRecurring() ?? [];
  const expenses = useExpenses() ?? [];
  const categories = useCategories() ?? [];
  const accounts = useAccounts() ?? [];
  const today = localDay();
  const candidates = detectRecurring(expenses, recurring, today);

  const card = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'No card';

  async function adopt(list: Candidate[]) {
    for (const c of list) await repos.recurring.adopt(fromCandidate(c, crypto.randomUUID()), c.expenseIds);
    const added = await repos.recurring.catchUp(today);
    toast(
      `Added ${list.length === 1 ? list[0].merchant : `${list.length} recurring payments`}${added ? `, and ${added} payment${added === 1 ? '' : 's'} since` : ''}.`,
    );
  }

  return (
    <section className="panel">
      <h2>Recurring payments</h2>
      {recurring.length ? (
        <ul className="accounts">
          {[...recurring]
            .sort((a, b) => nextDate(a).localeCompare(nextDate(b)))
            .map((r) => {
              const c = describeCategory(categories, r.categoryId);
              return (
                <li key={r.id}>
                  <span className="badge" style={{ background: `color-mix(in srgb, ${c.color} 30%, transparent)` }} aria-hidden>
                    {c.emoji}
                  </span>
                  <span className="merchant">
                    {r.merchant} · {formatMoney(r.amount, r.currency)}
                    <small>
                      {EVERY_LABEL[r.every]} · next {dayLabel(nextDate(r))} · {card(r.accountId)}
                    </small>
                  </span>
                  <button
                    onClick={async () => {
                      await repos.recurring.remove(r.id);
                      toast(`Stopped ${r.merchant}. Past payments stay.`, () => repos.recurring.save(r));
                    }}
                  >
                    Stop
                  </button>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className="hint">None yet. Choose Repeats on an expense to add one.</p>
      )}

      {candidates.length > 0 && (
        <>
          <div className="panel-head looks-recurring">
            <h3>Looks recurring</h3>
            {candidates.length > 1 && <button onClick={() => adopt(candidates)}>Add all</button>}
          </div>
          <p className="hint">The same merchant and amount on the same date, in back-to-back months or years.</p>
          <ul className="accounts">
            {candidates.map((c) => (
              <li key={c.key + c.every}>
                <span className="merchant">
                  {c.merchant} · {formatMoney(c.amount, c.currency)}
                  <small>
                    {EVERY_LABEL[c.every]} · seen {c.expenseIds.length} times since {dayLabel(c.start)} · {card(c.accountId)}
                  </small>
                </span>
                <button className="primary" onClick={() => adopt([c])}>
                  Add
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
