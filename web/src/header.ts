export type SitePage = 'home' | 'docs' | 'library';

function withTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function current(page: SitePage, target: SitePage): string {
  return page === target ? ' aria-current="page"' : '';
}

export function brandMarkup(href: string, logoUrl: string): string {
  return `<a class="brand" href="${href}" aria-label="Git Hooked home"><span class="brand-face"><img class="brand-logo" src="${logoUrl}" alt="" aria-hidden="true" width="48" height="48"></span><span>git hooked</span></a>`;
}

export function siteHeaderMarkup(page: SitePage, baseUrl: string): string {
  const base = withTrailingSlash(baseUrl);
  const logoUrl = `${base}assets/hooky-logo.png`;
  return `${brandMarkup(page === 'home' ? '#top' : base, logoUrl)}
      <nav aria-label="Main navigation">
        <a href="${base}#how">How it works</a>
        <a href="${base}docs/"${current(page, 'docs')}>Docs</a>
        <a href="${base}library/"${current(page, 'library')}>Library</a>
        <a class="github-nav" href="https://github.com/githooked/githooked" aria-label="GitHub" title="GitHub"><svg class="github-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.97 10.97 0 0 1 5.75 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.73.81 1.18 1.83 1.18 3.09 0 4.41-2.7 5.38-5.28 5.67.42.36.78 1.07.78 2.16v3.21c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg><span class="sr-only">GitHub</span></a>
      </nav>
      <a class="button button-small" href="${base}docs/#quick-start"><i data-lucide="download"></i> Install</a>
      <button class="menu" type="button" aria-label="Open navigation" aria-expanded="false"><i data-lucide="menu"></i></button>`;
}

export function mountSiteHeader(page: SitePage): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (!header) return;
  const base = withTrailingSlash(header.dataset.base ?? '/');
  const logoUrl = `${base}assets/hooky-logo.png`;
  if (!header.childElementCount) header.innerHTML = siteHeaderMarkup(page, base);
  for (const face of document.querySelectorAll<HTMLElement>('.brand-face')) {
    face.innerHTML = `<img class="brand-logo" src="${logoUrl}" alt="" aria-hidden="true" width="48" height="48">`;
  }
}
