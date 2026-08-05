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
    return await toJpeg(document.body, {
      quality: 0.75,
      backgroundColor: '#ffffff',
      pixelRatio: 1,
      cacheBust: true,
    });
  } catch (err) {
    console.warn('Screenshot capture failed:', err);
    return null;
  }
}
