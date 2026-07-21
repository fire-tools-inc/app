// Global vitest setup. Ensures i18next is initialised with English resources
// before any component that calls `useTranslation()` is rendered.
import { vi } from 'vitest';
import { i18nReady } from '../src/i18n';

await i18nReady;

vi.stubGlobal('__APP_VERSION__', '2.3.11');
vi.stubGlobal('__APP_COMMIT_HASH__', 'testcommit');
vi.stubGlobal('__APP_BUILD_TIME__', '2024-01-01T00:00:00.000Z');
vi.stubGlobal('__APP_DEPENDENCIES__', { react: '19.0.0' });
vi.stubGlobal('__APP_REPO_URL__', 'https://github.com/test/test');
vi.stubGlobal('__APP_PAGES_URL__', 'https://test.github.io/test/demo/');
