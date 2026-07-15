import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { siteHeaderMarkup, type SitePage } from '../web/src/header.js';

describe('shared website header', () => {
  it.each<SitePage>(['home', 'docs', 'library'])('renders the same navigation and mascot brand for %s', (page) => {
    const header = siteHeaderMarkup(page, '/githooked/');
    expect(header).toContain('/githooked/assets/hooky-logo.png');
    expect(header).toContain('How it works');
    expect(header).toContain('/githooked/docs/');
    expect(header).toContain('/githooked/library/');
    expect(header).toContain('https://github.com/githooked/githooked');
    expect(header).toContain('/githooked/docs/#quick-start');
    expect(header.match(/aria-current="page"/g) ?? []).toHaveLength(page === 'home' ? 0 : 1);
  });

  it('keeps every page on the shared mounting point instead of duplicating navigation markup', async () => {
    for (const path of ['web/index.html', 'web/docs/index.html', 'web/library/index.html']) {
      const html = await readFile(path, 'utf8');
      expect(html).toContain('<header class="nav wrap" data-site-header data-base="%BASE_URL%"></header>');
      expect(html).not.toContain('<nav aria-label="Main navigation">');
    }
  });
});
