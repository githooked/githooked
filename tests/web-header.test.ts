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
    expect(header).toContain('class="github-mark"');
    expect(header).toContain('data-lucide="download"></i> Install');
    expect(header).toContain('/githooked/docs/#quick-start');
    expect(header.match(/aria-current="page"/g) ?? []).toHaveLength(page === 'home' ? 0 : 1);
  });

  it('keeps every page on the shared mounting point instead of duplicating navigation markup', async () => {
    for (const path of ['web/index.html', 'web/docs/index.html', 'web/library/index.html']) {
      const html = await readFile(path, 'utf8');
      expect(html).toContain('<link rel="stylesheet" href="/src/style.css">');
      expect(html).toContain('<link rel="stylesheet" href="/src/header.css">');
      expect(html).toContain('<link rel="icon" type="image/png" href="%BASE_URL%favicon.png">');
      expect(html).toContain('<header class="nav wrap" data-site-header data-base="%BASE_URL%"></header>');
      expect(html).not.toContain('<nav aria-label="Main navigation">');
    }
  });

  it('shows concrete secret blocking and rule creation examples on the homepage', async () => {
    const html = await readFile('web/index.html', 'utf8');
    expect(html.indexOf('id="install"')).toBeLessThan(html.indexOf('id="how"'));
    expect(html.indexOf('id="rules"')).toBeLessThan(html.indexOf('id="use"'));
    expect(html).toContain('Checks run automatically.');
    for (const agent of ['Codex', 'Claude Code', 'Gemini CLI', 'Copilot CLI', 'Cursor Agent']) expect(html).toContain(agent);
    expect(html).toContain('Coding agent detected: Codex');
    expect(html).toContain('npx @githooked/cli init');
    expect(html).toContain('&lt;user creates src/api.ts&gt;');
    expect(html).toContain('git add src/api.ts');
    expect(html).toContain('accessToken exposed in API response');
    for (const image of ['hooky-install.png', 'hooky-detective.png', 'hooky-docs.png']) expect(html).toContain(image);
    expect(html).not.toContain('hooks/pre-commit.yml');
    expect(html).toContain('git add .env &amp;&amp; git commit');
    expect(html).toContain("Are you mad?! You're trying to commit a .env file!");
    expect(html).toContain('builtin:env-files');
    expect(html).toContain('git-hooked rule add');
    expect(html).toContain('Preview &amp; approve');
    expect(html).toContain('Nothing changes until you approve.');
    expect(html).not.toContain('Read-only review');
    expect(html).not.toContain('id="create-rule"');
  });
});
