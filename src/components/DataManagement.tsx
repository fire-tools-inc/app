import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { IS_DEMO_MODE } from '../utils/demoMode';

interface DataManagementProps {
  onExport: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onLoadDemo?: () => void; // Optional for expense tracker
  defaultOpen?: boolean;
  /** File format for import/export - 'csv' or 'json'. Default is 'csv' */
  fileFormat?: 'csv' | 'json';
  /** Additional page-specific actions shown before the reset button. */
  extraActions?: React.ReactNode;
}

export const DataManagement: React.FC<DataManagementProps> = ({
  onExport,
  onImport,
  onReset,
  onLoadDemo,
  defaultOpen = false,
  fileFormat = 'csv',
  extraActions,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { t } = useTranslation();
  
  const formatLabel = fileFormat.toUpperCase();
  const acceptType = fileFormat === 'json' ? '.json' : '.csv';

  return (
    <div id="section-data-management" className="data-management-section collapsible-section">
      <button 
        className="collapsible-header" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="data-management-content"
      >
        <h4>
          <MaterialIcon name="save" /> {t('dataManagement.title')} <span className="collapse-icon-small" aria-hidden="true">{isOpen ? '▼' : '▶'}</span>
        </h4>
      </button>
      {isOpen && (
        <div id="data-management-content" className="data-management-content">
          {onLoadDemo && !IS_DEMO_MODE && (
            <button 
              onClick={onLoadDemo} 
              className="action-btn" 
              style={{ 
                width: '100%', 
                marginBottom: '8px', 
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white'
              }}
              aria-label={t('dataManagement.loadDemoAriaLabel')}
            >
              <MaterialIcon name="casino" /> {t('dataManagement.loadDemoData')}
            </button>
          )}
          <button 
            onClick={onExport} 
            className="action-btn export-btn" 
            style={{ width: '100%', marginBottom: '8px', justifyContent: 'center' }}
            aria-label={t('dataManagement.exportAriaLabel', { format: formatLabel })}
          >
            <MaterialIcon name="download" /> {t('dataManagement.exportButton', { format: formatLabel })}
          </button>
          {IS_DEMO_MODE ? (
            <button
              type="button"
              disabled
              className="action-btn import-btn"
              style={{ width: '100%', justifyContent: 'center', marginBottom: '8px', opacity: 0.55, cursor: 'not-allowed' }}
              title={t('demo.disabledAction')}
              aria-label={t('demo.disabledAction')}
            >
              <MaterialIcon name="upload" /> {t('dataManagement.importButton', { format: formatLabel })}
            </button>
          ) : (
            <label
              className="action-btn import-btn"
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.currentTarget.querySelector('input') as HTMLInputElement)?.click();
                }
              }}
            >
              <MaterialIcon name="upload" /> {t('dataManagement.importButton', { format: formatLabel })}
              <input
                type="file"
                accept={acceptType}
                onChange={onImport}
                style={{ display: 'none' }}
                aria-label={t('dataManagement.importAriaLabel', { format: formatLabel })}
              />
            </label>
          )}
          {extraActions}
          {!IS_DEMO_MODE && (
            <button 
              onClick={onReset} 
              className="action-btn reset-btn" 
              style={{ width: '100%', backgroundColor: '#ef4444', color: 'white', justifyContent: 'center' }}
              aria-label={t('dataManagement.resetAriaLabel')}
            >
              <MaterialIcon name="refresh" /> {t('dataManagement.resetButton')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
