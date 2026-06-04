import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loadTourCompleted, saveTourCompleted } from '../utils/tourPreferences';
import { saveFireCalculatorInputs, saveAssetAllocation, saveExpenseTrackerData, saveNetWorthTrackerData, clearAllData, loadFireCalculatorInputs, loadAssetAllocation } from '../utils/cookieStorage';
import { saveSettings, loadSettings, DEFAULT_SETTINGS } from '../utils/cookieSettings';
import { DEFAULT_INPUTS, getDemoNetWorthData, getDemoAssetAllocationData } from '../utils/defaults';
import { generateDemoExpenseData } from '../utils/demoExpenseData';
import { DEFAULT_FALLBACK_RATES, type SupportedCurrency } from '../types/currency';
import { addNotification, clearNotifications } from '../utils/notificationStorage';
import { generateDemoTourNotifications } from '../utils/notificationGenerator';
import { MaterialIcon } from './MaterialIcon';
import './GuidedTour.css';

interface TourStep {
  title: string;
  content: React.ReactNode;
  icon: string; // Material icon name
}

interface InteractiveStep {
  page: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  elementSelector?: string; // CSS selector to highlight specific element
  inputSelector?: string; // CSS selector for input to validate (required when starting fresh)
  inputLabel?: string; // Label for the input field for validation message
  allowZero?: boolean; // Whether zero is a valid value for this field
  clickAction?: string; // CSS selector for button to click to open dialog
  dialogSelector?: string; // CSS selector for dialog to wait for
  isDialogStep?: boolean; // Whether this step is inside a dialog
  closeDialogAfter?: boolean; // Whether to close the dialog after this step
  waitForUserClick?: boolean; // Whether to wait for user to click the button themselves
  requiresAction?: boolean; // Whether the user must perform an action (like clicking "Run") before proceeding
  actionCompletedSelector?: string; // CSS selector to detect action completion (for requiresAction steps)
}

type TourPhase = 'overview' | 'data-choice' | 'interactive-prompt' | 'interactive' | 'end';

interface GuidedTourProps {
  onTourComplete?: () => void;
}

// Constants for tour timing
const DIALOG_WAIT_INTERVAL_MS = 100; // How often to check for dialog appearance
const DIALOG_WAIT_TIMEOUT_MS = 3000; // Maximum time to wait for dialog
const DIALOG_TRANSITION_DELAY_MS = 300; // Delay for dialog opening animation
const UI_UPDATE_DELAY_MS = 200; // Delay to allow UI to update before clicking
const ACTION_CHECK_INTERVAL_MS = 200; // How often to check for action completion

// Helper function to close any open dialog
function closeAnyOpenDialog(): boolean {
  // Try multiple selectors for dialog close buttons
  const selectors = [
    '.dialog.tour-highlight .dialog-close',
    '.net-worth-dialog .dialog-close',
    '.dca-dialog .dialog-close',
    '.dialog-content .dialog-close',
    '.dialog-close'
  ];
  
  for (const selector of selectors) {
    const closeButton = document.querySelector(selector) as HTMLElement;
    if (closeButton) {
      closeButton.click();
      return true;
    }
  }
  return false;
}

export function GuidedTour({ onTourComplete }: GuidedTourProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [demoDataLoaded, setDemoDataLoaded] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [tourPhase, setTourPhase] = useState<TourPhase>('overview');
  const [interactiveStep, setInteractiveStep] = useState(0);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [currentPageTour, setCurrentPageTour] = useState<string | null>(null);
  const [keepDemoData, setKeepDemoData] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hadExistingData, setHadExistingData] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [waitingForUserClick, setWaitingForUserClick] = useState(false);
  const [actionCompleted, setActionCompleted] = useState(false);
  
  // Dragging state for tooltip
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Check if tour should be shown on mount
  useEffect(() => {
    const tourCompleted = loadTourCompleted();
    if (!tourCompleted) {
      setIsVisible(true);
      // Check if user already has data (for first visit, they won't)
      const existingFireData = loadFireCalculatorInputs();
      const existingAssetData = loadAssetAllocation();
      const hasExistingData = !!(existingFireData || existingAssetData?.assets?.length);
      setHadExistingData(hasExistingData);
    }
  }, []);

  const loadDemoData = useCallback(() => {
    if (demoDataLoaded) return;

    // Reset settings to EUR as default currency
    const settings = loadSettings();
    const newSettings = {
      ...settings,
      currencySettings: {
        ...settings.currencySettings,
        defaultCurrency: 'EUR' as SupportedCurrency,
        fallbackRates: { ...DEFAULT_FALLBACK_RATES },
      },
    };
    saveSettings(newSettings);

    // Load demo FIRE Calculator data
    saveFireCalculatorInputs(DEFAULT_INPUTS);

    // Load demo Asset Allocation data
    const { assets, assetClassTargets } = getDemoAssetAllocationData();
    saveAssetAllocation(assets, assetClassTargets);

    // Load demo Cashflow Tracker data
    const cashflowData = generateDemoExpenseData();
    saveExpenseTrackerData(cashflowData);

    // Load demo Net Worth Tracker data
    const netWorthData = getDemoNetWorthData();
    saveNetWorthTrackerData(netWorthData);

    // Load demo notifications for the tour
    clearNotifications(); // Clear any existing notifications first
    const demoNotifications = generateDemoTourNotifications();
    demoNotifications.forEach(notification => {
      addNotification(notification);
    });

    setDemoDataLoaded(true);
  }, [demoDataLoaded]);

  // Load demo data when entering the "how tools work together" step,
  // but only if user doesn't already have existing data
  useEffect(() => {
    if (currentStep >= 2 && !demoDataLoaded && !hadExistingData) {
      loadDemoData();
    }
  }, [currentStep, demoDataLoaded, loadDemoData, hadExistingData]);

  // Add/remove tour-interactive-mode class on body during interactive tour
  useEffect(() => {
    if (tourPhase === 'interactive' && currentPageTour) {
      document.body.classList.add('tour-interactive-mode');
    } else {
      document.body.classList.remove('tour-interactive-mode');
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('tour-interactive-mode');
    };
  }, [tourPhase, currentPageTour]);

  // Detect dialog opening for waitForUserClick steps OR button clicks for tab steps
  useEffect(() => {
    if (!waitingForUserClick || tourPhase !== 'interactive' || !currentPageTour) return;

    const currentTour = pageTours[currentPageTour];
    const currentInteractiveStep = currentTour?.steps[interactiveStep];
    
    // If there's a dialogSelector, poll for dialog to appear
    if (currentInteractiveStep?.dialogSelector) {
      const checkDialog = () => {
        const dialog = document.querySelector(currentInteractiveStep.dialogSelector!);
        if (dialog) {
          setDialogOpen(true);
          setWaitingForUserClick(false);
          // Move to next step (first dialog step)
          setTimeout(() => {
            setInteractiveStep(interactiveStep + 1);
          }, DIALOG_TRANSITION_DELAY_MS);
        }
      };

      const intervalId = setInterval(checkDialog, DIALOG_WAIT_INTERVAL_MS);
      checkDialog(); // Check immediately
      
      return () => clearInterval(intervalId);
    }
    
    // For button clicks without dialog (like tab buttons), listen for click events
    if (currentInteractiveStep?.elementSelector && !currentInteractiveStep?.dialogSelector) {
      const handleTabClick = () => {
        setWaitingForUserClick(false);
        // Move to next step after a short delay for tab content to render
        setTimeout(() => {
          setInteractiveStep(interactiveStep + 1);
        }, DIALOG_TRANSITION_DELAY_MS);
      };
      
      // Find the highlighted element (should be a button/tab)
      const element = document.querySelector(currentInteractiveStep.elementSelector);
      if (element) {
        element.addEventListener('click', handleTabClick);
        return () => element.removeEventListener('click', handleTabClick);
      }
    }
    
    return undefined;
  }, [waitingForUserClick, tourPhase, currentPageTour, interactiveStep]);

  // Detect action completion for requiresAction steps (e.g., Monte Carlo results appearing)
  useEffect(() => {
    if (tourPhase !== 'interactive' || !currentPageTour) return;

    const currentTour = pageTours[currentPageTour];
    const currentInteractiveStep = currentTour?.steps[interactiveStep];
    
    if (!currentInteractiveStep?.requiresAction || !currentInteractiveStep?.actionCompletedSelector) return;

    // Check if the action result element appears
    const checkResults = () => {
      const results = document.querySelector(currentInteractiveStep.actionCompletedSelector!);
      if (results) {
        setActionCompleted(true);
      }
    };

    const intervalId = setInterval(checkResults, ACTION_CHECK_INTERVAL_MS);
    checkResults(); // Check immediately
    
    return () => clearInterval(intervalId);
  }, [tourPhase, currentPageTour, interactiveStep]);

  // Highlight elements during interactive tour
  useEffect(() => {
    // Helper function to clean up highlights
    const cleanupHighlights = () => {
      document.querySelectorAll('.tour-highlight').forEach(el => {
        el.classList.remove('tour-highlight');
      });
    };

    if (tourPhase !== 'interactive' || !currentPageTour) {
      // Clean up highlight when not in interactive mode
      cleanupHighlights();
      return;
    }

    // When showing the continue prompt, remove all highlights so the dialog is visible
    if (showContinuePrompt) {
      cleanupHighlights();
      return;
    }

    const currentTour = pageTours[currentPageTour];
    const currentInteractiveStep = currentTour?.steps[interactiveStep];
    
    // Remove highlight from previous elements first
    cleanupHighlights();

    // Add highlight to new element(s)
    if (currentInteractiveStep?.elementSelector) {
      // Small delay to ensure DOM is ready after navigation
      const timeoutId = setTimeout(() => {
        // Support multiple selectors separated by comma
        const selectors = currentInteractiveStep.elementSelector!.split(',').map(s => s.trim());
        
        selectors.forEach(selector => {
          const element = document.querySelector(selector) as HTMLElement;
          if (element) {
            element.classList.add('tour-highlight');
            // Scroll first element into view
            if (selectors.indexOf(selector) === 0) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        });
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [tourPhase, currentPageTour, interactiveStep, showContinuePrompt]);

  // Validate input when trying to proceed (only when starting fresh)
  const validateCurrentStep = useCallback((): boolean => {
    // If user kept demo data, no validation needed
    if (keepDemoData) {
      setValidationError(null);
      return true;
    }

    if (tourPhase !== 'interactive' || !currentPageTour) {
      return true;
    }

    const currentTour = pageTours[currentPageTour];
    const currentInteractiveStep = currentTour?.steps[interactiveStep];

    // If no input selector, no validation needed
    if (!currentInteractiveStep?.inputSelector) {
      setValidationError(null);
      return true;
    }

    // Find the input and check if it has a value
    const input = document.querySelector(currentInteractiveStep.inputSelector) as HTMLInputElement;
    if (input) {
      const value = input.value?.trim();
      const isZero = value === '0' || parseFloat(value) === 0;
      const isEmpty = !value || value === '';
      
      // Allow zero if the step specifies allowZero: true
      if (isEmpty || (isZero && !currentInteractiveStep.allowZero)) {
        setValidationError(t('guidedTour.validation.enterValueForField', { field: currentInteractiveStep.inputLabel || t('guidedTour.validation.thisField') }));
        input.focus();
        return false;
      }
    }

    setValidationError(null);
    return true;
  }, [keepDemoData, tourPhase, currentPageTour, interactiveStep]);

  // Drag handlers for tooltip
  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow dragging from the header
    if (!(e.target as HTMLElement).closest('.tour-tooltip-header')) return;
    if ((e.target as HTMLElement).tagName === 'BUTTON') return; // Don't drag when clicking buttons
    
    e.preventDefault();
    setIsDragging(true);
    
    const tooltipEl = tooltipRef.current;
    if (tooltipEl) {
      const rect = tooltipEl.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  }, []);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !tooltipRef.current) return;
    
    const tooltipEl = tooltipRef.current;
    const rect = tooltipEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate new position
    let newX = e.clientX - dragOffset.current.x;
    let newY = e.clientY - dragOffset.current.y;
    
    // Constrain to viewport boundaries with padding
    const padding = 10;
    newX = Math.max(padding, Math.min(viewportWidth - rect.width - padding, newX));
    newY = Math.max(padding, Math.min(viewportHeight - rect.height - padding, newY));
    
    setTooltipPosition({ x: newX, y: newY });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  const tourSteps: TourStep[] = [
    {
      title: t('guidedTour.overview.welcome.title'),
      icon: 'waving_hand',
      content: (
        <div className="tour-step-content">
          <p>
            {t('guidedTour.overview.welcome.paragraph1Start')} <strong>{t('guidedTour.overview.welcome.fireStrong')}</strong>.
          </p>
          <p>
            {t('guidedTour.overview.welcome.paragraph2')}
          </p>
          <p className="tour-privacy-note">
            <span className="tour-note-icon"><MaterialIcon name="lock" size="small" /></span>
            <span>{t('guidedTour.overview.welcome.privacyNote')}</span>
          </p>
        </div>
      ),
    },
    {
      title: t('guidedTour.overview.assetAllocation.title'),
      icon: 'pie_chart',
      content: (
        <div className="tour-step-content">
          <p>
            <strong>{t('guidedTour.overview.assetAllocation.strong')}</strong> {t('guidedTour.overview.assetAllocation.text')}
          </p>
          <ul className="tour-feature-list">
            <li><span className="tour-feature-icon"><MaterialIcon name="work" size="small" /></span> {t('guidedTour.overview.assetAllocation.features.addAssets')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="balance" size="small" /></span> {t('guidedTour.overview.assetAllocation.features.targets')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="show_chart" size="small" /></span> {t('guidedTour.overview.assetAllocation.features.dca')}</li>
          </ul>
        </div>
      ),
    },
    {
      title: t('guidedTour.overview.cashflow.title'),
      icon: 'account_balance_wallet',
      content: (
        <div className="tour-step-content">
          <p>
            <strong>{t('guidedTour.overview.cashflow.strong')}</strong> {t('guidedTour.overview.cashflow.text')}
          </p>
          <ul className="tour-feature-list">
            <li><span className="tour-feature-icon"><MaterialIcon name="receipt_long" size="small" /></span> {t('guidedTour.overview.cashflow.features.log')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="savings" size="small" /></span> {t('guidedTour.overview.cashflow.features.budgets')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="analytics" size="small" /></span> {t('guidedTour.overview.cashflow.features.analytics')}</li>
          </ul>
        </div>
      ),
    },
    {
      title: t('guidedTour.overview.netWorth.title'),
      icon: 'paid',
      content: (
        <div className="tour-step-content">
          <p>
            <strong>{t('guidedTour.overview.netWorth.strong')}</strong> {t('guidedTour.overview.netWorth.text')}
          </p>
          <ul className="tour-feature-list">
            <li><span className="tour-feature-icon"><MaterialIcon name="work" size="small" /></span> {t('guidedTour.overview.netWorth.features.monitor')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="trending_up" size="small" /></span> {t('guidedTour.overview.netWorth.features.charts')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="sync" size="small" /></span> {t('guidedTour.overview.netWorth.features.sync')}</li>
          </ul>
        </div>
      ),
    },
    {
      title: t('guidedTour.overview.fireCalculator.title'),
      icon: 'local_fire_department',
      content: (
        <div className="tour-step-content">
          <p>
            <strong>{t('guidedTour.overview.fireCalculator.strong')}</strong> {t('guidedTour.overview.fireCalculator.text')}
          </p>
          <ul className="tour-feature-list">
            <li><span className="tour-feature-icon"><MaterialIcon name="bar_chart" size="small" /></span> {t('guidedTour.overview.fireCalculator.features.projections')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="gps_fixed" size="small" /></span> {t('guidedTour.overview.fireCalculator.features.reachFire')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="settings" size="small" /></span> {t('guidedTour.overview.fireCalculator.features.scenarios')}</li>
          </ul>
        </div>
      ),
    },
    {
      title: t('guidedTour.overview.monteCarlo.title'),
      icon: 'casino',
      content: (
        <div className="tour-step-content">
          <p>
            <strong>{t('guidedTour.overview.monteCarlo.strong')}</strong> {t('guidedTour.overview.monteCarlo.text')}
          </p>
          <ul className="tour-feature-list">
            <li><span className="tour-feature-icon"><MaterialIcon name="gps_fixed" size="small" /></span> {t('guidedTour.overview.monteCarlo.features.success')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="ssid_chart" size="small" /></span> {t('guidedTour.overview.monteCarlo.features.volatility')}</li>
            <li><span className="tour-feature-icon"><MaterialIcon name="bolt" size="small" /></span> {t('guidedTour.overview.monteCarlo.features.outcomes')}</li>
          </ul>
        </div>
      ),
    },
    {
      title: t('guidedTour.overview.together.title'),
      icon: 'handshake',
      content: (
        <div className="tour-step-content">
          <p>
            <strong>{t('guidedTour.overview.together.strong')}</strong>
          </p>
          <div className="tour-integration-diagram">
            <div className="tour-integration-item">
              <span className="tour-integration-icon"><MaterialIcon name="pie_chart" size="small" /></span>
              <span className="tour-integration-arrow">→</span>
              <span className="tour-integration-icon"><MaterialIcon name="local_fire_department" size="small" /></span>
              <span className="tour-integration-text">{t('guidedTour.overview.together.assetValues')}</span>
            </div>
            <div className="tour-integration-item">
              <span className="tour-integration-icon"><MaterialIcon name="account_balance_wallet" size="small" /></span>
              <span className="tour-integration-arrow">→</span>
              <span className="tour-integration-icon"><MaterialIcon name="local_fire_department" size="small" /></span>
              <span className="tour-integration-text">{t('guidedTour.overview.together.cashflowUpdates')}</span>
            </div>
            <div className="tour-integration-item">
              <span className="tour-integration-icon"><MaterialIcon name="paid" size="small" /></span>
              <span className="tour-integration-arrow">↔</span>
              <span className="tour-integration-icon"><MaterialIcon name="pie_chart" size="small" /></span>
              <span className="tour-integration-text">{t('guidedTour.overview.together.netWorthSync')}</span>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // Interactive tour steps for each page
  const fireCalculatorSteps: InteractiveStep[] = [
    {
      page: '/fire-calculator',
      title: t('guidedTour.interactive.fireCalculator.initialSavings.title'),
      description: t('guidedTour.interactive.fireCalculator.initialSavings.description'),
      position: 'center',
      elementSelector: '[data-tour="initial-savings"]',
      inputSelector: '#initial-savings',
      inputLabel: t('guidedTour.interactive.fireCalculator.initialSavings.title'),
      allowZero: true, // Zero is valid for someone just starting
    },
    {
      page: '/fire-calculator',
      title: t('guidedTour.interactive.fireCalculator.annualIncome.title'),
      description: t('guidedTour.interactive.fireCalculator.annualIncome.description'),
      position: 'center',
      elementSelector: '[data-tour="income-section"]',
      inputSelector: '#labor-income',
      inputLabel: t('guidedTour.interactive.fireCalculator.annualIncome.title'),
    },
    {
      page: '/fire-calculator',
      title: t('guidedTour.interactive.fireCalculator.annualExpenses.title'),
      description: t('guidedTour.interactive.fireCalculator.annualExpenses.description'),
      position: 'center',
      elementSelector: '[data-tour="expenses-section"]',
      inputSelector: '#current-expenses',
      inputLabel: t('guidedTour.interactive.fireCalculator.annualExpenses.title'),
    },
    {
      page: '/fire-calculator',
      title: t('guidedTour.interactive.fireCalculator.withdrawalRate.title'),
      description: t('guidedTour.interactive.fireCalculator.withdrawalRate.description'),
      position: 'center',
      elementSelector: '[data-tour="fire-params"]',
      inputSelector: '#withdrawal-rate',
      inputLabel: t('guidedTour.interactive.fireCalculator.withdrawalRate.title'),
    },
    {
      page: '/fire-calculator',
      title: t('guidedTour.interactive.fireCalculator.integrationOptions.title'),
      description: t('guidedTour.interactive.fireCalculator.integrationOptions.description'),
      position: 'center',
      elementSelector: '[data-tour="options-section"]',
    },
    {
      page: '/fire-calculator',
      title: t('guidedTour.interactive.fireCalculator.fireMetrics.title'),
      description: t('guidedTour.interactive.fireCalculator.fireMetrics.description'),
      position: 'center',
      elementSelector: '[data-tour="results-section"]',
    },
    {
      page: '/fire-calculator',
      title: t('guidedTour.interactive.fireCalculator.growthCharts.title'),
      description: t('guidedTour.interactive.fireCalculator.growthCharts.description'),
      position: 'center',
      elementSelector: '[data-tour="charts-section"]',
    },
  ];

  const assetAllocationSteps: InteractiveStep[] = [
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.yourAssets.title'),
      description: t('guidedTour.interactive.assetAllocation.yourAssets.description'),
      position: 'center',
      elementSelector: '[data-tour="asset-list"]',
    },
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.addNewAssets.title'),
      description: t('guidedTour.interactive.assetAllocation.addNewAssets.description'),
      position: 'center',
      elementSelector: '[data-tour="add-asset-button"]',
      waitForUserClick: true,
      dialogSelector: '.dialog-content',
    },
    // Add Asset Dialog steps
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.assetClassSelection.title'),
      description: t('guidedTour.interactive.assetAllocation.assetClassSelection.description'),
      position: 'center',
      elementSelector: '.dialog-content',
      isDialogStep: true,
    },
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.assetDetails.title'),
      description: t('guidedTour.interactive.assetAllocation.assetDetails.description'),
      position: 'center',
      elementSelector: '.dialog-content',
      isDialogStep: true,
    },
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.targetAllocation.title'),
      description: t('guidedTour.interactive.assetAllocation.targetAllocation.description'),
      position: 'center',
      elementSelector: '.dialog-content',
      isDialogStep: true,
      closeDialogAfter: true,
    },
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.targetAllocations.title'),
      description: t('guidedTour.interactive.assetAllocation.targetAllocations.description'),
      position: 'center',
      elementSelector: '[data-tour="target-allocations"]',
    },
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.dcaHelper.title'),
      description: t('guidedTour.interactive.assetAllocation.dcaHelper.description'),
      position: 'center',
      elementSelector: '[data-tour="dca-helper"]',
      waitForUserClick: true,
      dialogSelector: '.dca-dialog',
    },
    // DCA Helper Dialog steps
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.enterInvestmentAmount.title'),
      description: t('guidedTour.interactive.assetAllocation.enterInvestmentAmount.description'),
      position: 'center',
      elementSelector: '.dca-dialog',
      isDialogStep: true,
    },
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.investmentBreakdown.title'),
      description: t('guidedTour.interactive.assetAllocation.investmentBreakdown.description'),
      position: 'center',
      elementSelector: '.dca-dialog',
      isDialogStep: true,
    },
    {
      page: '/asset-allocation',
      title: t('guidedTour.interactive.assetAllocation.confirm.title'),
      description: t('guidedTour.interactive.assetAllocation.confirm.description'),
      position: 'center',
      elementSelector: '.dca-dialog',
      isDialogStep: true,
      closeDialogAfter: true,
    },
  ];

  const expenseTrackerSteps: InteractiveStep[] = [
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.addIncome.title'),
      description: t('guidedTour.interactive.expenseTracker.addIncome.description'),
      position: 'center',
      elementSelector: '[data-tour="transaction-actions"]',
      waitForUserClick: true,
      dialogSelector: '.dialog',
    },
    // Add Income Dialog steps
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.dateAmount.title'),
      description: t('guidedTour.interactive.expenseTracker.dateAmount.description'),
      position: 'center',
      elementSelector: '.dialog',
      isDialogStep: true,
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.incomeSource.title'),
      description: t('guidedTour.interactive.expenseTracker.incomeSource.description'),
      position: 'center',
      elementSelector: '.dialog',
      isDialogStep: true,
      closeDialogAfter: true,
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.addExpense.title'),
      description: t('guidedTour.interactive.expenseTracker.addExpense.description'),
      position: 'center',
      elementSelector: '[data-tour="transaction-actions"]',
      waitForUserClick: true,
      dialogSelector: '.dialog',
    },
    // Add Expense Dialog steps
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.expenseDetails.title'),
      description: t('guidedTour.interactive.expenseTracker.expenseDetails.description'),
      position: 'center',
      elementSelector: '.dialog',
      isDialogStep: true,
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.categoryType.title'),
      description: t('guidedTour.interactive.expenseTracker.categoryType.description'),
      position: 'center',
      elementSelector: '.dialog',
      isDialogStep: true,
      closeDialogAfter: true,
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.budgetRule.title'),
      description: t('guidedTour.interactive.expenseTracker.budgetRule.description'),
      position: 'center',
      elementSelector: '[data-tour="budget-analysis"]',
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.setBudgets.title'),
      description: t('guidedTour.interactive.expenseTracker.setBudgets.description'),
      position: 'center',
      elementSelector: '[data-tour="budgets-tab"]',
      waitForUserClick: true,
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.budgetCategories.title'),
      description: t('guidedTour.interactive.expenseTracker.budgetCategories.description'),
      position: 'center',
      elementSelector: '[data-tour="expense-tabs"], [data-tour="budgets-content"]',
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.analytics.title'),
      description: t('guidedTour.interactive.expenseTracker.analytics.description'),
      position: 'center',
      elementSelector: '[data-tour="analytics-tab"]',
      waitForUserClick: true,
    },
    {
      page: '/expense-tracker',
      title: t('guidedTour.interactive.expenseTracker.spendingInsights.title'),
      description: t('guidedTour.interactive.expenseTracker.spendingInsights.description'),
      position: 'center',
      elementSelector: '[data-tour="expense-tabs"], [data-tour="analytics-content"]',
    },
  ];

  const netWorthSteps: InteractiveStep[] = [
    {
      page: '/net-worth-tracker',
      title: t('guidedTour.interactive.netWorth.logAssets.title'),
      description: t('guidedTour.interactive.netWorth.logAssets.description'),
      position: 'center',
      elementSelector: '[data-tour="assets-section"]',
    },
    {
      page: '/net-worth-tracker',
      title: t('guidedTour.interactive.netWorth.logOperations.title'),
      description: t('guidedTour.interactive.netWorth.logOperations.description'),
      position: 'center',
      elementSelector: '[data-tour="assets-section"]',
      waitForUserClick: true,
      dialogSelector: '.net-worth-dialog',
    },
    // Log Operation Dialog steps
    {
      page: '/net-worth-tracker',
      title: t('guidedTour.interactive.netWorth.operationDetails.title'),
      description: t('guidedTour.interactive.netWorth.operationDetails.description'),
      position: 'center',
      elementSelector: '.net-worth-dialog',
      isDialogStep: true,
    },
    {
      page: '/net-worth-tracker',
      title: t('guidedTour.interactive.netWorth.amountDescription.title'),
      description: t('guidedTour.interactive.netWorth.amountDescription.description'),
      position: 'center',
      elementSelector: '.net-worth-dialog',
      isDialogStep: true,
      closeDialogAfter: true,
    },
    {
      page: '/net-worth-tracker',
      title: t('guidedTour.interactive.netWorth.historicalChart.title'),
      description: t('guidedTour.interactive.netWorth.historicalChart.description'),
      position: 'center',
      elementSelector: '[data-tour="historical-chart"]',
    },
    {
      page: '/net-worth-tracker',
      title: t('guidedTour.interactive.netWorth.assetAllocationSync.title'),
      description: t('guidedTour.interactive.netWorth.assetAllocationSync.description'),
      position: 'center',
      elementSelector: '[data-tour="sync-options"]',
    },
  ];

  // Monte Carlo Simulation steps
  const monteCarloSteps: InteractiveStep[] = [
    {
      page: '/monte-carlo',
      title: t('guidedTour.interactive.monteCarlo.baseData.title'),
      description: t('guidedTour.interactive.monteCarlo.baseData.description'),
      position: 'center',
      elementSelector: '[data-tour="monte-carlo-base-data"]',
    },
    {
      page: '/monte-carlo',
      title: t('guidedTour.interactive.monteCarlo.parameters.title'),
      description: t('guidedTour.interactive.monteCarlo.parameters.description'),
      position: 'center',
      elementSelector: '[data-tour="monte-carlo-params"]',
    },
    {
      page: '/monte-carlo',
      title: t('guidedTour.interactive.monteCarlo.runSimulation.title'),
      description: t('guidedTour.interactive.monteCarlo.runSimulation.description'),
      position: 'center',
      elementSelector: '[data-tour="monte-carlo-run-btn"]',
      requiresAction: true,
      actionCompletedSelector: '[data-tour="monte-carlo-results"]',
    },
    {
      page: '/monte-carlo',
      title: t('guidedTour.interactive.monteCarlo.results.title'),
      description: t('guidedTour.interactive.monteCarlo.results.description'),
      position: 'center',
      elementSelector: '[data-tour="monte-carlo-results"]',
    },
    {
      page: '/monte-carlo',
      title: t('guidedTour.interactive.monteCarlo.logs.title'),
      description: t('guidedTour.interactive.monteCarlo.logs.description'),
      position: 'center',
      elementSelector: '[data-tour="monte-carlo-logs"]',
    },
  ];

  const pageTours: Record<string, { steps: InteractiveStep[]; nextPage: string | null; previousPage: string | null; pageName: string }> = {
    '/fire-calculator': { steps: fireCalculatorSteps, nextPage: '/asset-allocation', previousPage: null, pageName: t('guidedTour.pageNames.assetAllocation') },
    '/asset-allocation': { steps: assetAllocationSteps, nextPage: '/expense-tracker', previousPage: '/fire-calculator', pageName: t('guidedTour.pageNames.cashflowTracker') },
    '/expense-tracker': { steps: expenseTrackerSteps, nextPage: '/net-worth-tracker', previousPage: '/asset-allocation', pageName: t('guidedTour.pageNames.netWorthTracker') },
    '/net-worth-tracker': { steps: netWorthSteps, nextPage: '/monte-carlo', previousPage: '/expense-tracker', pageName: t('guidedTour.pageNames.monteCarlo') },
    '/monte-carlo': { steps: monteCarloSteps, nextPage: null, previousPage: '/net-worth-tracker', pageName: '' },
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // After overview tour, first ask about demo data
      setTourPhase('data-choice');
      setShowEndDialog(true);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    // Show end dialog to ask about demo data
    if (demoDataLoaded) {
      setTourPhase('data-choice');
      setShowEndDialog(true);
    } else {
      // If demo data wasn't loaded, just close the tour
      completeTour();
    }
  };

  const completeTour = (keepData = true) => {
    if (!keepData) {
      clearAllData();
      // Reset settings to defaults
      saveSettings(DEFAULT_SETTINGS);
    }
    saveTourCompleted(true);
    setIsVisible(false);
    setShowEndDialog(false);
    setTourPhase('overview');
    onTourComplete?.();
    
    // Reload the page to reflect data changes
    if (!keepData) {
      window.location.reload();
    }
  };

  // Handle keeping demo data and proceed to interactive tour prompt
  const handleKeepDataAndContinue = () => {
    setKeepDemoData(true);
    setTourPhase('interactive-prompt');
  };

  // Handle clearing data and proceed to interactive tour prompt
  const handleClearDataAndContinue = () => {
    setKeepDemoData(false);
    clearAllData();
    saveSettings(DEFAULT_SETTINGS);
    setTourPhase('interactive-prompt');
  };

  // Handle keeping current user data (when restarting tour)
  const handleKeepCurrentDataAndContinue = () => {
    setKeepDemoData(true);
    // Don't load demo data or clear anything - just proceed
    setTourPhase('interactive-prompt');
  };

  // Finish tour without interactive walkthrough
  const finishWithoutInteractive = () => {
    saveTourCompleted(true);
    setIsVisible(false);
    setShowEndDialog(false);
    onTourComplete?.();
    navigate('/');
    // Reload if data was cleared
    if (!keepDemoData) {
      window.location.reload();
    }
  };

  // Start the interactive tour
  const startInteractiveTour = () => {
    setShowEndDialog(false);
    setTourPhase('interactive');
    setCurrentPageTour('/fire-calculator');
    setInteractiveStep(0);
    setValidationError(null);
    setWaitingForUserClick(false);
    setActionCompleted(false);
    navigate('/fire-calculator');
  };

  // Handle next step in interactive tour
  const handleInteractiveNext = () => {
    if (!currentPageTour) return;
    
    // Validate current step before proceeding
    if (!validateCurrentStep()) {
      return;
    }
    
    const currentTour = pageTours[currentPageTour];
    if (!currentTour) return;

    const currentInteractiveStep = currentTour.steps[interactiveStep];
    const nextStepIndex = interactiveStep + 1;
    const nextStep = nextStepIndex < currentTour.steps.length ? currentTour.steps[nextStepIndex] : null;

    // Reset action states
    setActionCompleted(false);
    setWaitingForUserClick(false);

    // Close dialog if current step requires it or if moving from a dialog step to a non-dialog step
    const shouldCloseDialog = dialogOpen && (
      currentInteractiveStep?.closeDialogAfter ||
      (currentInteractiveStep?.isDialogStep && nextStep && !nextStep.isDialogStep)
    );
    if (shouldCloseDialog) {
      closeAnyOpenDialog();
      setDialogOpen(false);
    }

    // If current step requires waiting for user to click a button to open dialog
    // and the dialog isn't open yet, set waiting state and return
    if (currentInteractiveStep?.waitForUserClick && !dialogOpen && currentInteractiveStep?.dialogSelector) {
      // User hasn't clicked yet, set waiting state
      setWaitingForUserClick(true);
      return;
    }

    // If current step is a waitForUserClick step without dialog (like tab clicks),
    // just proceed since the step description tells user what to do
    // The actual click will be detected in the useEffect

    // If current step requires an action (like clicking Run), check if action was completed
    if (currentInteractiveStep?.requiresAction && !actionCompleted) {
      setValidationError(t('guidedTour.validation.completeActionBeforeContinuing'));
      return;
    }

    // If next step has clickAction (needs to auto-click to open a dialog), handle it
    if (nextStep?.clickAction) {
      // Move to next step first
      setInteractiveStep(nextStepIndex);
      setValidationError(null);
      
      // Delay to allow UI to update, then click the button
      setTimeout(() => {
        const button = document.querySelector(nextStep.clickAction!) as HTMLElement;
        if (button) {
          button.click();
          setDialogOpen(true);
          
          // Wait for dialog to appear with timeout to prevent infinite loop
          let waitTime = 0;
          const waitForDialog = () => {
            const dialog = document.querySelector(nextStep.dialogSelector || '.dialog');
            if (dialog) {
              // Move to the first dialog step after dialog opening animation
              setTimeout(() => {
                setInteractiveStep(nextStepIndex + 1);
              }, DIALOG_TRANSITION_DELAY_MS);
            } else if (waitTime < DIALOG_WAIT_TIMEOUT_MS) {
              // Keep waiting until timeout
              waitTime += DIALOG_WAIT_INTERVAL_MS;
              setTimeout(waitForDialog, DIALOG_WAIT_INTERVAL_MS);
            } else {
              // Timeout reached, proceed anyway
              setInteractiveStep(nextStepIndex + 1);
            }
          };
          setTimeout(waitForDialog, UI_UPDATE_DELAY_MS);
        }
      }, UI_UPDATE_DELAY_MS);
      return;
    }

    // If next step requires waiting for user click, set the waiting state
    if (nextStep?.waitForUserClick) {
      setInteractiveStep(nextStepIndex);
      setValidationError(null);
      setWaitingForUserClick(true);
      return;
    }

    if (nextStepIndex < currentTour.steps.length) {
      setInteractiveStep(nextStepIndex);
      setValidationError(null);
    } else {
      // Show prompt to continue to next page or finish
      // First close any open dialog
      if (dialogOpen) {
        closeAnyOpenDialog();
        setDialogOpen(false);
      }
      setShowContinuePrompt(true);
    }
  };

  // Handle previous step in interactive tour
  const handleInteractivePrev = () => {
    const currentTour = currentPageTour ? pageTours[currentPageTour] : null;
    const currentInteractiveStep = currentTour?.steps[interactiveStep];
    
    // Reset waiting states
    setWaitingForUserClick(false);
    setActionCompleted(false);
    setValidationError(null);
    
    // If we're in a dialog, going back should stay in dialog or close it
    if (currentInteractiveStep?.isDialogStep) {
      // Check if previous step is also a dialog step
      const prevStep = interactiveStep > 0 ? currentTour?.steps[interactiveStep - 1] : null;
      if (prevStep?.isDialogStep) {
        // Stay in dialog, go to previous step
        setInteractiveStep(interactiveStep - 1);
        return;
      } else if (prevStep?.waitForUserClick || prevStep?.clickAction) {
        // Previous step is the one that opened the dialog, close dialog and go back
        closeAnyOpenDialog();
        setDialogOpen(false);
        setInteractiveStep(interactiveStep - 1);
        return;
      }
    }
    
    // If previous step was a dialog step (from current non-dialog step), we need to reopen the dialog
    const prevStep = interactiveStep > 0 ? currentTour?.steps[interactiveStep - 1] : null;
    if (prevStep?.closeDialogAfter) {
      // Find the step that opened the dialog
      let dialogOpenerIndex = interactiveStep - 1;
      while (dialogOpenerIndex > 0) {
        const step = currentTour?.steps[dialogOpenerIndex - 1];
        if (step?.waitForUserClick || step?.clickAction) {
          break;
        }
        dialogOpenerIndex--;
      }
      
      // Go back to the last dialog step and reopen dialog
      const openerStep = currentTour?.steps[dialogOpenerIndex - 1];
      if (openerStep?.clickAction) {
        // Auto-click to open dialog
        setInteractiveStep(interactiveStep - 1);
        setTimeout(() => {
          const button = document.querySelector(openerStep.clickAction!) as HTMLElement;
          if (button) {
            button.click();
            setDialogOpen(true);
          }
        }, UI_UPDATE_DELAY_MS);
        return;
      } else if (openerStep?.waitForUserClick && openerStep?.dialogSelector) {
        // For waitForUserClick steps, we need to tell user to click again
        setInteractiveStep(dialogOpenerIndex - 1);
        setWaitingForUserClick(true);
        return;
      }
    }
    
    if (interactiveStep > 0) {
      setInteractiveStep(interactiveStep - 1);
    } else if (currentPageTour) {
      // At start of page - go to previous page's last step
      if (currentTour?.previousPage) {
        const prevPageTour = pageTours[currentTour.previousPage];
        if (prevPageTour) {
          // Close any open dialog first
          if (dialogOpen) {
            closeAnyOpenDialog();
            setDialogOpen(false);
          }
          setCurrentPageTour(currentTour.previousPage);
          setInteractiveStep(prevPageTour.steps.length - 1);
          navigate(currentTour.previousPage);
        }
      }
    }
  };

  // Continue to next page in interactive tour
  const continueToNextPage = () => {
    if (!currentPageTour) return;
    
    // Close any open dialog first
    if (dialogOpen) {
      closeAnyOpenDialog();
      setDialogOpen(false);
    }
    
    const currentTour = pageTours[currentPageTour];
    if (currentTour?.nextPage) {
      setCurrentPageTour(currentTour.nextPage);
      setInteractiveStep(0);
      setShowContinuePrompt(false);
      setValidationError(null);
      navigate(currentTour.nextPage);
    } else {
      finishInteractiveTour();
    }
  };

  // Finish the interactive tour
  const finishInteractiveTour = () => {
    // Close any open dialog first
    if (dialogOpen) {
      closeAnyOpenDialog();
      setDialogOpen(false);
    }
    
    // Clean up tour state
    setShowContinuePrompt(false);
    saveTourCompleted(true);
    setIsVisible(false);
    setShowEndDialog(false);
    setTourPhase('overview');
    setCurrentPageTour(null);
    
    // Remove tour-interactive-mode class to restore all inputs
    document.body.classList.remove('tour-interactive-mode');
    
    // Remove any highlight from elements
    document.querySelectorAll('.tour-highlight').forEach(el => {
      el.classList.remove('tour-highlight');
    });
    
    onTourComplete?.();
    navigate('/');
  };

  // Skip interactive tour and go to end
  const skipInteractiveTour = () => {
    // Close any open dialog first
    if (dialogOpen) {
      closeAnyOpenDialog();
      setDialogOpen(false);
    }
    
    // Clean up tour state
    setShowContinuePrompt(false);
    saveTourCompleted(true);
    setIsVisible(false);
    setShowEndDialog(false);
    setTourPhase('overview');
    setCurrentPageTour(null);
    
    // Remove tour-interactive-mode class to restore all inputs
    document.body.classList.remove('tour-interactive-mode');
    
    // Remove any highlight from elements
    document.querySelectorAll('.tour-highlight').forEach(el => {
      el.classList.remove('tour-highlight');
    });
    
    onTourComplete?.();
    
    // Force page refresh to ensure all inputs are clickable again
    window.location.href = '/';
  };

  // Skip just the current step (not the entire tour)
  const skipCurrentPage = () => {
    if (!currentPageTour) return;
    
    const currentTour = pageTours[currentPageTour];
    if (!currentTour) return;

    const currentInteractiveStep = currentTour.steps[interactiveStep];

    // Reset validation and waiting states
    setValidationError(null);
    setWaitingForUserClick(false);
    setActionCompleted(false);

    // If current step has closeDialogAfter or is a dialog step, close any dialog
    if ((currentInteractiveStep?.closeDialogAfter || currentInteractiveStep?.isDialogStep) && dialogOpen) {
      closeAnyOpenDialog();
      setDialogOpen(false);
    }

    // Skip to the end of the current page's tour
    setShowContinuePrompt(true);
  };

  if (!isVisible) return null;

  // Interactive tour - show continue prompt
  if (showContinuePrompt && currentPageTour) {
    const currentTour = pageTours[currentPageTour];
    const hasNextPage = currentTour?.nextPage;
    
    return (
      <div className="tour-overlay tour-overlay-transparent" role="dialog" aria-modal="true">
        <div className="tour-modal tour-continue-modal">
          <div className="tour-continue-header">
            <span className="tour-continue-icon"><MaterialIcon name="auto_awesome" /></span>
            <h2>{t('guidedTour.pageCompleteTitle')}</h2>
          </div>
          <div className="tour-continue-content">
            {hasNextPage ? (
              <>
                <p>
                  {t('guidedTour.pageCompleteContinueStart')} <strong>{currentTour.pageName}</strong> {t('guidedTour.pageCompleteContinueEnd')}
                </p>
                <div className="tour-continue-actions">
                  <button 
                    className="tour-btn tour-btn-secondary"
                    onClick={finishInteractiveTour}
                  >
                    {t('guidedTour.finishTour')}
                  </button>
                  <button 
                    className="tour-btn tour-btn-primary"
                    onClick={continueToNextPage}
                  >
                    {t('guidedTour.continueTo', { pageName: currentTour.pageName })} →
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  {t('guidedTour.allPagesComplete')}
                </p>
                <div className="tour-continue-actions">
                  <button 
                    className="tour-btn tour-btn-primary"
                    onClick={finishInteractiveTour}
                  >
                    {t('guidedTour.finishTour')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Interactive tour - show step tooltip with dimmed background
  if (tourPhase === 'interactive' && currentPageTour) {
    const currentTour = pageTours[currentPageTour];
    const currentInteractiveStep = currentTour?.steps[interactiveStep];
    const hasInputValidation = !keepDemoData && currentInteractiveStep?.inputSelector;
    
    if (currentInteractiveStep) {
      return (
        <>
          {/* Dimmed background overlay */}
          <div className="tour-interactive-overlay" />
          
          {/* Tooltip */}
          <div 
            ref={tooltipRef}
            className={`tour-tooltip-container ${isDragging ? 'tour-dragging' : ''}`}
            style={tooltipPosition ? {
              position: 'fixed',
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              bottom: 'auto',
              transform: 'none'
            } : undefined}
          >
            <div className="tour-tooltip">
              <div 
                className="tour-tooltip-header tour-draggable"
                onMouseDown={handleDragStart}
                title={t('guidedTour.dragToMove')}
              >
                <h3>{currentInteractiveStep.title}</h3>
                <div className="tour-tooltip-skip-options">
                  <button 
                    className="tour-tooltip-skip tour-tooltip-skip-step"
                    onClick={skipCurrentPage}
                    aria-label={t('guidedTour.skipThisPage')}
                    title={t('guidedTour.skipThisPage')}
                  >
                    {t('guidedTour.skipPage')}
                  </button>
                  <button 
                    className="tour-tooltip-skip"
                    onClick={skipInteractiveTour}
                    aria-label={t('guidedTour.skipEntireTour')}
                    title={t('guidedTour.skipEntireTour')}
                  >
                    {t('guidedTour.skipTour')}
                  </button>
                </div>
              </div>
              <p>{currentInteractiveStep.description}</p>
              {hasInputValidation && (
                <p className="tour-tooltip-hint">
                  <span className="tour-hint-icon"><MaterialIcon name="edit" size="small" /></span>
                  {t('guidedTour.hints.enterValue')}
                </p>
              )}
              {waitingForUserClick && (
                <p className="tour-tooltip-hint">
                  <span className="tour-hint-icon"><MaterialIcon name="touch_app" size="small" /></span>
                  {t('guidedTour.hints.clickHighlighted')}
                </p>
              )}
              {currentInteractiveStep?.requiresAction && !actionCompleted && (
                <p className="tour-tooltip-hint">
                  <span className="tour-hint-icon"><MaterialIcon name="play_arrow" size="small" /></span>
                  {t('guidedTour.hints.runActionThenNext')}
                </p>
              )}
              {validationError && (
                <p className="tour-tooltip-error">
                  <span className="tour-error-icon"><MaterialIcon name="warning" size="small" /></span>
                  {validationError}
                </p>
              )}
              <div className="tour-tooltip-footer">
                <button
                  className="tour-btn tour-btn-secondary tour-btn-small"
                  onClick={handleInteractivePrev}
                  disabled={interactiveStep === 0 && !currentTour.previousPage}
                >
                  ← {t('guidedTour.back')}
                </button>
                <span className="tour-tooltip-count">
                  {interactiveStep + 1} / {currentTour.steps.length}
                </span>
                <button
                  className="tour-btn tour-btn-primary tour-btn-small"
                  onClick={handleInteractiveNext}
                >
                  {interactiveStep === currentTour.steps.length - 1 ? t('guidedTour.done') : t('guidedTour.nextArrow')}
                </button>
              </div>
            </div>
          </div>
        </>
      );
    }
  }

  if (showEndDialog) {
    // Data choice phase - ask about keeping/clearing demo data first
    if (tourPhase === 'data-choice') {
      return (
        <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-end-title">
          <div className="tour-modal tour-end-modal">
            <div className="tour-end-header">
              <span className="tour-end-icon"><MaterialIcon name="celebration" /></span>
              <h2 id="tour-end-title">{t('guidedTour.overviewCompleteTitle')}</h2>
            </div>
            <div className="tour-end-content">
              <p>
                {t('guidedTour.dataChoice.greatOverview')} {hadExistingData ? t('guidedTour.dataChoice.existingData') : t('guidedTour.dataChoice.demoDataLoaded')}
              </p>
              <p className="tour-end-question">
                <strong>{t('guidedTour.dataChoice.question')}</strong>
              </p>
            </div>
            <div className="tour-end-actions">
              <button 
                className="tour-btn tour-btn-secondary"
                onClick={handleClearDataAndContinue}
              >
                <span className="tour-btn-icon"><MaterialIcon name="delete" size="small" /></span>
                {t('guidedTour.dataChoice.startFresh')}
                <span className="tour-btn-hint">{t('guidedTour.dataChoice.clearAllData')}</span>
              </button>
              {hadExistingData ? (
                <button 
                  className="tour-btn tour-btn-primary"
                  onClick={handleKeepCurrentDataAndContinue}
                >
                  <span className="tour-btn-icon"><MaterialIcon name="folder" size="small" /></span>
                  {t('guidedTour.dataChoice.keepMyData')}
                  <span className="tour-btn-hint">{t('guidedTour.dataChoice.keepCurrentData')}</span>
                </button>
              ) : (
                <button 
                  className="tour-btn tour-btn-primary"
                  onClick={handleKeepDataAndContinue}
                >
                  <span className="tour-btn-icon"><MaterialIcon name="auto_awesome" size="small" /></span>
                  {t('guidedTour.dataChoice.keepDemoData')}
                  <span className="tour-btn-hint">{t('guidedTour.dataChoice.exploreSampleData')}</span>
                </button>
              )}
            </div>
            <p className="tour-end-note">
              <span className="tour-note-icon"><MaterialIcon name="lightbulb" size="small" /></span>
              {t('guidedTour.restartNote')}
            </p>
          </div>
        </div>
      );
    }
    
    // Interactive tour prompt - ask if user wants guided walkthrough
    if (tourPhase === 'interactive-prompt') {
      return (
        <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-prompt-title">
          <div className="tour-modal tour-end-modal">
            <div className="tour-end-header">
              <span className="tour-end-icon"><MaterialIcon name="gps_fixed" /></span>
              <h2 id="tour-prompt-title">{t('guidedTour.interactivePrompt.title')}</h2>
            </div>
            <div className="tour-end-content">
              <p>
                {t('guidedTour.interactivePrompt.description')}
              </p>
              <p className="tour-end-question">
                <strong>{t('guidedTour.interactivePrompt.learnByDoing')}</strong> {t('guidedTour.interactivePrompt.stepByStep')}
              </p>
            </div>
            <div className="tour-end-actions">
              <button 
                className="tour-btn tour-btn-secondary"
                onClick={finishWithoutInteractive}
              >
                <span className="tour-btn-icon"><MaterialIcon name="auto_awesome" size="small" /></span>
                {t('guidedTour.interactivePrompt.exploreOwn')}
                <span className="tour-btn-hint">{t('guidedTour.interactivePrompt.skipWalkthrough')}</span>
              </button>
              <button 
                className="tour-btn tour-btn-primary"
                onClick={startInteractiveTour}
              >
                <span className="tour-btn-icon"><MaterialIcon name="gps_fixed" size="small" /></span>
                {t('guidedTour.interactivePrompt.yesGuideMe')}
                <span className="tour-btn-hint">{t('guidedTour.interactivePrompt.walkthroughHint')}</span>
              </button>
            </div>
            <p className="tour-end-note">
              <span className="tour-note-icon"><MaterialIcon name="lightbulb" size="small" /></span>
              {t('guidedTour.restartNote')}
            </p>
          </div>
        </div>
      );
    }
  }

  const step = tourSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-modal">
        <div className="tour-header">
          <div className="tour-step-indicator">
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className={`tour-step-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
                aria-label={t('guidedTour.stepIndicatorAria', { current: index + 1, total: tourSteps.length })}
              />
            ))}
          </div>
          <button
            className="tour-skip-btn"
            onClick={handleSkip}
            aria-label={t('guidedTour.skipTour')}
          >
            {t('guidedTour.skipTour')}
          </button>
        </div>

        <div className="tour-body">
          <div className="tour-icon-large"><MaterialIcon name={step.icon} size="large" /></div>
          <h2 id="tour-title" className="tour-title">{step.title}</h2>
          {step.content}
        </div>

        <div className="tour-footer">
          <button
            className="tour-btn tour-btn-secondary"
            onClick={handlePrev}
            disabled={isFirstStep}
            aria-label={t('guidedTour.previousStep')}
          >
            ← {t('guidedTour.back')}
          </button>
          <span className="tour-step-count">
            {currentStep + 1} / {tourSteps.length}
          </span>
          <button
            className="tour-btn tour-btn-primary"
            onClick={handleNext}
            aria-label={isLastStep ? t('guidedTour.finishTour') : t('guidedTour.nextStep')}
          >
            {isLastStep ? t('guidedTour.finish') : t('guidedTour.nextArrow')}
          </button>
        </div>
      </div>
    </div>
  );
}
