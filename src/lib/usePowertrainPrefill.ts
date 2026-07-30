import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useComponentProfiles } from './useComponentProfiles';
import type { MotorProfileParams } from './motorProfiles';
import type { BatteryProfileParams } from './batteryProfiles';
import type { ControllerProfileParams } from './controllerProfiles';
import type { PowertrainProfileParams } from './powertrainProfiles';

// Deep-link pre-fill from a saved powertrain bundle. A calculator arriving with
// ?powertrain=<id> (from the Powertrain workspace's "Open in…" links) resolves
// that bundle's referenced component profiles and applies them via the SAME
// per-calculator apply functions the individual equipment pickers already use —
// so the powertrain feeds each calculator exactly what that calculator already
// knows how to accept from saved equipment, with no duplicated mapping logic.
//
// Handlers are called in order controller → battery → motor → system, so where
// two components write the same field (e.g. DC bus voltage), the battery — the
// actual pack voltage on the DC bus — wins over the controller's rated maximum.
//
// The component lists are only fetched when a ?powertrain= param is present
// (via useComponentProfiles' `enabled`), so a normal calculator load pays no
// extra fetch cost.

export interface PowertrainHandlers {
  onController?: (p: ControllerProfileParams) => void;
  onBattery?: (p: BatteryProfileParams) => void;
  onMotor?: (p: MotorProfileParams) => void;
  onSystem?: (p: PowertrainProfileParams) => void;
}

export function usePowertrainPrefill(handlers: PowertrainHandlers): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const ptId = searchParams.get('powertrain');
  const enabled = !!ptId;

  const powertrains = useComponentProfiles<PowertrainProfileParams>('powertrain', { enabled });
  const motors = useComponentProfiles<MotorProfileParams>('motor', { enabled });
  const batteries = useComponentProfiles<BatteryProfileParams>('battery', { enabled });
  const controllers = useComponentProfiles<ControllerProfileParams>('controller', { enabled });

  const appliedRef = useRef<string | null>(null);
  // Keep the latest handlers without making them a dependency (calculators
  // create fresh apply closures every render).
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!ptId || appliedRef.current === ptId) return;
    if (powertrains.loading || motors.loading || batteries.loading || controllers.loading) return;
    if (!powertrains.loggedIn) return;

    const pt = powertrains.profiles.find((p) => p.id === ptId);
    if (!pt) return; // list loaded but no such powertrain — leave the param be

    appliedRef.current = ptId;
    const h = handlersRef.current;
    const { motorProfileId, batteryProfileId, controllerProfileId } = pt.params;

    const controller = controllerProfileId ? controllers.profiles.find((c) => c.id === controllerProfileId) : null;
    const battery = batteryProfileId ? batteries.profiles.find((b) => b.id === batteryProfileId) : null;
    const motor = motorProfileId ? motors.profiles.find((m) => m.id === motorProfileId) : null;

    if (controller && h.onController) h.onController(controller.params);
    if (battery && h.onBattery) h.onBattery(battery.params);
    if (motor && h.onMotor) h.onMotor(motor.params);
    if (h.onSystem) h.onSystem(pt.params);

    const next = new URLSearchParams(searchParams);
    next.delete('powertrain');
    setSearchParams(next, { replace: true });
  }, [ptId, powertrains.loading, motors.loading, batteries.loading, controllers.loading, powertrains.profiles, motors.profiles, batteries.profiles, controllers.profiles, powertrains.loggedIn, searchParams, setSearchParams]);
}
