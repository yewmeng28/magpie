import { describe, expect, it } from 'vitest';
import { repairAmount } from './statementOcr';

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
