import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({ title, subtitle, onBack, actions, eyebrow }: PageHeaderProps) {
  return (
    <header className="page-header">
      {onBack ? (
        <button type="button" className="icon-button" onClick={onBack} aria-label="Назад">
          <Icon name="arrow-left" />
        </button>
      ) : (
        <div className="brand-mark" aria-hidden="true">
          <Icon name="check" size={20} />
        </div>
      )}
      <div className="page-heading">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : <div className="page-actions-spacer" />}
    </header>
  );
}
