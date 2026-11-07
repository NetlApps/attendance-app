import { useEffect, useState } from 'react';
import type { Group } from '../types';
import { useApp } from '../store';
import { plural } from '../utils';
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
    notify,
  } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);

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

  const studentCount = (groupId: string) =>
    data.students.filter((student) => student.groupId === groupId && !student.archived).length;

  return (
    <div className="screen">
      <PageHeader
        title="Группы"
        subtitle="Каждая группа хранит своих студентов и историю"
        onBack={onBack}
        actions={
          <button type="button" className="icon-button" onClick={openCreate} aria-label="Создать группу">
            <Icon name="plus" />
          </button>
        }
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
          При первом запуске уже создана группа «Моя группа» с 29 студентами из ведомости.
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
