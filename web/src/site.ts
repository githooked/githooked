export function bindNavigation(): void {
  const button = document.querySelector<HTMLButtonElement>('.menu');
  const navigation = document.querySelector<HTMLElement>('.nav nav');

  button?.addEventListener('click', () => {
    const open = navigation?.classList.toggle('open') ?? false;
    button.setAttribute('aria-expanded', String(open));
  });
}

export function bindCopyButtons(renderIcons: () => void): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', async () => {
      const code = button.closest('.code-block')?.querySelector('code');
      const value = button.dataset.copy?.trim() || code?.textContent?.trim();
      if (!value) return;
      await navigator.clipboard.writeText(value);
      const previousLabel = button.getAttribute('aria-label') ?? 'Copy code';
      button.innerHTML = '<i data-lucide="check"></i><span>Copied</span>';
      button.setAttribute('aria-label', 'Copied');
      renderIcons();
      window.setTimeout(() => {
        button.innerHTML = '<i data-lucide="copy"></i><span>Copy</span>';
        button.setAttribute('aria-label', previousLabel);
        renderIcons();
      }, 1500);
    });
  }
}
