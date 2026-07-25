import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('mil-dtl-38999')!;

export default function MilDtl38999Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What MIL-DTL-38999 is</h2>
      <p>
        MIL-DTL-38999 is the US military detail specification for a family of <b>circular
        connectors</b> — the rugged, threaded or bayonet-coupled connectors you see all over aerospace,
        defence, and increasingly EV and industrial systems where vibration, sealing, and reliability
        matter. When a harness calls out a "38999 Series III connector," this is the standard defining its
        shell, contacts, and performance. Designing with them is mostly about choosing the right shell
        size and contact arrangement, then laying out the pinout.
      </p>

      <h2>Contact size sets the current rating</h2>
      <p>
        The single most important electrical fact: a connector's current capability comes from its
        <b> contact size</b>, not the connector as a whole. Contacts are specified by a size number (size
        22, 20, 16, 12, …), and each size has a rated current — smaller numbers are physically bigger
        contacts carrying more current. So a high-current power pin needs a large contact (and takes up
        more of the shell), while dozens of signal lines use small size-22 contacts. Pick the contact size
        per circuit from its current, then find a shell/insert arrangement that holds the mix you need.
      </p>

      <h2>Shell and insert basics</h2>
      <p>
        The <b>shell size</b> sets the overall diameter and how many contacts fit; the <b>insert
        arrangement</b> is the specific pattern of contact cavities (positions and sizes) within that
        shell. Together they determine the pin count and layout. A real design picks a standard insert
        arrangement from the manufacturer's tables — you don't place contacts arbitrarily; you choose an
        arrangement that has the right count of each contact size.
      </p>

      <h2>From connectors to a harness pinout</h2>
      <p>
        Once the connectors are chosen, the harness is a <b>point-to-point pinout</b>: which pin on which
        connector wires to which pin on another, with each wire's gauge and construction. This is captured
        as a wiring diagram — labelled connector boxes with numbered pins and wires between them — rather
        than a to-scale drawing of the connector faces. Details like twisted pairs, shielded conductors
        and their drain wires, and multi-drop splices are all part of that point-to-point definition.
      </p>

      <GuideDeepDive
        title="Design flow, special conductors & checklist"
        teaser="The order to make the decisions in, how twisted/shielded conductors and splices are handled, and a checklist for specifying a 38999 harness."
        feature="MIL-DTL-38999 deep dive"
      >
        <h3>The design flow</h3>
        <p>
          Work it in this order: (1) list every circuit and its current, (2) pick a contact size per
          circuit from the current rating, (3) total up how many of each contact size you need, (4) choose
          a shell size and insert arrangement that holds that mix with room to spare, (5) assign pins and
          lay out the point-to-point wiring. Doing it in this order stops the classic mistake of picking a
          connector first and then discovering it can't carry the power circuit's current.
        </p>

        <h3>Special conductors</h3>
        <ul>
          <li><b>Twisted pairs</b> — routed between two pins as a linked pair; on a diagram the twist is shown by crossing the two conductors, a drafting convention rather than a literal helix.</li>
          <li><b>Shielded conductors</b> — the shield's drain terminates on its own real pin, wired like any other contact, not an abstract flag.</li>
          <li><b>Splices</b> — several pins pointing at one target form a multi-drop splice, electrically a shared node even when drawn at one representative junction.</li>
        </ul>

        <h3>Checklist</h3>
        <ol>
          <li>Size each contact from its circuit current (smaller size number = bigger contact = more current).</li>
          <li>Tally the contact-size mix, then choose a shell/insert arrangement that fits it with margin.</li>
          <li>Assign the wire gauge and construction per circuit; twisted/shielded specs apply to the whole wire.</li>
          <li>Terminate shield drains on real pins; define splices as shared targets.</li>
          <li>Verify the final pin arrangement against the manufacturer's insert-arrangement drawing before release.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
