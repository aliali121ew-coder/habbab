// Screen-size check for one page at the current window size. Paste into javascript_tool after
// the page has loaded (and the element of interest is on screen). Returns a short report; every
// list should be empty. It only reads the page; it changes nothing.
(() => {
  // The page's real width: innerWidth also counts a desktop browser's scrollbar (335 on a
  // 320 screen), which phones do not have.
  const W = document.documentElement.clientWidth;
  const touch = W < 768;
  // Visible = has a real size (1px boxes are labels for screen readers), is not inside a hidden or inert panel, and is at least partly on the
  // screen (a closed side menu sits wholly off-screen and is not a problem).
  const visible = (el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    if (el.closest('[inert], [aria-hidden="true"], [hidden], .sr-only, .visually-hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.right > 0 && r.left < W && getComputedStyle(el).visibility !== 'hidden';
  };
  // Inside a box that scrolls sideways on purpose (chips row, wide table)?
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
  const all = [...document.querySelectorAll('body *')].filter(visible);

  // 1. The page itself scrolls sideways.
  const pageOverflow = document.documentElement.scrollWidth - W;

  // 2. Elements that stick out of the screen (not inside an intended sideways scroller).
  const outside = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return (r.right > W + 1 || r.left < -1) && !inScroller(el) && getComputedStyle(el).position !== 'fixed';
  }).map(label);

  // 3. Text cut off (hidden overflow or "…").
  //    Any box with text, also one holding an icon or spans, whose content is clipped (not a box
  //    that scrolls on purpose).
  const cut = all.filter((el) => el.textContent.trim() && el.scrollWidth > el.clientWidth + 1
    && ['hidden', 'clip'].includes(getComputedStyle(el).overflowX)).map(label);

  // 3b. Text spilling out of its box while still visible (a label wider than its tile).
  //     Always a fault: fix it with two lines or a 2×2 grid, not a smaller font.
  const spill = all.filter((el) => el.children.length === 0 && el.textContent.trim()
    && getComputedStyle(el).overflow === 'visible' && el.parentElement && !inScroller(el)
    // 2px tolerance: an Arabic letter's edge may reach a pixel or two past its box, unseen.
    && (el.scrollWidth > el.getBoundingClientRect().width + 2
      || el.getBoundingClientRect().width > el.parentElement.getBoundingClientRect().width + 1
      || el.getBoundingClientRect().left < el.parentElement.getBoundingClientRect().left - 1
      || el.getBoundingClientRect().right > el.parentElement.getBoundingClientRect().right + 1)).map(label);

  // 4. Buttons, chips, links and titles whose short text wrapped onto two lines.
  const wrapped = all.filter((el) => el.matches('button, a, [role="tab"], .chip, [class*="pill"], [class*="badge"], h1, h2, h3'))
    .filter((el) => {
      const text = el.textContent.trim();
      if (!text || text.length > 30) return false;
      // Wrapped = one piece of text runs onto a second line. Pieces placed on separate lines
      // on purpose (a number above its label) do not count.
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        const tops = [...range.getClientRects()].filter((r) => r.width > 1).map((r) => r.top).sort((a, b) => a - b);
        if (tops.length > 1 && tops[tops.length - 1] - tops[0] > fs * 0.9) return true;
      }
      return false;
    }).map(label);

  // 4b. Words broken mid-word ("يوس / ف / حميد"): a text that takes more lines than it has words
  //     must have split a word. Usually a column width that still applies inside a phone card.
  //     Checked on any text, also in table cells, not only buttons and titles.
  const broken = all.filter((el) => [...el.childNodes].some((node) => {
    const text = node.nodeType === 3 ? node.textContent.trim() : '';
    if (text.length < 3) return false;
    const range = document.createRange(); range.selectNodeContents(node);
    const tops = [...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top));
    const lines = new Set(tops.map((t) => Math.round(t / 4))).size; // pieces on one line share a top
    return lines > text.split(/\s+/).length;
  })).map(label);

  // 5. Tap targets too small for a finger (phone widths only).
  const small = touch ? all.filter((el) => el.matches('button, a[href], input, select, [role="button"]'))
    .filter((el) => {
      // The tap area also counts an invisible ::after that reaches past the button (the usual way
      // to enlarge a small button without changing its look).
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      let w = r.width, h = r.height;
      if (a.content !== 'none' && a.position === 'absolute') {
        w -= (parseFloat(a.left) || 0) + (parseFloat(a.right) || 0);
        h -= (parseFloat(a.top) || 0) + (parseFloat(a.bottom) || 0);
      }
      return w < 32 || h < 32;
    })
    .map((el) => `${label(el)} (${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)})`) : [];

  // 6. Things that only appear on hover (no finger can reach them): :hover rules that show or
  //    move content and are not inside @media (hover: hover).
  const hoverOnly = [];
  const walk = (rules, guarded) => {
    for (const rule of rules) {
      if (rule.media) { walk(rule.cssRules, guarded || /hover:\s*hover/.test(rule.media.mediaText)); continue; }
      if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules, guarded); continue; }
      if (!guarded && rule.selectorText?.includes(':hover')) {
        const s = rule.style;
        if (['display', 'visibility', 'opacity', 'max-height', 'pointer-events'].some((p) => s.getPropertyValue(p))) hoverOnly.push(rule.selectorText.slice(0, 70));
      }
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, false); } catch { /* other origin */ } }

  // 7. Large screens: how wide the main content runs. Over ~1700px lines and tables get hard
  //    to read; report it so a max-width can be considered.
  //    Measured on the content itself (tables, sections, cards), not the page frame.
  const contentWidth = Math.round(Math.max(0, ...all
    .filter((el) => el.matches('table, section, article, [class*="card"], [class*="panel"]'))
    .map((el) => el.getBoundingClientRect().width)));

  const uniq = (list) => [...new Set(list)].slice(0, 12);
  return {
    size: `${W}×${innerHeight}`,
    pageOverflow: pageOverflow > 1 ? `${pageOverflow}px` : 0,
    outside: uniq(outside),
    cut: uniq(cut),
    spill: uniq(spill),
    wrapped: uniq(wrapped),
    brokenWords: uniq(broken),
    smallTapTargets: uniq(small),
    hoverOnly: touch ? uniq(hoverOnly) : '(checked on phone widths)',
    wideContent: W >= 1600 && contentWidth > 1700 ? `${contentWidth}px` : 0,
  };
})();
