import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';

function MyNotifications() {
  const { apiJson, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      setNotifications([]);

      try {
        const data = await apiJson('/notifications/me');
        const rows = [...(data.notifications || [])].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        setNotifications(rows);
      } catch (err) {
        setError(err.message || 'Unable to load notifications.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [apiJson]);

  return (
    <PortalLayout
      role={user?.role || 'student'}
      title="My Notifications"
      subtitle="Announcements and updates sent by school administration."
    >
      {loading && <p className="mt-4 text-sm text-slate-600">Loading notifications...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 space-y-3">
        {notifications.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">{item.sourceLabel || item.roleTarget}</p>
            <h3 className="mt-1 font-semibold text-primary">{item.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{item.message}</p>
            {item.createdAt && (
              <p className="mt-3 text-xs text-slate-500">
                Received {new Date(item.createdAt).toLocaleString()}
              </p>
            )}
          </article>
        ))}
        {!loading && !error && !notifications.length && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No notifications yet.
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

export default MyNotifications;
