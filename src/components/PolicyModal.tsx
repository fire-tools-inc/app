import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PrivacyPolicyContent, CookiePolicyContent } from './PolicyContent';
import './PolicyModal.css';

export type PolicyType = 'privacy' | 'cookie';

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyType: PolicyType;
  onSwitchPolicy?: (type: PolicyType) => void;
}

export function PolicyModal({ isOpen, onClose, policyType, onSwitchPolicy }: PolicyModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const dateKey = policyType === 'privacy'
    ? 'policyContent.privacy.lastUpdatedDate'
    : 'policyContent.cookie.lastUpdatedDate';

  return (
    <div
      className="policy-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-modal-title"
    >
      <div
        className="policy-modal-content"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="policy-modal-header">
          <h1 id="policy-modal-title">
            {policyType === 'privacy' ? t('legal.privacyPolicy') : t('legal.cookiePolicy')}
          </h1>
          <button
            ref={closeButtonRef}
            className="policy-modal-close"
            onClick={onClose}
            aria-label={t('legal.closePolicyModal')}
          >
            ×
          </button>
        </div>
        <div className="policy-modal-body">
          <p className="last-updated">
            <strong>{t('legal.lastUpdated')}:</strong> {t(dateKey)}
          </p>
          <p className="policy-language-note">{t('legal.contentEnglishOnly')}</p>
          {policyType === 'privacy'
            ? <PrivacyPolicyContent onSwitchPolicy={onSwitchPolicy} />
            : <CookiePolicyContent onSwitchPolicy={onSwitchPolicy} />
          }
        </div>
      </div>
    </div>
  );
}
