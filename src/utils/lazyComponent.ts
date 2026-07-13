import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { logger } from './logger';

export function createLazyComponent<Props extends object>(
  componentName: string,
  loadComponent: () => Promise<ComponentType<Props>>,
  renderFailure: () => ReactNode,
): LazyExoticComponent<ComponentType<Props>> {
  return lazy(async () => {
    try {
      return { default: await loadComponent() };
    } catch (error) {
      logger.error('ui', 'chunk-load-failed', `failed to load component: ${componentName}`, {
        pii: { error: error instanceof Error ? error.message : String(error) },
      });
      const FailedComponent = (_props: Props) => renderFailure();
      return { default: FailedComponent };
    }
  });
}
