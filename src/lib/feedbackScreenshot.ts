// Captures a JPEG snapshot of the current page for bug reports. Deliberately
// NOT html2canvas (already used elsewhere in this project, via html2pdf.js,
// for the synthetic self-contained PDF report DOM in pdfExport.ts) — that
// library re-implements CSS parsing from scratch and can't parse the
// `color-mix()` functions this site's theme variables (--accent-glow,
// --accent-border) use everywhere, so it fails on every real page. Uses
// html-to-image instead, which renders via an SVG <foreignObject> and lets
// the browser's own engine do the actual rendering — handles color-mix()
// and other modern CSS correctly. Deliberately capped resolution and JPEG
// compression: this is a "what were you looking at" bug-report aid, not a
// pixel-perfect record, and keeps the resulting email attachment small.

export async function captureScreenshot(): Promise<string | null> {
  try {
    const { toJpeg } = await import('html-to-image');
    // Without explicit width/height, html-to-image sizes the output to the target node's
    // current offsetWidth/offsetHeight — for document.body that's only the viewport, not the
    // full scrolled document. Forcing the full scrollWidth/scrollHeight captures everything on
    // the page (including content below the fold), which matters for a bug report: a visual
    // issue further down the page wouldn't show up in a viewport-only capture even though the
    // reporter saw it, and it's not something the "reopen this calculation" link can substitute
    // for (that reproduces the inputs, not a rendering bug).
    return await toJpeg(document.body, {
      quality: 0.75,
      backgroundColor: '#ffffff',
      pixelRatio: 1,
      cacheBust: true,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    });
  } catch (err) {
    console.warn('Screenshot capture failed:', err);
    return null;
  }
}
