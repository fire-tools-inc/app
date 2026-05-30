import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './SearchableSelect.css';

export interface SelectOption {
  id: string;
  label: string;
  icon?: string;
  isCustom?: boolean;
  color?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Minimum number of items for search input to appear (default: 8) */
  searchThreshold?: number;
  renderOption?: (option: SelectOption) => React.ReactNode;
  renderValue?: (option: SelectOption | undefined) => React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchThreshold = 8,
  renderOption,
  renderValue,
  ariaLabel,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const isSearchable = options.length >= searchThreshold;

  const selectedOption = useMemo(
    () => options.find(o => o.id === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && isSearchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, isSearchable]);

  const handleSelect = useCallback((id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  }, []);

  return (
    <div className={`searchable-select-container ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={`searchable-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="searchable-select-value">
          {renderValue
            ? renderValue(selectedOption)
            : selectedOption?.label || placeholder}
        </span>
        <span className={`searchable-select-arrow ${isOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="searchable-select-dropdown">
          {isSearchable && (
            <div className="searchable-select-search">
              <input
                ref={searchInputRef}
                type="text"
                className="searchable-select-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchableSelect.searchPlaceholder')}
                aria-label={t('searchableSelect.searchAriaLabel')}
              />
            </div>
          )}
          <ul className="searchable-select-options" role="listbox">
            {filteredOptions.length === 0 ? (
              <li className="searchable-select-no-results">{t('searchableSelect.noResults')}</li>
            ) : (
              filteredOptions.map(option => (
                <li
                  key={option.id}
                  role="option"
                  aria-selected={value === option.id}
                  className={`searchable-select-option ${value === option.id ? 'selected' : ''} ${option.isCustom ? 'custom-option' : ''}`}
                  onClick={() => handleSelect(option.id)}
                >
                  {renderOption ? renderOption(option) : option.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
