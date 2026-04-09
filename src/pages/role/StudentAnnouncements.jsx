import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';

function StudentAnnouncements() {
  const { apiJson, user } = useAuth();
  const [items, setItems] = useState([]);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setLoading(true);
      setError('');
      setItems([]);
      setStudent(null);

      try {
        const data = await apiJson('/upcoming/student');
        if (!isCurrent) return;
        setItems(data.items || []);
        setStudent(data.student || null);
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load announcements.');
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isCurrent = false;
    };
  }, [apiJson]);

  return (
    <PortalLayout
      role={user?.role || 'student'}
      title="Announcements"
      subtitle="Teacher-posted class announcements, homework, tests, and upcoming reminders."
    >
      {loading && <p className="mt-4 text-sm text-slate-600">Loading announcements...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {student && (
        <p className="mt-4 text-sm text-slate-600">
          Class: {student.classLabel || student.level || 'Pending'}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {items.map((item) => {
          const hasDueDate = item.dueDate && !Number.isNaN(new Date(item.dueDate).getTime());
          return (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Announcement</p>
              <h3 className="mt-1 font-semibold text-primary">{item.title}</h3>
              {item.details && <p className="mt-1 text-sm text-slate-700">{item.details}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                {hasDueDate && <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>}
                {item.teacherName && <span>Posted by {item.teacherName}</span>}
              </div>
            </article>
          );
        })}
        {!loading && !error && !items.length && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No announcements yet.
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

export default StudentAnnouncements;
