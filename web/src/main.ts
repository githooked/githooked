import './style.css';

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
