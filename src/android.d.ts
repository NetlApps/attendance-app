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
  }

  interface Window {
    AndroidApp?: AndroidAppBridge;
    /** Нативный загрузчик обновлений передаёт сюда состояние OTA. */
    __onOtaEvent?: (json: string) => void;
  }
}
