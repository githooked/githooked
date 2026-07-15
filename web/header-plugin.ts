import type { Plugin } from 'vite';
import { siteHeaderMarkup, type SitePage } from './src/header.js';

function pageFor(filename: string): SitePage {
  const normalized = filename.replaceAll('\\', '/');
  if (normalized.endsWith('/docs/index.html')) return 'docs';
  if (normalized.endsWith('/library/index.html')) return 'library';
  return 'home';
}

export function sharedHeaderPlugin(): Plugin {
  let base = '/';
  return {
    name: 'git-hooked-shared-header',
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const marker = /<header class="nav wrap" data-site-header data-base="[^"]*"><\/header>/;
        if (!marker.test(html)) return html;
        const page = pageFor(context.filename);
        const content = siteHeaderMarkup(page, base);
        return html.replace(marker, `<header class="nav wrap" data-site-header data-base="${base}">\n      ${content}\n    </header>`);
      },
    },
  };
}
