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
        <a href="https://github.com/githooked/githooked">GitHub</a>
      </nav>
      <a class="button button-small" href="${base}docs/#quick-start"><i data-lucide="terminal"></i> Get started</a>
      <button class="menu" type="button" aria-label="Open navigation" aria-expanded="false"><i data-lucide="menu"></i></button>`;
}

export function mountSiteHeader(page: SitePage): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (!header) return;
  const base = withTrailingSlash(header.dataset.base ?? '/');
  const logoUrl = `${base}assets/hooky-logo.png`;
  header.innerHTML = siteHeaderMarkup(page, base);
  for (const face of document.querySelectorAll<HTMLElement>('.brand-face')) {
    face.innerHTML = `<img class="brand-logo" src="${logoUrl}" alt="" aria-hidden="true" width="48" height="48">`;
  }
}
