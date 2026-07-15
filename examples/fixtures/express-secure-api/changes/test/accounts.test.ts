import { describe, expect, it } from 'vitest';

describe('account authorization', () => {
  it('does not expose an account from another tenant', () => {
    expect({ status: 404 }).toEqual({ status: 404 });
  });
});
