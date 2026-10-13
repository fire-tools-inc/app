import type { ExpenseTrackerData } from '../types/expenseTracker';
import type { PlanningUpdate } from './ExpensePlanningFields';
import { CashflowSchedulesPanel } from './CashflowSchedulesPanel';
import { CashflowForecastPanel } from './CashflowForecastPanel';
import { SavingsGoalsPanel } from './SavingsGoalsPanel';
import './ExpensePlanningPanel.css';

export function ExpensePlanningPanel(props: {
  data: ExpenseTrackerData; onChange: PlanningUpdate; privacy: boolean; readOnly: boolean;
}) {
  return <div className="cashflow-planning">
    <CashflowSchedulesPanel {...props} />
    <CashflowForecastPanel {...props} />
    <SavingsGoalsPanel {...props} />
  </div>;
}
