import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const pages = [
  { html: 'web/index.html', markdown: 'web/public/index.md', href: '%BASE_URL%index.md' },
  { html: 'web/docs/index.html', markdown: 'web/public/docs/index.md', href: '%BASE_URL%docs/index.md' },
  { html: 'web/library/index.html', markdown: 'web/public/library/index.md', href: '%BASE_URL%library/index.md' },
];

describe('AI-readable website', () => {
  it('publishes llms.txt and a discoverable Markdown equivalent for every page', async () => {
    const llms = await readFile('web/public/llms.txt', 'utf8');
    for (const page of pages) {
      await access(page.markdown);
      const html = await readFile(page.html, 'utf8');
      expect(html).toContain(`<link rel="alternate" type="text/markdown" href="${page.href}"`);
      expect(html).toContain('>llms.txt</a>');
      expect(llms).toContain(page.href.replace('%BASE_URL%', 'https://githooked.github.io/githooked/'));
    }
  });

  it('offers a safe, copyable installation prompt for coding agents', async () => {
    const html = await readFile('web/index.html', 'utf8');
    const docs = await readFile('web/docs/index.html', 'utf8');
    const script = await readFile('web/src/main.ts', 'utf8');
    expect(html).toContain('Copy and paste this into your coding agent.');
    expect(html).toContain('data-copy-agent');
    expect(html).toContain('Do not bypass any safety checks.');
    expect(html).toContain('as a development dependency');
    expect(script).toContain("document.querySelector<HTMLButtonElement>('[data-copy-agent]')");
    expect(script).toContain("navigator.clipboard.writeText(value)");
    expect(script).toContain("document.execCommand('copy')");
    expect(docs).toContain('npm install --save-dev @githooked/cli');
    expect(docs).not.toContain('npm install --global @githooked/cli');
  });
});
