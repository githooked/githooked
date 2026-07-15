import { expect, it } from 'vitest';
import { formatName } from '../src/format.js';

it('formats a user name', () => {
  expect(formatName(' hooky ')).toBe('HOOKY');
});
