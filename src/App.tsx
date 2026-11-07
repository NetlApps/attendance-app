import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { useApp } from './store';
import { nextPairNumber, todayISO } from './utils';
import { useReminders } from './useReminders';
import {
  OTA_CHECK_INTERVAL_MS,
  OTA_LAST_CHECK_KEY,
  checkForUpdate,
  downloadUpdate,
  formatBytes,
  installUpdate,
  isAndroidApp,
  openUpdatePermission,
  useOtaState,
  type OtaState,
} from './ota';
import type { IconName } from './components/Icon';
import { Icon } from './components/Icon';
import { HomeScreen } from './screens/HomeScreen';
import { MarkSetupScreen } from './screens/MarkSetupScreen';
import { MarkScreen } from './screens/MarkScreen';
import { MarkSummaryScreen } from './screens/MarkSummaryScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { DayScreen } from './screens/DayScreen';
import { PairScreen } from './screens/PairScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { StudentsScreen } from './screens/StudentsScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Route =
  | { name: 'home' }
  | { name: 'mark-setup'; date?: string; pair?: number }
  | { name: 'mark'; groupId: string; date: string; pairNumber: number }
  | { name: 'mark-summary'; groupId: string; date: string; pairNumber: number }
  | { name: 'calendar' }
  | { name: 'day'; groupId: string; date: string }
  | { name: 'pair'; groupId: string; date: string; pairNumber: number }
  | { name: 'reports' }
  | { name: 'students' }
  | { name: 'groups' }
  | { name: 'settings' };

const tabs: { route: Route; label: string; icon: IconName; match: Route['name'][] }[] = [
  { route: { name: 'home' }, label: 'Главная', icon: 'home', match: ['home'] },
  {
    route: { name: 'calendar' },
    label: 'Календарь',
    icon: 'calendar',
    match: ['calendar', 'day', 'pair'],
  },
  { route: { name: 'reports' }, label: 'Отчёты', icon: 'chart', match: ['reports'] },
  {
    route: { name: 'students' },
    label: 'Студенты',
    icon: 'users',
    match: ['students', 'groups'],
  },
  { route: { name: 'settings' }, label: 'Настройки', icon: 'settings', match: ['settings'] },
];

function isMarkRoute(route: Route): boolean {
  return route.name === 'mark-setup' || route.name === 'mark' || route.name === 'mark-summary';
}

function hapticTick(): void {
  try {
    if (window.AndroidApp?.vibrate) {
      window.AndroidApp.vibrate(8);
      return;
    }
    navigator.vibrate?.(8);
  } catch {
    // Тактильный отклик не критичен.
  }
}

interface NavCursorState {
  visible: boolean;
  snapping: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NavDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startIndex: number;
  active: boolean;
  moved: boolean;
  lastIndex: number;
}

const HIDDEN_CURSOR: NavCursorState = {
  visible: false,
  snapping: false,
  x: 0,
  y: 0,
  width: 52,
  height: 52,
};

/**
 * Нижнее меню с «жидким стеклянным» курсором.
 * Короткое нажатие работает как обычная кнопка, горизонтальный свайп
 * «листает» вкладки, а удержание включает перетаскивание курсора.
 */
function BottomNav({
  activeName,
  onSelect,
}: {
  activeName?: Route['name'];
  onSelect: (route: Route) => void;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<NavDragState | null>(null);
  const longPressRef = useRef<number | null>(null);
  const hideCursorRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [cursor, setCursor] = useState<NavCursorState>(HIDDEN_CURSOR);
  const [dragging, setDragging] = useState(false);

  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const clearHideCursor = () => {
    if (hideCursorRef.current !== null) {
      window.clearTimeout(hideCursorRef.current);
      hideCursorRef.current = null;
    }
  };

  /**
   * Положение курсора над вкладкой. При перетаскивании (`nearest`) вертикальный
   * уход пальца игнорируется, а при отпускании за пределами меню берётся
   * ближайшая по горизонтали вкладка — так свайп не «теряется».
   */
  const pointToCursor = (clientX: number, clientY: number, nearest = false) => {
    const nav = navRef.current;
    if (!nav) return null;
    const navRect = nav.getBoundingClientRect();
    const items = Array.from(
      nav.querySelectorAll<HTMLButtonElement>('.bottom-nav-item'),
    );
    let index = -1;
    let targetRect: DOMRect | null = null;
    items.forEach((item, itemIndex) => {
      const rect = item.getBoundingClientRect();
      const insideX = clientX >= rect.left && clientX <= rect.right;
      const insideY = clientY >= rect.top - 6 && clientY <= rect.bottom + 6;
      if (insideX && (nearest || insideY)) {
        index = itemIndex;
        targetRect = rect;
      }
    });
    if (nearest && index < 0) {
      let bestDistance = Number.POSITIVE_INFINITY;
      items.forEach((item, itemIndex) => {
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(clientX - (rect.left + rect.width / 2));
        if (distance < bestDistance) {
          bestDistance = distance;
          index = itemIndex;
          targetRect = rect;
        }
      });
    }
    const rect = targetRect as DOMRect | null;
    return {
      index,
      x: (rect ? rect.left + rect.width / 2 : clientX) - navRect.left,
      y: (rect ? rect.top + rect.height / 2 : clientY) - navRect.top,
      width: rect ? rect.width : 52,
      height: rect ? rect.height : 52,
    };
  };

  const cursorForIndex = (index: number) => {
    const nav = navRef.current;
    if (!nav) return null;
    const item = nav.querySelectorAll<HTMLButtonElement>('.bottom-nav-item')[index];
    if (!item) return null;
    const navRect = nav.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    return {
      index,
      x: rect.left + rect.width / 2 - navRect.left,
      y: rect.top + rect.height / 2 - navRect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const startDragging = (drag: NavDragState, clientX: number, clientY: number) => {
    if (drag.active) return;
    drag.active = true;
    clearLongPress();
    setDragging(true);
    const point = pointToCursor(clientX, clientY, true);
    if (point) {
      setCursor({
        visible: true,
        snapping: false,
        x: point.x,
        y: point.y,
        width: point.width,
        height: point.height,
      });
    }
    hapticTick();
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearLongPress();
    clearHideCursor();
    suppressClickRef.current = false;
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Захват указателя не обязателен для работы нажатия.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startIndex: index,
      active: false,
      moved: false,
      lastIndex: index,
    };
    longPressRef.current = window.setTimeout(() => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      startDragging(drag, drag.startX, drag.startY);
    }, 180);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.active) {
      if (Math.hypot(dx, dy) > 9) clearLongPress();
      // Горизонтальный свайп по меню включает «листание» сразу, без удержания.
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.moved = true;
        startDragging(drag, event.clientX, event.clientY);
      } else {
        return;
      }
    }

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    const point = pointToCursor(event.clientX, event.clientY, true);
    if (!point) return;
    if (point.index >= 0 && point.index !== drag.lastIndex) {
      drag.lastIndex = point.index;
      hapticTick();
    }
    setCursor({
      visible: true,
      snapping: false,
      x: point.x,
      y: point.y,
      width: point.width,
      height: point.height,
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    clearLongPress();
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.active) return;

    event.preventDefault();
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 400);
    setDragging(false);

    const dx = event.clientX - drag.startX;
    const releasePoint = pointToCursor(event.clientX, event.clientY, true);
    let targetIndex = releasePoint ? releasePoint.index : drag.startIndex;
    // Короткий «флик» в пределах одной вкладки листает на соседнюю.
    if (
      drag.moved &&
      drag.startIndex >= 0 &&
      targetIndex === drag.startIndex &&
      Math.abs(dx) >= 14
    ) {
      targetIndex = Math.min(
        tabs.length - 1,
        Math.max(0, drag.startIndex + (dx < 0 ? 1 : -1)),
      );
    }

    const point = cursorForIndex(targetIndex);
    if (point) {
      const tab = tabs[targetIndex];
      setCursor({
        visible: true,
        snapping: true,
        x: point.x,
        y: point.y,
        width: point.width,
        height: point.height,
      });
      hideCursorRef.current = window.setTimeout(() => {
        setCursor((current) => ({ ...current, visible: false, snapping: false }));
        hideCursorRef.current = null;
      }, 300);
      if (tab) onSelect(tab.route);
    } else {
      setCursor((current) => ({ ...current, visible: false, snapping: true }));
    }
  };

  const handlePointerCancel = () => {
    clearLongPress();
    dragRef.current = null;
    setDragging(false);
    setCursor((current) => ({ ...current, visible: false, snapping: false }));
  };

  const cursorStyle = {
    '--cursor-x': `${cursor.x}px`,
    '--cursor-y': `${cursor.y}px`,
    '--cursor-w': `${cursor.width}px`,
    '--cursor-h': `${cursor.height}px`,
  } as CSSProperties;

  return (
    <nav
      ref={navRef}
      className={`bottom-nav no-print${dragging ? ' is-dragging' : ''}`}
      aria-label="Основная навигация"
      onContextMenu={(event) => event.preventDefault()}
    >
      {tabs.map((tab, index) => {
        const active = activeName === tab.route.name;
        return (
          <button
            key={tab.label}
            type="button"
            className={`bottom-nav-item${active ? ' is-active' : ''}`}
            onClick={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              onSelect(tab.route);
            }}
            onPointerDown={(event) => handlePointerDown(event, index)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={tab.icon} size={22} />
            <span>{tab.label}</span>
          </button>
        );
      })}
      <div
        className={`nav-cursor${cursor.visible ? ' is-visible' : ''}${
          cursor.snapping ? ' is-snapping' : ''
        }`}
        style={cursorStyle}
        aria-hidden="true"
      >
        <span className="nav-cursor-glow" />
        <span className="nav-cursor-shine" />
      </div>
    </nav>
  );
}

function UpdateBanner({
  state,
  onDismiss,
}: {
  state: OtaState;
  onDismiss: () => void;
}) {
  if (
    state.state !== 'available' &&
    state.state !== 'downloading' &&
    state.state !== 'ready' &&
    state.state !== 'need_permission'
  ) {
    return null;
  }

  const version = state.versionName ? ` ${state.versionName}` : '';
  const progress = state.progress ?? 0;
  const size = formatBytes(state.size);

  let title = `Доступно обновление${version}`;
  let detail = [size, state.notes].filter(Boolean).join(' · ');
  let actionLabel = 'Скачать и установить';
  let action: (() => void) | null = () => downloadUpdate(true);
  let disabled = false;

  if (state.state === 'downloading') {
    title = `Скачивание обновления${version}`;
    detail = `Загружено ${progress}%${size ? ` из ${size}` : ''}`;
    actionLabel = 'Скачивание…';
    action = null;
    disabled = true;
  } else if (state.state === 'ready') {
    title = `Обновление${version} готово`;
    detail = 'Файл проверен по SHA-256 и подписи. Осталось подтвердить установку.';
    actionLabel = 'Установить';
    action = () => installUpdate();
  } else if (state.state === 'need_permission') {
    title = 'Нужно разрешение на установку';
    detail = 'Разрешите приложению устанавливать обновления, затем нажмите «Установить».';
    actionLabel = 'Разрешить';
    action = () => openUpdatePermission();
  }

  return (
    <div className={`update-banner no-print is-${state.state}`} role="status">
      <span className="update-banner-icon">
        <Icon name="download" size={20} />
      </span>
      <div className="update-banner-text">
        <strong>{title}</strong>
        <span>{detail}</span>
        {state.state === 'downloading' && (
          <span className="update-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={action ?? undefined}
        disabled={disabled}
      >
        {actionLabel}
      </button>
      <button
        type="button"
        className="icon-button small"
        onClick={onDismiss}
        aria-label="Скрыть уведомление об обновлении"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function AppContent() {
  const { data, activeGroup, toasts, dismissToast } = useApp();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [stack, setStack] = useState<Route[]>([]);
  const transitionOrigin = useRef({ x: 0, y: 0, hasPointer: false });

  useEffect(() => {
    const rememberOrigin = (event: PointerEvent) => {
      transitionOrigin.current = {
        x: event.clientX,
        y: event.clientY,
        hasPointer: true,
      };
    };
    window.addEventListener('pointerdown', rememberOrigin, { passive: true });
    return () => window.removeEventListener('pointerdown', rememberOrigin);
  }, []);

  /**
   * Плавный переход: новый экран раскрывается кругом из точки нажатия.
   * Если View Transitions недоступны или включено уменьшение движения,
   * экран меняется сразу.
   */
  const runTransition = (update: () => void) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startViewTransition = (
      document as Document & {
        startViewTransition?: (callback: () => void) => { finished: Promise<void> };
      }
    ).startViewTransition;

    if (reduceMotion || typeof startViewTransition !== 'function') {
      update();
      return;
    }

    let { x, y } = transitionOrigin.current;
    if (!transitionOrigin.current.hasPointer) {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const rect = active.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else {
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }
    }

    const radius = Math.ceil(
      Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      ),
    );
    const root = document.documentElement;
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-radius', `${radius}px`);

    const transition = startViewTransition.call(document, () => {
      flushSync(update);
    });
    transition.finished.finally(() => {
      root.style.removeProperty('--vt-x');
      root.style.removeProperty('--vt-y');
      root.style.removeProperty('--vt-radius');
    });
  };

  const today = todayISO();
  const hasAttendanceToday = Boolean(
    activeGroup &&
      data.attendance.some(
        (record) => record.groupId === activeGroup.id && record.date === today,
      ),
  );
  const { due, dismiss } = useReminders(
    data.settings.reminders,
    hasAttendanceToday,
    activeGroup?.name ?? 'Моя группа',
  );
  const ota = useOtaState();
  const [dismissedOtaVersion, setDismissedOtaVersion] = useState<string | null>(null);
  const autoOtaChecked = useRef(false);

  useEffect(() => {
    if (autoOtaChecked.current) return;
    if (!isAndroidApp() || !data.settings.updateUrl) return;
    if (data.settings.autoUpdateCheck === false) return;
    autoOtaChecked.current = true;

    let lastCheck = 0;
    try {
      lastCheck = Number(localStorage.getItem(OTA_LAST_CHECK_KEY)) || 0;
    } catch {
      lastCheck = 0;
    }
    if (Date.now() - lastCheck < OTA_CHECK_INTERVAL_MS) return;
    try {
      localStorage.setItem(OTA_LAST_CHECK_KEY, String(Date.now()));
    } catch {
      // Частота автопроверки не критична.
    }
    checkForUpdate(data.settings.updateUrl);
  }, [data.settings.updateUrl, data.settings.autoUpdateCheck]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  const navigate = (next: Route) => {
    runTransition(() => {
      setStack((current) => [...current, route]);
      setRoute(next);
    });
  };

  const resetTo = (next: Route) => {
    runTransition(() => {
      setStack([]);
      setRoute(next);
    });
  };

  const back = () => {
    if (stack.length === 0) {
      runTransition(() => setRoute({ name: 'home' }));
      return;
    }
    const previous = stack[stack.length - 1];
    runTransition(() => {
      setRoute(previous);
      setStack(stack.slice(0, -1));
    });
  };

  const replace = (next: Route) => {
    runTransition(() => setRoute(next));
  };

  const activeTab = tabs.find((tab) => tab.match.includes(route.name));

  let screen: ReactNode = null;

  if (route.name === 'home') {
    screen = (
      <HomeScreen
        onMark={() => navigate({ name: 'mark-setup' })}
        onCalendar={() => resetTo({ name: 'calendar' })}
        onReports={() => resetTo({ name: 'reports' })}
        onStudents={() => resetTo({ name: 'students' })}
        onSettings={() => resetTo({ name: 'settings' })}
        onGroups={() => navigate({ name: 'groups' })}
        onOpenPair={(date, pairNumber) => {
          if (!activeGroup) return;
          navigate({ name: 'pair', groupId: activeGroup.id, date, pairNumber });
        }}
      />
    );
  } else if (route.name === 'mark-setup') {
    screen = (
      <MarkSetupScreen
        initialDate={route.date}
        initialPair={route.pair}
        onBack={back}
        onStart={(date, pairNumber) => {
          if (!activeGroup) return;
          navigate({
            name: 'mark',
            groupId: activeGroup.id,
            date,
            pairNumber,
          });
        }}
        onSummary={(date, pairNumber) => {
          if (!activeGroup) return;
          navigate({
            name: 'mark-summary',
            groupId: activeGroup.id,
            date,
            pairNumber,
          });
        }}
        onStudents={() => resetTo({ name: 'students' })}
        onGroups={() => navigate({ name: 'groups' })}
      />
    );
  } else if (route.name === 'mark') {
    screen = (
      <MarkScreen
        groupId={route.groupId}
        date={route.date}
        pairNumber={route.pairNumber}
        onExit={back}
        onSummary={() =>
          replace({
            name: 'mark-summary',
            groupId: route.groupId,
            date: route.date,
            pairNumber: route.pairNumber,
          })
        }
      />
    );
  } else if (route.name === 'mark-summary') {
    screen = (
      <MarkSummaryScreen
        groupId={route.groupId}
        date={route.date}
        pairNumber={route.pairNumber}
        onBack={back}
        onHome={() => resetTo({ name: 'home' })}
        onAnotherPair={() =>
          resetTo({
            name: 'mark-setup',
            date: route.date,
            pair: nextPairNumber(route.pairNumber),
          })
        }
      />
    );
  } else if (route.name === 'calendar') {
    screen = (
      <CalendarScreen
        onDay={(date) => {
          if (!activeGroup) return;
          navigate({ name: 'day', groupId: activeGroup.id, date });
        }}
        onGroups={() => navigate({ name: 'groups' })}
      />
    );
  } else if (route.name === 'day') {
    screen = (
      <DayScreen
        groupId={route.groupId}
        date={route.date}
        onBack={back}
        onOpenPair={(date, pairNumber) =>
          navigate({ name: 'pair', groupId: route.groupId, date, pairNumber })
        }
        onMark={(date) => navigate({ name: 'mark-setup', date })}
      />
    );
  } else if (route.name === 'pair') {
    screen = (
      <PairScreen
        groupId={route.groupId}
        date={route.date}
        pairNumber={route.pairNumber}
        onBack={back}
        onMark={() =>
          navigate({
            name: 'mark',
            groupId: route.groupId,
            date: route.date,
            pairNumber: route.pairNumber,
          })
        }
      />
    );
  } else if (route.name === 'reports') {
    screen = (
      <ReportsScreen
        onMark={() => navigate({ name: 'mark-setup' })}
        onGroups={() => navigate({ name: 'groups' })}
      />
    );
  } else if (route.name === 'students') {
    screen = <StudentsScreen onGroups={() => navigate({ name: 'groups' })} />;
  } else if (route.name === 'groups') {
    screen = (
      <GroupsScreen
        onBack={back}
        onSelected={() => resetTo({ name: 'home' })}
        onStudents={() => resetTo({ name: 'students' })}
      />
    );
  } else if (route.name === 'settings') {
    screen = <SettingsScreen />;
  }

  return (
    <>
      <div className={`app-shell${route.name === 'reports' ? ' app-shell-wide' : ''}`}>
        {!isMarkRoute(route) && dismissedOtaVersion !== (ota.versionName ?? '') && (
          <UpdateBanner state={ota} onDismiss={() => setDismissedOtaVersion(ota.versionName ?? '')} />
        )}

        {due && !isMarkRoute(route) && (
          <div className="reminder-banner no-print" role="status">
            <span className="reminder-icon">
              <Icon name="bell" size={20} />
            </span>
            <div className="reminder-text">
              <strong>Пора отметить посещаемость</strong>
              <span>
                Напоминание на {due.time}
                {activeGroup ? ` · ${activeGroup.name}` : ''}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate({ name: 'mark-setup' })}
            >
              Отметить
            </button>
            <button
              type="button"
              className="icon-button small"
              onClick={dismiss}
              aria-label="Скрыть напоминание"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {screen}

        {!isMarkRoute(route) && (
          <BottomNav activeName={activeTab?.route.name} onSelect={resetTo} />
        )}
      </div>

      <div className="toast-stack no-print" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <Icon
              name={toast.kind === 'error' ? 'alert' : toast.kind === 'info' ? 'info' : 'check'}
              size={18}
            />
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Закрыть"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default function App() {
  return <AppContent />;
}
