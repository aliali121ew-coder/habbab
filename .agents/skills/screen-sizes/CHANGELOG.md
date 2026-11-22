# CHANGELOG — screen-sizes

## 2026-11-21
- First version: 11 screen sizes from iPhone 5 (320) to 27-inch monitors (2560), and audit.js.

## 2026-11-21 (test run on the home and families pages, 7 sizes)
- The closed side menu counted as "outside the screen" → skip elements wholly off-screen, hidden or inert.
- Headings were not checked for wrapping → h1–h3 added.
- A tall button with an icon counted as two lines, and tiles with a number above a label too → a wrap now means one piece of text breaking onto a second line.
- Screen-reader labels (1px) counted as cut text → boxes of 1px or less are skipped.
- Added wideContent: how wide tables, sections and cards run on large screens.

## 2026-11-21 (user correction)
- "نسبة التسديد" spilled out of its tile and no check caught it (cut only looked at hidden overflow). Added `spill` and its fix rule. Approved by the user.
- Test: a chip in the sideways-scrolling sort row counted as spilling → spill skips intended sideways scrollers, like `outside`. Proof: with the old tile rules spill reports «نسبة التسديد»; with the fix it is empty.
- Test: the delegate card's line under the name («… هذا الشه») was clipped but missed, because cut only checked text with no icon or span inside → cut now checks any clipped box with text, skipping boxes that scroll on purpose.

## 2026-11-21 (fixing home and families)
- 320 read as 335: innerWidth counts the desktop scrollbar → width is now documentElement.clientWidth.
- Fixes made with the skill: short money-card labels, summary notes may wrap, families title scales, slider dots 36px (30px under 380, counter hidden), month count never squeezed, summary comparison box wraps under its title. All 7 sizes clean afterwards.

## 2026-11-21 (all pages, 6 sizes)
- A run at 768 measured 362 because the pane width changed and the size was cleared → check `size` in each result and rerun if it differs. Clicks in the pane during a run (side menu opened) also spoil results.
- Small tap targets now count an invisible ::after that enlarges the tap area (the standard fix that keeps the look).
- Full-app fix run: added known non-faults (home banner, closing side menu) and the usual cause of a page wider than the screen (a grid column that grows with its content).
- spill: 2px tolerance — Arabic glyph edges reach 1–2px past their box without being visible («بالألف» in the ledger).
- Large screens: the 1600px cap left wide empty sides on 1920 screens (user correction) → pages cap at 2000px, and only from 2040px wide; the skill now reports sideGap on wide screens.
- Skip text inside .sr-only / .visually-hidden (screen-reader captions) — they are 1px on purpose.
- Large-screen cap moved to 2400px from 2440px wide after the user said the side margins were too large.

## 2026-11-21 (user correction: expenses register)
- Names in the phone expenses cards broke letter by letter («يوس ف حميد الخفا جي») and no check caught it: `wrapped` only looked at buttons and titles. Added `brokenWords`: a text that takes more lines than it has words (so a word split); and the usual cause (a desktop column width still applying in the card). Approved by the user.
