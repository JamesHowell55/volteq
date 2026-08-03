// DXF (AutoCAD R12/2000-compatible ASCII) export of an external involute-spline
// end-view: the true tooth profile as a closed polyline (for CAM / wire EDM /
// laser), plus the pitch, base, major and minor reference circles on their own
// layer. Premium feature. Kept dependency-free — plain string assembly.

import { generateProfilePoints, type SplineGeometry } from './splinePhysics';

interface DxfLayer { name: string; color: number; } // color = AutoCAD ACI index

const LAYERS: DxfLayer[] = [
  { name: 'SPLINE_PROFILE', color: 7 }, // white/black
  { name: 'REFERENCE', color: 8 },      // grey — pitch/base/major/minor circles
  { name: 'ANNOTATION', color: 3 },     // green — text
];

function group(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function circle(cx: number, cy: number, r: number, layer: string): string {
  return group(0, 'CIRCLE') + group(8, layer) + group(10, cx.toFixed(5)) + group(20, cy.toFixed(5)) + group(30, '0.0') + group(40, r.toFixed(5));
}

function lwpolyline(points: { x: number; y: number }[], layer: string, closed: boolean): string {
  let s = group(0, 'LWPOLYLINE') + group(8, layer) + group(100, 'AcDbEntity') + group(100, 'AcDbPolyline')
    + group(90, points.length) + group(70, closed ? 1 : 0);
  for (const p of points) s += group(10, p.x.toFixed(5)) + group(20, p.y.toFixed(5));
  return s;
}

function text(content: string, x: number, y: number, height: number, layer: string): string {
  return group(0, 'TEXT') + group(8, layer) + group(10, x.toFixed(4)) + group(20, y.toFixed(4)) + group(30, '0.0')
    + group(40, height.toFixed(3)) + group(1, content);
}

export function buildSplineDxf(g: SplineGeometry, opts?: { title?: string }): string {
  const profile = generateProfilePoints(g, 16);

  // --- HEADER (units = mm, extents) ---
  const rTip = g.majorDiaMm / 2;
  const ext = rTip * 1.15;
  let header = group(0, 'SECTION') + group(2, 'HEADER')
    + group(9, '$ACADVER') + group(1, 'AC1015')
    + group(9, '$INSUNITS') + group(70, 4) // 4 = millimetres
    + group(9, '$EXTMIN') + group(10, (-ext).toFixed(3)) + group(20, (-ext).toFixed(3)) + group(30, '0.0')
    + group(9, '$EXTMAX') + group(10, ext.toFixed(3)) + group(20, ext.toFixed(3)) + group(30, '0.0')
    + group(0, 'ENDSEC');

  // --- TABLES (layer definitions) ---
  let tables = group(0, 'SECTION') + group(2, 'TABLES')
    + group(0, 'TABLE') + group(2, 'LAYER') + group(70, LAYERS.length);
  for (const l of LAYERS) {
    tables += group(0, 'LAYER') + group(2, l.name) + group(70, 0) + group(62, l.color) + group(6, 'CONTINUOUS');
  }
  tables += group(0, 'ENDTAB') + group(0, 'ENDSEC');

  // --- ENTITIES ---
  let entities = group(0, 'SECTION') + group(2, 'ENTITIES');
  entities += lwpolyline(profile, 'SPLINE_PROFILE', true);
  entities += circle(0, 0, g.pitchDiaMm / 2, 'REFERENCE');
  entities += circle(0, 0, g.baseDiaMm / 2, 'REFERENCE');
  entities += circle(0, 0, g.majorDiaMm / 2, 'REFERENCE');
  entities += circle(0, 0, g.minorDiaMm / 2, 'REFERENCE');
  const title = opts?.title ?? `Involute spline ${g.pressureAngleDeg} deg  m=${g.moduleMm}  z=${g.teeth}`;
  entities += text(title, -ext, -ext, Math.max(0.6, rTip * 0.05), 'ANNOTATION');
  entities += text(
    `D=${g.pitchDiaMm.toFixed(3)}  Db=${g.baseDiaMm.toFixed(3)}  Dee=${g.majorDiaMm.toFixed(3)}  Die=${g.minorDiaMm.toFixed(3)}  MOP=${g.measurementOverPinsMm.toFixed(3)} over ${g.pinDiameterMm.toFixed(3)} pins`,
    -ext, -ext - Math.max(0.9, rTip * 0.08), Math.max(0.5, rTip * 0.04), 'ANNOTATION',
  );
  entities += group(0, 'ENDSEC');

  return header + tables + entities + group(0, 'EOF');
}

// Trigger a browser download of the DXF for the given geometry.
export function downloadSplineDxf(g: SplineGeometry, filename: string): void {
  const dxf = buildSplineDxf(g);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
