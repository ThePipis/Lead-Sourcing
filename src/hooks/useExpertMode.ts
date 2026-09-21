import { useEffect, useState } from 'react';

/**
 * Development-only gate override.
 *
 * The product is a gated form: sections open in order and the operator cannot
 * skip ahead. That is the whole point, so it is not a user-facing setting.
 * Development still needs to reach section 5 without selling fourteen slots,
 * so this unlocks every gate — behind `import.meta.env.DEV`, which Vite
 * statically replaces with `false` in `npm run build`, letting the bundler drop
 * the branch entirely. There is no toggle in the shipped app to find or misuse.
 *
 * Toggle with Ctrl+Shift+E.
 */
export function useExpertMode() {
  const [expertMode, setExpertMode] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault();
        setExpertMode((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return { expertMode: import.meta.env.DEV && expertMode };
}
