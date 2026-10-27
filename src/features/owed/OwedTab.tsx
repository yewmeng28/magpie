import { useState } from 'react';
import { Meter } from '../../app/Meter';
import { useToast } from '../../app/toast';
import { useExpenses, useRepos } from '../../data/RepoContext';
import { formatMoney, toCents } from '../../domain/money';
import { myShare, outstanding, owedSummary, repay, shareLabel } from '../../domain/split';
import type { Cents, Expense, SplitShare } from '../../domain/types';
import { ExpenseSheet } from '../expense/ExpenseSheet';
import { PersonSheet } from './PersonSheet';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Record = (expense: Expense, share: SplitShare, repaid: Cents) => void;
type Open = (name: string) => void;

export function OwedTab() {
  const repos = useRepos();
  const toast = useToast();
  const expenses = useExpenses();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [personKey, setPersonKey] = useState<string | null>(null);
  if (!expenses) return null;
  const summary = owedSummary(expenses);
  const record: Record = (expense, share, repaid) => {
    const who = shareLabel(share, expense.split!.shares.indexOf(share));
    const message =
      repaid === 0 ? `${who} marked as not paid back.` : repaid >= share.amount ? `${who} paid back in full.` : `${who} has paid back ${formatMoney(repaid)}.`;
    void repos.expenses.save(repay(expense, share.id, repaid, Date.now()));
    toast(message, () => repos.expenses.save(expense));
  };

  if (!summary.lent) {
    return (
      <section className="panel">
        <h2>Owed to you</h2>
        <p className="empty">No split expenses yet. Tap an expense in Spending, then “Split with others”.</p>
      </section>
    );
  }

  const unnamedOwed = summary.unnamed.lent - summary.unnamed.repaid;
  // Looked up on every render, so the sheet follows payments as they're recorded.
  const person = summary.people.find((p) => p.key === personKey);
  return (
    <>
      <section className="panel">
        <h2>Owed to you</h2>
        <p className="hero">{formatMoney(summary.lent - summary.repaid)}</p>
        <Meter value={summary.repaid} max={summary.lent} label="Paid back overall" />
        <p className="hint">
          {formatMoney(summary.repaid)} of {formatMoney(summary.lent)} paid back
        </p>
      </section>

      {summary.people.length > 0 && (
        <section className="panel">
          <h3>By person</h3>
          <ul className="people-owed">
            {summary.people.map((p) => (
              <li key={p.key}>
                <button className="person-row" onClick={() => setPersonKey(p.key)}>
                  <span className="row">
                    <strong>{p.name}</strong>
                    <span className="amount">{formatMoney(p.lent - p.repaid)} ›</span>
                  </span>
                  <Meter value={p.repaid} max={p.lent} label={`${p.name} paid back`} />
                  <small className="hint">
                    {p.lent > p.repaid ? `owes ${formatMoney(p.lent - p.repaid)} of ${formatMoney(p.lent)}` : 'all paid back'} ·{' '}
                    {plural(p.shares.length, 'expense')}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {unnamedOwed > 0 && (
            <p className="hint">
              Plus {formatMoney(unnamedOwed)} from {plural(summary.unnamed.count, 'unnamed share')}, listed below.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <h3>Waiting to be paid back</h3>
        {summary.open.length ? (
          <ul className="split-list">
            {summary.open.map((e) => (
              <SplitCard key={e.id} expense={e} onRecord={record} onEdit={() => setEditing(e)} onPerson={(name) => setPersonKey(name.toLowerCase())} />
            ))}
          </ul>
        ) : (
          <p className="hint">Everyone has paid you back. 🎉</p>
        )}
      </section>

      {summary.settled.length > 0 && (
        <details className="panel settled">
          <summary>Settled ({summary.settled.length})</summary>
          <ul className="split-list">
            {summary.settled.map((e) => (
              <SplitCard key={e.id} expense={e} onRecord={record} onEdit={() => setEditing(e)} onPerson={(name) => setPersonKey(name.toLowerCase())} />
            ))}
          </ul>
        </details>
      )}

      {editing && <ExpenseSheet expense={editing} onClose={() => setEditing(null)} />}
      {person && <PersonSheet person={person} onClose={() => setPersonKey(null)} />}
    </>
  );
}

function SplitCard({ expense, onRecord, onEdit, onPerson }: { expense: Expense; onRecord: Record; onEdit: () => void; onPerson: Open }) {
  const [partFor, setPartFor] = useState<string | null>(null);
  const [partText, setPartText] = useState('');
  const shares = expense.split!.shares;
  const lent = shares.reduce((t, s) => t + s.amount, 0);
  const repaid = shares.reduce((t, s) => t + s.repaid, 0);

  return (
    <li className="split-card">
      <button className="split-title" onClick={onEdit}>
        <span className="merchant">
          {expense.merchant}
          <small>
            {shortDate(expense.date)} · paid {formatMoney(expense.amount, expense.currency)} · your share {formatMoney(myShare(expense), expense.currency)}
          </small>
        </span>
        <span className="amount">{formatMoney(lent - repaid, expense.currency)}</span>
      </button>
      <Meter value={repaid} max={lent} label={`${expense.merchant} paid back`} />
      <ul className="shares">
        {shares.map((s, i) => {
          const who = shareLabel(s, i);
          return (
            <li key={s.id}>
              {s.name.trim() ? (
                <button className="who link" onClick={() => onPerson(s.name.trim())}>
                  {who}
                </button>
              ) : (
                <span className="who">{who}</span>
              )}
              <span className="status">
                {outstanding(s) === 0
                  ? `paid back ${formatMoney(s.amount, expense.currency)}`
                  : s.repaid
                    ? `${formatMoney(s.repaid, expense.currency)} of ${formatMoney(s.amount, expense.currency)}`
                    : `owes ${formatMoney(s.amount, expense.currency)}`}
              </span>
              <span className="share-actions">
                {outstanding(s) > 0 && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setPartFor(s.id);
                      setPartText('');
                    }}
                    aria-label={`${who} paid back part`}
                  >
                    Part…
                  </button>
                )}
                <button
                  className={outstanding(s) === 0 ? 'toggle on' : 'toggle'}
                  aria-pressed={outstanding(s) === 0}
                  onClick={() => onRecord(expense, s, outstanding(s) === 0 ? 0 : s.amount)}
                  aria-label={outstanding(s) === 0 ? `${who} paid back; tap to mark not paid` : `${who} paid back in full`}
                >
                  {outstanding(s) === 0 ? '✓ Paid' : 'Paid'}
                </button>
              </span>
              {partFor === s.id && (
                <form
                  className="part"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cents = toCents(partText);
                    if (cents === null || cents <= 0) return;
                    onRecord(expense, s, s.repaid + cents);
                    setPartFor(null);
                  }}
                >
                  <input
                    inputMode="decimal"
                    autoFocus
                    placeholder={`Up to ${formatMoney(outstanding(s), expense.currency)}`}
                    value={partText}
                    onChange={(e) => setPartText(e.target.value)}
                    aria-label={`Amount ${who} paid back`}
                  />
                  <button type="submit" className="primary">
                    Add
                  </button>
                  <button type="button" onClick={() => setPartFor(null)}>
                    Cancel
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
