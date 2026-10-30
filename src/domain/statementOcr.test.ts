import { describe, expect, it } from 'vitest';
import { imageScale, renderScale, repairAmount, repairMonths } from './statementOcr';

const words = (line: string) => line.split(' ').map((text) => ({ text }));
const repaired = (line: string) => repairAmount(words(line)).map((w) => w.text).join(' ');

describe('repairAmount', () => {
  it('restores a dropped decimal point on a transaction line', () => {
    expect(repaired('15 Sep 14 Sep AKITCHEN - TAMPINES 1 2570')).toBe('15 Sep 14 Sep AKITCHEN - TAMPINES 1 25.70');
  });
  it('turns a comma into a decimal point', () => {
    expect(repaired('15 Sep 14 Sep SHOP 25,70')).toBe('15 Sep 14 Sep SHOP 25.70');
  });
  it('leaves lines that already have an amount, and lines that are not transactions', () => {
    expect(repaired('15 Sep 14 Sep SHOP 25.70')).toBe('15 Sep 14 Sep SHOP 25.70');
    expect(repaired('15 Sep 14 Sep SHOP 25.70 CR')).toBe('15 Sep 14 Sep SHOP 25.70 CR');
    expect(repaired('REF NO 1234567')).toBe('REF NO 1234567');
  });
});

describe('repairMonths', () => {
  const fixed = (...texts: string[]) => repairMonths(texts.map((text) => ({ text }))).map((w) => w.text);
  it('reads a zero as the O of Oct', () => {
    expect(fixed('010ct', '0ct', '02', 'Oct', 'COSTCO')).toEqual(['01 Oct', 'Oct', '02', 'Oct', 'COSTCO']);
  });
});

describe('renderScale', () => {
  it('renders an A4 page at 4x and a huge page smaller, to stay under the iOS canvas limit', () => {
    expect(renderScale({ width: 595, height: 842 })).toBe(4);
    const big = renderScale({ width: 3000, height: 4000 });
    expect(big).toBeLessThan(1.1);
    expect(3000 * big * 4000 * big).toBeLessThanOrEqual(12_000_001);
  });
});

describe('imageScale', () => {
  it('enlarges a phone screenshot to about 2400 px wide, within the canvas limit', () => {
    const scale = imageScale({ width: 1125, height: 2436 });
    expect(scale).toBeGreaterThan(2);
    expect(1125 * scale * 2436 * scale).toBeLessThanOrEqual(12_000_001);
  });
  it('leaves an already large image alone', () => {
    expect(imageScale({ width: 3000, height: 3000 })).toBeCloseTo(1, 5);
  });
});
