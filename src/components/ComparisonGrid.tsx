interface Props {
  title: string;
  rowLabels: string[];
  colLabels: string[];
  getValue: (rowIdx: number, colIdx: number) => number;
  highlightRow: number;
  highlightCol: number;
  unit?: string;
}

// A small Row x Column reference grid (e.g. Material Group x Pollution Degree)
// with the cell matching the user's current selection highlighted, so the
// comparison between the selected combination and its neighbours is visible
// at a glance.
export default function ComparisonGrid({ title, rowLabels, colLabels, getValue, highlightRow, highlightCol, unit = 'mm' }: Props) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-2)' }}>{title}</div>
      <table className="data-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th></th>
            {colLabels.map((c, ci) => (
              <th key={ci} style={{ textAlign: 'center', color: ci === highlightCol ? 'var(--accent)' : undefined }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, ri) => (
            <tr key={ri}>
              <td style={{ fontFamily: 'var(--font-sans)', color: ri === highlightRow ? 'var(--accent)' : 'var(--text-2)', fontWeight: ri === highlightRow ? 700 : 400 }}>{r}</td>
              {colLabels.map((_, ci) => {
                const isHighlighted = ri === highlightRow && ci === highlightCol;
                return (
                  <td
                    key={ci}
                    style={{
                      textAlign: 'center',
                      background: isHighlighted ? 'var(--accent-glow)' : undefined,
                      color: isHighlighted ? 'var(--accent)' : undefined,
                      fontWeight: isHighlighted ? 700 : 400,
                      borderRadius: isHighlighted ? 4 : undefined,
                    }}
                  >
                    {getValue(ri, ci).toFixed(2)}{unit}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
