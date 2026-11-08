type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** Регистрирует обработчик системного «назад». Возвращает функцию отписки. */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** Закрывает верхнее модальное окно, если оно открыто. */
export function runTopBackHandler(): boolean {
  const handler = handlers[handlers.length - 1];
  return handler ? handler() : false;
}
