import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import './ProfileMenu.css';

interface ProfileMenuProps {
  accountName: string;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ accountName }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="profile-menu-container" ref={menuRef}>
      <button
        className="profile-icon-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('profileMenu.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="profile-icon">
          {getInitials(accountName)}
        </div>
      </button>

      {isOpen && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-header">
            <span className="profile-name">{accountName}</span>
          </div>
          <div className="profile-dropdown-divider" />
          <Link
            to="/settings"
            className="profile-dropdown-item"
            onClick={() => setIsOpen(false)}
            role="menuitem"
          >
            <span className="dropdown-icon"><MaterialIcon name="settings" size="small" /></span>
            {t('profileMenu.settings')}
          </Link>
        </div>
      )}
    </div>
  );
};
