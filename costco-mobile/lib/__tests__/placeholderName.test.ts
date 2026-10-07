import { placeholderNameFor } from '../placeholderName';

describe('placeholderNameFor', () => {
  it('falls back to the first name when there is no user id', () => {
    expect(placeholderNameFor(null)).toBe('Jamie Doe');
    expect(placeholderNameFor(undefined)).toBe('Jamie Doe');
    expect(placeholderNameFor('')).toBe('Jamie Doe');
  });

  it('is stable for the same user across calls', () => {
    const id = '6f1c2a3b-0000-4000-8000-000000000001';
    expect(placeholderNameFor(id)).toBe(placeholderNameFor(id));
  });

  it('spreads different users across the list', () => {
    const names = new Set(
      Array.from({ length: 50 }, (_, i) => placeholderNameFor(`user-${i}`)),
    );
    expect(names.size).toBeGreaterThan(1);
  });
});
