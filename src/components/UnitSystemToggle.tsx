import { useUnitSystem } from '../lib/UnitSystemContext';

export default function UnitSystemToggle() {
  const { unitSystem, toggleUnitSystem } = useUnitSystem();
  const isSI = unitSystem === 'SI';

  return (
    <div className="navbar-units-control">
      <span>Units</span>
      <button
        type="button"
        role="switch"
        aria-checked={isSI}
        aria-label={`Units: ${isSI ? 'SI' : 'Imperial'}. Switch to ${isSI ? 'Imperial' : 'SI'}`}
        title={`${isSI ? 'SI' : 'Imperial'} units`}
        className="navbar-units-switch"
        onClick={toggleUnitSystem}
      >
        <span className="navbar-units-thumb" />
      </button>
    </div>
  );
}
