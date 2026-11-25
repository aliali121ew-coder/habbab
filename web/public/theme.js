// Loaded before first paint so a saved theme/palette never flashes default.
document.documentElement.dataset.palette = 'blue';
try {
  var savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
  // Blue became the default look; a choice saved before it existed is replaced once.
  var savedPalette = localStorage.getItem('palette');
  if (localStorage.getItem('palette-v') !== '2') {
    savedPalette = 'blue';
    localStorage.setItem('palette', 'blue');
    localStorage.setItem('palette-v', '2');
  }
  document.documentElement.dataset.palette = savedPalette === 'violet' || savedPalette === 'official' ? savedPalette : 'blue';
} catch (error) {
  // Blocked storage: the system colour preference applies.
}

// With no choice made in the app, the page still carries the phone's own light/dark setting as
// data-theme, so every dark-mode rule applies the same way whether dark was chosen in the app
// or comes from the phone (some rules only knew the first, and washed the cards out). It
// follows the phone while no choice is saved; a choice made in the app always wins.
(function followSystemTheme() {
  var media = matchMedia('(prefers-color-scheme: dark)');
  var chosen = function () {
    try { var t = localStorage.getItem('theme'); return t === 'light' || t === 'dark'; } catch (e) { return false; }
  };
  var apply = function () {
    if (!chosen()) document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
  };
  apply();
  media.addEventListener('change', function () {
    // No element transitions while the colours change (see switchLook in src/theme.ts).
    var root = document.documentElement;
    root.classList.add('theme-switching');
    apply();
    if (window.syncThemeColor) window.syncThemeColor();
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('theme-switching'); }); });
  });
})();

// The browser / installed-app status bar takes the top bar's exact light/dark colour so the
// OS always picks high-contrast clock & battery icons (dark icons in light mode, white in dark).
window.syncThemeColor = function () {
  var root = document.documentElement;
  var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  var colours = {
    blue: ['#ffffff', '#161c27'],
    violet: ['#ffffff', '#1b1d36'],
    official: ['#fcfcfd', '#181f2b'],
  };
  var pair = colours[root.dataset.palette] || colours.blue;
  var colour = pair[dark ? 1 : 0];
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colour);
  var appleBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleBar) appleBar.setAttribute('content', dark ? 'black-translucent' : 'default');
};
window.syncThemeColor();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', window.syncThemeColor);
matchMedia('(max-width: 767.98px)').addEventListener('change', window.syncThemeColor);
window.addEventListener('load', window.syncThemeColor);
