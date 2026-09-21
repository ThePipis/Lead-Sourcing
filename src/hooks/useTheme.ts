import { useEffect, useState } from 'react';

/**
 * Dark is the default: this form is worked at a desk for long stretches and is
 * read backlit. Light renders it on its actual manila stock.
 *
 * Both classes are written to <html>: `.light` carries the light token block,
 * and `.dark` keeps Tailwind's `dark:` variant firing in the default theme.
 */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') return stored;
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
