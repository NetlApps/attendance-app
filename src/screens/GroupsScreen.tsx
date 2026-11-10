import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Group } from '../types';
import { useApp } from '../store';
import { plural, shareTextFile } from '../utils';
import {
  buildImportedGroupData,
  createGroupShareFile,
  groupShareFileName,
  parseGroupShareFile,
  serializeGroupShare,
} from '../groupShare';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';

interface GroupsScreenProps {
  onBack: () => void;
  onSelected: () => void;
  onStudents: () => void;
}

export function GroupsScreen({ onBack, onSelected, onStudents }: GroupsScreenProps) {
  const {
    data,
    activeGroup,
    setActiveGroup,
    addGroup,
    updateGroup,
    deleteGroup,
    replaceData,
    notify,
  } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [shareGroup, setShareGroup] = useState<Group | null>(null);
  const [sharing, setSharing] = useState<'students' | 'full' | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (group: Group) => {
    setEditing(group);
    setFormOpen(true);
  };

  const handleDelete = (group: Group) => {
    if (data.groups.length <= 1) {
      notify('Нельзя удалить единственную группу. Сначала создайте другую.', 'error');
      return;
    }
    setDeleting(group);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const removed = deleteGroup(deleting.id);
    if (removed) notify(`Группа «${deleting.name}» удалена`, 'info');
    setDeleting(null);
  };

  const handleImportClick = () => {
    if (importing) return;
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      notify('Файл слишком большой для импорта группы', 'error');
      return;
    }
    setImporting(true);
    try {
      const parsed = parseGroupShareFile(await file.text());
      const result = buildImportedGroupData(data, parsed);
      replaceData(result.data);
      const studentsLabel = `${result.studentCount} ${plural(
        result.studentCount,
        'студент',
        'студента',
        'студентов',
      )}`;
      const historyLabel = parsed.includesAttendance
        ? `, ${result.attendanceCount} ${plural(
            result.attendanceCount,
            'отметка',
            'отметки',
            'отметок',
          )}`
        : ', без истории';
      notify(`Группа «${parsed.group.name}» добавлена: ${studentsLabel}${historyLabel}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось импортировать группу', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleShare = async (includeAttendance: boolean) => {
    if (!shareGroup || sharing) return;
    setSharing(includeAttendance ? 'full' : 'students');
    try {
      const file = createGroupShareFile(data, shareGroup.id, includeAttendance);
      const content = serializeGroupShare(file);
      const filename = groupShareFileName(shareGroup.name, includeAttendance);
      const result = await shareTextFile(
        filename,
        content,
        'application/json',
        `Группа ${shareGroup.name}`,
      );
      setShareGroup(null);
      if (result === 'cancelled') {
        notify('Отправка файла отменена', 'info');
      } else if (result === 'downloaded') {
        notify('Файл группы сохранён в «Загрузки»');
      } else {
        notify('Файл группы отправлен');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось подготовить файл', 'error');
    } finally {
      setSharing(null);
    }
  };

  const studentCount = (groupId: string) =>
    data.students.filter((student) => student.groupId === groupId && !student.archived).length;

  const attendanceCount = (groupId: string) =>
    data.attendance.filter((record) => record.groupId === groupId).length;

  return (
    <div className="screen">
      <PageHeader
        title="Группы"
        subtitle="Каждая группа хранит своих студентов и историю"
        onBack={onBack}
        actions={
          <>
            <button
              type="button"
              className="icon-button"
              onClick={handleImportClick}
              disabled={importing}
              aria-label="Импортировать группу"
              title="Импортировать группу из файла"
            >
              <Icon name="upload" />
            </button>
            <button type="button" className="icon-button" onClick={openCreate} aria-label="Создать группу">
              <Icon name="plus" />
            </button>
          </>
        }
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportFile}
        hidden
      />

      <div className="groups-list">
        {data.groups.map((group) => {
          const isActive = group.id === activeGroup?.id;
          const count = studentCount(group.id);
          return (
            <section key={group.id} className={`card group-card${isActive ? ' is-active' : ''}`}>
              <div className="group-card-head">
                <span className="group-avatar large" aria-hidden="true">
                  {group.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <div className="group-card-title">
                  <h2>{group.name}</h2>
                  <span className="muted">
                    {count} {plural(count, 'студент', 'студента', 'студентов')}
                    {group.curator ? ` · куратор ${group.curator}` : ''}
                  </span>
                </div>
                {isActive && <span className="pill pill-active">Активная</span>}
              </div>

              <div className="group-card-actions">
                <button
                  type="button"
                  className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setActiveGroup(group.id);
                    onSelected();
                  }}
                >
                  {isActive ? 'Открыть' : 'Выбрать группу'}
                </button>
                <button
                  type="button"
                  className="icon-button bordered"
                  onClick={() => {
                    setActiveGroup(group.id);
                    onStudents();
                  }}
                  aria-label={`Студенты группы ${group.name}`}
                  title="Студенты группы"
                >
                  <Icon name="users" size={18} />
                </button>
                <button
                  type="button"
                  className="icon-button bordered"
                  onClick={() => openEdit(group)}
                  aria-label={`Изменить группу ${group.name}`}
                  title="Изменить"
                >
                  <Icon name="edit" size={18} />
                </button>
                <button
                  type="button"
                  className="icon-button bordered danger"
                  onClick={() => handleDelete(group)}
                  disabled={data.groups.length <= 1}
                  aria-label={`Удалить группу ${group.name}`}
                  title={
                    data.groups.length <= 1
                      ? 'Нельзя удалить единственную группу'
                      : 'Удалить группу'
                  }
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-block group-share-btn"
                onClick={() => setShareGroup(group)}
              >
                <Icon name="share" size={18} />
                Поделиться группой
              </button>
            </section>
          );
        })}

        {data.groups.length === 0 && (
          <EmptyState
            icon="users"
            title="Нет групп"
            text="Создайте группу и добавьте в неё студентов."
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" />
                Создать группу
              </button>
            }
          />
        )}
      </div>

      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={openCreate}>
        <Icon name="plus" />
        Создать группу
      </button>

      <div className="info-note">
        <Icon name="info" size={18} />
        <span>
          При первом запуске создаётся группа «Моя группа» со стартовым списком студентов.
          Название можно изменить, а список — дополнить или очистить.
        </span>
      </div>

      <GroupFormModal
        open={formOpen}
        group={editing}
        onClose={() => setFormOpen(false)}
        onSave={(name, curator) => {
          if (editing) {
            updateGroup(editing.id, name, curator);
            notify('Группа обновлена');
            setFormOpen(false);
          } else {
            addGroup(name, curator);
            notify('Группа создана. Добавьте в неё студентов.', 'success');
            setFormOpen(false);
            onStudents();
          }
        }}
      />

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Удалить группу?"
        subtitle={deleting?.name}
        footer={
          <div className="modal-footer-row">
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
              Отмена
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmDelete}>
              Удалить группу
            </button>
          </div>
        }
      >
        <p>
          Вместе с группой удалятся все её студенты и вся история посещаемости. Это действие
          нельзя отменить.
        </p>
        {deleting && (
          <p className="muted">
            В группе сейчас {studentCount(deleting.id)}{' '}
            {plural(studentCount(deleting.id), 'студент', 'студента', 'студентов')}.
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(shareGroup)}
        onClose={() => {
          if (!sharing) setShareGroup(null);
        }}
        title="Поделиться группой"
        subtitle={shareGroup?.name}
        footer={
          <div className="modal-footer-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShareGroup(null)}
              disabled={Boolean(sharing)}
            >
              Отмена
            </button>
          </div>
        }
      >
        {shareGroup && (
          <div className="form-stack">
            <p className="muted">
              Получатель откроет файл в приложении через «Группы → Импортировать группу».
              Его текущие группы и данные не пострадают.
            </p>
            <button
              type="button"
              className="share-option"
              onClick={() => handleShare(false)}
              disabled={Boolean(sharing)}
            >
              <span className="share-option-icon">
                <Icon name="users" size={20} />
              </span>
              <span className="share-option-text">
                <strong>Только список студентов</strong>
                <small>
                  {studentCount(shareGroup.id)}{' '}
                  {plural(studentCount(shareGroup.id), 'студент', 'студента', 'студентов')}
                </small>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
            <button
              type="button"
              className="share-option"
              onClick={() => handleShare(true)}
              disabled={Boolean(sharing)}
            >
              <span className="share-option-icon">
                <Icon name="calendar" size={20} />
              </span>
              <span className="share-option-text">
                <strong>Список + история посещаемости</strong>
                <small>
                  {studentCount(shareGroup.id)}{' '}
                  {plural(studentCount(shareGroup.id), 'студент', 'студента', 'студентов')} ·{' '}
                  {attendanceCount(shareGroup.id)}{' '}
                  {plural(attendanceCount(shareGroup.id), 'отметка', 'отметки', 'отметок')}
                </small>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
            {sharing && <p className="field-hint">Готовим файл…</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function GroupFormModal({
  open,
  group,
  onClose,
  onSave,
}: {
  open: boolean;
  group: Group | null;
  onClose: () => void;
  onSave: (name: string, curator: string) => void;
}) {
  const [name, setName] = useState('');
  const [curator, setCurator] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setCurator(group?.curator ?? '');
  }, [open, group]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? 'Изменить группу' : 'Новая группа'}
      subtitle={group ? undefined : 'Например, «ИС-21» или «2 курс, группа А»'}
      footer={
        <div className="modal-footer-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), curator.trim())}
          >
            {group ? 'Сохранить' : 'Создать группу'}
          </button>
        </div>
      }
    >
      <div className="form-stack">
        <label className="field">
          <span>Название группы</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, ИС-21"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Куратор (необязательно)</span>
          <input
            className="input"
            value={curator}
            onChange={(event) => setCurator(event.target.value)}
            placeholder="ФИО куратора"
          />
        </label>
      </div>
    </Modal>
  );
}
