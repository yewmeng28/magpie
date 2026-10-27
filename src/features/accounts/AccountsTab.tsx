import { useState } from 'react';
import { useToast } from '../../app/toast';
import { useAccounts, useExpenses, useRepos } from '../../data/RepoContext';
import type { AccountKind } from '../../domain/types';

const KINDS: { id: AccountKind; label: string }[] = [
  { id: 'credit', label: 'Credit card' },
  { id: 'debit', label: 'Debit / bank' },
  { id: 'cash', label: 'Cash' },
  { id: 'ewallet', label: 'E-wallet' },
];

const COLORS = ['#d6372f', '#3a8fd9', '#5aa454', '#e0b72f', '#7a6fd1', '#e8833a', '#3fb3a6'];

export function AccountsTab() {
  const repos = useRepos();
  const toast = useToast();
  const expenses = useExpenses() ?? [];
  const accounts = useAccounts() ?? [];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('credit');
  const [aliases, setAliases] = useState('');

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await repos.accounts.save({
      id: crypto.randomUUID(),
      name: trimmed,
      kind,
      color: COLORS[accounts.length % COLORS.length],
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
    });
    setName('');
    setAliases('');
  }

  return (
    <>
      <section className="panel">
        <h2>Cards</h2>
        <ul className="accounts">
          {accounts.map((a) => (
            <li key={a.id}>
              <span className="swatch" style={{ background: a.color }} />
              <span className="merchant">
                {a.name}
                <small>
                  {KINDS.find((k) => k.id === a.kind)?.label}
                  {a.aliases?.length ? ` · also "${a.aliases.join('", "')}"` : ''}
                </small>
              </span>
              <button
                className="icon"
                aria-label={`Delete ${a.name}`}
                onClick={async () => {
                  // Its expenses stay, without a card; Undo puts the card back on them.
                  const used = expenses.filter((e) => e.accountId === a.id);
                  await repos.accounts.remove(a.id);
                  toast(`Deleted ${a.name}. Its ${used.length} expenses stay, without a card.`, async () => {
                    await repos.accounts.save(a);
                    await Promise.all(used.map((e) => repos.expenses.save(e)));
                  });
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <details className="add-form">
          <summary>Add a card</summary>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DBS Live Fresh" />
          </label>
          <label className="field">
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Name on statements (optional, comma separated)
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. DBS LIVE FRESH CARD" />
          </label>
          <div className="actions">
            <button className="primary" onClick={add} disabled={!name.trim()}>
              Add card
            </button>
          </div>
        </details>
      </section>
    </>
  );
}
