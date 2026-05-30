/**
 * ScrollToTopButton Component
 * A floating button that appears when the user scrolls down and scrolls to the top when clicked
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import './ScrollToTopButton.css';

interface ScrollToTopButtonProps {
  /**
   * The threshold in pixels below which the button will appear
   * @default 300
   */
  threshold?: number;
}

export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({ threshold = 300 }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show button when scrolled past threshold
      setIsVisible(window.scrollY > threshold);
    };

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Check initial scroll position
    handleScroll();

    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <button
      className="scroll-to-top-button"
      onClick={scrollToTop}
      aria-label={t('scrollToTop.ariaLabel')}
      title={t('scrollToTop.title')}
    >
      <MaterialIcon name="arrow_upward" />
    </button>
  );
};
