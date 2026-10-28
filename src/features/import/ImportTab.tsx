import { useState, type ChangeEvent } from 'react';
import { passwordProblem, readPdfText } from '../../app/pdfText';
import { useToast } from '../../app/toast';
import { useAccounts, useCategories, useExpenses, useRepos, useRules } from '../../data/RepoContext';
import { pickable } from '../../domain/categories';
import { DEFAULT_CURRENCY } from '../../domain/defaults';
import { buildDraft, commitDraft, extractJson, parseImportFile, sumKind, type Draft, type DraftRow, type ImportFile } from '../../domain/importFile';
import { merchantKey } from '../../domain/merchant';
import { formatMoney } from '../../domain/money';
import { buildImportPrompt } from '../../domain/prompt';
import { parseStatement, StatementError, unreadLines } from '../../domain/statement';

/** Read the chosen file, then clear the input so picking the same file again still triggers a change. */
const takeFile = (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  return file;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Rows to look at before adding: shops Maggie doesn't know, and rows that look already imported. */
const needsAttention = (r: DraftRow) => !!r.duplicateOf || (r.include && !r.categoryId);

function shortDate(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

/** `onImported` gets the latest date added, so Spending can open on that statement's month. */
export function ImportTab({ onImported }: { onImported?: (day: string) => void }) {
  const repos = useRepos();
  const toast = useToast();
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
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reading, setReading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ file: File; problem: 'needed' | 'wrong' } | null>(null);
  const [password, setPassword] = useState('');

  const prompt = buildImportPrompt(pickable(categories), accounts, DEFAULT_CURRENCY);

  function showDraft(file: ImportFile, from: string) {
    const next = buildDraft(file, { categories, accounts, rules, existing });
    setDraft(next);
    setRows(next.rows);
    setSource(from);
    setOnlyAttention(next.rows.some(needsAttention));
    setOpen(null);
    setError(null);
    setReplyError(null);
  }


  async function readPdf(file: File | undefined, pw?: string) {
    if (!file) return;

    setError(null);
    setOcrStatus(null);
    setReading(true);

    try {
      const pages = await readPdfText(await file.arrayBuffer(), pw);

      let parsed: ImportFile;

      try {
        // Fast path: use the PDF's existing text layer.
        parsed = parseStatement(pages, accounts);
      } catch (e) {
        if (
          !(e instanceof StatementError) ||
          !['no-text', 'no-transactions'].includes(e.problem)
        ) {
          throw e;
        }

        // Fallback: OCR the PDF locally in the browser.
        setOcrStatus('No usable text layer found. Starting on-device OCR…');
        const { ocrPdf } = await import('../../domain/statementOcr');
        const ocrPages = await ocrPdf(
          file,
          ({ page, totalPages, progress }) => {
            setOcrStatus(`Recognising text on page ${page} of ${totalPages} (${Math.round(progress * 100)}%)…`);
          },
          pw,
        );

        // Reuse the existing transaction parser. Lines it skips are logged (on this device only), to find a lost row.
        console.info('[MagPie OCR] lines with an amount that were not read as transactions:', unreadLines(ocrPages));
        parsed = parseStatement(ocrPages, accounts);
      }

      showDraft(parsed, `Read on this device from ${file.name}.`);
      setLocked(null);
      setPassword('');
      setOcrStatus(null);
    } catch (e) {
      setOcrStatus(null);
      const problem = passwordProblem(e);

      if (problem) {
        setLocked({ file, problem });
      } else {
        setError(
          e instanceof StatementError
            ? e.message
            : `Couldn’t read that PDF (${(e as Error).message}).`,
        );
      }
    } finally {
      setReading(false);
      setOcrStatus(null);
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

  async function confirm() {
    if (!draft) return;
    const importId = crypto.randomUUID();
    const { expenses, rules: learned } = commitDraft(rows, { currency: draft.currency, importId, now: Date.now(), rules, newId: () => crypto.randomUUID() });
    // What the learned rules replace, so Undo can put them back.
    const replaced = learned.map((r) => ({ id: r.id, before: rules.find((old) => old.id === r.id) }));
    await repos.imports.commit(expenses, learned);
    toast(
      `Added ${plural(expenses.length, 'expense')}${learned.length ? `; Maggie learned ${plural(learned.length, 'merchant')}` : ''}.`,
      async () => {
        await repos.imports.remove(importId);
        await Promise.all(replaced.map(({ id, before }) => (before ? repos.rules.save(before) : repos.rules.remove(id))));
      },
    );
    setDraft(null);
    setRows([]);
    setPasted('');
    if (onImported && expenses.length) onImported(expenses.reduce((max, e) => (e.date > max ? e.date : max), expenses[0].date));
  }

  if (draft) {
    const included = rows.filter((r) => r.include);
    const attention = rows.filter(needsAttention);
    const shown = onlyAttention && attention.length ? attention : rows;
    const rec = draft.reconciliation;
    const money = (c: number) => formatMoney(c, draft.currency);
    const cards = new Set(rows.map((r) => r.accountId));
    const card = cards.size === 1 ? [...cards][0] : undefined;
    return (
      <>
        {rec && (
          <p className={rec.expected === rec.actual ? 'banner ok' : 'banner warn'}>
            <span aria-hidden>{rec.expected === rec.actual ? '✓' : '⚠'}</span>
            <span>
              {rec.expected === rec.actual
                ? rec.basis === 'purchases'
                  ? `Matches the statement: purchases total ${money(rec.expected)}.`
                  : 'Matches the statement: every row adds up to its balance.'
                : `Doesn’t match the statement: ${rec.basis === 'purchases' ? 'purchases' : 'the balance change'} should be ${money(rec.expected)} but the rows add up to ${money(rec.actual)}${rec.basis === 'balance' ? ` (${[`${money(sumKind(rows, 'expense'))} spent`, sumKind(rows, 'refund') && `${money(sumKind(rows, 'refund'))} refunded`, sumKind(rows, 'payment') && `${money(sumKind(rows, 'payment'))} paid off`].filter(Boolean).join(', less ')})` : ''}, ${money(Math.abs(rec.expected - rec.actual))} ${rec.expected > rec.actual ? 'short' : 'over'}. A row may be missing or misread.`}
            </span>
          </p>
        )}
        <p className="hint">{source} Nothing is saved until you add it.</p>

        <div className="review-controls">
          <label className="field">
            Card for every row
            <select
              value={card ?? ''}
              onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, accountId: e.target.value || null })))}
            >
              <option value="">{card === undefined ? 'Mixed' : 'No card'}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {attention.length > 0 && (
            <div className="segmented small" role="radiogroup" aria-label="Rows">
              <button role="radio" aria-checked={onlyAttention} onClick={() => setOnlyAttention(true)}>
                Needs attention ({attention.length})
              </button>
              <button role="radio" aria-checked={!onlyAttention} onClick={() => setOnlyAttention(false)}>
                All ({rows.length})
              </button>
            </div>
          )}
        </div>

        <ul className="draft">
          {shown.map((r) => {
            const expanded = open === r.key;
            return (
              <li key={r.key} className={r.include ? '' : 'skipped'}>
                <div className="draft-row">
                  <input type="checkbox" checked={r.include} onChange={(e) => update(r, { include: e.target.checked })} aria-label={`Add ${r.merchant}`} />
                  <button className="draft-main" onClick={() => setOpen(expanded ? null : r.key)} aria-expanded={expanded}>
                    <span className="date">{shortDate(r.date)}</span>
                    <span className="merchant">{r.merchant}</span>
                    <span className={r.amount < 0 ? 'amount refund' : 'amount'}>{money(r.amount)}</span>
                  </button>
                </div>
                <div className="draft-meta">
                  {r.kind !== 'payment' && (
                    <select
                      className={r.categoryId ? 'chip' : 'chip missing'}
                      value={r.categoryId ?? ''}
                      onChange={(e) => setCategory(r, e.target.value || null)}
                      aria-label={`Category for ${r.merchant}`}
                    >
                      <option value="">❔ Pick a category</option>
                      {pickable(categories, r.categoryId).map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.emoji} {cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {r.kind === 'payment' && <span className="tag">card payment</span>}
                  {r.kind === 'refund' && <span className="tag">refund</span>}
                  {r.duplicateOf && <span className="tag warn">already imported?</span>}
                  {r.categorySource === 'rule' && <span className="tag">remembered</span>}
                  {!r.categoryId && r.include && r.kind !== 'payment' && <span className="tag warn">new merchant</span>}
                </div>
                {expanded && (
                  <div className="draft-details">
                    <label className="field">
                      Merchant
                      <input value={r.merchant} onChange={(e) => update(r, { merchant: e.target.value })} />
                    </label>
                    <label className="field">
                      Card
                      <select value={r.accountId ?? ''} onChange={(e) => update(r, { accountId: e.target.value || null })}>
                        <option value="">No card</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="raw">On the statement: {r.description}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {onlyAttention && attention.length > 0 && (
          <button className="row-link" onClick={() => setOnlyAttention(false)}>
            <span>{plural(rows.length - attention.length, 'other row')} look fine</span>
            <span>Show all ›</span>
          </button>
        )}

        <div className="sticky-actions">
          <button onClick={() => setDraft(null)}>Cancel</button>
          <button className="primary" onClick={confirm} disabled={!included.length}>
            Add {included.length} · {money(included.reduce((t, r) => t + r.amount, 0))}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <section className="panel">
        <h2>Import a statement</h2>
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
        {ocrStatus && <p className="note">{ocrStatus}</p>}
        {error && <p className="note warn">{error}</p>}
      </section>

      <details className="panel claude" open={!!replyError || undefined}>
        <summary>Can’t read your PDF? Let Claude read it</summary>
        <p className="hint">For scans and other banks’ layouts.</p>
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
      </details>
    </>
  );
}
