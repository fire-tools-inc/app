import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { CalculatorInputs } from '../types/calculator';
import { FireScenario, MAX_SCENARIOS } from '../types/scenario';
import { loadScenarios, saveScenarios } from '../utils/cookieStorage';
import './ScenarioManager.css';

interface ScenarioManagerProps {
  /** The currently active calculator inputs (used when saving a new scenario). */
  inputs: CalculatorInputs;
  /** Called with the stored inputs when a scenario is loaded. */
  onLoad: (inputs: CalculatorInputs) => void;
}

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const ScenarioManager: React.FC<ScenarioManagerProps> = ({ inputs, onLoad }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [scenarios, setScenarios] = useState<FireScenario[]>(() => loadScenarios());
  const [name, setName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const isFull = scenarios.length >= MAX_SCENARIOS;

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

  const persist = (next: FireScenario[]) => {
    setScenarios(next);
    saveScenarios(next);
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || isFull) return;
    const newScenario: FireScenario = {
      id: generateId(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      inputs,
    };
    persist([...scenarios, newScenario]);
    setName('');
  };

  const handleLoad = (scenario: FireScenario) => {
    onLoad(scenario.inputs);
    setIsOpen(false);
  };

  const handleDelete = (id: string) => {
    persist(scenarios.filter((scenario) => scenario.id !== id));
  };

  return (
    <div className="scenario-manager" ref={menuRef}>
      <button
        type="button"
        className="share-button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={t('scenarios.ariaToggle')}
      >
        <MaterialIcon name="bookmark" /> {t('scenarios.bookmark')}
        {scenarios.length > 0 && (
          <span className="scenario-count">{scenarios.length}/{MAX_SCENARIOS}</span>
        )}
      </button>

      {isOpen && (
        <div className="scenario-dropdown" role="dialog" aria-label={t('scenarios.heading')}>
          <div className="scenario-dropdown-header">{t('scenarios.heading')}</div>

          {scenarios.length === 0 ? (
            <p className="scenario-empty">{t('scenarios.empty')}</p>
          ) : (
            <ul className="scenario-list">
              {scenarios.map((scenario) => (
                <li key={scenario.id} className="scenario-item">
                  <button
                    type="button"
                    className="scenario-load-btn"
                    onClick={() => handleLoad(scenario)}
                    title={t('scenarios.load')}
                  >
                    <MaterialIcon name="bookmark" size="small" />
                    <span className="scenario-name">{scenario.name}</span>
                  </button>
                  <button
                    type="button"
                    className="scenario-delete-btn"
                    onClick={() => handleDelete(scenario.id)}
                    aria-label={t('scenarios.deleteNamed', { name: scenario.name })}
                    title={t('scenarios.delete')}
                  >
                    <MaterialIcon name="delete" size="small" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="scenario-save">
            <input
              type="text"
              className="scenario-name-input"
              value={name}
              maxLength={40}
              placeholder={t('scenarios.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              disabled={isFull}
              aria-label={t('scenarios.namePlaceholder')}
            />
            <button
              type="button"
              className="scenario-save-btn"
              onClick={handleSave}
              disabled={isFull || name.trim().length === 0}
            >
              <MaterialIcon name="save" size="small" /> {t('scenarios.save')}
            </button>
          </div>
          {isFull && <p className="scenario-limit">{t('scenarios.limitReached', { max: MAX_SCENARIOS })}</p>}
        </div>
      )}
    </div>
  );
};
