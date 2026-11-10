import { STATUS_ORDER } from './constants';
import type { AppData, Attendance, Group, Status, Student } from './types';
import { uid } from './utils';

export const GROUP_SHARE_FORMAT = 'attendance-group-share';
export const GROUP_SHARE_VERSION = 1;

export interface GroupShareFile {
  format: typeof GROUP_SHARE_FORMAT;
  version: number;
  exportedAt: string;
  includesAttendance: boolean;
  group: {
    name: string;
    curator?: string;
  };
  students: Array<Pick<Student, 'id' | 'fullName' | 'order' | 'archived'>>;
  attendance?: Array<
    Pick<
      Attendance,
      'studentId' | 'date' | 'pairNumber' | 'status' | 'latePairNumber' | 'comment' | 'updatedAt'
    >
  >;
}

export function createGroupShareFile(
  data: AppData,
  groupId: string,
  includeAttendance: boolean,
): GroupShareFile {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) throw new Error('Группа не найдена');
  const students = data.students
    .filter((student) => student.groupId === groupId)
    .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
  const ids = new Set(students.map((student) => student.id));
  const attendance = includeAttendance
    ? data.attendance
        .filter((record) => record.groupId === groupId && ids.has(record.studentId))
        .sort((a, b) => a.date.localeCompare(b.date) || a.pairNumber - b.pairNumber)
        .map((record) => ({
          studentId: record.studentId,
          date: record.date,
          pairNumber: record.pairNumber,
          status: record.status,
          latePairNumber: record.latePairNumber,
          comment: record.comment,
          updatedAt: record.updatedAt,
        }))
    : undefined;
  return {
    format: GROUP_SHARE_FORMAT,
    version: GROUP_SHARE_VERSION,
    exportedAt: new Date().toISOString(),
    includesAttendance: includeAttendance,
    group: { name: group.name, curator: group.curator },
    students: students.map((student) => ({
      id: student.id,
      fullName: student.fullName,
      order: student.order,
      archived: student.archived,
    })),
    ...(attendance ? { attendance } : {}),
  };
}

export function groupShareFileName(name: string, includeAttendance: boolean): string {
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'group';
  return `group-${safe}-${includeAttendance ? 'full' : 'students'}.json`;
}

export function parseGroupShareFile(text: string): GroupShareFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Файл не является JSON.');
  }
  const source = (parsed && typeof parsed === 'object' ? parsed : {}) as Partial<GroupShareFile>;
  if (source.format !== GROUP_SHARE_FORMAT) {
    throw new Error('Это не файл группы «Посещаемости».');
  }
  if (Number(source.version) > GROUP_SHARE_VERSION) {
    throw new Error('Файл создан более новой версией приложения.');
  }
  const name = String(source.group?.name ?? '').trim();
  if (!name) throw new Error('В файле нет названия группы.');

  const students: GroupShareFile['students'] = [];
  const studentIds = new Set<string>();
  if (Array.isArray(source.students)) {
    for (const raw of source.students) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id ?? '').trim();
      const fullName = String(raw.fullName ?? '').trim();
      if (!id || !fullName || studentIds.has(id)) continue;
      studentIds.add(id);
      const order = Number(raw.order);
      students.push({
        id,
        fullName,
        order: Number.isInteger(order) && order > 0 ? order : students.length + 1,
        archived: Boolean(raw.archived),
      });
    }
  }

  return {
    format: GROUP_SHARE_FORMAT,
    version: GROUP_SHARE_VERSION,
    exportedAt: String(source.exportedAt ?? new Date().toISOString()),
    includesAttendance: Boolean(source.includesAttendance),
    group: {
      name,
      curator: String(source.group?.curator ?? '').trim() || undefined,
    },
    students,
    ...(source.includesAttendance && Array.isArray(source.attendance)
      ? { attendance: normalizeSharedAttendance(source.attendance, studentIds) }
      : {}),
  };
}

function normalizeSharedAttendance(
  input: unknown[],
  studentIds: Set<string>,
): NonNullable<GroupShareFile['attendance']> {
  const result: NonNullable<GroupShareFile['attendance']> = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const studentId = String(item.studentId ?? '').trim();
    const date = String(item.date ?? '').trim();
    const pairNumber = Number(item.pairNumber);
    const status = item.status as Status;
    if (!studentIds.has(studentId)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isInteger(pairNumber) || pairNumber < 1 || pairNumber > 9) continue;
    if (!STATUS_ORDER.includes(status)) continue;
    const key = `${studentId}|${date}|${pairNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const latePair = Number(item.latePairNumber);
    result.push({
      studentId,
      date,
      pairNumber,
      status,
      latePairNumber:
        status === 'late' && Number.isInteger(latePair) && latePair >= 1 && latePair <= 9
          ? latePair
          : undefined,
      comment: String(item.comment ?? '').trim().slice(0, 300) || undefined,
      updatedAt: String(item.updatedAt ?? new Date().toISOString()),
    });
  }
  return result;
}

export function serializeGroupShare(file: GroupShareFile): string {
  return JSON.stringify(file, null, 2);
}

export interface ImportedGroupResult {
  data: AppData;
  groupId: string;
  studentCount: number;
  attendanceCount: number;
}

export function buildImportedGroupData(
  data: AppData,
  file: GroupShareFile,
): ImportedGroupResult {
  const groupId = uid('group');
  const group: Group = {
    id: groupId,
    name: uniqueGroupName(data.groups, file.group.name),
    curator: file.group.curator,
    createdAt: new Date().toISOString(),
  };
  const studentIdMap = new Map<string, string>();
  const students: Student[] = file.students.map((student, index) => {
    const id = uid('student');
    studentIdMap.set(student.id, id);
    return {
      id,
      groupId,
      fullName: student.fullName,
      order: student.order || index + 1,
      archived: Boolean(student.archived),
    };
  });
  const attendance: Attendance[] = (file.attendance ?? []).flatMap((record) => {
    const studentId = studentIdMap.get(record.studentId);
    if (!studentId) return [];
    return [
      {
        id: uid('attendance'),
        groupId,
        studentId,
        date: record.date,
        pairNumber: record.pairNumber,
        status: record.status,
        latePairNumber: record.latePairNumber,
        comment: record.comment,
        updatedAt: record.updatedAt,
      },
    ];
  });
  return {
    data: {
      ...data,
      groups: [...data.groups, group],
      students: [...data.students, ...students],
      attendance: [...data.attendance, ...attendance],
      settings: { ...data.settings, activeGroupId: groupId },
    },
    groupId,
    studentCount: students.length,
    attendanceCount: attendance.length,
  };
}

function uniqueGroupName(groups: Group[], base: string): string {
  const names = new Set(groups.map((group) => group.name.trim().toLowerCase()));
  if (!names.has(base.trim().toLowerCase())) return base.trim();
  let index = 2;
  while (names.has(`${base} (${index})`.toLowerCase())) index += 1;
  return `${base} (${index})`;
}



