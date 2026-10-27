import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useToast } from '../../app/toast';
import { useAccounts, useCategories, useExpenses, useRecurring, useRepos, useRules } from '../../data/RepoContext';
import { pickable } from '../../domain/categories';
import { DEFAULT_CURRENCY } from '../../domain/defaults';
import { suggestCategory } from '../../domain/dictionary';
import { localDay } from '../../domain/expenses';
import { merchantKey } from '../../domain/merchant';
import { formatMoney, toCents } from '../../domain/money';
import { dayLabel, EVERY_LABEL, nextDate, type Every } from '../../domain/recurring';
import { equalShares, knownNames, splitError } from '../../domain/split';
import type { Cents, Expense } from '../../domain/types';

interface Person {
  id: string;
  name: string;
  /** Typed amount, used in custom mode. */
  amount: string;
  /** Kept from the saved split so editing it doesn't lose repayments. */
  repaid: Cents;
}

const LAST_ACCOUNT = 'magpie:lastAccount';
const centsText = (c: Cents) => (c / 100).toFixed(2);
const newPerson = (): Person => ({ id: crypto.randomUUID(), name: '', amount: '', repaid: 0 });

function rememberedAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT);
  } catch {
    return null;
  }
}

interface Props {
  /** The expense to edit, or nothing to add a new one. */
  expense?: Expense;
  /** Date for a new expense. */
  date?: string;
  onClose: () => void;
}

/** Add, edit, split or delete one expense, in a bottom sheet. */
export function ExpenseSheet({ expense, date: initialDate, onClose }: Props) {
  const repos = useRepos();
  const toast = useToast();
  const categories = useCategories() ?? [];
  const accounts = useAccounts() ?? [];
  const rules = useRules() ?? [];
  const names = knownNames(useExpenses() ?? []);
  const dialog = useRef<HTMLDialogElement>(null);

  const [amountText, setAmountText] = useState(expense ? centsText(expense.amount) : '');
  const [merchant, setMerchant] = useState(expense?.merchant ?? '');
  const [date, setDate] = useState(expense?.date ?? initialDate ?? localDay());
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(expense ? expense.accountId : rememberedAccount());
  const [note, setNote] = useState(expense?.note ?? '');
  const rule = useRecurring()?.find((r) => r.id === expense?.recurringId);
  const [repeat, setRepeat] = useState<Every | 'never' | null>(null);
  // Until it's touched, Repeats shows the expense's rule (which loads after the sheet opens).
  const repeats = repeat ?? rule?.every ?? 'never';
  const [splitOn, setSplitOn] = useState(!!expense?.split);
  // An existing split keeps its exact amounts; a new one starts as an equal split with me.
  const [mode, setMode] = useState<'equal' | 'custom'>(expense?.split ? 'custom' : 'equal');
  const [includeMe, setIncludeMe] = useState(true);
  const [people, setPeople] = useState<Person[]>(
    expense?.split?.shares.map((s) => ({ id: s.id, name: s.name, amount: centsText(s.amount), repaid: s.repaid })) ?? [newPerson()],
  );
  const [error, setError] = useState<string | null>(null);

  const amountField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // showModal focuses the first control (Cancel); a new expense starts at its amount instead.
    if (!expense) amountField.current?.focus();
  }, [expense]);

  const amount = toCents(amountText);
  const shares: (Cents | null)[] =
    mode === 'equal' && amount !== null ? equalShares(amount, people.length, includeMe) : people.map((p) => toCents(p.amount));
  const othersTotal = shares.reduce<Cents>((t, s) => t + (s ?? 0), 0);
  const splitProblem = splitOn ? splitError(amount ?? 0, shares.map((s) => ({ amount: s }))) : null;

  const updatePerson = (id: string, change: Partial<Person>) => setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)));

  function switchMode(next: 'equal' | 'custom') {
    // Carry the equal amounts over as a starting point for custom ones.
    if (next === 'custom' && mode === 'equal') setPeople((ps) => ps.map((p, i) => ({ ...p, amount: shares[i] != null ? centsText(shares[i]!) : '' })));
    setMode(next);
  }

  // Nothing is saved until Save, so Cancel already undoes removing a split.
  const removeSplit = () => setSplitOn(false);

  async function save(now: number) {
    if (amount === null || amount === 0) return setError('Enter an amount, like 12.50.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Pick a date.');
    if (splitProblem) return setError(splitProblem);
    const next: Expense = {
      ...(expense ?? { id: crypto.randomUUID(), currency: DEFAULT_CURRENCY, createdAt: now }),
      date,
      merchant: merchant.trim() || categories.find((c) => c.id === categoryId)?.name || 'Expense',
      amount,
      categoryId,
      accountId,
      note: note.trim() || undefined,
      split: splitOn
        ? { shares: people.map((p, i) => ({ id: p.id, name: p.name.trim(), amount: shares[i]!, repaid: Math.min(p.repaid, shares[i]!) })) }
        : undefined,
      updatedAt: now,
    };
    if (!next.note) delete next.note;
    if (!next.split) delete next.split;
    // Repeats: a new rule starts here; an existing one follows this edit for its future copies; Never stops it.
    if (repeats === 'never') {
      if (rule) await repos.recurring.remove(rule.id);
      delete next.recurringId;
    } else {
      const id = rule?.id ?? crypto.randomUUID();
      await repos.recurring.save({
        ...(rule ?? { start: date, last: date }),
        id,
        every: repeats,
        merchant: next.merchant,
        ...(next.description ? { description: next.description } : {}),
        amount,
        currency: next.currency,
        categoryId,
        accountId,
        ...(next.note ? { note: next.note } : {}),
      });
      next.recurringId = id;
    }
    await repos.expenses.save(next);
    // A short confirmation; a new one-off expense can be taken back straight away.
    const added = repeats !== 'never' && !rule ? await repos.recurring.catchUp(localDay()) : 0;
    if (added) toast(`Added ${next.merchant}, and ${added} earlier repeat${added === 1 ? '' : 's'}.`);
    else if (expense) toast(`Saved ${next.merchant}.`);
    else toast(`Added ${next.merchant} · ${formatMoney(amount, next.currency)}.`, repeats === 'never' ? () => repos.expenses.remove(next.id) : undefined);
    // Recategorising an imported expense teaches MagPie that merchant, as picking a category in an import draft does.
    if (expense?.description && categoryId && categoryId !== expense.categoryId) {
      const key = merchantKey(expense.description);
      if (key && suggestCategory(expense.description, rules)?.categoryId !== categoryId) await repos.rules.save({ id: key, categoryId, updatedAt: now });
    }
    if (!expense) {
      try {
        if (accountId) localStorage.setItem(LAST_ACCOUNT, accountId);
      } catch {
        /* not remembered */
      }
    }
    onClose();
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(Date.now());
  };

  async function remove() {
    if (!expense) return;
    await repos.expenses.remove(expense.id);
    toast(`Deleted ${expense.merchant}.`, () => repos.expenses.save(expense));
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={expense ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      onClick={(e) => {
        // A backdrop tap lands on the dialog element itself, but so does a tap on the sheet's padding: only close when
        // the tap is outside the sheet's box.
        const r = e.currentTarget.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (e.target === e.currentTarget && outside) e.currentTarget.close();
      }}
    >
      <form
        method="dialog"
        onSubmit={submit}
      >
        {/* The iPhone sheet pattern: Cancel and Save stay at the top, above the keyboard. */}
        <header className="sheet-head">
          <button type="button" className="text-button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <h2>{expense ? 'Expense' : 'New expense'}</h2>
          <button type="submit" className="text-button strong">
            Save
          </button>
        </header>
        {error && <p className="note warn">{error}</p>}

        <label className="field amount-field">
          Amount
          <input
            inputMode="decimal"
            ref={amountField}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0.00"
            aria-invalid={amountText !== '' && amount === null}
          />
        </label>
        {expense && expense.amount < 0 && <p className="hint">A negative amount is a refund.</p>}

        <fieldset className="categories">
          <legend>Category</legend>
          {pickable(categories, expense?.categoryId ?? null).map((c) => (
            <button
              type="button"
              key={c.id}
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              style={{ '--swatch': c.color } as CSSProperties}
            >
              <span className="emoji">{c.emoji}</span>
              {c.name}
            </button>
          ))}
        </fieldset>

        <div className="field-row">
          <label className="field">
            Merchant
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Tian Tian Chicken Rice" />
          </label>
          <label className="field">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Card
            <select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value || null)}>
              <option value="">No card</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <label className="field">
          Repeats
          <select value={repeats} onChange={(e) => setRepeat(e.target.value as Every | 'never')}>
            <option value="never">Never</option>
            {(Object.keys(EVERY_LABEL) as Every[]).map((every) => (
              <option key={every} value={every}>
                {EVERY_LABEL[every]}
              </option>
            ))}
          </select>
        </label>
        {rule && (
          <p className="hint">
            Next on {dayLabel(nextDate({ ...rule, every: repeats === 'never' ? rule.every : repeats }))}. Changes here apply to later
            repeats too; choose Never to stop it (past ones stay).
          </p>
        )}
        {expense?.description && <p className="raw">{expense.description}</p>}

        {amount !== null && amount > 0 && (
          <section className="split">
            {!splitOn ? (
              <button type="button" onClick={() => setSplitOn(true)}>
                Split with others
              </button>
            ) : (
              <>
                <div className="split-head">
                  <h3>Split</h3>
                  <div className="segmented small" role="radiogroup" aria-label="Split mode">
                    {(['equal', 'custom'] as const).map((m) => (
                      <button type="button" key={m} role="radio" aria-checked={mode === m} onClick={() => switchMode(m)}>
                        {m === 'equal' ? 'Equally' : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>
                {mode === 'equal' && (
                  <label className="check">
                    <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
                    Include me
                  </label>
                )}
                <datalist id="split-names">
                  {names.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <ul className="people">
                  {people.map((p, i) => (
                    <li key={p.id}>
                      <input
                        value={p.name}
                        list="split-names"
                        placeholder={`Friend ${i + 1}`}
                        aria-label={`Name of person ${i + 1}`}
                        onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                      />
                      {mode === 'equal' ? (
                        <span className="amount">{shares[i] != null ? formatMoney(shares[i]!) : '–'}</span>
                      ) : (
                        <input
                          className="share-amount"
                          inputMode="decimal"
                          value={p.amount}
                          placeholder="0.00"
                          aria-label={`Amount for ${p.name || `Friend ${i + 1}`}`}
                          onChange={(e) => updatePerson(p.id, { amount: e.target.value })}
                        />
                      )}
                      <button
                        type="button"
                        className="icon"
                        aria-label={`Remove ${p.name || `Friend ${i + 1}`}`}
                        disabled={people.length === 1}
                        onClick={() => setPeople((ps) => ps.filter((q) => q.id !== p.id))}
                      >
                        ×
                      </button>
                      {p.repaid > 0 && <small className="repaid">paid back {formatMoney(p.repaid)}</small>}
                    </li>
                  ))}
                </ul>
                <div className="actions start">
                  <button type="button" onClick={() => setPeople((ps) => [...ps, newPerson()])}>
                    + Add person
                  </button>
                  <button type="button" onClick={removeSplit}>
                    Remove split
                  </button>
                </div>
                <p className="split-summary">
                  Your share <strong>{formatMoney(Math.max(0, amount - othersTotal))}</strong> · Others owe you{' '}
                  <strong>{formatMoney(othersTotal)}</strong>
                </p>
                {splitProblem && <p className="note warn">{splitProblem}</p>}
              </>
            )}
          </section>
        )}

        {expense && (
          <div className="actions start">
            <button type="button" className="danger" onClick={remove}>
              Delete expense
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
