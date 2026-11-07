import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = 'info', title, text, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon} size={30} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
