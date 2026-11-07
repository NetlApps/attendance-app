import { STATUS_META } from '../constants';
import type { Status } from '../types';

export function StatusChip({
  status,
  short = false,
}: {
  status: Status;
  short?: boolean;
}) {
  const meta = STATUS_META[status];
  return (
    <span className={`status-chip status-${status}`}>
      {short ? meta.short : meta.label}
    </span>
  );
}

export function StatusSymbol({ status }: { status: Status }) {
  return (
    <span className={`report-symbol status-${status}`} title={STATUS_META[status].label}>
      {STATUS_META[status].symbol}
    </span>
  );
}
