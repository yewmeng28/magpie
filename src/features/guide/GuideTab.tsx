import { useEffect, type ReactNode } from 'react';
import { Mascot } from '../../app/Mascot';
import { TITLES, type Tab } from '../../app/tabs';

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
            <Ui>Import a statement</Ui> (behind the + in the middle of the tab bar): add a whole bank statement at once.
          </li>
          <li>
            <Ui>Settings</Ui>: your categories and cards, the merchants Maggie knows, backups, and this Guide.
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
            Tap the + in the middle of the tab bar, then <Ui>Add expense</Ui>.
          </li>
          <li>
            Type the <Ui>Amount</Ui>, pick a <Ui>Category</Ui>, and type the <Ui>Merchant</Ui> (the shop, or what it was).
          </li>
          <li>
            Check the <Ui>Date</Ui> and the <Ui>Card</Ui> you paid with, add a <Ui>Note</Ui> if you like, then tap <Ui>Save</Ui> at the top.
          </li>
        </ol>
        <p>
          MagPie remembers the card you last paid with. To change or remove an expense, tap it in the list; the same
          sheet has <Ui>Delete expense</Ui>.
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
            Tap the +, then <Ui>Import a statement</Ui>. Tap <Ui>Choose PDF statement</Ui> and pick the statement your bank sent you. MagPie reads it on
            this device. It’s built for POSB/DBS and HSBC statements, and tries any statement whose lines start with a date.
          </li>
          <li>
            If the PDF has a password, type it and tap <Ui>Unlock</Ui>.
          </li>
          <li>
            Check the draft. It opens on <Ui>Needs attention</Ui>: shops Maggie doesn’t know and rows that look already
            imported. Pick a category from a row’s chip; it fixes every row from that merchant. Set the card once with{' '}
            <Ui>Card for every row</Ui>, and tap a row to change its merchant or card on its own.
          </li>
          <li>
            Tap <Ui>Add</Ui> to save. Nothing is saved before that, and MagPie then opens the statement’s month. Changed your
            mind? Tap <Ui>Undo</Ui> straight away, or remove it later under <Ui>Recent imports</Ui> in Settings.
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
          For statements MagPie can’t read itself, like scans or other banks, open <Ui>Can’t read your PDF? Let Claude read it</Ui> on the Import screen:
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
            of <Ui>All cards</Ui> to see just that card.
          </li>
          <li>
            <Ui>Bars</Ui> lists every category. <Ui>Pie</Ui> shows the biggest ones: hold a slice to see its amount in the
            middle, and slide your finger around the ring to check the others.
          </li>
          <li>
            Tap a slice, a bar or a category under the chart to list only its expenses. Tap the category’s chip above the
            list to show everything again.
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
          <Ui>Show</Ui> picks what to draw: <Ui>All spending</Ui>, a single category, or <Ui>Each category</Ui>: one row per
          category with its 12 months as a small line, and this month against its usual month. Tap a row for its chart.
        </li>
        <li>Hold the chart and slide along it to see each month’s figures. ‹ and › move a year at a time.</li>
        <li>
          The top box compares this month with last month. <Ui>Average a month</Ui> and <Ui>Highest month</Ui> sum up the
          12 months, and <Ui>Show as a table</Ui> lists every figure.
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
          <Ui>Owed</Ui> shows how much you’re owed, by person and by bill. When someone pays a bill back, tap its{' '}
          <Ui>Paid</Ui> switch (tap again to undo), or <Ui>Part…</Ui> to type an amount. Fully paid bills move to{' '}
          <Ui>Settled</Ui>.
        </p>
        <p>
          Tap a person to see everything they owe. <Ui>Record</Ui> a payment and it pays off their oldest bills first;{' '}
          <Ui>Mark all paid</Ui> settles everything. <Ui>Remind</Ui> sends them a message listing what they owe, with your
          PayNow number if you’ve added it under <Ui>Your PayNow number</Ui> in Settings.
        </p>
      </>
    ),
  },
  {
    id: 'recurring',
    emoji: '↻',
    title: 'Repeat a payment',
    tab: 'settings',
    body: (
      <>
        <p>
          For a bill or subscription, open the expense and set <Ui>Repeats</Ui> to every week, month or year, then tap{' '}
          <Ui>Save</Ui>. MagPie adds it again each time it’s due, even for dates you missed while the app was closed.
        </p>
        <p>
          MagPie also spots payments that already repeat: the same merchant and amount on the same date in back-to-back
          months. They’re listed under <Ui>Looks recurring</Ui> in <Ui>Recurring payments</Ui> in Settings; tap{' '}
          <Ui>Add</Ui> or <Ui>Add all</Ui>. To stop one, tap <Ui>Stop</Ui>; the payments already added stay.
        </p>
      </>
    ),
  },
  {
    id: 'cards',
    emoji: '💳',
    title: 'Set up your cards',
    tab: 'settings',
    body: (
      <>
        <p>
          Add each card under <Ui>Add a card</Ui> in <Ui>Settings</Ui>; cash counts as a card too. In <Ui>Name on statements</Ui>, type the card’s name
          exactly as your statement prints it (like “DBS LIVE FRESH CARD”), so imported rows land on the right card by
          themselves.
        </p>
        <p>
          Deleting a card keeps its expenses; they show <Ui>No card</Ui> instead.
        </p>
      </>
    ),
  },
  {
    id: 'categories',
    emoji: '🎨',
    title: 'Make the categories yours',
    tab: 'settings',
    body: (
      <>
        <p>
          Under <Ui>Categories</Ui> in Settings, tap one to rename it, change its emoji or colour, or move it up or down
          the list. <Ui>Add a category</Ui> makes a new one.
        </p>
        <p>
          The eight colours are picked to stay easy to tell apart in the charts, so each belongs to one category. Taking a
          colour from another category turns that one grey; grey categories are drawn together as “Everything else”.
        </p>
        <p>
          To stop seeing one when you pick a category, untick <Ui>Show when picking a category</Ui>; its expenses keep it.
          Deleting a category leaves its expenses uncategorised, with Undo just after.
        </p>
      </>
    ),
  },
  {
    id: 'learn',
    emoji: '🏷️',
    title: 'Teach Maggie your merchants',
    tab: 'settings',
    body: (
      <p>
        Maggie already knows many Singapore shops. When you pick a category for one she doesn’t know, in an import draft or
        by editing an expense, she remembers it for every future import. Under <Ui>Learned merchants</Ui> in Settings you
        can change one’s category, or tap × to make her forget it.
      </p>
    ),
  },
  {
    id: 'backup',
    emoji: '💾',
    title: 'Back up, or move to another device',
    tab: 'settings',
    body: (
      <>
        <ol>
          <li>
            In <Ui>Settings</Ui>, tap <Ui>Back up now</Ui>. On iPhone the share sheet opens: choose Save to Files, or
            AirDrop it to another device. Keep the file somewhere private: it holds your spending in plain text.
          </li>
          <li>
            On the other device, open MagPie, tap <Ui>Restore backup</Ui> and pick the file. Tap <Ui>Replace everything</Ui> to confirm; it replaces
            everything there.
          </li>
        </ol>
        <p>
          Your data lives only in this browser. Clearing website data erases it, and on iPhone, Safari can clear it if you
          don’t open MagPie for a while (installing it on your Home Screen avoids that). Settings shows when you last backed
          up, and Spending reminds you once a month.
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
/** Opens on `topic` when given (e.g. from Get started), or on the first one. */
export function GuideTab({ onOpen, topic: openOn }: { onOpen: (tab: Tab) => void; topic?: string }) {
  useEffect(() => {
    if (openOn) document.getElementById(`guide-${openOn}`)?.scrollIntoView({ block: 'start' });
  }, [openOn]);
  return (
    <>
      <div className="nest-intro">
        <Mascot size={56} label="Maggie the magpie" />
        <p className="hint">Maggie’s guide to MagPie. Tap a topic to open it.</p>
      </div>
      <section className="panel guide">
        {TOPICS.map((topic, i) => (
          <details key={topic.id} id={`guide-${topic.id}`} open={openOn ? topic.id === openOn : i === 0}>
            <summary>
              <span aria-hidden>{topic.emoji}</span> {topic.title}
            </summary>
            <div className="guide-body">
              {topic.body}
              {topic.tab && (
                <button className="go" onClick={() => onOpen(topic.tab!)}>
                  Open {TITLES[topic.tab]} →
                </button>
              )}
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
