import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import BusbarCalculator from './pages/BusbarCalculator';
import CreepageClearanceCalculator from './pages/CreepageClearanceCalculator';
import BoltedJointCalculator from './pages/BoltedJointCalculator';
import BoltPatternCalculator from './pages/BoltPatternCalculator';
import BomCompareCalculator from './pages/BomCompareCalculator';
import BeamCalculator from './pages/BeamCalculator';
import CableWireSizingCalculator from './pages/CableWireSizingCalculator';
import BatteryPackSeriesParallelCalculator from './pages/BatteryPackSeriesParallelCalculator';
import MotorTorquePowerSpeedCalculator from './pages/MotorTorquePowerSpeedCalculator';
import ChokeSizingCalculator from './pages/ChokeSizingCalculator';
import MosfetLossCalculator from './pages/MosfetLossCalculator';
import BundleDiameterCalculator from './pages/BundleDiameterCalculator';
import HarnessDesigner from './pages/HarnessDesigner';
import ORingCalculator from './pages/ORingCalculator';
import FitsAndLimitsCalculator from './pages/FitsAndLimitsCalculator';
import MohrsCircleCalculator from './pages/MohrsCircleCalculator';
import DqCurrentCalculator from './pages/DqCurrentCalculator';
import DcLinkCalculator from './pages/DcLinkCalculator';
import SkinDepthCalculator from './pages/SkinDepthCalculator';
import ConversionsCalculator from './pages/ConversionsCalculator';
import ComingSoonCalculator from './pages/ComingSoonCalculator';
import AccountPage from './pages/AccountPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
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
              <Route path="/busbar" element={<BusbarCalculator />} />
              <Route path="/creepage-clearance" element={<CreepageClearanceCalculator />} />
              <Route path="/bolted-joint" element={<BoltedJointCalculator />} />
              <Route path="/bolt-pattern" element={<BoltPatternCalculator />} />
              <Route path="/bom-compare" element={<BomCompareCalculator />} />
              <Route path="/beam-bending" element={<BeamCalculator />} />
              <Route path="/o-ring" element={<ORingCalculator />} />
              <Route path="/fits-and-limits" element={<FitsAndLimitsCalculator />} />
              <Route path="/mohrs-circle" element={<MohrsCircleCalculator />} />
              <Route path="/cable-sizing" element={<CableWireSizingCalculator />} />
              <Route path="/battery-pack-series-parallel" element={<BatteryPackSeriesParallelCalculator />} />
              <Route path="/speed-torque-power" element={<MotorTorquePowerSpeedCalculator />} />
              <Route path="/id-iq-current" element={<DqCurrentCalculator />} />
              <Route path="/choke-sizing" element={<ChokeSizingCalculator />} />
              <Route path="/mosfet-loss" element={<MosfetLossCalculator />} />
              <Route path="/dc-link" element={<DcLinkCalculator />} />
              <Route path="/harness-bundle-diameter" element={<BundleDiameterCalculator />} />
              <Route path="/harness-designer" element={<HarnessDesigner />} />
              <Route path="/skin-depth" element={<SkinDepthCalculator />} />
              <Route path="/conversions" element={<ConversionsCalculator />} />
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
