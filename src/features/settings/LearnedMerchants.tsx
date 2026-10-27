import { useToast } from '../../app/toast';
import { useCategories, useExpenses, useRepos, useRules } from '../../data/RepoContext';
import { pickable, ruleNames } from '../../domain/categories';
import { merchantKey } from '../../domain/merchant';

/** The merchants MagPie files on its own, by name, each with its category to change in place. */
export function LearnedMerchants() {
  const repos = useRepos();
  const toast = useToast();
  const rules = useRules() ?? [];
  const categories = useCategories() ?? [];
  const names = ruleNames(rules, useExpenses() ?? [], merchantKey);
  const sorted = [...rules].sort((a, b) => names.get(a.id)!.localeCompare(names.get(b.id)!));

  return (
    <section className="panel">
      <h2>Learned merchants</h2>
      {rules.length ? (
        <>
          <p className="hint">Maggie files these on her own when you add or import them. Change a category here, or forget one.</p>
          <ul className="rules">
            {sorted.map((r) => {
              const name = names.get(r.id)!;
              return (
                <li key={r.id}>
                  <span className="name">{name}</span>
                  <select
                    className="chip"
                    value={r.categoryId}
                    aria-label={`Category for ${name}`}
                    onChange={(e) => repos.rules.save({ ...r, categoryId: e.target.value, updatedAt: Date.now() })}
                  >
                    {pickable(categories, r.categoryId).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon"
                    aria-label={`Forget ${name}`}
                    onClick={async () => {
                      await repos.rules.remove(r.id);
                      toast(`Forgot ${name}.`, () => repos.rules.save(r));
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="hint">None yet. Categories you pick when importing or editing an expense are remembered here.</p>
      )}
    </section>
  );
}
