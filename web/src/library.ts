import './style.css';
import './icons.css';
import './pages.css';
import './header.css';
import {
  ArrowRight, Bot, Check, Copy, createIcons, Menu, PackageOpen, Search, Terminal, Zap,
} from 'lucide';
import { builtinChecks, guidePacks, type BuiltinCheck, type GuidePack } from './catalog';
import { bindCopyButtons, bindNavigation } from './site';
import { mountSiteHeader } from './header';

type CatalogFilter = 'all' | 'security' | 'quality' | 'deterministic' | 'semantic';

const renderIcons = (): void => createIcons({
  icons: { ArrowRight, Bot, Check, Copy, Menu, PackageOpen, Search, Terminal, Zap },
});

function builtinCard(check: BuiltinCheck): string {
  const family = check.category === 'security' ? 'security' : 'quality';
  const filters = `${family} ${check.kind} ${check.category}`;
  const searchable = `${check.id} ${check.name} ${check.description} ${filters}`.toLowerCase();
  const severity = check.severity === 'agent-assessed' ? 'assessed by agent' : check.severity;
  return `
    <article class="catalog-card" data-catalog-card data-filters="${filters}" data-search="${searchable}">
      <div class="catalog-card-top">
        <span class="kind-badge ${check.kind === 'semantic' ? 'semantic' : ''}"><i data-lucide="${check.kind === 'semantic' ? 'bot' : 'zap'}"></i>${check.kind}</span>
        ${check.defaultHook ? '<span class="default-mark">Default</span>' : ''}
      </div>
      <h3>${check.name}</h3>
      <p>${check.description}</p>
      <span class="catalog-id">builtin:${check.id}</span>
      <div class="catalog-card-footer">
        <span class="severity-badge">${severity}</span>
        ${check.defaultHook ? `<span class="hook-badge">${check.defaultHook}</span>` : ''}
      </div>
    </article>`;
}

function guideCard(pack: GuidePack): string {
  const filters = `${pack.family} semantic ${pack.checks.map((check) => check.category).join(' ')}`;
  const searchable = `${pack.id} ${pack.name} ${pack.description} ${pack.checks.map((check) => `${check.id} ${check.name}`).join(' ')} ${filters}`.toLowerCase();
  const command = `git-hooked guide add ${pack.id}`;
  return `
    <article class="catalog-card pack-card" data-catalog-card data-filters="${filters}" data-search="${searchable}">
      <div class="catalog-card-top">
        <span class="kind-badge ${pack.family === 'quality' ? 'pack-quality' : ''}"><i data-lucide="package-open"></i>${pack.family} pack</span>
        <span class="hook-badge">${pack.defaultHook}</span>
      </div>
      <h3>${pack.name}</h3>
      <p>${pack.description}</p>
      <div class="install-command"><span>${command}</span><button type="button" data-copy="${command}" aria-label="Copy install command for ${pack.name}"><i data-lucide="copy"></i><span>Copy</span></button></div>
      <ul class="pack-checks">
        ${pack.checks.map((check) => `<li><span>${check.name}</span><span>${check.severity}</span></li>`).join('')}
      </ul>
      <span class="catalog-id">${pack.id} · ${pack.checks.length} checks</span>
    </article>`;
}

const builtinGrid = document.querySelector<HTMLElement>('#builtin-grid');
const guideGrid = document.querySelector<HTMLElement>('#guide-grid');
if (builtinGrid) builtinGrid.innerHTML = builtinChecks.map(builtinCard).join('');
if (guideGrid) guideGrid.innerHTML = guidePacks.map(guideCard).join('');

mountSiteHeader('library');
renderIcons();
bindNavigation();
bindCopyButtons(renderIcons);

const search = document.querySelector<HTMLInputElement>('#catalog-search');
const filterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')];
const cards = [...document.querySelectorAll<HTMLElement>('[data-catalog-card]')];
const sections = [...document.querySelectorAll<HTMLElement>('[data-catalog-section]')];
const empty = document.querySelector<HTMLElement>('#catalog-empty');
const status = document.querySelector<HTMLElement>('#catalog-status');
let activeFilter: CatalogFilter = 'all';

function updateCatalog(): void {
  const query = search?.value.trim().toLowerCase() ?? '';
  let visibleCount = 0;
  for (const card of cards) {
    const matchesSearch = !query || card.dataset.search?.includes(query) === true;
    const matchesFilter = activeFilter === 'all' || card.dataset.filters?.split(' ').includes(activeFilter) === true;
    card.hidden = !(matchesSearch && matchesFilter);
    if (!card.hidden) visibleCount += 1;
  }
  for (const section of sections) {
    section.hidden = ![...section.querySelectorAll<HTMLElement>('[data-catalog-card]')].some((card) => !card.hidden);
  }
  empty?.classList.toggle('visible', visibleCount === 0);
  if (status) status.textContent = `${visibleCount} library ${visibleCount === 1 ? 'entry' : 'entries'} shown.`;
}

search?.addEventListener('input', updateCatalog);
for (const button of filterButtons) {
  button.addEventListener('click', () => {
    activeFilter = (button.dataset.filter ?? 'all') as CatalogFilter;
    for (const candidate of filterButtons) candidate.setAttribute('aria-pressed', String(candidate === button));
    updateCatalog();
  });
}

updateCatalog();
