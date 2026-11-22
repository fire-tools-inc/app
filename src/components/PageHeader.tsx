import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={`page-head${className ? ` ${className}` : ''}`}>
      <div className="page-head__text">
        <h1 className="page-head__title">{title}</h1>
        {description && <p className="page-head__description">{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}
