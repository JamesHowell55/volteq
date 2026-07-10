// Pure data model + validation/net-extraction logic for the Harness Designer.
//
// Scope (disclosed in the UI): one dominant contact size per connector, a
// direct user-entered pin count (no shell/insert-arrangement constraint),
// and per-pin destinations of Unused / Ground / another connector's pin.
// Multiple pins may point at the same target pin — that is a multi-drop
// splice, not an error — so the destination graph is undirected and
// extractNets groups it into connected components (see extractNets).
import { CONTACT_SIZE_SPECS, type ContactSize } from './connectorLibrary';
import { getWireConstruction } from './harnessWireTypes';

export interface Destination {
  kind: 'unused' | 'ground' | 'pin';
  connectorId?: string;
  pin?: number;
}

export interface PinSpec {
  pin: number;
  signalName: string;
  constructionId: string;
  awg: number;
  destination: Destination;
  /** Pin number (same connector only) this pin's twisted-pair conductor is
   *  twisted with — only meaningful when constructionId's category is one of
   *  the twistable categories (twistedPair / twistedShieldedPair / canBus).
   *  Kept mutually consistent by setTwistedPartner, mirroring how
   *  setPinDestination keeps pin-to-pin links consistent. */
  twistedWithPin?: number;
  /** Pin number (same connector only) whose cable shield this pin is the
   *  drain wire for — a real separate conductor with its own signalName/
   *  destination like any other pin, not an abstract flag, since a drain
   *  wire can terminate anywhere a normal wire can (ground, another
   *  connector's pin, or unused). If the referenced pin is itself twisted
   *  with another pin, this drains the whole pair's shared shield, not
   *  just the one conductor (see getShieldTargets). Kept valid by
   *  pruneDanglingShieldDrains whenever a pin's construction/twist link/
   *  existence changes. */
  shieldDrainForPin?: number;
}

export interface ConnectorSpec {
  id: string;
  name: string;
  contactSize: ContactSize;
  pins: PinSpec[];
}

export interface Net {
  id: string;
  kind: 'pinToPin' | 'pinToGround';
  a: { connectorId: string; pin: number };
  b: { connectorId: string; pin: number } | 'ground';
  /** True when `a` is the shared anchor of a 3+-pin splice — the renderer
   *  draws a filled junction dot there instead of a plain connection dot. */
  isSpliceAnchor: boolean;
}

function pinKey(connectorId: string, pin: number): string {
  return `${connectorId}:${pin}`;
}
function parsePinKey(key: string): { connectorId: string; pin: number } {
  const [connectorId, pinStr] = key.split(':');
  return { connectorId, pin: Number(pinStr) };
}

/** Walks every connector's pins and builds the net list. A pin's destination
 *  pointing at another pin is an undirected edge (multiple pins may point at
 *  the same target — a splice), so pin-to-pin nets are found via connected
 *  components (union-find) rather than simple pairwise dedup: a component of
 *  exactly 2 pins is an ordinary point-to-point net, and a component of 3+ is
 *  a multi-drop splice. Each splice picks one deterministic anchor member
 *  (lowest connector order, then lowest pin number) and emits one edge from
 *  every other member back to it — reusing the exact same point-to-point
 *  rendering per spoke instead of needing real Steiner-tree routing. */
export function extractNets(connectors: ConnectorSpec[]): Net[] {
  const nets: Net[] = [];
  const connectorIndex = new Map(connectors.map((c, i) => [c.id, i]));

  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const edges: [string, string][] = [];
  for (const c of connectors) {
    for (const p of c.pins) {
      if (p.destination.kind === 'pin' && p.destination.connectorId != null && p.destination.pin != null) {
        const edge: [string, string] = [pinKey(c.id, p.pin), pinKey(p.destination.connectorId, p.destination.pin)];
        edges.push(edge);
        union(edge[0], edge[1]);
      }
    }
  }

  const members = new Map<string, Set<string>>();
  for (const [a, b] of edges) {
    const root = find(a);
    if (!members.has(root)) members.set(root, new Set());
    members.get(root)!.add(a);
    members.get(root)!.add(b);
  }

  const orderOf = (key: string): [number, number] => {
    const { connectorId, pin } = parsePinKey(key);
    return [connectorIndex.get(connectorId) ?? 0, pin];
  };

  for (const group of members.values()) {
    if (group.size < 2) continue;
    const sortedKeys = [...group].sort((x, y) => {
      const [ox, px] = orderOf(x);
      const [oy, py] = orderOf(y);
      return ox !== oy ? ox - oy : px - py;
    });
    const anchorKey = sortedKeys[0];
    const anchor = parsePinKey(anchorKey);
    const isSpliceAnchor = sortedKeys.length > 2;
    for (let i = 1; i < sortedKeys.length; i++) {
      const member = parsePinKey(sortedKeys[i]);
      nets.push({
        id: [anchorKey, sortedKeys[i]].sort().join('|'),
        kind: 'pinToPin',
        a: anchor,
        b: member,
        isSpliceAnchor,
      });
    }
  }

  for (const c of connectors) {
    for (const p of c.pins) {
      if (p.destination.kind === 'ground') {
        nets.push({ id: `${c.id}-${p.pin}-gnd`, kind: 'pinToGround', a: { connectorId: c.id, pin: p.pin }, b: 'ground', isSpliceAnchor: false });
      }
    }
  }

  return nets;
}

function findPin(connectors: ConnectorSpec[], connectorId: string, pin: number): PinSpec | undefined {
  return connectors.find((c) => c.id === connectorId)?.pins.find((p) => p.pin === pin);
}

/** True when this pin's current wire construction actually has a shield
 *  layer (twistedShieldedPair / shielded) — a drain wire only makes sense
 *  for those, not a bare single conductor or unshielded twisted pair/CAN
 *  bus. */
export function pinHasShield(pin: PinSpec): boolean {
  return (getWireConstruction(pin.constructionId).shieldAddMm ?? 0) > 0;
}

export interface ShieldTarget {
  /** Canonical representative pin — the lower-numbered member when this is
   *  a twisted shielded pair, or the pin itself for a lone shielded single
   *  conductor. */
  pin: number;
  /** The other conductor's pin number — only set for a twisted shielded pair. */
  partnerPin?: number;
  label: string;
}

/** Every shield-eligible conductor (or twisted pair) on a connector, listed
 *  once each — a twisted shielded pair's two conductors share ONE physical
 *  shield, so only its lower-numbered pin represents it here, not both. */
export function getShieldTargets(connector: ConnectorSpec): ShieldTarget[] {
  const targets: ShieldTarget[] = [];
  for (const p of connector.pins) {
    if (!pinHasShield(p)) continue;
    if (p.twistedWithPin != null) {
      if (p.pin > p.twistedWithPin) continue;
      targets.push({ pin: p.pin, partnerPin: p.twistedWithPin, label: `Pins ${p.pin} & ${p.twistedWithPin} (twisted pair)` });
    } else {
      targets.push({ pin: p.pin, label: `Pin ${p.pin}` });
    }
  }
  return targets;
}

/** Immutably sets which shield-eligible conductor (or pair) a pin's drain
 *  wire belongs to. Only one drain per target — assigning a new drain to a
 *  target clears whichever other pin previously drained it. Pass
 *  targetPin=null to clear this pin's own drain assignment. */
export function setShieldDrain(connectors: ConnectorSpec[], connectorId: string, drainPin: number, targetPin: number | null): ConnectorSpec[] {
  return connectors.map((c) => {
    if (c.id !== connectorId) return c;
    return {
      ...c,
      pins: c.pins.map((p) => {
        if (p.pin === drainPin) return { ...p, shieldDrainForPin: targetPin ?? undefined };
        if (targetPin != null && p.shieldDrainForPin === targetPin) return { ...p, shieldDrainForPin: undefined };
        return p;
      }),
    };
  });
}

/** Clears any shieldDrainForPin reference that no longer points at a valid
 *  shield target — call after any edit that could invalidate one (a
 *  construction change dropping the shield, a broken twist link, or a
 *  removed pin). */
export function pruneDanglingShieldDrains(connector: ConnectorSpec): ConnectorSpec {
  const validTargets = new Set(getShieldTargets(connector).flatMap((t) => (t.partnerPin != null ? [t.pin, t.partnerPin] : [t.pin])));
  return {
    ...connector,
    pins: connector.pins.map((p) => (p.shieldDrainForPin != null && !validTargets.has(p.shieldDrainForPin) ? { ...p, shieldDrainForPin: undefined } : p)),
  };
}

/** A pin's signal name is considered "still at its default" (never
 *  deliberately renamed by the user) when it matches the SIG{pin} pattern
 *  makeDefaultConnector assigns — used to decide which end's name should
 *  propagate to the other when a new pin-to-pin link is made. */
function isDefaultSignalName(pin: PinSpec): boolean {
  return pin.signalName === `SIG${pin.pin}`;
}

/** Immutably sets one pin's destination. Only this pin's OWN previous link is
 *  touched — other pins already pointing at the same target are left alone,
 *  which is exactly how a multi-drop splice is created (several pins all
 *  pointing at, directly or transitively through, one another — see
 *  extractNets). When the new target still has its default signal name and
 *  this pin has already been renamed (or vice-versa), the default one adopts
 *  the other's name — every pin touching one connection is one logical
 *  signal, so they should read the same name — but a name the user has
 *  already deliberately typed on either pin is never overwritten. */
export function setPinDestination(connectors: ConnectorSpec[], fromConnectorId: string, fromPin: number, newDestination: Destination): ConnectorSpec[] {
  const next = connectors.map((c) => ({ ...c, pins: c.pins.map((p) => ({ ...p, destination: { ...p.destination } })) }));

  const from = findPin(next, fromConnectorId, fromPin);
  if (!from) return connectors;

  if (newDestination.kind === 'pin' && newDestination.connectorId != null && newDestination.pin != null) {
    const target = findPin(next, newDestination.connectorId, newDestination.pin);
    if (target) {
      if (isDefaultSignalName(target) && !isDefaultSignalName(from)) {
        target.signalName = from.signalName;
      } else if (isDefaultSignalName(from) && !isDefaultSignalName(target)) {
        from.signalName = target.signalName;
      }
    }
  }

  from.destination = newDestination;
  return next;
}

/** Immutably links two pins on the SAME connector as a twisted pair, mirroring
 *  setPinDestination's mutual-consistency approach: clears the old reciprocal
 *  link (if any) on both the pin being set and whatever the new partner was
 *  previously twisted with, then points both ends at each other. Pass
 *  partnerPin=null to clear the link entirely. */
export function setTwistedPartner(connectors: ConnectorSpec[], connectorId: string, pin: number, partnerPin: number | null): ConnectorSpec[] {
  const next = connectors.map((c) => (c.id === connectorId ? { ...c, pins: c.pins.map((p) => ({ ...p })) } : c));
  const conn = next.find((c) => c.id === connectorId);
  if (!conn) return connectors;

  const from = conn.pins.find((p) => p.pin === pin);
  if (!from) return connectors;

  if (from.twistedWithPin != null) {
    const oldPartner = conn.pins.find((p) => p.pin === from.twistedWithPin);
    if (oldPartner && oldPartner.twistedWithPin === pin) oldPartner.twistedWithPin = undefined;
  }

  if (partnerPin != null) {
    const newPartner = conn.pins.find((p) => p.pin === partnerPin);
    if (newPartner) {
      if (newPartner.twistedWithPin != null) {
        const itsOldPartner = conn.pins.find((p) => p.pin === newPartner.twistedWithPin);
        if (itsOldPartner && itsOldPartner.twistedWithPin === partnerPin) itsOldPartner.twistedWithPin = undefined;
      }
      newPartner.twistedWithPin = pin;
    }
  }

  from.twistedWithPin = partnerPin ?? undefined;
  return next;
}

export function makeDefaultConnector(id: string, name: string, contactSize: ContactSize, pinCount = 8): ConnectorSpec {
  return {
    id,
    name,
    contactSize,
    pins: Array.from({ length: pinCount }, (_, i) => ({
      pin: i + 1,
      signalName: `SIG${i + 1}`,
      constructionId: 'm22759-32',
      awg: CONTACT_SIZE_SPECS[contactSize].awgRange[0],
      destination: { kind: 'unused' },
    })),
  };
}
