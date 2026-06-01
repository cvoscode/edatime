export function initThemeToggle(): void {
    const btn = document.getElementById('theme-toggle-btn');
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    if (!btn) return;

    const savedTheme = localStorage.getItem('edatime-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const apply = (theme: 'dark' | 'light') => {
        if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
        else document.documentElement.removeAttribute('data-theme');
        if (iconDark) iconDark.hidden = theme === 'light';
        if (iconLight) iconLight.hidden = theme !== 'light';
    };

    apply(savedTheme === 'light' ? 'light' : (prefersDark ? 'dark' : 'dark'));

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const manualPreference = localStorage.getItem('edatime-theme');
        if (manualPreference) return;
        apply(e.matches ? 'dark' : 'light');
    });

    btn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        apply(isLight ? 'dark' : 'light');
        localStorage.setItem('edatime-theme', isLight ? 'dark' : 'light');
    });
}
