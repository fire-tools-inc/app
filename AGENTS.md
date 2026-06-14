# AI Agent Instructions for Fire Tools

This document provides comprehensive instructions for AI agents working on the Fire Tools repository.

## Stack & Technologies

### Frontend Framework
- **React 19** with TypeScript
- **React Router DOM v7** for client-side routing
- **Vite** as the build tool and development server

### Visualization & UI
- **Recharts v3** for interactive charts and data visualization
- **CSS3** for styling (no CSS framework - custom CSS)

### Data Security & Storage
- **js-cookie v3** for cookie management
- **crypto-js v4** for AES encryption of sensitive data stored in cookies

### Development & Testing
- **TypeScript 5.9+** with strict mode enabled
- **Vitest** for unit and integration testing
- **@testing-library/react** for component testing
- **jsdom** for DOM simulation in tests

### Node.js Version Requirements
- Node.js ^20.19.0 || ^22.12.0 || >=24.0.0

### Backend (implemented — [`server/`](server/))
Local-deployment / Electron path (issues [#133](https://github.com/fire-tools-inc/app/issues/133),
[#189](https://github.com/fire-tools-inc/app/issues/189),
[#195](https://github.com/fire-tools-inc/app/issues/195),
[#222](https://github.com/fire-tools-inc/app/issues/222)):
- **Runtime**: Node.js + Express 4 + TypeScript (strict, ESM)
- **REST API**: OpenAPI 3.0.3 contract at [`docs/api/openapi.yaml`](docs/api/openapi.yaml). See [`docs/api/README.md`](docs/api/README.md) for conventions, type mapping, and client generation.
- **Database**: better-sqlite3 (SQLite as the **first-class** target), **PostgreSQL-compatible** schema. DDL at [`docs/database/schema.sql`](docs/database/schema.sql); design notes and ERD at [`docs/database/README.md`](docs/database/README.md).
- **Auth model**: single-user-by-default; schema/API are already multi-tenant-ready (a `users` table exists and every domain row carries `user_id`).
- **Deployment**: Docker Compose ([`docker-compose.yml`](docker-compose.yml)) or bundled in Electron.

When adding or changing a domain type in `src/types/*.ts`, update **all three**:
1. The TS interface / union
2. The matching schema/enum in [`docs/api/openapi.yaml`](docs/api/openapi.yaml)
3. The matching column / `CHECK (... IN (...))` constraint in [`docs/database/schema.sql`](docs/database/schema.sql)

Validate after edits:
```sh
npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/redocly.yaml
sqlite3 :memory: < docs/database/schema.sql
```

## Architecture Overview

### Application Structure
Fire Tools is **today** a **client-side only** React application for FIRE (Financial Independence Retire Early) planning. A local-deployment backend (see "Planned Backend" above) is contract-only — the frontend is still the only running component. It consists of multiple tools accessible through a single-page application architecture:

1. **Homepage** - Landing page with tool overview
2. **FIRE Calculator** - Main calculator with projections and Monte Carlo simulations
3. **Asset Allocation Manager** - Portfolio tracking and rebalancing recommendations
4. **Settings Page** - User preferences and data management

### Key Design Principles

#### Privacy-First Architecture
- **No backend servers (today)** - All data processing happens client-side. The planned backend (above) runs **locally** on the user's machine; data never leaves the device.
- **Encrypted local storage** - AES-256 encryption for all sensitive data stored in browser cookies
- **No data transmission** - Nothing is sent to external servers (Yahoo Finance is the only opt-in external call)
- **Secure cookies** - `SameSite=Strict` and `Secure` flags for HTTPS

#### State Management
- React Context and hooks for global state
- URL parameters for shareable calculator configurations
- Encrypted cookies for data persistence
- No external state management library (Redux, etc.)

#### Component Organization
- Functional components with hooks only (no class components)
- One component per file
- Co-located CSS files when component-specific styles needed
- Shared utilities in `/src/utils`
- Type definitions in `/src/types`

## Project Scope

### What Fire Tools Does
- **FIRE Calculator**: Projects years to financial independence based on savings rate, expenses, and expected returns
- **Monte Carlo Simulations**: Runs probabilistic simulations accounting for market volatility and black swan events
- **Asset Allocation Manager**: Tracks portfolio allocation across stocks, bonds, real estate, commodities, and cash
- **Rebalancing Recommendations**: Provides buy/sell/hold guidance to maintain target allocations
- **DCA Helper**: Assists with dollar-cost averaging strategies
- **Data Export/Import**: CSV export for backup and data portability

### What Fire Tools Does NOT Do
- Real-time market data integration
- Brokerage account connections
- Tax calculations or advice
- Automatic trading or rebalancing
- Server-side data storage or user accounts
- Payment processing or premium features

## API Documentation

### Internal APIs

#### Cookie Storage API (`/src/utils/cookieStorage.ts`)
```typescript
// Save FIRE calculator inputs
saveFireCalculatorInputs(inputs: CalculatorInputs): void

// Load FIRE calculator inputs
loadFireCalculatorInputs(): CalculatorInputs | null

// Clear all application data
clearAllData(): void
```

#### Settings API (`/src/utils/cookieSettings.ts`)
```typescript
// Save user settings
saveSettings(settings: UserSettings): void

// Load user settings
loadSettings(): UserSettings
```

#### CSV Export API (`/src/utils/csvExport.ts`)
```typescript
// Export FIRE calculator data to CSV
exportFireCalculatorToCSV(inputs: CalculatorInputs): void

// Import FIRE calculator data from CSV
importFireCalculatorFromCSV(file: File): Promise<CalculatorInputs>

// Export asset allocation to CSV
exportAssetAllocationToCSV(assets: Asset[], currency: string): void

// Import asset allocation from CSV
importAssetAllocationFromCSV(file: File): Promise<Asset[]>
```

#### URL Parameters API (`/src/utils/urlParams.ts`)
```typescript
// Serialize calculator inputs to URL
serializeInputsToURL(inputs: CalculatorInputs): string

// Deserialize calculator inputs from URL
deserializeInputsFromURL(params: URLSearchParams): Partial<CalculatorInputs>

// Check if URL has calculator parameters
hasURLParams(params: URLSearchParams): boolean
```

### No External APIs
This application does not integrate with external APIs or services.

## Directory Structure

```
fire-tools/
├── .github/
│   └── workflows/          # GitHub Actions for CI/CD
├── public/                 # Static assets
├── src/
│   ├── components/         # React components
│   │   ├── *Page.tsx      # Top-level page components
│   │   ├── *Chart.tsx     # Recharts visualization components
│   │   ├── *Dialog.tsx    # Modal dialog components
│   │   ├── *Form.tsx      # Form components
│   │   ├── *Table.tsx     # Table components
│   │   └── *.css          # Component-specific styles
│   ├── hooks/             # Custom React hooks
│   ├── types/             # TypeScript type definitions
│   │   ├── calculator.ts  # FIRE calculator types
│   │   ├── assetAllocation.ts  # Asset allocation types
│   │   └── currency.ts    # Currency types
│   ├── utils/             # Utility functions and logic
│   │   ├── *Calculator.ts # Business logic calculators
│   │   ├── cookie*.ts     # Cookie/storage utilities
│   │   ├── csv*.ts        # CSV import/export
│   │   ├── defaults.ts    # Default values
│   │   └── *.test.ts      # Unit tests
│   ├── App.tsx            # Main application component with routing
│   ├── App.css            # Global application styles
│   ├── main.tsx           # Application entry point
│   └── index.css          # Global CSS styles
├── index.html             # HTML template
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build configuration
└── README.md              # Project documentation
```

### File Naming Conventions
- **Components**: PascalCase (e.g., `CalculatorInputsForm.tsx`)
- **Utilities**: camelCase (e.g., `fireCalculator.ts`)
- **Types**: camelCase (e.g., `assetAllocation.ts`)
- **Tests**: `*.test.ts` or `*.test.tsx`
- **CSS**: Match component name (e.g., `HomePage.css` for `HomePage.tsx`)

## Coding Standards

### TypeScript Guidelines
- **Strict mode enabled** - All TypeScript strict checks are enforced
- **Explicit types** - Avoid `any`, use specific types or `unknown`
- **Interface over type** - Prefer `interface` for object shapes
- **Type exports** - Export types alongside implementation
- **No unused variables** - `noUnusedLocals` and `noUnusedParameters` are enabled

### React Best Practices
- **Functional components only** - No class components
- **Hooks** - Use React hooks for state and side effects
- **Props destructuring** - Destructure props in function parameters
- **Key props** - Always provide stable keys in lists
- **Accessibility** - Use semantic HTML and ARIA attributes where needed

### Error Handling
- **User-facing errors** - Display errors in the UI for user actions
- **Console errors** - Use `console.error()` for logging errors (NOT `console.log()`)
- **Try-catch blocks** - Wrap risky operations in try-catch
- **Graceful degradation** - Provide fallbacks when features fail

### State Management Rules
- **Minimize state** - Derive values when possible instead of storing them
- **Single source of truth** - Don't duplicate state
- **Lift state up** - Keep state at the lowest common ancestor
- **URL as state** - Use URL parameters for shareable state (calculator inputs)

### Performance Considerations
- **Lazy loading** - Code-split routes if the app grows significantly
- **Memoization** - Use `useMemo` and `useCallback` for expensive computations
- **Debouncing** - Debounce expensive operations triggered by user input
- **Virtual scrolling** - Consider for large lists (though not currently needed)

### Accessibility Requirements
- **Semantic HTML** - Use appropriate HTML elements (`<nav>`, `<main>`, `<button>`, etc.)
- **ARIA attributes** - Add `aria-label`, `aria-expanded`, `aria-current` where needed
- **Keyboard navigation** - All interactive elements must be keyboard accessible
- **Focus management** - Manage focus for dialogs and dynamic content
- **Color contrast** - Ensure WCAG AA contrast ratios (4.5:1 for text)
- **Screen reader testing** - Test with screen readers when making UI changes

### Loading Speed & Performance
- **Bundle size** - Keep bundle size minimal, avoid large dependencies
- **Code splitting** - Split routes to avoid loading unnecessary code
- **Lazy images** - Use lazy loading for images (when/if added)
- **Optimize charts** - Limit data points in charts for large datasets
- **Efficient rendering** - Avoid unnecessary re-renders with React.memo when beneficial
- **Critical CSS** - Above-the-fold styles are inlined in `index.html` to prevent render-blocking and improve First Contentful Paint (FCP)
- **Layout stability** - Conditional UI elements are positioned to avoid Cumulative Layout Shift (CLS)

## Backend Rules

**There is no backend.** This is a fully client-side application.

### Data Storage Strategy
- **Primary storage**: Encrypted cookies (via `js-cookie` and `crypto-js`)
- **Why cookies**: More secure than localStorage with httpOnly and secure flags
- **Encryption**: AES-256 encryption for all sensitive financial data
- **Expiration**: Cookies set to expire after 365 days

### Security Considerations
- **XSS Protection**: All user input is rendered through React (automatic escaping)
- **No eval()**: Never use `eval()` or `Function()` constructor
- **Encryption keys**: Encryption keys are client-side only, not transmitted
- **HTTPS only**: Secure flag on cookies requires HTTPS in production

## Testing Strategy

### Test Coverage Goals
- **Utility functions**: 100% coverage for calculators and business logic
- **Components**: Test user interactions and rendering logic
- **Integration**: Test data flow between components

### Running Tests
```bash
# Run all tests once
npm test

# Run tests in watch mode during development
npm run test:watch
```

### Test Conventions
- Place tests next to the files they test (`utils/fireCalculator.test.ts`)
- Use descriptive test names: `it('should calculate years to FIRE correctly', ...)`
- Test edge cases and error conditions
- Mock external dependencies (cookies, file system)

## Build & Development

### Development Server
```bash
npm run dev
```
Starts Vite dev server at `http://localhost:5173`

### Production Build
```bash
npm run build
```
Outputs to `/dist` directory. Includes TypeScript compilation and Vite bundling.

### Preview Production Build
```bash
npm run preview
```
Serves the production build locally for testing.

### Deployment
- The app ships as a desktop build (Electron) and a self-hosted Docker stack;
  there is no public web deployment.
- Desktop releases are built by `.github/workflows/release.yml`, triggered when
  a version tag matching `v*` (e.g. `v1.2.3`) is pushed.

## Common Tasks for AI Agents

### Adding a New Feature
1. Determine if it requires new types (add to `/src/types`)
2. Create utility functions with tests (in `/src/utils`)
3. Build React component (in `/src/components`)
4. Add routing if needed (in `App.tsx`)
5. Update `README.md` if user-facing

### Fixing a Bug
1. Write a failing test that reproduces the bug
2. Fix the bug in the minimal way possible
3. Verify the test passes
4. Check for similar bugs in related code

### Refactoring
1. Ensure tests exist and pass before refactoring
2. Make incremental changes
3. Run tests after each change
4. Don't change behavior, only structure

### Improving Performance
1. Profile first (React DevTools Profiler)
2. Identify bottlenecks
3. Apply optimizations (memoization, code splitting)
4. Measure improvement
5. Document performance considerations

### Security Updates
1. Check `npm audit` regularly
2. Update dependencies carefully (test thoroughly)
3. Review CHANGELOG for breaking changes
4. Run full test suite after updates

## Code Review Checklist

Before submitting changes, verify:
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] No `console.log()` statements (only `console.error()` for errors)
- [ ] Accessibility attributes added where needed
- [ ] Code follows existing style and conventions
- [ ] Documentation updated (README, comments if needed)
- [ ] No sensitive data or API keys in code
- [ ] Bundle size hasn't grown significantly
- [ ] Manual testing completed for UI changes

## Resources

- **React Documentation**: https://react.dev
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/handbook/
- **Vite Documentation**: https://vitejs.dev
- **Recharts Documentation**: https://recharts.org
- **WCAG Accessibility Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/

## Questions or Issues?

If you encounter ambiguity or need clarification:
1. Check this document first
2. Review similar existing code in the repository
3. Consult the README.md for user-facing documentation
4. Open an issue for discussion if unclear
