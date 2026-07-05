import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import BusbarCalculator from './pages/BusbarCalculator';
import CreepageClearanceCalculator from './pages/CreepageClearanceCalculator';
import BoltedJointCalculator from './pages/BoltedJointCalculator';
import CableWireSizingCalculator from './pages/CableWireSizingCalculator';
import ConversionsCalculator from './pages/ConversionsCalculator';
import ComingSoonCalculator from './pages/ComingSoonCalculator';
import { ThemeProvider } from './lib/ThemeContext';
import { NAV_CATEGORIES } from './lib/navCategories';

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
      <div className="app-shell">
        <NavBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/busbar" element={<BusbarCalculator />} />
          <Route path="/creepage-clearance" element={<CreepageClearanceCalculator />} />
          <Route path="/bolted-joint" element={<BoltedJointCalculator />} />
          <Route path="/cable-sizing" element={<CableWireSizingCalculator />} />
          <Route path="/conversions" element={<ConversionsCalculator />} />
          {placeholderLinks.map((link) => (
            <Route key={link.path} path={link.path} element={<ComingSoonCalculator />} />
          ))}
        </Routes>
        <footer className="site-footer">
          Engineering estimation tool — verify critical designs against the referenced standards and, where required, physical testing.
        </footer>
      </div>
    </ThemeProvider>
  );
}

export default App;
