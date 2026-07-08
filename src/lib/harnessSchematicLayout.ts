// Deterministic wiring-diagram layout: connectors placed left-to-right in a
// single row (keeps every wire a simple point-to-point line with an
// unambiguous "facing side" — no general graph-routing/collision-avoidance
// engine, matching this project's algorithmic-UI convention). Export the PDF
// for a full-resolution version when there are many connectors.
import type { ConnectorSpec } from './harnessDesignerLogic';
import { extractNets } from './harnessDesignerLogic';
import { getShellSize, getConnectorType } from './connectorLibrary';
import { getWireConstruction } from './harnessWireTypes';

const BOX_WIDTH = 200;
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 36;
const BOX_GAP_X = 220;
const MARGIN = 50;
const GROUND_STUB_LENGTH = 34;

export interface PinPoint {
  pin: number;
  signalName: string;
  leftX: number;
  rightX: number;
  y: number;
  wireLabel: string;
}

export interface ConnectorBoxLayout {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shellLabel: string;
  pins: PinPoint[];
}

export interface WirePath {
  netId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

export interface GroundSymbol {
  x: number;
  y: number;
  stubX1: number;
  stubY1: number;
  connectorId: string;
  pin: number;
}

export interface SchematicLayout {
  connectors: ConnectorBoxLayout[];
  wires: WirePath[];
  grounds: GroundSymbol[];
  width: number;
  height: number;
}

function wireLabelFor(constructionId: string, awg: number): string {
  const c = getWireConstruction(constructionId);
  return `${awg} AWG ${c.standard}`;
}

export function buildSchematicLayout(connectors: ConnectorSpec[]): SchematicLayout {
  const boxes: ConnectorBoxLayout[] = connectors.map((c, i) => {
    const height = HEADER_HEIGHT + c.pins.length * ROW_HEIGHT + 10;
    const x = MARGIN + i * (BOX_WIDTH + BOX_GAP_X);
    const y = MARGIN;
    const shellSpec = getShellSize(c.shellSize);
    const pins: PinPoint[] = c.pins.map((p, pi) => ({
      pin: p.pin,
      signalName: p.signalName,
      leftX: x,
      rightX: x + BOX_WIDTH,
      y: y + HEADER_HEIGHT + pi * ROW_HEIGHT + ROW_HEIGHT / 2,
      wireLabel: wireLabelFor(p.constructionId, p.awg),
    }));
    return {
      id: c.id,
      name: c.name,
      x, y, width: BOX_WIDTH, height,
      shellLabel: `Shell ${c.shellSize} (${shellSpec.militaryLetter}) · ${getConnectorType(c.connectorTypeId).label}`,
      pins,
    };
  });

  const boxIndex = new Map(connectors.map((c, i) => [c.id, i]));
  const boxById = new Map(boxes.map((b) => [b.id, b]));
  const nets = extractNets(connectors);

  const wires: WirePath[] = [];
  const grounds: GroundSymbol[] = [];

  for (const net of nets) {
    const aConnector = connectors.find((c) => c.id === net.a.connectorId);
    const aPinSpec = aConnector?.pins.find((p) => p.pin === net.a.pin);
    const aBox = boxById.get(net.a.connectorId);
    const aPoint = aBox?.pins.find((p) => p.pin === net.a.pin);
    if (!aBox || !aPoint || !aPinSpec) continue;

    if (net.kind === 'pinToGround') {
      const facesRight = true; // grounds always stub off the right edge (simplification, disclosed)
      const x1 = facesRight ? aPoint.rightX : aPoint.leftX;
      grounds.push({ x: x1 + GROUND_STUB_LENGTH, y: aPoint.y, stubX1: x1, stubY1: aPoint.y, connectorId: net.a.connectorId, pin: net.a.pin });
    } else if (net.kind === 'pinToPin' && net.b !== 'ground') {
      const b = net.b;
      const bBox = boxById.get(b.connectorId);
      const bPoint = bBox?.pins.find((p) => p.pin === b.pin);
      if (!bBox || !bPoint) continue;
      const aIdx = boxIndex.get(net.a.connectorId) ?? 0;
      const bIdx = boxIndex.get(b.connectorId) ?? 0;
      const aFacesRight = bIdx >= aIdx;
      const bFacesRight = aIdx >= bIdx;
      wires.push({
        netId: net.id,
        x1: aFacesRight ? aPoint.rightX : aPoint.leftX,
        y1: aPoint.y,
        x2: bFacesRight ? bPoint.rightX : bPoint.leftX,
        y2: bPoint.y,
        label: `${aPinSpec.signalName} · ${wireLabelFor(aPinSpec.constructionId, aPinSpec.awg)}`,
      });
    }
  }

  const width = boxes.length > 0 ? Math.max(...boxes.map((b) => b.x + b.width)) + MARGIN + GROUND_STUB_LENGTH + 30 : MARGIN * 2;
  const height = boxes.length > 0 ? Math.max(...boxes.map((b) => b.y + b.height)) + MARGIN : MARGIN * 2;

  return { connectors: boxes, wires, grounds, width, height };
}
