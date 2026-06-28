export const THEMES = {
  dark:  { bg: '#0d0d0f', dot: '#f2f2f2', border: '#555555', text: '#f2f2f2' },
  light: { bg: '#f4f4f6', dot: '#1a1a1e', border: '#9a9aa2', text: '#1a1a1e' },
};

export function resolveTheme(stored, systemPrefersDark) {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark ? 'dark' : 'light';
}

export function createThemeController({ onChange }) {
  const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  let theme = resolveTheme(localStorage.getItem('theme'), prefersDark());

  function apply() {
    const c = THEMES[theme];
    const root = document.documentElement;
    root.style.setProperty('--bg', c.bg);
    root.style.setProperty('--text', c.text);
    root.style.setProperty('--dot', c.dot); // dot accent colour token (matches the rendered dots)
    root.dataset.theme = theme; // CSS source of truth for the sun/moon flip toggle
    onChange?.(c);
  }
  apply();

  return {
    current: () => theme,
    colors: () => THEMES[theme],
    toggle() {
      theme = theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', theme);
      apply();
    },
  };
}
