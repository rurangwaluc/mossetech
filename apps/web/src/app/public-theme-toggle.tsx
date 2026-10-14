'use client';

import { Moon, Sun } from 'lucide-react';

function toggleTheme() {
  const root = document.documentElement;

  const nextTheme = root.classList.contains('dark')
    ? 'light'
    : 'dark';

  root.classList.toggle(
    'dark',
    nextTheme === 'dark',
  );

  root.dataset.theme = nextTheme;
  root.style.colorScheme = nextTheme;

  localStorage.setItem('theme', nextTheme);
}

export function PublicThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Switch light or dark mode"
      title="Switch light or dark mode"
      onClick={toggleTheme}
      className="public-theme-toggle"
    >
      <Sun
        className="hidden h-[17px] w-[17px] dark:block"
        aria-hidden="true"
      />

      <Moon
        className="h-[17px] w-[17px] dark:hidden"
        aria-hidden="true"
      />
    </button>
  );
}