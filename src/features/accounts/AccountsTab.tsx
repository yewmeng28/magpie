import { useState } from 'react';
import { useAccounts, useCategories, useRepos, useRules } from '../../data/RepoContext';
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
  const accounts = useAccounts() ?? [];
  const rules = useRules() ?? [];
  const categories = useCategories() ?? [];
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
        <h2>Accounts</h2>
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
                onClick={() =>
                  window.confirm(`Delete ${a.name}? Its expenses stay, without an account.`) && void repos.accounts.remove(a.id)
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h3>Add an account</h3>
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
            Add account
          </button>
        </div>
      </section>
      <section className="panel">
        <h3>Merchants Maggie has learned</h3>
        {rules.length ? (
          <ul className="rules">
            {rules.map((r) => (
              <li key={r.id}>
                <code>{r.id}</code> → {categories.find((c) => c.id === r.categoryId)?.name ?? r.categoryId}
                <button className="icon" aria-label={`Forget ${r.id}`} onClick={() => repos.rules.remove(r.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">None yet. Categories you pick when importing or editing an expense are remembered here.</p>
        )}
      </section>
    </>
  );
}
