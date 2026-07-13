import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MaterialIcon } from './MaterialIcon';
import { PreloadLink } from './PreloadLink';
import { NAVBAR_LABELS } from '../constants/navbarLabels';
import './ToolsMenu.css';

interface ToolItem {
  to: string;
  icon: string;
  label: string;
}

const TOOLS: ToolItem[] = [
  { to: '/monte-carlo', icon: 'casino', label: NAVBAR_LABELS.monteCarlo },
  { to: '/investment-growth', icon: 'trending_up', label: NAVBAR_LABELS.investmentGrowth },
  { to: '/withdrawal-rate', icon: 'trending_down', label: NAVBAR_LABELS.withdrawalRate },
  { to: '/portfolio-backtest', icon: 'analytics', label: NAVBAR_LABELS.portfolioBacktest },
  { to: '/debt-payoff', icon: 'credit_score', label: NAVBAR_LABELS.debtPayoff },
];

const PORTFOLIO_BREAKDOWN_TOOL: ToolItem = {
  to: '/portfolio-breakdown',
  icon: 'donut_large',
  label: NAVBAR_LABELS.portfolioBreakdown,
};

interface ToolsMenuProps {
  onNavigate?: () => void;
  showPortfolioBreakdown?: boolean;
}

export const ToolsMenu: React.FC<ToolsMenuProps> = ({ onNavigate, showPortfolioBreakdown = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const tools = showPortfolioBreakdown ? [...TOOLS, PORTFOLIO_BREAKDOWN_TOOL] : TOOLS;
  const isActive = tools.some((t) => location.pathname === t.to);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleItemClick = () => {
    setIsOpen(false);
    if (onNavigate) onNavigate();
  };

  return (
    <div className="tools-menu-container" ref={menuRef}>
      <button
        type="button"
        className={`nav-link tools-menu-trigger ${isActive ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={NAVBAR_LABELS.tools}
      >
        <MaterialIcon name="build" className="nav-icon" /> {NAVBAR_LABELS.tools}
        <MaterialIcon
          name={isOpen ? 'expand_less' : 'expand_more'}
          className="tools-menu-chevron"
          size="small"
        />
      </button>

      {isOpen && (
        <div className="tools-menu-dropdown" role="menu">
          {tools.map((tool) => (
            <PreloadLink
              key={tool.to}
              to={tool.to}
              className={`tools-menu-item ${location.pathname === tool.to ? 'active' : ''}`}
              onClick={handleItemClick}
              role="menuitem"
              aria-current={location.pathname === tool.to ? 'page' : undefined}
            >
              <span className="dropdown-icon">
                <MaterialIcon name={tool.icon} size="small" />
              </span>
              {tool.label}
            </PreloadLink>
          ))}
        </div>
      )}
    </div>
  );
};
