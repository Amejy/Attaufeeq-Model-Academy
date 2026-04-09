import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ChildScopePanel from '../../components/ChildScopePanel';
import useParentChildSelection from '../../hooks/useParentChildSelection';

function RoleLibrary({ role }) {
  const { apiJson, user } = useAuth();
  const [books, setBooks] = useState([]);
  const [issues, setIssues] = useState([]);
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
      setBooks([]);
      setIssues([]);
      setName('');
      setChildren([]);
      try {
        const query = role === 'parent' && selectedChildId ? `?childId=${encodeURIComponent(selectedChildId)}` : '';
        const data = await apiJson(`/library/${role}${query}`);
        if (!isCurrent) return;

        setBooks(data.books || []);
        setIssues(data.myIssues || data.childIssues || []);
        setName(data.student?.fullName || data.child?.fullName || '');
        setChildren(data.children || []);
        if (role === 'parent' && data.child?.id && data.child.id !== selectedChildId) {
          setSelectedChildId(data.child.id);
        }
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load library records.');
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
      title={role === 'student' ? 'My Library' : 'Child Library'}
      subtitle="View available books and issued/overdue records."
    >
      {role === 'parent' && (
        <ChildScopePanel
          children={children}
          activeChildId={selectedChildId}
          onChange={setSelectedChildId}
          heading="Library Scope"
          description="Issued books and overdue status now belong to the selected child only."
        />
      )}
      {loading && <p className="mt-3 text-sm text-slate-600">Loading library records...</p>}
      {name && <p className="text-sm text-slate-600">Profile: {name}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-heading text-2xl text-primary">Available Books</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Author</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Institution</th>
                <th className="px-3 py-2">Available</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{book.title}</td>
                  <td className="px-3 py-2">{book.author}</td>
                  <td className="px-3 py-2">{book.category}</td>
                  <td className="px-3 py-2">{book.classLabel}</td>
                  <td className="px-3 py-2">{book.institution}</td>
                  <td className="px-3 py-2">{book.availableCopies} / {book.totalCopies}</td>
                </tr>
              ))}
              {!books.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-slate-600">{loading ? 'Loading library records...' : 'No library materials available for this profile yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-heading text-2xl text-primary">Issued Records</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Book</th>
                <th className="px-3 py-2">Issued</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Returned</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{issue.bookTitle}</td>
                  <td className="px-3 py-2">{new Date(issue.issuedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{new Date(issue.dueDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{issue.returnedAt ? new Date(issue.returnedAt).toLocaleDateString() : '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${issue.status === 'returned' ? 'bg-emerald-100 text-emerald-800' : issue.overdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'}`}>
                      {issue.status === 'returned' ? 'returned' : issue.overdue ? 'overdue' : 'issued'}
                    </span>
                  </td>
                </tr>
              ))}
              {!issues.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-600">{loading ? 'Loading library records...' : 'No issued books found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PortalLayout>
  );
}

export default RoleLibrary;
