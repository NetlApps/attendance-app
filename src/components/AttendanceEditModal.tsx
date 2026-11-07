import { useEffect, useState } from 'react';
import { STATUS_META, STATUS_ORDER } from '../constants';
import type { Attendance, Status } from '../types';
import { useApp } from '../store';
import {
  formatDate,
  pairTimeLabel,
  scheduleForDate,
  slotName,
  slotNumbersForDate,
  weekdayLong,
} from '../utils';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface AttendanceEditModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  groupId: string;
  date: string;
  pairNumber: number;
  record?: Attendance;
}

export function AttendanceEditModal({
  open,
  onClose,
  studentId,
  studentName,
  groupId,
  date,
  pairNumber,
  record,
}: AttendanceEditModalProps) {
  const { data, upsertAttendance, removeAttendance, notify } = useApp();
  const dateSchedule = scheduleForDate(data.settings, date);
  const [status, setStatus] = useState<Status>('present');
  const [latePair, setLatePair] = useState(pairNumber);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setStatus(record?.status ?? 'present');
    setLatePair(record?.latePairNumber ?? pairNumber);
    setComment(record?.comment ?? '');
  }, [open, record, pairNumber]);

  const handleSave = () => {
    upsertAttendance({
      groupId,
      studentId: record?.studentId ?? studentId,
      date,
      pairNumber,
      status,
      latePairNumber: status === 'late' ? latePair : undefined,
      comment,
    });
    notify('Отметка сохранена');
    onClose();
  };

  const handleDelete = () => {
    if (!record) return;
    if (!window.confirm('Удалить эту отметку? Запись исчезнет из отчёта.')) return;
    removeAttendance(record.id);
    notify('Отметка удалена', 'info');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={record ? 'Изменить отметку' : 'Новая отметка'}
      subtitle={`${studentName} · ${formatDate(date)}, ${weekdayLong(date)} · ${slotName(pairNumber)}`}
      footer={
        <div className="modal-footer-row">
          {record ? (
            <button type="button" className="btn btn-danger-ghost" onClick={handleDelete}>
              <Icon name="trash" size={18} />
              Удалить
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      }
    >
      <div className="form-stack">
        <div>
          <span className="field-label">Статус</span>
          <div className="status-picker">
            {STATUS_ORDER.map((value) => (
              <button
                key={value}
                type="button"
                className={`status-pick status-${value}${status === value ? ' is-selected' : ''}`}
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
              >
                <span className="status-symbol">{STATUS_META[value].symbol}</span>
                <span>{STATUS_META[value].label}</span>
              </button>
            ))}
          </div>
        </div>

        {status === 'late' && (
          <label className="field">
            <span>На какую пару пришёл</span>
            <select
              className="select"
              value={latePair}
              onChange={(event) => setLatePair(Number(event.target.value))}
            >
              {slotNumbersForDate(dateSchedule, [
                pairNumber,
                record?.latePairNumber ?? pairNumber,
              ]).map((pair) => (
                <option key={pair} value={pair}>
                  {slotName(pair)}
                  {pairTimeLabel(dateSchedule, pair)
                    ? ` · ${pairTimeLabel(dateSchedule, pair)}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Комментарий (необязательно)</span>
          <textarea
            className="textarea"
            rows={3}
            maxLength={300}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Например: предупредил заранее"
          />
        </label>
      </div>
    </Modal>
  );
}
