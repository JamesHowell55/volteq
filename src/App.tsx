import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import CalculatorsIndex from './pages/CalculatorsIndex';
import BusbarCalculator from './pages/BusbarCalculator';
import CreepageClearanceCalculator from './pages/CreepageClearanceCalculator';
import BoltedJointCalculator from './pages/BoltedJointCalculator';
import BoltPatternCalculator from './pages/BoltPatternCalculator';
import BomCompareCalculator from './pages/BomCompareCalculator';
import BeamCalculator from './pages/BeamCalculator';
import BearingCalculator from './pages/BearingCalculator';
import SplineSizingCalculator from './pages/SplineSizingCalculator';
import ShaftSizingCalculator from './pages/ShaftSizingCalculator';
import ShaftBearingCalculator from './pages/ShaftBearingCalculator';
import CableWireSizingCalculator from './pages/CableWireSizingCalculator';
import BatteryPackSeriesParallelCalculator from './pages/BatteryPackSeriesParallelCalculator';
import MotorTorquePowerSpeedCalculator from './pages/MotorTorquePowerSpeedCalculator';
import ChokeSizingCalculator from './pages/ChokeSizingCalculator';
import MosfetLossCalculator from './pages/MosfetLossCalculator';
import HeatsinkThermalCalculator from './pages/HeatsinkThermalCalculator';
import HeatExchangerSizingCalculator from './pages/HeatExchangerSizingCalculator';
import BundleDiameterCalculator from './pages/BundleDiameterCalculator';
import HarnessDesigner from './pages/HarnessDesigner';
import PcbTraceCalculator from './pages/PcbTraceCalculator';
import ORingCalculator from './pages/ORingCalculator';
import FitsAndLimitsCalculator from './pages/FitsAndLimitsCalculator';
import MohrsCircleCalculator from './pages/MohrsCircleCalculator';
import DqCurrentCalculator from './pages/DqCurrentCalculator';
import MotorProfilesPage from './pages/MotorProfilesPage';
import BatteryProfilesPage from './pages/BatteryProfilesPage';
import ControllerProfilesPage from './pages/ControllerProfilesPage';
import DcLinkCalculator from './pages/DcLinkCalculator';
import SkinDepthCalculator from './pages/SkinDepthCalculator';
import ConversionsCalculator from './pages/ConversionsCalculator';
import ComingSoonCalculator from './pages/ComingSoonCalculator';
import AccountPage from './pages/AccountPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import GuidesIndex from './pages/GuidesIndex';
import Ipc2221Guide from './pages/guides/Ipc2221Guide';
import Iec60664Guide from './pages/guides/Iec60664Guide';
import Vdi2230Guide from './pages/guides/Vdi2230Guide';
import Iso6722Guide from './pages/guides/Iso6722Guide';
import DcLinkRippleGuide from './pages/guides/DcLinkRippleGuide';
import As568Iso3601Guide from './pages/guides/As568Iso3601Guide';
import Iec60287Guide from './pages/guides/Iec60287Guide';
import Iso286Guide from './pages/guides/Iso286Guide';
import MohrsCircleGuide from './pages/guides/MohrsCircleGuide';
import SkinEffectGuide from './pages/guides/SkinEffectGuide';
import CmDmChokesGuide from './pages/guides/CmDmChokesGuide';
import SicInverterLossGuide from './pages/guides/SicInverterLossGuide';
import HeatsinkThermalGuide from './pages/guides/HeatsinkThermalGuide';
import HeatExchangerNtuGuide from './pages/guides/HeatExchangerNtuGuide';
import FieldOrientedControlGuide from './pages/guides/FieldOrientedControlGuide';
import BoltGroupElasticGuide from './pages/guides/BoltGroupElasticGuide';
import EulerBernoulliBeamsGuide from './pages/guides/EulerBernoulliBeamsGuide';
import TorquePowerSpeedGuide from './pages/guides/TorquePowerSpeedGuide';
import SeriesParallelCellsGuide from './pages/guides/SeriesParallelCellsGuide';
import WireBundleDiameterGuide from './pages/guides/WireBundleDiameterGuide';
import MilDtl38999Guide from './pages/guides/MilDtl38999Guide';
import Iso281Guide from './pages/guides/Iso281Guide';
import Iso4156Guide from './pages/guides/Iso4156Guide';
import { ThemeProvider } from './lib/ThemeContext';
import { AuthProvider } from './lib/AuthContext';
import { UnitSystemProvider } from './lib/UnitSystemContext';
import { NAV_CATEGORIES } from './lib/navCategories';
import Seo from './components/Seo';

const placeholderLinks = NAV_CATEGORIES.flatMap((c) => c.links).filter((l) => !l.available);

function App() {
  useEffect(() => {
    // Prevent accidental value changes when the page is scrolled while a
    // number input happens to be focused (default browser behaviour).
    const handler = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number') el.blur();
    };
    document.addEventListener('wheel', handler, { passive: true });
    return () => document.removeEventListener('wheel', handler);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <UnitSystemProvider>
          <div className="app-shell">
            <Seo />
            <NavBar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/calculators" element={<CalculatorsIndex />} />
              <Route path="/busbar" element={<BusbarCalculator />} />
              <Route path="/creepage-clearance" element={<CreepageClearanceCalculator />} />
              <Route path="/bolted-joint" element={<BoltedJointCalculator />} />
              <Route path="/bolt-pattern" element={<BoltPatternCalculator />} />
              <Route path="/bom-compare" element={<BomCompareCalculator />} />
              <Route path="/beam-bending" element={<BeamCalculator />} />
              <Route path="/bearing-calculator" element={<BearingCalculator />} />
              <Route path="/spline-sizing" element={<SplineSizingCalculator />} />
              <Route path="/shaft-sizing" element={<ShaftSizingCalculator />} />
              <Route path="/shaft-bearing-system" element={<ShaftBearingCalculator />} />
              <Route path="/o-ring" element={<ORingCalculator />} />
              <Route path="/fits-and-limits" element={<FitsAndLimitsCalculator />} />
              <Route path="/mohrs-circle" element={<MohrsCircleCalculator />} />
              <Route path="/cable-sizing" element={<CableWireSizingCalculator />} />
              <Route path="/battery-pack-series-parallel" element={<BatteryPackSeriesParallelCalculator />} />
              <Route path="/speed-torque-power" element={<MotorTorquePowerSpeedCalculator />} />
              <Route path="/id-iq-current" element={<DqCurrentCalculator />} />
              <Route path="/motor-profiles" element={<MotorProfilesPage />} />
              <Route path="/battery-profiles" element={<BatteryProfilesPage />} />
              <Route path="/controller-profiles" element={<ControllerProfilesPage />} />
              <Route path="/choke-sizing" element={<ChokeSizingCalculator />} />
              <Route path="/mosfet-loss" element={<MosfetLossCalculator />} />
              <Route path="/heatsink-thermal" element={<HeatsinkThermalCalculator />} />
              <Route path="/heat-exchanger-sizing" element={<HeatExchangerSizingCalculator />} />
              <Route path="/dc-link" element={<DcLinkCalculator />} />
              <Route path="/harness-bundle-diameter" element={<BundleDiameterCalculator />} />
              <Route path="/harness-designer" element={<HarnessDesigner />} />
              <Route path="/pcb-trace-width" element={<PcbTraceCalculator />} />
              <Route path="/skin-depth" element={<SkinDepthCalculator />} />
              <Route path="/conversions" element={<ConversionsCalculator />} />
              <Route path="/guides" element={<GuidesIndex />} />
              <Route path="/guides/ipc-2221" element={<Ipc2221Guide />} />
              <Route path="/guides/iec-60664-1" element={<Iec60664Guide />} />
              <Route path="/guides/vdi-2230" element={<Vdi2230Guide />} />
              <Route path="/guides/iso-6722" element={<Iso6722Guide />} />
              <Route path="/guides/dc-link-ripple" element={<DcLinkRippleGuide />} />
              <Route path="/guides/as568-iso-3601" element={<As568Iso3601Guide />} />
              <Route path="/guides/iec-60287" element={<Iec60287Guide />} />
              <Route path="/guides/iso-286" element={<Iso286Guide />} />
              <Route path="/guides/mohrs-circle" element={<MohrsCircleGuide />} />
              <Route path="/guides/skin-effect" element={<SkinEffectGuide />} />
              <Route path="/guides/cm-dm-chokes" element={<CmDmChokesGuide />} />
              <Route path="/guides/sic-inverter-loss" element={<SicInverterLossGuide />} />
              <Route path="/guides/heatsink-thermal" element={<HeatsinkThermalGuide />} />
              <Route path="/guides/heat-exchanger-ntu" element={<HeatExchangerNtuGuide />} />
              <Route path="/guides/field-oriented-control" element={<FieldOrientedControlGuide />} />
              <Route path="/guides/bolt-group-elastic" element={<BoltGroupElasticGuide />} />
              <Route path="/guides/euler-bernoulli-beams" element={<EulerBernoulliBeamsGuide />} />
              <Route path="/guides/torque-power-speed" element={<TorquePowerSpeedGuide />} />
              <Route path="/guides/series-parallel-cells" element={<SeriesParallelCellsGuide />} />
              <Route path="/guides/wire-bundle-diameter" element={<WireBundleDiameterGuide />} />
              <Route path="/guides/mil-dtl-38999" element={<MilDtl38999Guide />} />
              <Route path="/guides/iso-281" element={<Iso281Guide />} />
              <Route path="/guides/iso-4156" element={<Iso4156Guide />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {placeholderLinks.map((link) => (
                <Route key={link.path} path={link.path} element={<ComingSoonCalculator />} />
              ))}
            </Routes>
            <footer className="site-footer">
              Engineering estimation tool — verify critical designs against the referenced standards and, where required, physical testing.
            </footer>
          </div>
        </UnitSystemProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
