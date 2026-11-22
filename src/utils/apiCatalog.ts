/**
 * Hand-curated catalog of REST endpoints exposed by the embedded backend.
 * Kept in sync with docs/api/openapi.yaml.
 *
 * Used by Settings → Advanced → API explorer to give users a quick way
 * to inspect or smoke-test the backend without leaving the app.
 */

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  summary: string;
  group: string;
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  { method: 'GET', path: '/health', summary: 'Health check', group: 'meta' },

  { method: 'GET', path: '/sync/status', summary: 'Revision of every synced domain', group: 'sync' },
  { method: 'GET', path: '/state/settings', summary: 'Settings shown in the app', group: 'sync' },
  { method: 'GET', path: '/state/calculator', summary: 'FIRE calculator inputs shown in the app', group: 'sync' },
  { method: 'GET', path: '/state/assetAllocation', summary: 'Asset allocation shown in the app', group: 'sync' },
  { method: 'GET', path: '/state/expenseTracker', summary: 'Cashflow shown in the app', group: 'sync' },
  { method: 'GET', path: '/state/netWorth', summary: 'Net worth shown in the app', group: 'sync' },
  { method: 'PATCH', path: '/state/:domain', summary: 'Merge a changeset into a domain', group: 'sync' },
  { method: 'PUT', path: '/state/:domain', summary: 'Replace a domain with a changeset', group: 'sync' },

  { method: 'GET', path: '/users/me', summary: 'Current user (database only)', group: 'users' },

  { method: 'GET', path: '/settings', summary: 'Get settings', group: 'settings' },
  { method: 'PUT', path: '/settings', summary: 'Replace settings', group: 'settings' },
  { method: 'PATCH', path: '/settings', summary: 'Update some settings', group: 'settings' },

  { method: 'GET', path: '/ui-preferences', summary: 'List UI preferences', group: 'ui' },
  { method: 'GET', path: '/ui-preferences/:key', summary: 'Get one preference', group: 'ui' },
  { method: 'PUT', path: '/ui-preferences/:key', summary: 'Set one preference', group: 'ui' },
  { method: 'DELETE', path: '/ui-preferences/:key', summary: 'Delete one preference', group: 'ui' },

  { method: 'GET', path: '/notifications', summary: 'List notifications (database only)', group: 'notifications' },
  { method: 'POST', path: '/notifications', summary: 'Create notification (database only)', group: 'notifications' },

  { method: 'GET', path: '/calculator/inputs', summary: 'FIRE calculator inputs', group: 'calculator' },
  { method: 'PUT', path: '/calculator/inputs', summary: 'Update FIRE inputs', group: 'calculator' },
  { method: 'GET', path: '/calculator/monte-carlo/runs', summary: 'Monte Carlo runs (database only)', group: 'calculator' },

  { method: 'GET', path: '/asset-allocation/assets', summary: 'List assets', group: 'portfolio' },
  { method: 'POST', path: '/asset-allocation/assets', summary: 'Create an asset', group: 'portfolio' },
  { method: 'GET', path: '/asset-allocation/targets', summary: 'Asset class targets', group: 'portfolio' },
  { method: 'PUT', path: '/asset-allocation/targets', summary: 'Replace asset class targets', group: 'portfolio' },
  { method: 'GET', path: '/portfolio-breakdown?dimension=currency', summary: 'Portfolio breakdown (database only)', group: 'portfolio' },

  { method: 'GET', path: '/expense-tracker/config', summary: 'Cashflow settings', group: 'tracking' },
  { method: 'GET', path: '/expense-tracker/expenses', summary: 'List expenses', group: 'tracking' },
  { method: 'POST', path: '/expense-tracker/expenses', summary: 'Add an expense', group: 'tracking' },
  { method: 'GET', path: '/expense-tracker/incomes', summary: 'List incomes', group: 'tracking' },
  { method: 'POST', path: '/expense-tracker/incomes', summary: 'Add an income', group: 'tracking' },
  { method: 'GET', path: '/expense-tracker/planning', summary: 'Cashflow planning document', group: 'tracking' },
  { method: 'PUT', path: '/expense-tracker/planning', summary: 'Replace cashflow planning document', group: 'tracking' },
  { method: 'GET', path: '/net-worth/snapshot', summary: 'Net worth history', group: 'tracking' },
  { method: 'GET', path: '/net-worth/months/:year/:month', summary: 'One net worth month', group: 'tracking' },

  { method: 'GET', path: '/questionnaire/results', summary: 'Questionnaire results (database only)', group: 'misc' },
  { method: 'GET', path: '/pdf-imports', summary: 'Document import history', group: 'misc' },
  { method: 'GET', path: '/banks', summary: 'Banks lookup', group: 'misc' },
];
