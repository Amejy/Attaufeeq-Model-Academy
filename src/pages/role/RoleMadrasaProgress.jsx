import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ChildScopePanel from '../../components/ChildScopePanel';
import useParentChildSelection from '../../hooks/useParentChildSelection';

function RoleMadrasaProgress({ role }) {
  const { apiJson, user } = useAuth();
  const [records, setRecords] = useState([]);
  const [profileName, setProfileName] = useState('');
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(role, user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setLoading(true);
      setError('');
      setRecords([]);
      setProfileName('');
      setChildren([]);
      try {
        const query = role === 'parent' && selectedChildId ? `?childId=${encodeURIComponent(selectedChildId)}` : '';
        const data = await apiJson(`/madrasa/${role}${query}`);
        if (!isCurrent) return;

        setRecords(data.records || []);
        setProfileName(data.student?.fullName || data.child?.fullName || '');
        setChildren(data.children || []);
        if (role === 'parent' && data.child?.id && data.child.id !== selectedChildId) {
          setSelectedChildId(data.child.id);
        }
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load madrasa progress.');
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
      title={role === 'student' ? 'My Madrasa Progress' : 'Child Madrasa Progress'}
      subtitle="Qur'an memorization, Tajweed level, and Islamic assessment records."
    >
      {role === 'parent' && (
        <ChildScopePanel
          children={children}
          activeChildId={selectedChildId}
          onChange={setSelectedChildId}
          heading="Madrasa Scope"
          description="Qur'an, Tajweed, Arabic, and Islamic progress now stay tied to the selected child."
        />
      )}
      {loading && <p className="mt-3 text-sm text-slate-600">Loading madrasa progress...</p>}
      {profileName && <p className="text-sm text-slate-600">Profile: {profileName}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">Qur'an Progress</th>
              <th className="px-3 py-2">Tajweed</th>
              <th className="px-3 py-2">Arabic</th>
              <th className="px-3 py-2">Islamic</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{record.term}</td>
                <td className="px-3 py-2">{record.quranPortion}</td>
                <td className="px-3 py-2">{record.tajweedLevel}</td>
                <td className="px-3 py-2">{record.arabicScore}</td>
                <td className="px-3 py-2">{record.islamicScore}</td>
                <td className="px-3 py-2">{record.notes || '-'}</td>
              </tr>
            ))}
            {!records.length && (
              <tr>
                <td className="px-3 py-3 text-slate-600" colSpan={6}>{loading ? 'Loading madrasa progress...' : 'No madrasa progress records yet.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default RoleMadrasaProgress;
