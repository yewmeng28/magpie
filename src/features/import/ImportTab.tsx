import { useState, type ChangeEvent } from 'react';
import { Mascot } from '../../app/Mascot';
import { passwordProblem, readPdfText } from '../../app/pdfText';
import { useAccounts, useCategories, useExpenses, useRepos, useRules } from '../../data/RepoContext';
import { DEFAULT_CURRENCY } from '../../domain/defaults';
import { buildDraft, commitDraft, extractJson, parseImportFile, type Draft, type DraftRow, type ImportFile } from '../../domain/importFile';
import { merchantKey } from '../../domain/merchant';
import { formatMoney } from '../../domain/money';
import { buildImportPrompt } from '../../domain/prompt';
import { parseStatement, StatementError } from '../../domain/statement';

/** Read the chosen file, then clear the input so picking the same file again still triggers a change. */
const takeFile = (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  return file;
};

/** `onImported` gets the latest date added, so Spending can open on that statement's month. */
export function ImportTab({ onImported }: { onImported?: (day: string) => void }) {
  const repos = useRepos();
  const categories = useCategories() ?? [];
  const accounts = useAccounts() ?? [];
  const rules = useRules() ?? [];
  const existing = useExpenses() ?? [];
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [source, setSource] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reading, setReading] = useState(false);
  const [locked, setLocked] = useState<{ file: File; problem: 'needed' | 'wrong' } | null>(null);
  const [password, setPassword] = useState('');

  const prompt = buildImportPrompt(categories, accounts, DEFAULT_CURRENCY);

  function showDraft(file: ImportFile, from: string) {
    const next = buildDraft(file, { categories, accounts, rules, existing });
    setDraft(next);
    setRows(next.rows);
    setSource(from);
    setError(null);
    setReplyError(null);
  }

  async function readPdf(file: File | undefined, pw?: string) {
    if (!file) return;
    setMessage(null);
    setError(null);
    setReading(true);
    try {
      const pages = await readPdfText(await file.arrayBuffer(), pw);
      showDraft(parseStatement(pages, accounts), `Read on this device from ${file.name}.`);
      setLocked(null);
      setPassword('');
    } catch (e) {
      const problem = passwordProblem(e);
      if (problem) setLocked({ file, problem });
      else setError(e instanceof StatementError ? e.message : `Couldn’t read that PDF (${(e as Error).message}).`);
    } finally {
      setReading(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setReplyError('Copying was blocked. Open "Show prompt" below and copy it by hand.');
    }
  }

  function readReply(text: string) {
    setMessage(null);
    try {
      showDraft(parseImportFile(extractJson(text)), 'From Claude’s reply.');
    } catch (e) {
      setReplyError((e as Error).message);
    }
  }

  /** Picking a category applies it to every row of the same merchant, so a statement full of Grab rides is one tap. */
  function setCategory(row: DraftRow, categoryId: string | null) {
    const key = merchantKey(row.description);
    setRows((rs) => rs.map((r) => (r === row || (r.kind !== 'payment' && merchantKey(r.description) === key) ? { ...r, categoryId } : r)));
  }

  const update = (row: DraftRow, change: Partial<DraftRow>) => setRows((rs) => rs.map((r) => (r === row ? { ...r, ...change } : r)));

  const setAllAccounts = (accountId: string | null) => setRows((rs) => rs.map((r) => ({ ...r, accountId })));

  async function confirm() {
    if (!draft) return;
    const { expenses, rules: learned } = commitDraft(rows, {
      currency: draft.currency,
      importId: crypto.randomUUID(),
      now: Date.now(),
      rules,
      newId: () => crypto.randomUUID(),
    });
    await repos.imports.commit(expenses, learned);
    if (onImported && expenses.length) return onImported(expenses.reduce((max, e) => (e.date > max ? e.date : max), expenses[0].date));
    setDraft(null);
    setRows([]);
    setPasted('');
    setMessage(
      `Maggie stashed ${expenses.length} expense${expenses.length === 1 ? '' : 's'}` +
        (learned.length ? ` and learned ${learned.length} new merchant${learned.length === 1 ? '' : 's'}.` : '.'),
    );
  }

  if (draft) {
    const included = rows.filter((r) => r.include);
    const missingAccount = included.some((r) => !r.accountId);
    const rec = draft.reconciliation;
    const money = (c: number) => formatMoney(c, draft.currency);
    return (
      <section className="panel">
        <h2>Review draft</h2>
        <p className="hint">{source} Nothing is saved until you add it.</p>
        {rec &&
          (rec.expected === rec.actual ? (
            <p className="note ok">
              {rec.basis === 'purchases'
                ? `Matches the statement’s purchase total of ${money(rec.expected)}.`
                : 'Every row adds up: together they explain the statement’s change in balance exactly.'}
            </p>
          ) : (
            <p className="note warn">
              {rec.basis === 'purchases'
                ? `The statement says purchases total ${money(rec.expected)}, but these rows add up to ${money(rec.actual)} (off by ${money(rec.actual - rec.expected)}).`
                : `The statement’s balance changed by ${money(rec.expected)}, but these rows add up to ${money(rec.actual)} (off by ${money(rec.actual - rec.expected)}).`}{' '}
              A row may be missing or misread. Check it against the statement.
            </p>
          ))}
        <label className="field">
          Account for every row
          <select value="" onChange={(e) => setAllAccounts(e.target.value || null)}>
            <option value="">Choose…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <ul className="draft">
          {rows.map((r) => (
            <li key={r.key} className={r.include ? '' : 'skipped'}>
              <label className="include">
                <input type="checkbox" checked={r.include} onChange={(e) => update(r, { include: e.target.checked })} />
                <span className="date">{r.date}</span>
              </label>
              <input className="merchant" value={r.merchant} onChange={(e) => update(r, { merchant: e.target.value })} aria-label="Merchant" />
              <span className={r.amount < 0 ? 'amount refund' : 'amount'}>{money(r.amount)}</span>
              <select
                value={r.categoryId ?? ''}
                onChange={(e) => setCategory(r, e.target.value || null)}
                aria-label="Category"
                className={r.categoryId ? '' : 'missing'}
              >
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
              <select
                value={r.accountId ?? ''}
                onChange={(e) => update(r, { accountId: e.target.value || null })}
                aria-label="Account"
                className={r.accountId ? '' : 'missing'}
              >
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <span className="tags">
                {r.kind === 'payment' && <span className="tag">card payment</span>}
                {r.kind === 'refund' && <span className="tag">refund</span>}
                {r.duplicateOf && <span className="tag warn">already imported?</span>}
                {r.categorySource === 'rule' && <span className="tag">remembered</span>}
                {!r.categoryId && r.include && <span className="tag warn">new merchant</span>}
              </span>
              <span className="raw">{r.description}</span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button onClick={() => setDraft(null)}>Cancel</button>
          <button className="primary" onClick={confirm} disabled={!included.length}>
            Add {included.length} · {money(included.reduce((t, r) => t + r.amount, 0))}
          </button>
        </div>
        {missingAccount && <p className="hint">Some rows have no account. They’ll be saved without one.</p>}
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <h2>Import a statement</h2>
        {message && (
          <p className="note ok">
            <Mascot size={24} /> {message}
          </p>
        )}
        <p className="hint">
          Upload your bank’s PDF statement. MagPie reads it on this device and sorts it with the merchants it knows.
          Nothing is uploaded anywhere.
        </p>
        <div className="actions start">
          <label className={reading ? 'button primary disabled' : 'button primary'} aria-disabled={reading}>
            {reading ? 'Reading statement…' : 'Choose PDF statement'}
            <input type="file" accept="application/pdf,.pdf" hidden disabled={reading} onChange={(e) => readPdf(takeFile(e))} />
          </label>
        </div>
        {locked && (
          <form
            className="unlock"
            onSubmit={(e) => {
              e.preventDefault();
              void readPdf(locked.file, password);
            }}
          >
            <label className="field">
              {locked.problem === 'wrong' ? 'That password didn’t work. Try again:' : `${locked.file.name} is password-protected. Its password:`}
              <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="actions">
              <button type="button" onClick={() => setLocked(null)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={!password || reading}>
                Unlock
              </button>
            </div>
          </form>
        )}
        {error && <p className="note warn">{error}</p>}
      </section>

      <section className="panel">
        <h2>Or let Claude read it</h2>
        <p className="hint">For statements MagPie can’t read yet, like scans or other banks’ layouts.</p>
        <ol className="steps">
          <li>
            <button className="primary" onClick={copyPrompt}>
              {copied ? 'Copied!' : 'Copy prompt'}
            </button>
            <details>
              <summary>Show prompt</summary>
              <pre className="prompt">{prompt}</pre>
            </details>
          </li>
          <li>
            Paste it into a Claude chat and attach your statement.
            <p className="hint">
              This sends the statement to Claude. Redact card numbers, your name and address first. Black boxes drawn on a
              PDF often leave the text readable underneath, so a screenshot of just the transactions is safer.
            </p>
          </li>
          <li>
            Paste Claude’s reply here:
            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} placeholder='{"magpie": 1, …}' />
            <div className="actions">
              <label className="button">
                Open .json file
                <input
                  type="file"
                  accept=".json,application/json,text/plain"
                  hidden
                  onChange={async (e) => {
                    const file = takeFile(e);
                    if (file) readReply(await file.text());
                  }}
                />
              </label>
              <button className="primary" onClick={() => readReply(pasted)} disabled={!pasted.trim()}>
                Review draft
              </button>
            </div>
          </li>
        </ol>
        {replyError && <p className="note warn">{replyError}</p>}
      </section>
    </>
  );
}
