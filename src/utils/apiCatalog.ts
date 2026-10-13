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

  { method: 'GET', path: '/users/me', summary: 'Current user', group: 'users' },
  { method: 'PUT', path: '/users/me', summary: 'Update current user', group: 'users' },

  { method: 'GET', path: '/settings', summary: 'List settings', group: 'settings' },
  { method: 'PUT', path: '/settings', summary: 'Replace settings', group: 'settings' },

  { method: 'GET', path: '/ui-preferences', summary: 'List UI preferences', group: 'ui' },
  { method: 'GET', path: '/ui-preferences/:key', summary: 'Get one preference', group: 'ui' },
  { method: 'PUT', path: '/ui-preferences/:key', summary: 'Set one preference', group: 'ui' },
  { method: 'DELETE', path: '/ui-preferences/:key', summary: 'Delete one preference', group: 'ui' },

  { method: 'GET', path: '/notifications', summary: 'List notifications', group: 'notifications' },
  { method: 'POST', path: '/notifications', summary: 'Create notification', group: 'notifications' },
  { method: 'DELETE', path: '/notifications', summary: 'Clear all notifications', group: 'notifications' },

  { method: 'GET', path: '/calculator/inputs', summary: 'FIRE calculator inputs', group: 'calculator' },
  { method: 'PUT', path: '/calculator/inputs', summary: 'Update FIRE inputs', group: 'calculator' },
  { method: 'GET', path: '/monte-carlo/runs', summary: 'Monte Carlo runs', group: 'calculator' },

  { method: 'GET', path: '/asset-allocation', summary: 'Asset allocation', group: 'portfolio' },
  { method: 'PUT', path: '/asset-allocation', summary: 'Update asset allocation', group: 'portfolio' },
  { method: 'GET', path: '/portfolio-breakdown', summary: 'Portfolio breakdown', group: 'portfolio' },

  { method: 'GET', path: '/expense-tracker', summary: 'Expense tracker data', group: 'tracking' },
  { method: 'PUT', path: '/expense-tracker', summary: 'Update expense tracker', group: 'tracking' },
  { method: 'GET', path: '/expense-tracker/planning', summary: 'Cashflow planning document', group: 'tracking' },
  { method: 'PUT', path: '/expense-tracker/planning', summary: 'Replace cashflow planning document', group: 'tracking' },
  { method: 'GET', path: '/net-worth', summary: 'Net worth snapshots', group: 'tracking' },
  { method: 'POST', path: '/net-worth', summary: 'Add net worth snapshot', group: 'tracking' },

  { method: 'GET', path: '/questionnaire', summary: 'Questionnaire state', group: 'misc' },
  { method: 'PUT', path: '/questionnaire', summary: 'Update questionnaire', group: 'misc' },
  { method: 'GET', path: '/pdf-imports', summary: 'PDF import history', group: 'misc' },
  { method: 'GET', path: '/banks', summary: 'Banks lookup', group: 'misc' },
];
