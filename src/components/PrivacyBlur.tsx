/**
 * PrivacyBlur Component
 * Wraps content that should be blurred when privacy mode is enabled
 */

import { useTranslation } from 'react-i18next';
import './PrivacyBlur.css';

interface PrivacyBlurProps {
  children: React.ReactNode;
  /**
   * Whether this content should be blurred when privacy mode is enabled.
   * Set to false for expenses, which should not be blurred.
   */
  shouldBlur?: boolean;
  /**
   * Custom CSS class for additional styling
   */
  className?: string;
  /**
   * Override the privacy mode state (for page-level toggle)
   * If not provided, the component will just check shouldBlur
   */
  isPrivacyMode?: boolean;
}

export const PrivacyBlur: React.FC<PrivacyBlurProps> = ({ 
  children, 
  shouldBlur = true,
  className = '',
  isPrivacyMode = false
}) => {
  const { t } = useTranslation();
  const isBlurred = shouldBlur && isPrivacyMode;

  if (!isBlurred) {
    return <>{children}</>;
  }

  return (
    <span 
      className={`privacy-blur ${className}`} 
      aria-label={t('privacyBlur.ariaLabel')}
      title={t('privacyBlur.title')}
    >
      {children}
    </span>
  );
};
