import { useMemo, useState } from 'react';
import { CONVERSION_CATEGORIES, convert, getCategory } from '../lib/unitConversions';

function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.0001 || abs >= 1e9)) return n.toExponential(6);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export default function ConversionsCalculator() {
  const [categoryId, setCategoryId] = useState('distance');
  const category = useMemo(() => getCategory(categoryId) ?? CONVERSION_CATEGORIES[0], [categoryId]);

  const [fromUnitId, setFromUnitId] = useState(category.units[0].id);
  const [toUnitId, setToUnitId] = useState(category.units[1]?.id ?? category.units[0].id);
  const [inputValue, setInputValue] = useState(1);

  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    const cat = getCategory(id);
    if (cat) {
      setFromUnitId(cat.units[0].id);
      setToUnitId(cat.units[1]?.id ?? cat.units[0].id);
    }
  };

  const fromValid = category.units.some((u) => u.id === fromUnitId);
  const toValid = category.units.some((u) => u.id === toUnitId);
  const result = useMemo(
    () => (fromValid && toValid ? convert(category.id, fromUnitId, toUnitId, inputValue) : NaN),
    [category.id, fromUnitId, toUnitId, inputValue, fromValid, toValid]
  );

  const swapUnits = () => {
    setFromUnitId(toUnitId);
    setToUnitId(fromUnitId);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● Conversions</div>
        <h1>Unit Conversions</h1>
        <p>
          Convert between units across distance, mass, force, torque, pressure, temperature, energy, power,
          area, volume, acceleration, speed, and density.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="grid grid-2">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Conversion type</label>
            <select value={category.id} onChange={(e) => handleCategoryChange(e.target.value)}>
              {CONVERSION_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>From</label>
            <select value={fromUnitId} onChange={(e) => setFromUnitId(e.target.value)}>
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Value</label>
            <input autoComplete="off" type="number" value={inputValue} onChange={(e) => setInputValue(Number(e.target.value))} />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1', alignItems: 'center' }}>
            <button className="btn small" onClick={swapUnits} style={{ alignSelf: 'flex-start' }}>⇄ Swap units</button>
          </div>

          <div className="field">
            <label>To</label>
            <select value={toUnitId} onChange={(e) => setToUnitId(e.target.value)}>
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Answer</label>
            <input value={fmt(result)} readOnly style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
