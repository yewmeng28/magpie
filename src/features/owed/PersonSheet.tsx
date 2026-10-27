import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Meter } from '../../app/Meter';
import { readPayNow, shareText } from '../../app/payNow';
import { useToast } from '../../app/toast';
import { useRepos } from '../../data/RepoContext';
import { formatMoney, toCents } from '../../domain/money';
import { outstanding, payOff, reminderText, repay, type PersonOwed } from '../../domain/split';
import type { Expense } from '../../domain/types';

function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Everything one person owes: remind them, record a payment, or tick bills off. */
export function PersonSheet({ person, onClose }: { person: PersonOwed; onClose: () => void }) {
  const repos = useRepos();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [amountText, setAmountText] = useState('');
  const owes = person.lent - person.repaid;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  /** Save changed expenses, with Undo restoring the versions before. */
  async function apply(changed: Expense[], message: string) {
    const before = changed.map((c) => person.shares.find((s) => s.expense.id === c.id)!.expense);
    await Promise.all(changed.map((e) => repos.expenses.save(e)));
    toast(message, () => Promise.all(before.map((e) => repos.expenses.save(e))).then(() => {}));
  }

  async function record(e: FormEvent) {
    e.preventDefault();
    const amount = toCents(amountText);
    if (amount === null || amount <= 0) return;
    const { expenses, left } = payOff(person, amount, Date.now());
    if (!expenses.length) return;
    setAmountText('');
    await apply(expenses, `Recorded ${formatMoney(amount - left)} from ${person.name}${left > 0 ? `; ${formatMoney(left)} more than they owed` : ''}.`);
  }

  async function remind() {
    const result = await shareText(reminderText(person, readPayNow(), (c) => formatMoney(c)));
    if (result === 'copied') toast('Reminder copied. Paste it into a chat.');
    if (result === 'failed') toast('Couldn’t share or copy the reminder on this device.');
  }

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={`What ${person.name} owes`}
      onClose={onClose}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (e.target === e.currentTarget && outside) e.currentTarget.close();
      }}
    >
      <header className="sheet-head">
        <button type="button" className="text-button" onClick={() => dialog.current?.close()}>
          Close
        </button>
        <h2>{person.name}</h2>
        <span />
      </header>

      <p className="person-total">
        <strong>{formatMoney(owes)}</strong> {owes > 0 ? 'still owed' : 'all paid back'}
      </p>
      <Meter value={person.repaid} max={person.lent} label={`${person.name} paid back`} />

      {owes > 0 && (
        <>
          <div className="actions start">
            <button className="primary" onClick={remind}>
              Remind {person.name}
            </button>
            <button
              onClick={() => apply(payOff(person, owes, Date.now()).expenses, `${person.name} has paid everything back.`)}
            >
              Mark all paid
            </button>
          </div>
          <form className="part" onSubmit={record}>
            <input
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="Record a payment…"
              aria-label={`Amount ${person.name} paid you`}
            />
            <button type="submit" disabled={!amountText.trim()}>
              Record
            </button>
          </form>
          <p className="hint">A payment pays off the oldest bills first.</p>
        </>
      )}

      <ul className="person-bills">
        {person.shares.map(({ expense, share }) => {
          const paid = outstanding(share) === 0;
          return (
            <li key={`${expense.id}:${share.id}`}>
              <span className="merchant">
                {expense.merchant}
                <small>
                  {shortDate(expense.date)}
                  {share.repaid > 0 && !paid && ` · paid ${formatMoney(share.repaid)} of ${formatMoney(share.amount)}`}
                </small>
              </span>
              <span className="amount">{formatMoney(share.amount)}</span>
              <button
                className={paid ? 'toggle on' : 'toggle'}
                aria-pressed={paid}
                onClick={() =>
                  apply(
                    [repay(expense, share.id, paid ? 0 : share.amount, Date.now())],
                    paid ? `${expense.merchant} marked as not paid back.` : `${expense.merchant} paid back.`,
                  )
                }
              >
                {paid ? '✓ Paid' : 'Paid'}
              </button>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
