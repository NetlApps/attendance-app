import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createEmptyData } from './seed';
import type {
  AppData,
  Attendance,
  Group,
  Settings,
  Status,
  Student,
} from './types';
import {
  clearFiredReminders,
  clearStoredData,
  loadData,
  saveData,
} from './storage';
import { uid } from './utils';

export interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'info';
}

export interface UpsertAttendanceInput {
  groupId: string;
  studentId: string;
  date: string;
  pairNumber: number;
  status: Status;
  latePairNumber?: number;
  comment?: string;
}

interface AppContextValue {
  data: AppData;
  activeGroup: Group | undefined;
  activeStudents: Student[];
  toasts: Toast[];
  notify: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;
  setActiveGroup: (groupId: string) => void;
  addGroup: (name: string, curator?: string) => string;
  updateGroup: (groupId: string, name: string, curator?: string) => void;
  deleteGroup: (groupId: string) => boolean;
  addStudents: (fullNames: string[]) => number;
  updateStudent: (studentId: string, fullName: string) => void;
  archiveStudent: (studentId: string) => void;
  restoreStudent: (studentId: string) => void;
  deleteStudentPermanently: (studentId: string) => void;
  moveStudent: (studentId: string, direction: -1 | 1) => void;
  sortStudentsAlphabetically: () => void;
  upsertAttendance: (input: UpsertAttendanceInput) => void;
  removeAttendance: (attendanceId: string) => void;
  clearPairAttendance: (groupId: string, date: string, pairNumber: number) => void;
  copyPairAttendance: (
    groupId: string,
    date: string,
    pairNumber: number,
    sourcePairNumber: number,
  ) => number;
  markAllPresent: (groupId: string, date: string, pairNumber: number) => number;
  saveSettings: (settings: Settings) => void;
  replaceData: (next: AppData) => void;
  resetAllData: () => void;
  requestNotifications: () => Promise<NotificationPermission | 'unsupported'>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const ok = saveData(data);
    if (!ok) {
      setToasts((current) => [
        ...current,
        {
          id: uid('toast'),
          message:
            'Не удалось сохранить данные в браузере. Сделайте резервную копию в настройках.',
          kind: 'error',
        },
      ]);
    }
  }, [data]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = data.settings.theme;
    const background = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && background) meta.setAttribute('content', background);
    if (background) {
      window.AndroidApp?.setSystemBars?.(background, data.settings.theme === 'dark');
    }
  }, [data.settings.theme]);

  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = uid('toast');
    setToasts((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const activeGroup = useMemo(
    () =>
      data.groups.find((group) => group.id === data.settings.activeGroupId) ??
      data.groups[0],
    [data.groups, data.settings.activeGroupId],
  );

  const activeStudents = useMemo(() => {
    if (!activeGroup) return [];
    return data.students
      .filter((student) => student.groupId === activeGroup.id && !student.archived)
      .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
  }, [data.students, activeGroup]);

  const setActiveGroup = useCallback((groupId: string) => {
    setData((prev) => ({
      ...prev,
      settings: { ...prev.settings, activeGroupId: groupId },
    }));
  }, []);

  const addGroup = useCallback((name: string, curator?: string) => {
    const id = uid('group');
    const group: Group = {
      id,
      name: name.trim(),
      curator: curator?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      groups: [...prev.groups, group],
      settings: { ...prev.settings, activeGroupId: id },
    }));
    return id;
  }, []);

  const updateGroup = useCallback((groupId: string, name: string, curator?: string) => {
    setData((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.id === groupId
          ? { ...group, name: name.trim(), curator: curator?.trim() || undefined }
          : group,
      ),
    }));
  }, []);

  const deleteGroup = useCallback(
    (groupId: string) => {
      if (data.groups.length <= 1) return false;
      setData((prev) => {
        if (prev.groups.length <= 1) return prev;
        const groups = prev.groups.filter((group) => group.id !== groupId);
        const activeGroupId =
          prev.settings.activeGroupId === groupId
            ? (groups[0]?.id ?? '')
            : prev.settings.activeGroupId;
        return {
          ...prev,
          groups,
          students: prev.students.filter((student) => student.groupId !== groupId),
          attendance: prev.attendance.filter((record) => record.groupId !== groupId),
          settings: { ...prev.settings, activeGroupId },
        };
      });
      return true;
    },
    [data.groups.length],
  );

  const addStudents = useCallback(
    (fullNames: string[]) => {
      const names = fullNames.map((name) => name.trim()).filter(Boolean);
      if (!activeGroup || names.length === 0) return 0;
      const groupId = activeGroup.id;
      setData((prev) => {
        const existing = prev.students.filter((student) => student.groupId === groupId);
        const maxOrder = existing.reduce((max, student) => Math.max(max, student.order), 0);
        const created: Student[] = names.map((fullName, index) => ({
          id: uid('student'),
          groupId,
          fullName,
          order: maxOrder + index + 1,
          archived: false,
        }));
        return { ...prev, students: [...prev.students, ...created] };
      });
      return names.length;
    },
    [activeGroup],
  );

  const updateStudent = useCallback((studentId: string, fullName: string) => {
    const trimmed = fullName.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      students: prev.students.map((student) =>
        student.id === studentId ? { ...student, fullName: trimmed } : student,
      ),
    }));
  }, []);

  const archiveStudent = useCallback((studentId: string) => {
    setData((prev) => ({
      ...prev,
      students: prev.students.map((student) =>
        student.id === studentId ? { ...student, archived: true } : student,
      ),
    }));
  }, []);

  const restoreStudent = useCallback((studentId: string) => {
    setData((prev) => {
      const target = prev.students.find((student) => student.id === studentId);
      if (!target) return prev;
      const maxOrder = prev.students
        .filter((student) => student.groupId === target.groupId && !student.archived)
        .reduce((max, student) => Math.max(max, student.order), 0);
      return {
        ...prev,
        students: prev.students.map((student) =>
          student.id === studentId
            ? { ...student, archived: false, order: maxOrder + 1 }
            : student,
        ),
      };
    });
  }, []);

  const deleteStudentPermanently = useCallback((studentId: string) => {
    setData((prev) => ({
      ...prev,
      students: prev.students.filter((student) => student.id !== studentId),
      attendance: prev.attendance.filter((record) => record.studentId !== studentId),
    }));
  }, []);

  const moveStudent = useCallback((studentId: string, direction: -1 | 1) => {
    setData((prev) => {
      const target = prev.students.find((student) => student.id === studentId);
      if (!target) return prev;
      const list = prev.students
        .filter((student) => student.groupId === target.groupId && !student.archived)
        .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
      const index = list.findIndex((student) => student.id === studentId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return prev;
      const reordered = [...list];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      const orderById = new Map(reordered.map((student, position) => [student.id, position + 1]));
      return {
        ...prev,
        students: prev.students.map((student) =>
          orderById.has(student.id)
            ? { ...student, order: orderById.get(student.id) ?? student.order }
            : student,
        ),
      };
    });
  }, []);

  const sortStudentsAlphabetically = useCallback(() => {
    if (!activeGroup) return;
    setData((prev) => {
      const list = prev.students
        .filter((student) => student.groupId === activeGroup.id && !student.archived)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
      const orderById = new Map(list.map((student, index) => [student.id, index + 1]));
      return {
        ...prev,
        students: prev.students.map((student) =>
          orderById.has(student.id)
            ? { ...student, order: orderById.get(student.id) ?? student.order }
            : student,
        ),
      };
    });
  }, [activeGroup]);

  const upsertAttendance = useCallback((input: UpsertAttendanceInput) => {
    const now = new Date().toISOString();
    const comment = input.comment?.trim() || undefined;
    const latePairNumber =
      input.status === 'late' ? input.latePairNumber ?? input.pairNumber : undefined;

    setData((prev) => {
      const existing = prev.attendance.find(
        (record) =>
          record.groupId === input.groupId &&
          record.studentId === input.studentId &&
          record.date === input.date &&
          record.pairNumber === input.pairNumber,
      );

      if (existing) {
        return {
          ...prev,
          attendance: prev.attendance.map((record) =>
            record.id === existing.id
              ? {
                  ...record,
                  status: input.status,
                  latePairNumber,
                  comment,
                  updatedAt: now,
                }
              : record,
          ),
        };
      }

      const record: Attendance = {
        id: uid('attendance'),
        groupId: input.groupId,
        studentId: input.studentId,
        date: input.date,
        pairNumber: input.pairNumber,
        status: input.status,
        latePairNumber,
        comment,
        updatedAt: now,
      };
      return { ...prev, attendance: [...prev.attendance, record] };
    });
  }, []);

  const removeAttendance = useCallback((attendanceId: string) => {
    setData((prev) => ({
      ...prev,
      attendance: prev.attendance.filter((record) => record.id !== attendanceId),
    }));
  }, []);

  const clearPairAttendance = useCallback(
    (groupId: string, date: string, pairNumber: number) => {
      setData((prev) => ({
        ...prev,
        attendance: prev.attendance.filter(
          (record) =>
            !(
              record.groupId === groupId &&
              record.date === date &&
              record.pairNumber === pairNumber
            ),
        ),
      }));
    },
    [],
  );

  /**
   * Заполняет пару статусами с другой пары того же дня, не перезаписывая уже
   * существующие отметки. «Опоздал» превращается в «Есть»: к следующей паре
   * студент уже на месте, а опоздание относится к конкретной паре.
   */
  const copyPairAttendance = useCallback(
    (groupId: string, date: string, pairNumber: number, sourcePairNumber: number) => {
      const activeIds = new Set(
        data.students
          .filter((student) => student.groupId === groupId && !student.archived)
          .map((student) => student.id),
      );
      const currentIds = new Set(
        data.attendance
          .filter(
            (record) =>
              record.groupId === groupId &&
              record.date === date &&
              record.pairNumber === pairNumber,
          )
          .map((record) => record.studentId),
      );
      const source = data.attendance.filter(
        (record) =>
          record.groupId === groupId &&
          record.date === date &&
          record.pairNumber === sourcePairNumber &&
          activeIds.has(record.studentId) &&
          !currentIds.has(record.studentId),
      );

      if (source.length === 0) return 0;

      const now = new Date().toISOString();
      setData((prev) => {
        const existing = new Set(
          prev.attendance
            .filter(
              (record) =>
                record.groupId === groupId &&
                record.date === date &&
                record.pairNumber === pairNumber,
            )
            .map((record) => record.studentId),
        );
        const additions: Attendance[] = [];
        for (const record of source) {
          if (existing.has(record.studentId)) continue;
          additions.push({
            id: uid('attendance'),
            groupId,
            studentId: record.studentId,
            date,
            pairNumber,
            status: record.status === 'late' ? 'present' : record.status,
            updatedAt: now,
          });
        }
        if (additions.length === 0) return prev;
        return { ...prev, attendance: [...prev.attendance, ...additions] };
      });

      return source.length;
    },
    [data.attendance, data.students],
  );

  const markAllPresent = useCallback(
    (groupId: string, date: string, pairNumber: number) => {
      const groupStudents = data.students.filter(
        (student) => student.groupId === groupId && !student.archived,
      );
      const now = new Date().toISOString();
      setData((prev) => {
        const next = [...prev.attendance];
        for (const student of groupStudents) {
          const index = next.findIndex(
            (record) =>
              record.groupId === groupId &&
              record.studentId === student.id &&
              record.date === date &&
              record.pairNumber === pairNumber,
          );
          if (index >= 0) {
            next[index] = {
              ...next[index],
              status: 'present',
              latePairNumber: undefined,
              comment: undefined,
              updatedAt: now,
            };
          } else {
            next.push({
              id: uid('attendance'),
              groupId,
              studentId: student.id,
              date,
              pairNumber,
              status: 'present',
              updatedAt: now,
            });
          }
        }
        return { ...prev, attendance: next };
      });
      return groupStudents.length;
    },
    [data.students],
  );

  const saveSettings = useCallback((settings: Settings) => {
    setData((prev) => ({ ...prev, settings }));
  }, []);

  const replaceData = useCallback((next: AppData) => {
    setData(next);
  }, []);

  const resetAllData = useCallback(() => {
    clearStoredData();
    clearFiredReminders();
    setData(createEmptyData());
  }, []);

  const requestNotifications = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.AndroidApp : undefined;
    if (bridge?.notificationPermission) {
      const current = bridge.notificationPermission();
      if (current === 'granted') return 'granted' as const;
      bridge.requestNotificationPermission?.();
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const after = bridge.notificationPermission();
      if (after === 'granted') return 'granted' as const;
      if (after === 'denied') return 'denied' as const;
      return 'default' as const;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported' as const;
    }
    if (Notification.permission === 'granted') return 'granted' as const;
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied' as const;
    }
  }, []);

  const value: AppContextValue = {
    data,
    activeGroup,
    activeStudents,
    toasts,
    notify,
    dismissToast,
    setActiveGroup,
    addGroup,
    updateGroup,
    deleteGroup,
    addStudents,
    updateStudent,
    archiveStudent,
    restoreStudent,
    deleteStudentPermanently,
    moveStudent,
    sortStudentsAlphabetically,
    upsertAttendance,
    removeAttendance,
    clearPairAttendance,
    copyPairAttendance,
    markAllPresent,
    saveSettings,
    replaceData,
    resetAllData,
    requestNotifications,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp должен использоваться внутри AppProvider');
  return context;
}
