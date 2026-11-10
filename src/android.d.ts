export {};

declare global {
  interface AndroidAppBridge {
    /** Сохраняет текстовый файл в «Загрузки» телефона. */
    saveFile?: (filename: string, mime: string, content: string) => void;
    /** Открывает системный диалог «Поделиться» с текстовым файлом. */
    shareFile?: (filename: string, mime: string, content: string) => void;
    /** Планирует системные будильники напоминаний (работают при закрытом приложении). */
    scheduleReminders?: (
      enabled: boolean,
      timesJson: string,
      weekdaysJson: string,
      groupName: string,
    ) => void;
    /** Синхронизирует цвет статус-бара и панели навигации с темой. */
    setSystemBars?: (background: string, dark: boolean) => void;
    /** Короткая вибрация для тактильного отклика нижнего меню. */
    vibrate?: (milliseconds: number) => void;
    /** Версия установленного APK в формате JSON. */
    getAppVersion?: () => string;
    /** Текущее состояние OTA-обновления в формате JSON. */
    getUpdateState?: () => string;
    /** Проверяет update.json по указанному адресу. */
    checkUpdate?: (manifestUrl: string) => void;
    /** Скачивает проверенный APK и, при необходимости, запускает установку. */
    downloadUpdate?: (installAfterDownload: boolean) => void;
    /** Открывает системный установщик для скачанного APK. */
    installUpdate?: () => void;
    /** Открывает настройку «Установка неизвестных приложений». */
    openUpdatePermission?: () => void;
    /** Показывает системное уведомление Android. */
    notify?: (title: string, body: string) => void;
    /** Открывает системный диалог печати для текущей страницы. */
    printPage?: () => void;
    /** Текущее состояние разрешения на уведомления. */
    notificationPermission?: () => 'granted' | 'denied' | 'default';
    /** Запрашивает разрешение на уведомления Android. */
    requestNotificationPermission?: () => void;
    /** Статусы разрешений для фоновых напоминаний в формате JSON. */
    getReliabilityState?: () => string;
    /** Открывает системный запрос точных будильников. */
    requestExactAlarms?: () => void;
    /** Открывает запрос на снятие ограничений батареи. */
    requestBatteryExemption?: () => void;
    /** Открывает системный список ограничений батареи. */
    openBatterySettings?: () => void;
    /** Открывает настройки автозапуска (Xiaomi/Redmi/POCO). */
    openAutostartSettings?: () => void;
    /** Открывает системные настройки приложения. */
    openAppSettings?: () => void;
    /** Открывает системный экран «Уведомления» приложения. */
    openNotificationSettings?: () => void;
    /** Показывает проверочное уведомление сразу. Возвращает false, если уведомления запрещены. */
    testNotificationNow?: () => boolean;
    /** Показывает проверочное уведомление через указанное число секунд. */
    testNotificationDelayed?: (seconds: number) => void;
    /** Сохраняет копию данных в приватном хранилище приложения. */
    saveDataSnapshot?: (json: string) => void;
    /** Принудительно создаёт снимок данных. */
    backupDataNow?: (json: string) => void;
    /** Возвращает последнюю цельную копию данных или пустую строку. */
    getDataSnapshot?: () => string;
    /** Сведения о хранилище копий в формате JSON. */
    getDataVaultInfo?: () => string;
    /** Список снимков данных в формате JSON. */
    listDataBackups?: () => string;
    /** Читает снимок данных по имени файла. */
    readDataBackup?: (name: string) => string;
  }

  interface Window {
    AndroidApp?: AndroidAppBridge;
    /** Нативный загрузчик обновлений передаёт сюда состояние OTA. */
    __onOtaEvent?: (json: string) => void;
    /** Нативная часть передаёт сюда статусы разрешений для напоминаний. */
    __onReliabilityEvent?: (json: string) => void;
    /** Системный «назад» в APK: возвращает true, если приложение обработало шаг. */
    __androidBack?: () => boolean;
  }
}
