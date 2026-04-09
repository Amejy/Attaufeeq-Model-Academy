import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

function isPeriodOpen(period) {
  if (!period?.enabled) return false;
  const start = period.startDate ? new Date(period.startDate).getTime() : null;
  const end = period.endDate ? new Date(period.endDate).getTime() : null;
  const now = Date.now();
  if (start != null && now < start) return false;
  if (end != null && now > end) return false;
  return true;
}

function validateAdmissionPeriod(period = {}) {
  const programs = period.programs || {};
  const windows = [
    { label: 'ATTAUFEEQ Model Academy', ...programs.modern },
    { label: 'Madrastul ATTAUFEEQ', ...programs.madrasa },
    { label: 'Quran Memorization', ...programs.memorization }
  ];

  for (const window of windows) {
    const start = window.startDate ? new Date(window.startDate).getTime() : null;
    const end = window.endDate ? new Date(window.endDate).getTime() : null;
    if (start != null && Number.isNaN(start)) {
      return `${window.label} start date is invalid.`;
    }
    if (end != null && Number.isNaN(end)) {
      return `${window.label} end date is invalid.`;
    }
    if (start != null && end != null && start > end) {
      return `${window.label} start date must be before its end date.`;
    }
  }

  return '';
}

function AdminAdmissionsAccess() {
  const { apiJson } = useAuth();
  const [admissionPeriod, setAdmissionPeriod] = useState({
    enabled: true,
    startDate: '',
    endDate: '',
    programs: {
      modern: { enabled: true, startDate: '', endDate: '' },
      madrasa: { enabled: true, startDate: '', endDate: '' },
      memorization: { enabled: true, startDate: '', endDate: '' }
    }
  });
  const [archive, setArchive] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [showArchiveRows, setShowArchiveRows] = useState(true);
  const loadDataSeq = useRef(0);

  const loadData = useCallback(async () => {
    const seq = ++loadDataSeq.current;
    setLoading(true);
    setError('');
    setSuccess('');
    setArchive([]);
    setClasses([]);

    try {
      const [periodData, archiveData, classesData] = await Promise.all([
        apiJson('/admin/admissions/period'),
        apiJson('/admin/admissions/archive'),
        apiJson('/admin/classes')
      ]);
      if (seq !== loadDataSeq.current) return;

      const period = periodData.admissionPeriod || { enabled: true, startDate: '', endDate: '' };
      const programs = period.programs || {};
      setAdmissionPeriod({
        enabled: period.enabled !== false,
        startDate: period.startDate ? period.startDate.slice(0, 16) : '',
        endDate: period.endDate ? period.endDate.slice(0, 16) : '',
        programs: {
          modern: {
            enabled: programs.modern?.enabled !== false,
            startDate: programs.modern?.startDate ? programs.modern.startDate.slice(0, 16) : '',
            endDate: programs.modern?.endDate ? programs.modern.endDate.slice(0, 16) : ''
          },
          madrasa: {
            enabled: programs.madrasa?.enabled !== false,
            startDate: programs.madrasa?.startDate ? programs.madrasa.startDate.slice(0, 16) : '',
            endDate: programs.madrasa?.endDate ? programs.madrasa.endDate.slice(0, 16) : ''
          },
          memorization: {
            enabled: programs.memorization?.enabled !== false,
            startDate: programs.memorization?.startDate ? programs.memorization.startDate.slice(0, 16) : '',
            endDate: programs.memorization?.endDate ? programs.memorization.endDate.slice(0, 16) : ''
          }
        }
      });
      setArchive(archiveData.archive || []);
      setClasses(classesData.classes || []);
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load admissions access data.');
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveAdmissionPeriod(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/admin/admissions/period', {
        method: 'PUT',
        body: admissionPeriod
      });
      const period = data.admissionPeriod || admissionPeriod;
      const programs = period.programs || {};
      setAdmissionPeriod({
        enabled: period.enabled !== false,
        startDate: period.startDate ? period.startDate.slice(0, 16) : '',
        endDate: period.endDate ? period.endDate.slice(0, 16) : '',
        programs: {
          modern: {
            enabled: programs.modern?.enabled !== false,
            startDate: programs.modern?.startDate ? programs.modern.startDate.slice(0, 16) : '',
            endDate: programs.modern?.endDate ? programs.modern.endDate.slice(0, 16) : ''
          },
          madrasa: {
            enabled: programs.madrasa?.enabled !== false,
            startDate: programs.madrasa?.startDate ? programs.madrasa.startDate.slice(0, 16) : '',
            endDate: programs.madrasa?.endDate ? programs.madrasa.endDate.slice(0, 16) : ''
          },
          memorization: {
            enabled: programs.memorization?.enabled !== false,
            startDate: programs.memorization?.startDate ? programs.memorization.startDate.slice(0, 16) : '',
            endDate: programs.memorization?.endDate ? programs.memorization.endDate.slice(0, 16) : ''
          }
        }
      });
      setSuccess('Admission period saved.');
    } catch (err) {
      setError(err.message || 'Unable to save period.');
    } finally {
      setSaving(false);
    }
  }

  const classLookup = useMemo(() => {
    const map = new Map();
    classes.forEach((item) => {
      map.set(item.id, `${item.name} ${item.arm}`.trim());
    });
    return map;
  }, [classes]);

  const filteredArchive = useMemo(() => {
    if (!search.trim()) return archive;
    const needle = search.trim().toLowerCase();
    return archive.filter((item) => {
      return (
        String(item.fullName || '').toLowerCase().includes(needle) ||
        String(item.guardianName || '').toLowerCase().includes(needle) ||
        String(item.phone || '').toLowerCase().includes(needle) ||
        String(item.email || '').toLowerCase().includes(needle)
      );
    });
  }, [archive, search]);

  const archiveSummary = useMemo(() => {
    const counts = {};
    archive.forEach((item) => {
      const label = classLookup.get(item.classId) || item.classLabel || item.classId || 'Unknown Class';
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [archive, classLookup]);

  const modernPeriod = admissionPeriod.programs?.modern || {};
  const madrasaPeriod = admissionPeriod.programs?.madrasa || {};
  const memorizationPeriod = admissionPeriod.programs?.memorization || {};
  const admissionsEnabled = admissionPeriod.enabled !== false;
  const modernOpen = admissionsEnabled && isPeriodOpen(modernPeriod);
  const madrasaOpen = admissionsEnabled && isPeriodOpen(madrasaPeriod);
  const memorizationOpen = admissionsEnabled && isPeriodOpen(memorizationPeriod);
  const periodOpen = admissionsEnabled && (modernOpen || madrasaOpen || memorizationOpen);
  const periodValidationError = validateAdmissionPeriod(admissionPeriod);
  const canSavePeriod = !saving && !periodValidationError;

  return (
    <PortalLayout
      role="admin"
      title="Admissions Access"
      subtitle="Open or close admissions and keep an archive of fully admitted students by class for future reference."
    >
      {loading && <p className="mt-4 text-sm text-slate-600">Loading admissions access...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
      {periodValidationError && <p className="mt-4 text-sm text-amber-700">{periodValidationError}</p>}

      <section className="mt-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Admission Window</h2>
            <p className="mt-2 text-sm text-slate-600">
              Toggle the public admission window. When closed, applicants cannot submit new forms.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${periodOpen ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {periodOpen ? 'Admissions Open' : 'Admissions Closed'}
          </span>
        </div>

        <form onSubmit={saveAdmissionPeriod} className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Master Admissions Switch</h3>
                <p className="mt-1 text-xs text-slate-600">Turn this off to close every admissions program at once, even if individual windows are configured.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={admissionPeriod.enabled !== false}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      enabled: e.target.checked
                    }))
                  }
                />
                Admissions enabled
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">ATTAUFEEQ Model Academy (Modern)</h3>
                <p className="mt-1 text-xs text-slate-600">Control the modern academy admission window.</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${modernOpen ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {modernOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={admissionPeriod.programs?.modern?.enabled !== false}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        modern: { ...prev.programs.modern, enabled: e.target.checked }
                      }
                    }))
                  }
                />
                Window enabled
              </label>
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.modern?.startDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                      modern: { ...prev.programs.modern, startDate: e.target.value }
                    }
                  }))
                }
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              />
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.modern?.endDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                      modern: { ...prev.programs.modern, endDate: e.target.value }
                    }
                  }))
                }
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Madrastul ATTAUFEEQ (Madrasa)</h3>
                <p className="mt-1 text-xs text-slate-600">Control the madrasa admission window.</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${madrasaOpen ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {madrasaOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={admissionPeriod.programs?.madrasa?.enabled !== false}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        madrasa: { ...prev.programs.madrasa, enabled: e.target.checked }
                      }
                    }))
                  }
                />
                Window enabled
              </label>
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.madrasa?.startDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                      madrasa: { ...prev.programs.madrasa, startDate: e.target.value }
                    }
                  }))
                }
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              />
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.madrasa?.endDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                      madrasa: { ...prev.programs.madrasa, endDate: e.target.value }
                    }
                  }))
                }
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Quran Memorization</h3>
                <p className="mt-1 text-xs text-slate-600">Control the memorization admission window.</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${memorizationOpen ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {memorizationOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={admissionPeriod.programs?.memorization?.enabled !== false}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        memorization: { ...prev.programs.memorization, enabled: e.target.checked }
                      }
                    }))
                  }
                />
                Window enabled
              </label>
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.memorization?.startDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                      memorization: { ...prev.programs.memorization, startDate: e.target.value }
                    }
                  }))
                }
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              />
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.memorization?.endDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                      memorization: { ...prev.programs.memorization, endDate: e.target.value }
                    }
                  }))
                }
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={!canSavePeriod}
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Admission Archive</h2>
            <p className="mt-2 text-sm text-slate-600">
              Fully admitted students are archived here by class for future lookup, even after the desk record is cleared.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            {archive.length} archived
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived admissions by name, guardian, phone, or email"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm"
          />
        </div>

        {archiveSummary.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archiveSummary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{item.count}</p>
                <p className="mt-1 text-xs text-slate-500">Archived admissions</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Admission archive table</span>
            <button
              type="button"
              onClick={() => setShowArchiveRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {showArchiveRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Archived At</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {!showArchiveRows && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Rows are hidden. Click “Show rows” to display the archive.
                  </td>
                </tr>
              )}
              {showArchiveRows && filteredArchive.map((record) => (
                <tr key={record.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{record.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{record.guardianName} • {record.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    {classLookup.get(record.classId) || record.classLabel || record.classId || '—'}
                  </td>
                  <td className="px-4 py-3">{record.status}</td>
                  <td className="px-4 py-3">{record.verificationStatus}</td>
                  <td className="px-4 py-3">{record.archivedAt ? new Date(record.archivedAt).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3">{record.reason || '-'}</td>
                </tr>
              ))}
              {showArchiveRows && !filteredArchive.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No archived admissions found yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PortalLayout>
  );
}

export default AdminAdmissionsAccess;
