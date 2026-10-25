import type { ReactNode } from 'react';
import { Mascot } from '../../app/Mascot';
import { TABS, type Tab } from '../../app/tabs';

/** A label exactly as it appears in the app. guide.test.ts checks each one still exists, so this guide can't drift. */
const Ui = ({ children }: { children: string }) => <strong className="ui">{children}</strong>;

interface Topic {
  id: string;
  emoji: string;
  title: string;
  /** The tab this topic is about, offered as a shortcut. */
  tab?: Tab;
  body: ReactNode;
}

const TOPICS: Topic[] = [
  {
    id: 'start',
    emoji: '🐦',
    title: 'What MagPie does',
    body: (
      <>
        <p>
          MagPie tracks what you spend. Maggie the magpie sorts each expense into a category, so you can see where your
          money goes, how it changes month to month, and who still owes you for a shared bill.
        </p>
        <p>
          Everything stays in this browser, on this device. Nothing is uploaded, unless you choose to let Claude read a
          statement for you.
        </p>
        <ul>
          <li>
            <Ui>Spending</Ui>: your expenses by day, month or year, as bars or a pie.
          </li>
          <li>
            <Ui>Trends</Ui>: how your spending changes over 12 months.
          </li>
          <li>
            <Ui>Owed</Ui>: money friends owe you from split bills.
          </li>
          <li>
            <Ui>Import</Ui>: add a whole bank statement at once.
          </li>
          <li>
            <Ui>Nest</Ui>: your cards and accounts, the merchants Maggie knows, and backups.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'add',
    emoji: '➕',
    title: 'Add an expense',
    tab: 'spending',
    body: (
      <>
        <ol>
          <li>
            On <Ui>Spending</Ui>, tap the gold + button.
          </li>
          <li>
            Type the <Ui>Amount</Ui>, pick a <Ui>Category</Ui>, and say <Ui>What for</Ui> (like “Chicken rice”).
          </li>
          <li>
            Check the <Ui>Date</Ui> and what you <Ui>Paid with</Ui>, add a <Ui>Note</Ui> if you like, then tap <Ui>Save</Ui>.
          </li>
        </ol>
        <p>
          MagPie remembers the account you last paid with. To change or remove an expense, tap it in the list; the same
          sheet has <Ui>Delete</Ui>.
        </p>
      </>
    ),
  },
  {
    id: 'pdf',
    emoji: '📄',
    title: 'Import a bank statement',
    tab: 'import',
    body: (
      <>
        <ol>
          <li>
            On <Ui>Import</Ui>, tap <Ui>Choose PDF statement</Ui> and pick the statement your bank sent you. MagPie reads it on
            this device. It’s built for POSB/DBS and HSBC statements, and tries any statement whose lines start with a date.
          </li>
          <li>
            If the PDF has a password, type it and tap <Ui>Unlock</Ui>.
          </li>
          <li>
            Check the draft. Untick rows you don’t want. Fixing one row’s category fixes every row from that merchant. Set
            the card with <Ui>Account for every row</Ui>, or row by row.
          </li>
          <li>
            Tap <Ui>Add</Ui> to save. Nothing is saved before that.
          </li>
        </ol>
        <p>The draft checks itself against the statement:</p>
        <ul>
          <li>A green note means every row adds up to the statement’s own totals.</li>
          <li>An orange note means a row may be missing or misread. Compare the draft with the statement.</li>
          <li>
            <Ui>card payment</Ui> rows (paying off the card) are unticked: they aren’t spending.
          </li>
          <li>
            <Ui>already imported?</Ui> rows are unticked so nothing is counted twice.
          </li>
          <li>
            <Ui>new merchant</Ui> means Maggie doesn’t know it yet. Pick a category and she’ll remember it.
          </li>
        </ul>
        <p>
          If MagPie says the PDF has no readable text, it’s a scan, or it was flattened (redacting often does this). Use the
          original statement from your bank, or let Claude read it.
        </p>
      </>
    ),
  },
  {
    id: 'claude',
    emoji: '🤖',
    title: 'Let Claude read a statement',
    tab: 'import',
    body: (
      <>
        <p>
          For statements MagPie can’t read itself, like scans or other banks, use <Ui>Or let Claude read it</Ui>:
        </p>
        <ol>
          <li>
            Tap <Ui>Copy prompt</Ui>.
          </li>
          <li>Paste it into a Claude chat and attach the statement.</li>
          <li>
            Copy Claude’s whole reply into <Ui>Paste Claude’s reply here</Ui> and tap <Ui>Review draft</Ui>. A saved reply can
            be loaded with <Ui>Open .json file</Ui>.
          </li>
        </ol>
        <p className="note warn">
          This sends the statement to Claude. Cover card numbers, your name and your address first. Black boxes drawn on a
          PDF often leave the text underneath readable, so a screenshot of just the transactions is safer.
        </p>
      </>
    ),
  },
  {
    id: 'spending',
    emoji: '🥧',
    title: 'See where your money goes',
    tab: 'spending',
    body: (
      <>
        <ul>
          <li>
            Pick <Ui>Day</Ui>, <Ui>Month</Ui> or <Ui>Year</Ui>, and step back and forward with ‹ and ›. Choose a card instead
            of <Ui>All accounts</Ui> to see just that card.
          </li>
          <li>
            <Ui>Bars</Ui> lists every category. <Ui>Pie</Ui> shows the biggest ones: hold a slice to see its amount in the
            middle, and slide your finger around the ring to check the others.
          </li>
          <li>
            The pie shows up to six slices. Smaller categories share one grey slice, <Ui>Everything else</Ui>; the list under
            the pie shows what’s in it.
          </li>
        </ul>
        <p>
          Totals count only your share of split bills. Refunds reduce their category, and card payments aren’t counted.
          So a month’s total won’t match your statement, which mixes in payments and runs across two months.
        </p>
      </>
    ),
  },
  {
    id: 'trends',
    emoji: '📈',
    title: 'Spot your spending habits',
    tab: 'trends',
    body: (
      <ul>
        <li>
          <Ui>Show</Ui> picks what to draw: <Ui>All spending</Ui>, <Ui>Each category</Ui> (one line each, in its own colour),
          or a single category.
        </li>
        <li>Hold the chart and slide along it to see each month’s figures. ‹ and › move a year at a time.</li>
        <li>
          <Ui>Average a month</Ui> and <Ui>Highest month</Ui> sum up the 12 months. <Ui>Show as a table</Ui> lists every
          figure.
        </li>
      </ul>
    ),
  },
  {
    id: 'split',
    emoji: '🤝',
    title: 'Split a bill and track who owes you',
    tab: 'owed',
    body: (
      <>
        <ol>
          <li>
            Tap the expense on <Ui>Spending</Ui>, then <Ui>Split with others</Ui>.
          </li>
          <li>
            Choose <Ui>Equally</Ui> (keep <Ui>Include me</Ui> ticked if you had a share too) or <Ui>Custom</Ui> amounts. Add
            people with <Ui>+ Add person</Ui>. Names are optional; unnamed people show as Friend 1, Friend 2…
          </li>
          <li>
            Tap <Ui>Save</Ui>. Only <Ui>Your share</Ui> counts as your spending.
          </li>
        </ol>
        <p>
          <Ui>Owed</Ui> shows how much you’re owed, by person and by bill. When someone pays you back, tap <Ui>Paid</Ui> for all
          of it, or <Ui>Part</Ui> and type the amount. <Ui>Unpaid</Ui> undoes it. Fully paid bills move to <Ui>Settled</Ui>.
        </p>
      </>
    ),
  },
  {
    id: 'cards',
    emoji: '💳',
    title: 'Set up your cards',
    tab: 'nest',
    body: (
      <>
        <p>
          Add each card under <Ui>Add an account</Ui> in <Ui>Nest</Ui>. In <Ui>Name on statements</Ui>, type the card’s name
          exactly as your statement prints it (like “DBS LIVE FRESH CARD”), so imported rows land on the right card by
          themselves.
        </p>
        <p>
          Deleting an account keeps its expenses; they show <Ui>No account</Ui> instead.
        </p>
      </>
    ),
  },
  {
    id: 'learn',
    emoji: '🏷️',
    title: 'Teach Maggie your merchants',
    tab: 'nest',
    body: (
      <p>
        Maggie already knows many Singapore shops. When you pick a category for one she doesn’t know, in an import draft or
        by editing an expense, she remembers it for every future import. To make her forget one, tap × next to it under{' '}
        <Ui>Merchants Maggie has learned</Ui>.
      </p>
    ),
  },
  {
    id: 'backup',
    emoji: '💾',
    title: 'Back up, or move to another device',
    tab: 'nest',
    body: (
      <>
        <ol>
          <li>
            In <Ui>Nest</Ui>, tap <Ui>Export backup</Ui>. Keep the file somewhere private: it holds your spending in plain
            text.
          </li>
          <li>
            On the other device, open MagPie, tap <Ui>Restore backup</Ui> and pick the file. This replaces everything there.
          </li>
        </ol>
        <p>
          Your data lives only in this browser. Clearing website data erases it, and on iPhone, Safari can clear it if you
          don’t open MagPie for a while (installing it on your Home Screen avoids that). Export a backup now and then.
        </p>
      </>
    ),
  },
  {
    id: 'install',
    emoji: '📱',
    title: 'Install MagPie as an app',
    body: (
      <>
        <ul>
          <li>
            iPhone or iPad: open MagPie in Safari, tap the Share button, then <em>Add to Home Screen</em>.
          </li>
          <li>
            Android: open it in Chrome, tap ⋮, then <em>Install app</em> (or <em>Add to Home screen</em>).
          </li>
        </ul>
        <p>It then opens full screen and works offline, including reading statements.</p>
      </>
    ),
  },
];

/** How to use MagPie, one collapsible topic per task. */
export function GuideTab({ onOpen }: { onOpen: (tab: Tab) => void }) {
  return (
    <>
      <div className="nest-intro">
        <Mascot size={56} label="Maggie the magpie" />
        <p className="hint">Maggie’s guide to MagPie. Tap a topic to open it.</p>
      </div>
      <section className="panel guide">
        {TOPICS.map((topic, i) => (
          <details key={topic.id} open={i === 0}>
            <summary>
              <span aria-hidden>{topic.emoji}</span> {topic.title}
            </summary>
            <div className="guide-body">
              {topic.body}
              {topic.tab && (
                <button className="go" onClick={() => onOpen(topic.tab!)}>
                  Open {TABS.find((t) => t.id === topic.tab)!.label} →
                </button>
              )}
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
