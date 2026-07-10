import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import volteqLogo from '../assets/brand/volteq-logo.svg';
import ThemeControls from './ThemeControls';
import NavDropdown from './NavDropdown';
import { NAV_CATEGORIES, CONVERSIONS_LINK } from '../lib/navCategories';
import { useAuth } from '../lib/AuthContext';

export default function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="navbar">
      <NavLink to="/" className="navbar-brand" onClick={() => setMobileOpen(false)}>
        <img src={volteqLogo} alt="Volteq" className="navbar-logo" />
        <span className="brand-sub">Engineering Calculators</span>
      </NavLink>

      <nav className="navbar-nav navbar-nav-desktop">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Home
        </NavLink>
        {NAV_CATEGORIES.map((category) => (
          <NavDropdown key={category.label} category={category} />
        ))}
        <NavLink to={CONVERSIONS_LINK.path} className={({ isActive }) => (isActive ? 'active' : '')}>
          {CONVERSIONS_LINK.label}
        </NavLink>
        <NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : '')}>
          {user ? 'Account' : 'Log in'}
        </NavLink>
        <ThemeControls />
      </nav>

      <button type="button" className="navbar-mobile-toggle" aria-label="Toggle menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)}>
        {mobileOpen ? '✕' : '☰'}
      </button>

      {mobileOpen && (
        <div className="navbar-mobile-panel">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMobileOpen(false)}>
            Home
          </NavLink>
          {NAV_CATEGORIES.map((category) => (
            <div className="navbar-mobile-group" key={category.label}>
              <div className="navbar-mobile-group-label">{category.label}</div>
              {category.links.map((link) => (
                <NavLink key={link.path} to={link.path} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMobileOpen(false)}>
                  {link.label}
                  {!link.available && <span className="tag" style={{ marginLeft: '0.5rem' }}>Soon</span>}
                </NavLink>
              ))}
            </div>
          ))}
          <NavLink to={CONVERSIONS_LINK.path} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMobileOpen(false)}>
            {CONVERSIONS_LINK.label}
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMobileOpen(false)}>
            {user ? 'Account' : 'Log in'}
          </NavLink>
          <div className="navbar-mobile-theme">
            <ThemeControls />
          </div>
        </div>
      )}
    </header>
  );
}
