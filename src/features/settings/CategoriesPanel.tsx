import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useToast } from '../../app/toast';
import { useCategories, useExpenses, useRecurring, useRepos, useRules } from '../../data/RepoContext';
import { freeHue, move, newCategoryId, recolour } from '../../domain/categories';
import { FOLD_COLOR, isSeriesColor, SERIES_COLORS } from '../../domain/palette';
import type { Category } from '../../domain/types';

const HUES = [...Object.values(SERIES_COLORS), FOLD_COLOR];

/** The first emoji (or character) typed, so the field holds one symbol however it was entered. */
function firstSymbol(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed);
  return first.segment;
}

/** Add, rename, recolour, reorder, hide or delete categories. */
export function CategoriesPanel() {
  const categories = useCategories() ?? [];
  const expenses = useExpenses() ?? [];
  // null = closed, 'new' = adding one, or the category being edited.
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const count = (id: string) => expenses.filter((e) => e.categoryId === id).length;

  return (
    <section className="panel">
      <h2>Categories</h2>
      <ul className="accounts">
        {categories.map((c) => (
          <li key={c.id} className={c.hidden ? 'muted' : undefined}>
            <button className="list-row" onClick={() => setEditing(c)}>
              <span className="badge" style={{ background: `color-mix(in srgb, ${c.color} 30%, transparent)` }} aria-hidden>
                {c.emoji}
              </span>
              <span className="merchant">
                {c.name}
                <small>
                  {count(c.id)} expense{count(c.id) === 1 ? '' : 's'}
                  {c.hidden && ' · hidden'}
                  {!isSeriesColor(c.color) && ' · grey in charts'}
                </small>
              </span>
              <span className="chevron" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="actions start">
        <button onClick={() => setEditing('new')}>Add a category</button>
      </div>
      {editing && <CategorySheet category={editing === 'new' ? null : editing} count={editing === 'new' ? 0 : count(editing.id)} onClose={() => setEditing(null)} />}
    </section>
  );
}

function CategorySheet({ category, count, onClose }: { category: Category | null; count: number; onClose: () => void }) {
  const repos = useRepos();
  const toast = useToast();
  const categories = useCategories() ?? [];
  const expenses = useExpenses() ?? [];
  const rules = useRules() ?? [];
  const recurring = useRecurring() ?? [];
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(category?.name ?? '');
  const [emoji, setEmoji] = useState(category?.emoji ?? '🏷️');
  const [color, setColor] = useState(category?.color ?? freeHue(categories));
  const [hidden, setHidden] = useState(category?.hidden ?? false);
  const owner = (hue: string) => categories.find((c) => c.id !== category?.id && c.color.toLowerCase() === hue);
  const taken = isSeriesColor(color) ? owner(color) : undefined;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const close = () => dialog.current?.close();

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !emoji) return;
    // A new category has no order, so it follows the others; Move up/down gives every category one.
    const id = category?.id ?? newCategoryId(name, categories);
    const saved: Category = { ...category, id, name: name.trim(), emoji, color };
    if (hidden) saved.hidden = true;
    else delete saved.hidden;
    // Whoever had this hue turns grey in the same step.
    const changed = [saved, ...recolour(categories, id, color).filter((c) => c.id !== id)];
    const before = categories.filter((c) => changed.some((x) => x.id === c.id));
    await Promise.all(changed.map((c) => repos.categories.save(c)));
    close();
    const moved = changed.length > 1 ? ` ${changed[1].name} is grey now.` : '';
    toast(category ? `Saved ${saved.name}.${moved}` : `Added ${saved.name}.${moved}`, async () => {
      if (!category) await repos.categories.remove(id);
      await Promise.all(before.map((c) => repos.categories.save(c)));
    });
  }

  async function shift(by: -1 | 1) {
    if (!category) return;
    await Promise.all(move(categories, category.id, by).map((c) => repos.categories.save(c)));
  }

  async function remove() {
    if (!category) return;
    const used = expenses.filter((e) => e.categoryId === category.id);
    const learned = rules.filter((r) => r.categoryId === category.id);
    const repeats = recurring.filter((r) => r.categoryId === category.id);
    await repos.categories.remove(category.id);
    close();
    toast(`Deleted ${category.name}.${used.length ? ` Its ${used.length} expenses are uncategorised now.` : ''}`, async () => {
      await repos.categories.save(category);
      await Promise.all([
        ...used.map((x) => repos.expenses.save(x)),
        ...learned.map((x) => repos.rules.save(x)),
        ...repeats.map((x) => repos.recurring.save(x)),
      ]);
    });
  }

  const index = category ? categories.findIndex((c) => c.id === category.id) : -1;

  return (
    <dialog ref={dialog} className="sheet" aria-label={category ? `Edit ${category.name}` : 'Add a category'} onClose={onClose}>
      <form onSubmit={save}>
        <header className="sheet-head">
          <button type="button" className="text-button" onClick={close}>
            Cancel
          </button>
          <h2>{category ? 'Edit category' : 'New category'}</h2>
          <button type="submit" className="text-button strong" disabled={!name.trim() || !emoji}>
            Save
          </button>
        </header>

        <div className="field-row emoji-name">
          <label className="field">
            Emoji
            <input value={emoji} onChange={(e) => setEmoji(firstSymbol(e.target.value) || '')} aria-label="Emoji" className="emoji-input" />
          </label>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pets" autoFocus={!category} />
          </label>
        </div>

        <fieldset className="hues">
          <legend>Colour</legend>
          {HUES.map((hue) => {
            const by = isSeriesColor(hue) ? owner(hue) : undefined;
            return (
              <button
                type="button"
                key={hue}
                aria-pressed={color === hue}
                aria-label={hue === FOLD_COLOR ? 'Grey' : by ? `Colour used by ${by.name}` : 'Free colour'}
                style={{ '--swatch': hue } as CSSProperties}
                onClick={() => setColor(hue)}
              >
                {color === hue ? '✓' : by ? by.emoji : ''}
              </button>
            );
          })}
        </fieldset>
        <p className="hint">
          {taken
            ? `${taken.emoji} ${taken.name} has this colour now. Saving gives it to ${name.trim() || 'this category'}, and ${taken.name} turns grey.`
            : 'Each of the eight colours belongs to one category, so the charts stay easy to read. Grey can be shared: grey categories are drawn together as “Everything else”.'}
        </p>

        <label className="check">
          <input type="checkbox" checked={!hidden} onChange={(e) => setHidden(!e.target.checked)} />
          Show when picking a category
        </label>

        {category && (
          <>
            <div className="actions start">
              <button type="button" onClick={() => shift(-1)} disabled={index <= 0}>
                ↑ Move up
              </button>
              <button type="button" onClick={() => shift(1)} disabled={index >= categories.length - 1}>
                ↓ Move down
              </button>
            </div>
            <div className="actions start">
              <button type="button" className="danger" onClick={remove}>
                Delete {category.name}
              </button>
            </div>
            <p className="hint">
              {count
                ? `Deleting leaves its ${count} expense${count === 1 ? '' : 's'} uncategorised, and MagPie forgets the merchants it learned for it. To keep them, hide it instead.`
                : 'No expenses use it.'}
            </p>
          </>
        )}
      </form>
    </dialog>
  );
}
