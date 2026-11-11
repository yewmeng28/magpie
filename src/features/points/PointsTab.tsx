import { useToast } from '../../app/toast';
import { useAccounts, useExpenses, usePoints, useRepos } from '../../data/RepoContext';
import { localDay } from '../../domain/expenses';
import { formatMoney } from '../../domain/money';
import {
  BASE_POINTS_PER_DOLLAR,
  FOREIGN_POINTS_PER_DOLLAR,
  currentCycle,
  cycleOf,
  estimateJourney,
  inCycle,
  milesFor,
  programOf,
  type Cycle,
  type PointsProgram,
  type PointsStatement,
} from '../../domain/points';
import type { Account, Expense } from '../../domain/types';

const n = (points: number) => points.toLocaleString('en-SG');

function day(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The first day of a cycle is the day after the previous statement. */
function firstDay(cycle: Cycle): string {
  const [y, m, d] = cycle.from.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return next.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

/** Credit card points: what each statement awarded, and a guess at what the open statement has earned so far. */
export function PointsTab() {
  const accounts = useAccounts() ?? [];
  const statements = usePoints() ?? [];
  const expenses = useExpenses() ?? [];
  const cards = accounts.filter((a) => a.kind === 'credit' && (programOf(a) || statements.some((s) => s.accountId === a.id)));

  if (!cards.length) {
    return (
      <section className="panel">
        <h2>Card points</h2>
        <p className="empty">
          No cards with points yet. Add a credit card in Settings, then import its statement: MagPie reads the points
          the statement shows.
        </p>
      </section>
    );
  }
  return (
    <>
      {cards.map((card) => (
        <CardPoints
          key={card.id}
          card={card}
          program={programOf(card)}
          statements={statements.filter((s) => s.accountId === card.id)}
          expenses={expenses.filter((e) => e.accountId === card.id)}
        />
      ))}
    </>
  );
}

function CardPoints({ card, program, statements, expenses }: { card: Account; program?: PointsProgram; statements: PointsStatement[]; expenses: Expense[] }) {
  const repos = useRepos();
  const toast = useToast();
  const latest = statements[0];
  const miles = latest && program ? milesFor(latest.balance, program) : undefined;
  const open = program?.canEstimate ? currentCycle(latest?.date, localDay()) : undefined;
  const openEstimate = open ? estimateJourney(inCycle(expenses, open)) : undefined;

  return (
    <>
      <section className="panel">
        <h2>{card.name}</h2>
        {latest ? (
          <>
            <p className="hero">{n(latest.balance)}</p>
            <p className="hint">
              {program?.unit ?? 'points'} available after the statement of {day(latest.date)}
              {miles !== undefined && ` · about ${n(miles)} KrisFlyer miles`}
            </p>
          </>
        ) : (
          <p className="empty">Import a {card.name} statement to start tracking its points.</p>
        )}
      </section>

      {open && openEstimate && (openEstimate.eligible > 0 || openEstimate.excluded > 0) && (
        <section className="panel">
          <h3>This statement so far</h3>
          <p className="hint">
            {firstDay(open)} to {day(open.to)}
          </p>
          <p className="hero">about {n(openEstimate.points)}</p>
          <p className="hint">
            from {formatMoney(openEstimate.eligible)} of spend that earns
            {openEstimate.excluded > 0 && `, leaving out ${formatMoney(openEstimate.excluded)} (${openEstimate.reasons.map(([why]) => why).join(', ')})`}.
          </p>
          <p className="hint">
            A rough guess at the base rate only: {BASE_POINTS_PER_DOLLAR} points per S$1, {FOREIGN_POINTS_PER_DOLLAR} abroad. It can come out too high, because
            hospitals, schools, parking and charities earn nothing and a statement doesn’t say which merchants those are, or too low, because online
            transport, food delivery and grocery purchases earn 4.5 more per S$1. The statement’s own figure is the one to trust.
          </p>
        </section>
      )}

      {program && !program.canEstimate && (
        <section className="panel">
          <p className="hint">
            MagPie doesn’t guess {card.name} points: its earning rules aren’t built in. Import each statement to keep what the bank awarded.
          </p>
        </section>
      )}

      {statements.length > 0 && (
        <section className="panel">
          <h3>Statements</h3>
          <ul className="accounts">
            {statements.map((s, i) => {
              const cycle = cycleOf(s.date, statements[i + 1]?.date);
              const spent = inCycle(expenses, cycle).reduce((t, e) => t + e.amount, 0);
              const estimate = program?.canEstimate ? estimateJourney(inCycle(expenses, cycle)) : undefined;
              const before = statements[i + 1];
              // A statement should start where the one before it ended; if not, a figure was misread or one is missing.
              const gap = before && s.broughtForward !== undefined && s.broughtForward !== before.balance;
              return (
                <li key={s.id}>
                  <span className="merchant">
                    {day(s.date)}
                    <small>
                      {n(s.balance)} available
                      {s.used > 0 && ` · ${n(s.used)} used or expired`}
                      {estimate && estimate.points > 0 && ` · guessed ${n(estimate.points)}`}
                      {!estimate && spent > 0 && ` · ${(s.earned / (spent / 100)).toFixed(1)} per S$1 spent`}
                    </small>
                    {gap && (
                      <small className="warn-text">
                        ⚠ Starts from {n(s.broughtForward!)}, but the statement before ended at {n(before.balance)}. Check the figures or import the one between.
                      </small>
                    )}
                  </span>
                  <span className="amount">+{n(s.earned)}</span>
                  <button
                    className="icon"
                    aria-label={`Remove the ${day(s.date)} statement’s points`}
                    onClick={async () => {
                      await repos.points.remove(s.id);
                      toast(`Removed the points from the ${day(s.date)} statement.`, () => repos.points.save(s));
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
