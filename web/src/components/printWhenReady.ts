// Prints once the sheet's pictures (logo, stamp) have loaded, so they never come out as broken
// images; gives up waiting after a few seconds and prints anyway. Returns a cancel function.
export function printWhenReady(sheetSelector: string, wait = 4000): () => void {
  let cancelled = false;
  const start = window.setTimeout(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>(`${sheetSelector} img`)];
    const loaded = Promise.all(images.map((image) => (image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      }))));
    await Promise.race([loaded, new Promise((resolve) => window.setTimeout(resolve, wait))]);
    if (!cancelled) window.print();
  }, 50);
  return () => {
    cancelled = true;
    window.clearTimeout(start);
  };
}
