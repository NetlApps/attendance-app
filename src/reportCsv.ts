import { STATUS_META, STATUS_ORDER } from './constants';
import { buildReportData, type ReportDataOptions } from './reportData';
import {
  csvLine,
  formatDate,
  safeFilePart,
  slotName,
  todayISO,
} from './utils';

export interface ReportCsvOptions extends ReportDataOptions {
  periodLabel: string;
  periodCaption?: string;
}

/** Имя файла отчёта: группа и период (дата или месяц). */
export function reportFileName(groupName: string, periodKey: string): string {
  return `Посещаемость_${safeFilePart(groupName)}_${periodKey}.csv`;
}

/**
 * Простой CSV для Excel: одна строка — студент и дата, дальше пары
 * со словами «Есть», «Не было», «Болеет» и т.п. Без широкой матрицы.
 */
export function buildReportCsv({
  group,
  students,
  records,
  periodLabel,
  periodCaption = 'Период',
}: ReportCsvOptions): string {
  const data = buildReportData({ group, students, records });
  const pairColumns = data.pairNumbers.map((pairNumber) => slotName(pairNumber));

  const lines: string[] = [];
  lines.push(csvLine(['Отчёт о посещаемости']));
  lines.push(csvLine(['Группа', group.name]));
  lines.push(csvLine([periodCaption, periodLabel]));
  lines.push(csvLine(['Сформировано', formatDate(todayISO())]));
  lines.push('');
  lines.push(
    csvLine([
      '№',
      'ФИО',
      'Дата',
      ...pairColumns,
      'Посещено',
      'Пропущено',
      '%',
      'Комментарии',
    ]),
  );

  for (const entry of data.entries) {
    const name = entry.student.fullName;
    const number = entry.student.archived ? 'арх.' : String(entry.number ?? '');

    if (entry.days.length === 0) {
      lines.push(
        csvLine([
          number,
          name,
          '—',
          ...pairColumns.map(() => '—'),
          0,
          0,
          '—',
          'нет отметок за период',
        ]),
      );
      continue;
    }

    for (const day of entry.days) {
      const byPair = new Map(day.records.map((record) => [record.pairNumber, record]));
      const cells = data.pairNumbers.map((pairNumber) => {
        const record = byPair.get(pairNumber);
        return record ? STATUS_META[record.status].label : '—';
      });
      const visited = day.records.filter(
        (record) => record.status === 'present' || record.status === 'late',
      ).length;
      const missed = day.records.length - visited;
      const percent =
        day.records.length > 0
          ? `${Math.round((visited / day.records.length) * 100)}%`
          : '—';
      const comments = day.records
        .filter((record) => record.comment?.trim())
        .map((record) => `${slotName(record.pairNumber)}: ${record.comment!.trim()}`)
        .join('; ');
      const notes = [entry.student.archived ? 'архив' : '', comments]
        .filter(Boolean)
        .join('; ');

      lines.push(
        csvLine([
          number,
          name,
          formatDate(day.date),
          ...cells,
          visited,
          missed,
          percent,
          notes,
        ]),
      );
    }
  }

  lines.push('');
  lines.push(
    csvLine([
      'Обозначения',
      ...STATUS_ORDER.map((status) => STATUS_META[status].label),
      '— нет отметки',
    ]),
  );
  lines.push(
    csvLine(['Формула', '% = (Есть + Опоздал) / Всего отмечено × 100']),
  );

  return `\uFEFF${lines.join('\r\n')}`;
}
