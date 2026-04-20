(function () {
    const storedTheme = window.localStorage.getItem("theme");
    if (storedTheme) {
        if (document.body) document.body.dataset.theme = storedTheme;
        return;
    }

    window.localStorage.setItem("theme", "dark");

    const applyTheme = function () {
        if (document.body) document.body.dataset.theme = "dark";
    };

    if (document.body) applyTheme();
    else window.addEventListener("DOMContentLoaded", applyTheme, { once: true });
})();