import './style.css';
import './hooky.css';

document.querySelector<HTMLButtonElement>('.menu')?.addEventListener('click', () => document.querySelector('nav')?.classList.toggle('open'));

document.querySelector<HTMLButtonElement>('.copy')?.addEventListener('click', async (event) => {
  await navigator.clipboard.writeText('npx @githooked/cli init');
  const button = event.currentTarget as HTMLButtonElement;
  button.textContent = '✓';
  setTimeout(() => { button.textContent = '□'; }, 1500);
});

document.querySelector<HTMLButtonElement>('#create-rule')?.addEventListener('click', () => {
  const count = document.querySelector('#check-count');
  if (count) count.textContent = '✓ Checks ready';
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
