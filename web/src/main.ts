import { ArrowRight, BookOpen, Bot, Check, CircleX, Coffee, Copy, createIcons, Download, Gift, LibraryBig, LockKeyhole, Menu, Terminal } from 'lucide';
import { bindNavigation } from './site';
import { mountSiteHeader } from './header';

const renderIcons = () => createIcons({ icons: { ArrowRight, BookOpen, Bot, Check, CircleX, Coffee, Copy, Download, Gift, LibraryBig, LockKeyhole, Menu, Terminal } });

mountSiteHeader('home');
renderIcons();
bindNavigation();

document.querySelector<HTMLButtonElement>('.copy')?.addEventListener('click', async (event) => {
  await navigator.clipboard.writeText('npx @githooked/cli init');
  const button = event.currentTarget as HTMLButtonElement;
  button.innerHTML = '<i data-lucide="check"></i>';
  renderIcons();
  setTimeout(() => { button.innerHTML = '<i data-lucide="copy"></i>'; renderIcons(); }, 1500);
});

const hooky = document.querySelector<HTMLElement>('.hooky-stage');

if (hooky && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  window.addEventListener('pointermove', (event) => {
    const bounds = hooky.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (window.innerWidth / 2)));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height * 0.3) / (window.innerHeight / 2)));
    hooky.style.setProperty('--look-x', `${(x * 5).toFixed(2)}px`);
    hooky.style.setProperty('--look-y', `${(y * 4).toFixed(2)}px`);
  }, { passive: true });
}
