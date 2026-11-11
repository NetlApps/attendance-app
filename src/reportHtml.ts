import { STATUS_META, STATUS_ORDER } from './constants';
import { buildReportData, type ReportDataOptions } from './reportData';
import type { Status } from './types';
import {
  comparePairNumbers,
  formatDate,
  plural,
  safeFilePart,
  slotName,
  todayISO,
  weekdayLong,
} from './utils';

export interface ReportHtmlOptions extends ReportDataOptions {
  periodLabel: string;
  periodCaption?: string;
}

const REPORT_STATUS_LABEL: Record<Status, string> = {
  present: 'Есть',
  absent: 'Не было',
  sick: 'Болеет',
  excused: 'Уваж.',
  late: 'Опоздал',
};

const STATUS_CLASS: Record<Status, string> = {
  present: 's-present',
  absent: 's-absent',
  sick: 's-sick',
  excused: 's-excused',
  late: 's-late',
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function percentClass(value: number | null): string {
  if (value === null) return 'is-neutral';
  if (value >= 75) return 'is-good';
  if (value >= 50) return 'is-warn';
  return 'is-bad';
}

/** Имя красивого HTML-отчёта: группа и период. */
export function reportHtmlFileName(groupName: string, periodKey: string): string {
  return `Посещаемость_${safeFilePart(groupName)}_${periodKey}.html`;
}

/**
 * Собирает самостоятельный HTML-файл: его можно отправить в мессенджер,
 * открыть в браузере на телефоне или распечатать. Без внешних ресурсов.
 */
export function buildReportHtml({
  group,
  students,
  records,
  periodLabel,
  periodCaption = 'Период',
}: ReportHtmlOptions): string {
  const data = buildReportData({ group, students, records });
  const singleDate = data.dates.length === 1;

  const pairsByDate = new Map<string, number[]>();
  for (const record of data.records) {
    const list = pairsByDate.get(record.date) ?? [];
    if (!list.includes(record.pairNumber)) list.push(record.pairNumber);
    pairsByDate.set(record.date, list);
  }
  for (const list of pairsByDate.values()) list.sort(comparePairNumbers);

  const cards = data.entries
    .map((entry) => {
      const number = entry.student.archived
        ? 'арх.'
        : String(entry.number ?? '');
      const archived = entry.student.archived
        ? '<span class="tag">архив</span>'
        : '';
      const subtitle =
        entry.total > 0
          ? `Посещено ${entry.visited} из ${entry.total}${
              entry.missed > 0 ? ` · пропущено ${entry.missed}` : ''
            }`
          : 'Нет отметок за период';

      const days = entry.days
        .map((day) => {
          const dayPairs = pairsByDate.get(day.date) ?? [];
          const byPair = new Map(
            day.records.map((record) => [record.pairNumber, record]),
          );
          const pairs = dayPairs
            .map((pairNumber) => {
              const record = byPair.get(pairNumber);
              const pairName = escapeHtml(slotName(pairNumber));
              if (!record) {
                return `<span class="pair"><span class="pair-name">${pairName}</span><span class="status s-none" title="Нет отметки">—</span></span>`;
              }
              const fullLabel = STATUS_META[record.status].label;
              const comment = record.comment?.trim();
              const title = escapeHtml(
                comment ? `${fullLabel}: ${comment}` : fullLabel,
              );
              return `<span class="pair"><span class="pair-name">${pairName}</span><span class="status ${
                STATUS_CLASS[record.status]
              }" title="${title}">${escapeHtml(
                REPORT_STATUS_LABEL[record.status],
              )}</span></span>`;
            })
            .join('');

          const dateLabel = singleDate
            ? ''
            : `<span class="day-date">${escapeHtml(formatDate(day.date))}<small>${escapeHtml(
                weekdayLong(day.date),
              )}</small></span>`;

          return `<div class="day${singleDate ? ' is-single' : ''}">${dateLabel}<span class="day-pairs">${pairs}</span></div>`;
        })
        .join('');

      return `<article class="student${entry.student.archived ? ' is-archived' : ''}">
  <header class="student-head">
    <span class="student-num">${escapeHtml(number)}</span>
    <div class="student-title">
      <h2>${escapeHtml(entry.student.fullName)}${archived}</h2>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    <span class="student-percent ${percentClass(entry.percentValue)}">${escapeHtml(
      entry.percent,
    )}</span>
  </header>
  ${days ? `<div class="days">${days}</div>` : ''}
</article>`;
    })
    .join('');

  const dateLine =
    singleDate && data.dates.length > 0
      ? `${formatDate(data.dates[0])} · ${weekdayLong(data.dates[0])}`
      : periodLabel;

  const summary = `<div class="summary-item"><strong>${data.activeStudents}</strong><span>${plural(
    data.activeStudents,
    'студент',
    'студента',
    'студентов',
  )}</span></div>
  <div class="summary-item"><strong>${data.totalLessons}</strong><span>${plural(
    data.totalLessons,
    'занятие',
    'занятия',
    'занятий',
  )}</span></div>
  <div class="summary-item"><strong>${escapeHtml(
    data.overallPercent,
  )}</strong><span>посещаемость</span></div>
  <div class="summary-item"><strong>${data.absences}</strong><span>${plural(
    data.absences,
    'пропуск',
    'пропуска',
    'пропусков',
  )}</span></div>`;

  const legend = STATUS_ORDER.map(
    (status) =>
      `<span class="legend-item"><i class="dot ${STATUS_CLASS[status]}"></i>${escapeHtml(
        STATUS_META[status].label,
      )}</span>`,
  ).join('');

  const title = `${group.name} — ${periodLabel}`;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root {
  color-scheme: light;
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --accent: #4f46e5;
  --surface: #ffffff;
  --soft: #f8fafc;
  --green: #15803d;
  --green-bg: #dcfce7;
  --red: #b91c1c;
  --red-bg: #fee2e2;
  --amber: #b45309;
  --amber-bg: #fef3c7;
  --purple: #6d28d9;
  --purple-bg: #ede9fe;
  --blue: #1d4ed8;
  --blue-bg: #dbeafe;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  padding: 28px 16px 48px;
  background: #eef2f8;
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.45;
}
.page { max-width: 900px; margin: 0 auto; }
.report {
  background: var(--surface);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}
.hero {
  padding: 30px 34px 26px;
  background: linear-gradient(135deg, #4338ca 0%, #7c3aed 60%, #a855f7 100%);
  color: #ffffff;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.9;
}
.brand-mark {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 14px;
}
.eyebrow {
  display: inline-block;
  margin-top: 22px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.75;
}
h1 {
  margin: 6px 0 4px;
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.hero-period { margin: 0; font-size: 17px; font-weight: 600; opacity: 0.95; }
.hero-generated { margin: 10px 0 0; font-size: 12.5px; opacity: 0.7; }
.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--line);
  border-bottom: 1px solid var(--line);
}
.summary-item { background: #ffffff; padding: 16px 14px; text-align: center; }
.summary-item strong { display: block; font-size: 21px; line-height: 1.1; letter-spacing: -0.02em; }
.summary-item span { display: block; margin-top: 3px; font-size: 11.5px; color: var(--muted); }
.students { padding: 8px 22px 20px; }
.student {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px 18px;
  margin-top: 12px;
  background: #ffffff;
  break-inside: avoid;
}
.student.is-archived { opacity: 0.72; background: var(--soft); }
.student-head { display: flex; align-items: flex-start; gap: 12px; }
.student-num {
  flex: 0 0 auto;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border-radius: 10px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.student-title { flex: 1 1 auto; min-width: 0; }
.student-title h2 { margin: 0; font-size: 16.5px; line-height: 1.25; overflow-wrap: anywhere; }
.student-title p { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); }
.tag {
  display: inline-block;
  margin-left: 7px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 10.5px;
  font-weight: 600;
  vertical-align: middle;
}
.student-percent {
  flex: 0 0 auto;
  min-width: 52px;
  padding: 6px 9px;
  border-radius: 10px;
  text-align: center;
  font-size: 14px;
  font-weight: 800;
}
.is-good { background: var(--green-bg); color: var(--green); }
.is-warn { background: var(--amber-bg); color: var(--amber); }
.is-bad { background: var(--red-bg); color: var(--red); }
.is-neutral { background: #f1f5f9; color: #64748b; }
.days { margin-top: 12px; display: flex; flex-direction: column; gap: 7px; }
.day {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}
.day:first-child { padding-top: 0; border-top: 0; }
.day.is-single { padding-top: 0; border-top: 0; }
.day-date { flex: 0 0 116px; font-size: 12.5px; font-weight: 700; color: #334155; }
.day-date small { display: block; font-size: 11px; font-weight: 500; color: var(--muted); }
.day-pairs { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.pair {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  font-size: 12px;
}
.pair-name { color: #475569; white-space: nowrap; }
.status {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
}
.s-present { background: var(--green-bg); color: var(--green); }
.s-absent { background: var(--red-bg); color: var(--red); }
.s-sick { background: var(--amber-bg); color: var(--amber); }
.s-excused { background: var(--purple-bg); color: var(--purple); }
.s-late { background: var(--blue-bg); color: var(--blue); }
.s-none { background: #f1f5f9; color: #94a3b8; }
.no-marks {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--soft);
  color: var(--muted);
  font-size: 12.5px;
}
.foot { padding: 4px 30px 28px; }
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: #475569;
}
.legend-item { display: inline-flex; align-items: center; gap: 5px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.s-present { background: #16a34a; }
.dot.s-absent { background: #dc2626; }
.dot.s-sick { background: #d97706; }
.dot.s-excused { background: #7c3aed; }
.dot.s-late { background: #2563eb; }
.dot.s-none { background: #cbd5e1; }
.formula { margin: 9px 0 0; font-size: 11.5px; color: var(--muted); }
@media (max-width: 640px) {
  body { padding: 12px 8px 28px; }
  .report { border-radius: 18px; }
  .hero { padding: 22px 18px 20px; }
  h1 { font-size: 23px; }
  .hero-period { font-size: 15px; }
  .summary { grid-template-columns: repeat(2, 1fr); }
  .summary-item { padding: 12px 10px; }
  .students { padding: 4px 10px 14px; }
  .student { padding: 14px 13px; }
  .day { flex-direction: column; gap: 5px; }
  .day-date { flex: none; }
  .foot { padding: 2px 16px 22px; }
}
@media print {
  @page { size: A4; margin: 12mm; }
  body {
    padding: 0;
    background: #ffffff;
    font-size: 10.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: none; }
  .report { border-radius: 0; box-shadow: none; }
  .hero {
    padding: 0 0 12px;
    background: #ffffff;
    color: var(--ink);
    border-bottom: 2px solid var(--accent);
  }
  .brand { color: var(--accent); opacity: 1; }
  .brand-mark { background: #eef2ff; color: var(--accent); }
  .eyebrow, .hero-generated { color: var(--muted); opacity: 1; }
  .summary { border-top: 1px solid var(--line); }
  .summary-item strong { font-size: 16pt; }
  .students { padding: 0; }
  .student { margin-top: 8px; padding: 10px 12px; }
  .student-head h2 { font-size: 12pt; }
  .foot { padding: 0; }
  .legend { font-size: 9.5pt; }
  .formula { font-size: 9pt; }
}
</style>
</head>
<body>
<div class="page">
<article class="report">
<header class="hero">
  <div class="brand"><span class="brand-mark">✓</span><span>Посещаемость</span></div>
  <span class="eyebrow">${escapeHtml(periodCaption)}</span>
  <h1>${escapeHtml(group.name)}</h1>
  <p class="hero-period">${escapeHtml(dateLine)}</p>
  <p class="hero-generated">Сформировано ${escapeHtml(formatDate(todayISO()))}</p>
</header>
<section class="summary">${summary}</section>
<main class="students">${cards || '<p class="no-marks">В группе пока нет студентов.</p>'}</main>
<footer class="foot">
  <div class="legend">${legend}<span class="legend-item"><i class="dot s-none"></i>— нет отметки</span></div>
  <p class="formula">% = (Есть + Опоздал) / Всего отмечено × 100</p>
</footer>
</article>
</div>
</body>
</html>`;
}
