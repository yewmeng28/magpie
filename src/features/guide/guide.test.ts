import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuideTab } from './GuideTab';

// The rest of the app's source, to check the guide's button and field names against. This folder is left out, or
// every label would trivially match its own mention in the guide. (Vite keys files here as './…', so exclude by glob.)
const sources = Object.values(
  import.meta.glob<string>(['../../**/*.{ts,tsx}', '!./**', '!../../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }),
).join('\n');

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('Guide', () => {
  const html = renderToStaticMarkup(createElement(GuideTab, { onOpen: () => {} }));
  const labels = [...html.matchAll(/<strong class="ui">(.*?)<\/strong>/g)].map((m) => decode(m[1]));

  it('only names buttons and fields that exist in the app', () => {
    expect(sources).not.toContain('TOPICS');
    expect(labels.length).toBeGreaterThan(40);
    expect(labels.filter((label) => !sources.includes(label))).toEqual([]);
  });

  it('links each topic to the tab it explains', () => {
    expect(html.match(/Open (Spending|Trends|Owed|Import|Settings) →/g)).toHaveLength(9);
  });
});
