import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ChildScopePanel from '../../components/ChildScopePanel';
import useParentChildSelection from '../../hooks/useParentChildSelection';

function RoleTimetable({ role }) {
  const { apiJson, user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [name, setName] = useState('');
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(role, user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setLoading(true);
      setError('');
      setEntries([]);
      setName('');
      setChildren([]);
      try {
        const query = role === 'parent' && selectedChildId ? `?childId=${encodeURIComponent(selectedChildId)}` : '';
        const data = await apiJson(`/timetable/${role}${query}`);
        if (!isCurrent) return;

        setEntries(data.entries || []);
        setName(data.student?.fullName || data.child?.fullName || '');
        setChildren(data.children || []);
        if (role === 'parent' && data.child?.id && data.child.id !== selectedChildId) {
          setSelectedChildId(data.child.id);
        }
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load timetable.');
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
  }, [role, apiJson, selectedChildId, setSelectedChildId]);

  return (
    <PortalLayout
      role={role}
      title={role === 'teacher' ? 'My Timetable' : role === 'student' ? 'Class Timetable' : 'Child Timetable'}
      subtitle="Daily class schedule by day and period."
    >
      {role === 'parent' && (
        <ChildScopePanel
          children={children}
          activeChildId={selectedChildId}
          onChange={setSelectedChildId}
          heading="Timetable Scope"
          description="Only the active child class timetable is displayed here."
        />
      )}
      {loading && <p className="mt-3 text-sm text-slate-600">Loading timetable...</p>}
      {name && <p className="text-sm text-slate-600">Profile: {name}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Day</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Teacher</th>
              <th className="px-3 py-2">Room</th>
              <th className="px-3 py-2">Term</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{entry.dayOfWeek}</td>
                <td className="px-3 py-2">{entry.startTime} - {entry.endTime}</td>
                <td className="px-3 py-2">{entry.classLabel}</td>
                <td className="px-3 py-2">{entry.subjectName}</td>
                <td className="px-3 py-2">{entry.teacherName}</td>
                <td className="px-3 py-2">{entry.room || '-'}</td>
                <td className="px-3 py-2">{entry.term}</td>
              </tr>
            ))}
            {!entries.length && (
              <tr><td colSpan={7} className="px-3 py-3 text-slate-600">{loading ? 'Loading timetable...' : 'No timetable entries found.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default RoleTimetable;
