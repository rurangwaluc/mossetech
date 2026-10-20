(function () {
  try {
    var stored = window.localStorage.getItem('theme');

    var theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';

    var root = document.documentElement;

    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch {}
})();
