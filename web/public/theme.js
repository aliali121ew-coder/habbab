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

// The browser / installed-app title bar takes the top bar's colour (the --surface token) for the
// current palette and light or dark mode. Called again whenever either changes.
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
  // The page colour shows at the top (the background gradient fades into it), so the
  // status bar takes that colour once the stylesheet has loaded.
  {
    // The page-top colour may be a color-mix() formula; let the browser resolve it, then write hex.
    var probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--page-top, var(--paper))';
    root.appendChild(probe);
    var resolved = getComputedStyle(probe).color;
    probe.remove();
    var nums = (resolved.match(/[\d.]+/g) || []).map(Number);
    if (nums.length >= 3) {
      var scale = resolved.indexOf('color(') === 0 ? 255 : 1;
      colour = '#' + nums.slice(0, 3).map(function (n) {
        return ('0' + Math.round(n * scale).toString(16)).slice(-2);
      }).join('');
    }
  }
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colour);
};
window.syncThemeColor();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', window.syncThemeColor);
matchMedia('(max-width: 767.98px)').addEventListener('change', window.syncThemeColor);
window.addEventListener('load', window.syncThemeColor);
