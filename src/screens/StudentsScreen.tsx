import { useEffect, useMemo, useState } from 'react';
import type { Student } from '../types';
import { useApp } from '../store';
import { plural } from '../utils';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';

interface StudentsScreenProps {
  onGroups: () => void;
}

export function StudentsScreen({ onGroups }: StudentsScreenProps) {
  const {
    data,
    activeGroup,
    activeStudents,
    addStudents,
    updateStudent,
    archiveStudent,
    restoreStudent,
    deleteStudentPermanently,
    moveStudent,
    sortStudentsAlphabetically,
    notify,
  } = useApp();
  const [query, setQuery] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);

  const groupStudents = useMemo(() => {
    if (!activeGroup) return [];
    return data.students
      .filter((student) => student.groupId === activeGroup.id)
      .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
  }, [data.students, activeGroup]);

  const archived = groupStudents.filter((student) => student.archived);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const matches = (student: Student) =>
    !normalizedQuery ||
    student.fullName.toLocaleLowerCase('ru').includes(normalizedQuery);

  const activeFiltered = groupStudents.filter(
    (student) => !student.archived && matches(student),
  );
  const archivedFiltered = archived.filter(matches);

  if (!activeGroup) {
    return (
      <div className="screen">
        <PageHeader title="Студенты" />
        <EmptyState
          icon="users"
          title="Нет активной группы"
          text="Создайте группу, чтобы добавлять в неё студентов."
          action={
            <button type="button" className="btn btn-primary" onClick={onGroups}>
              Перейти к группам
            </button>
          }
        />
      </div>
    );
  }

  const handleArchive = (student: Student) => {
    if (
      !window.confirm(
        `Убрать «${student.fullName}» в архив?\n\nИстория посещаемости сохранится и останется в отчётах.`,
      )
    ) {
      return;
    }
    archiveStudent(student.id);
    notify('Студент перемещён в архив', 'info');
  };

  const handleRestore = (student: Student) => {
    restoreStudent(student.id);
    notify('Студент возвращён в список');
  };

  const handleDelete = (student: Student) => {
    if (
      !window.confirm(
        `Удалить «${student.fullName}» навсегда?\n\nВместе с ним удалится вся история его отметок. Это действие нельзя отменить.`,
      )
    ) {
      return;
    }
    deleteStudentPermanently(student.id);
    notify('Студент и его отметки удалены', 'info');
  };

  return (
    <div className="screen">
      <PageHeader
        title="Студенты"
        subtitle={activeGroup.name}
        actions={
          <button type="button" className="icon-button" onClick={onGroups} aria-label="Сменить группу">
            <Icon name="users" />
          </button>
        }
      />

      <section className="card students-toolbar">
        <div className="students-toolbar-head">
          <div>
            <span className="eyebrow">В группе</span>
            <strong>
              {activeStudents.length}{' '}
              {plural(activeStudents.length, 'студент', 'студента', 'студентов')}
            </strong>
          </div>
          <button type="button" className="text-button" onClick={onGroups}>
            Сменить группу
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <div className="search-field">
          <Icon name="search" size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти по ФИО"
            aria-label="Поиск студента по ФИО"
          />
          {query && (
            <button
              type="button"
              className="icon-button small"
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="students-toolbar-actions">
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" />
            Добавить
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              sortStudentsAlphabetically();
              notify('Список отсортирован по алфавиту', 'info');
            }}
            disabled={activeStudents.length < 2}
          >
            <Icon name="arrow-down" />
            По алфавиту
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Список</h2>
          <button
            type="button"
            className={`text-button${showArchive ? ' is-active' : ''}`}
            onClick={() => setShowArchive((value) => !value)}
          >
            <Icon name="archive" size={16} />
            {showArchive ? 'Обычный список' : `Архив${archived.length ? ` (${archived.length})` : ''}`}
          </button>
        </div>

        {!showArchive && activeFiltered.length === 0 && (
          <EmptyState
            icon={activeStudents.length === 0 ? 'users' : 'search'}
            title={
              activeStudents.length === 0
                ? 'Пока нет студентов'
                : 'Никого не нашли'
            }
            text={
              activeStudents.length === 0
                ? 'Добавьте студентов — по одному или списком.'
                : 'Попробуйте изменить запрос.'
            }
            action={
              activeStudents.length === 0 ? (
                <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" />
                  Добавить студентов
                </button>
              ) : undefined
            }
          />
        )}

        {showArchive && archivedFiltered.length === 0 && (
          <EmptyState
            icon="archive"
            title="Архив пуст"
            text="Сюда попадают студенты, которых вы убрали из списка. История их отметок сохраняется."
          />
        )}

        <div className="student-list">
          {(showArchive ? archivedFiltered : activeFiltered).map((student, index, list) => (
            <div
              key={student.id}
              className={`student-row${student.archived ? ' is-archived' : ''}`}
            >
              <span className="student-order-badge">
                {student.archived ? <Icon name="archive" size={15} /> : student.order}
              </span>
              <button
                type="button"
                className="student-name-button"
                onClick={() => setEditStudent(student)}
                title="Изменить ФИО"
              >
                <strong>{student.fullName}</strong>
              </button>

              {!showArchive && (
                <div className="student-row-actions">
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => moveStudent(student.id, -1)}
                    disabled={index === 0}
                    aria-label="Переместить выше"
                  >
                    <Icon name="arrow-up" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => moveStudent(student.id, 1)}
                    disabled={index === list.length - 1}
                    aria-label="Переместить ниже"
                  >
                    <Icon name="arrow-down" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => handleArchive(student)}
                    aria-label="Убрать в архив"
                    title="Убрать в архив"
                  >
                    <Icon name="archive" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button small danger"
                    onClick={() => handleDelete(student)}
                    aria-label="Удалить навсегда"
                    title="Удалить навсегда"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}

              {showArchive && (
                <div className="student-row-actions">
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => handleRestore(student)}
                    aria-label="Вернуть в список"
                    title="Вернуть в список"
                  >
                    <Icon name="restore" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button small danger"
                    onClick={() => handleDelete(student)}
                    aria-label="Удалить навсегда"
                    title="Удалить навсегда"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <AddStudentsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(names) => {
          const count = addStudents(names);
          if (count > 0) notify(`Добавлено: ${count}`);
          setAddOpen(false);
        }}
      />

      <EditStudentModal
        student={editStudent}
        onClose={() => setEditStudent(null)}
        onSave={(fullName) => {
          if (editStudent) {
            updateStudent(editStudent.id, fullName);
            notify('ФИО обновлено');
          }
          setEditStudent(null);
        }}
      />
    </div>
  );
}

function AddStudentsModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (names: string[]) => void;
}) {
  const [mode, setMode] = useState<'one' | 'many'>('one');
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('one');
    setName('');
    setBulk('');
  }, [open]);

  const names =
    mode === 'one'
      ? name.trim()
        ? [name.trim()]
        : []
      : bulk
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Добавить студентов"
      subtitle="Можно добавить одного или сразу список"
      footer={
        <div className="modal-footer-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={names.length === 0}
            onClick={() => onAdd(names)}
          >
            {mode === 'many' && names.length > 0 ? `Добавить (${names.length})` : 'Добавить'}
          </button>
        </div>
      }
    >
      <div className="segmented">
        <button
          type="button"
          className={mode === 'one' ? 'is-active' : ''}
          onClick={() => setMode('one')}
        >
          Один студент
        </button>
        <button
          type="button"
          className={mode === 'many' ? 'is-active' : ''}
          onClick={() => setMode('many')}
        >
          Списком
        </button>
      </div>

      {mode === 'one' ? (
        <label className="field">
          <span>ФИО</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Фамилия Имя Отчество"
            autoFocus
          />
        </label>
      ) : (
        <label className="field">
          <span>ФИО, каждое с новой строки</span>
          <textarea
            className="textarea"
            rows={8}
            value={bulk}
            onChange={(event) => setBulk(event.target.value)}
            placeholder={'Иванов Иван Иванович\nПетрова Мария Сергеевна\nСидоров Алексей Петрович'}
            autoFocus
          />
          <span className="field-hint">
            Строки можно вставить из документа или таблицы.
          </span>
        </label>
      )}
    </Modal>
  );
}

function EditStudentModal({
  student,
  onClose,
  onSave,
}: {
  student: Student | null;
  onClose: () => void;
  onSave: (fullName: string) => void;
}) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (student) setName(student.fullName);
  }, [student]);

  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      title="Изменить ФИО"
      subtitle={student?.archived ? 'Студент находится в архиве' : undefined}
      footer={
        <div className="modal-footer-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim())}
          >
            Сохранить
          </button>
        </div>
      }
    >
      <label className="field">
        <span>ФИО</span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>
    </Modal>
  );
}
