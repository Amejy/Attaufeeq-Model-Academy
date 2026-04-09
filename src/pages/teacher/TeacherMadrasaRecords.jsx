import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { buildStudentCode } from '../../utils/studentCode';
import useDebouncedValue from '../../hooks/useDebouncedValue';

function TeacherMadrasaRecords() {
  const { apiJson } = useAuth();
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [showRows, setShowRows] = useState(true);
  const [search, setSearch] = useState('');
  const [termFilter, setTermFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState('all');
  const [form, setForm] = useState({
    studentId: '',
    term: 'First Term',
    quranPortion: '',
    tajweedLevel: 'Beginner',
    arabicScore: '',
    islamicScore: '',
    notes: ''
  });
  const loadDataSeq = useRef(0);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  function resetForm(nextStudentId = '') {
    setEditingId('');
    setForm((prev) => ({
      ...prev,
      studentId: nextStudentId,
      quranPortion: '',
      tajweedLevel: 'Beginner',
      arabicScore: '',
      islamicScore: '',
      notes: ''
    }));
  }

  const loadData = useCallback(async (options = {}) => {
    const seq = ++loadDataSeq.current;
    const preserveSuccess = Boolean(options.preserveSuccess);
    setLoading(true);
    setError('');
    if (!preserveSuccess) {
      setSuccess('');
    }
    setStudents([]);
    setRecords([]);
    try {
      const [studentsData, recordsData] = await Promise.all([
        apiJson('/madrasa/teacher/students'),
        apiJson('/madrasa/teacher/records')
      ]);
      if (seq !== loadDataSeq.current) return;

      const studentRows = studentsData.students || [];
      setStudents(studentRows);
      setRecords(recordsData.records || []);
      setForm((prev) => {
        const stillValid = studentRows.some((student) => student.id === prev.studentId);
        return { ...prev, studentId: stillValid ? prev.studentId : studentRows?.[0]?.id || '' };
      });
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load madrasa data.');
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const nextStudentId = students[0]?.id || '';
    const stillValid = students.some((student) => student.id === form.studentId);

    if (stillValid) {
      return;
    }

    if (editingId) {
      resetForm(nextStudentId);
      return;
    }

    setForm((prev) => ({ ...prev, studentId: nextStudentId }));
  }, [editingId, form.studentId, students]);

  async function submitRecord(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const method = editingId ? 'PUT' : 'POST';
    const endpoint = editingId ? `/madrasa/teacher/records/${editingId}` : '/madrasa/teacher/records';

    try {
      await apiJson(endpoint, {
        method,
        body: form
      });

      setSuccess(editingId ? 'Madrasa record updated.' : 'Madrasa record created.');
      resetForm(form.studentId || students[0]?.id || '');
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to save record.');
    }
  }

  async function deleteRecord(id) {
    setError('');
    setSuccess('');

    try {
      setDeletingId(id);
      await apiJson(`/madrasa/teacher/records/${id}`, { method: 'DELETE' });

      setSuccess('Madrasa record deleted.');
      setRecords((prev) => prev.filter((item) => item.id !== id));
      if (id === editingId) {
        resetForm(students.some((student) => student.id === form.studentId) ? form.studentId : students[0]?.id || '');
      }
    } catch (err) {
      setError(err.message || 'Unable to delete record.');
    } finally {
      setDeletingId((prev) => (prev === id ? '' : prev));
    }
  }

  function startEdit(record) {
    setEditingId(record.id);
    setForm({
      studentId: record.studentId,
      term: record.term,
      quranPortion: record.quranPortion,
      tajweedLevel: record.tajweedLevel,
      arabicScore: record.arabicScore,
      islamicScore: record.islamicScore,
      notes: record.notes || ''
    });
  }

  const hasStudents = students.length > 0;
  const hasValidScores = [form.arabicScore, form.islamicScore].every((value) => (
    value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
  ));
  const canSubmit = hasStudents && Boolean(form.studentId && form.quranPortion.trim() && form.tajweedLevel) && hasValidScores;
  const classOptions = useMemo(() => {
    const map = new Map();
    records.forEach((record) => {
      const label = record.classLabel || 'Class Pending';
      if (!map.has(label)) {
        map.set(label, label);
      }
    });
    return Array.from(map.values()).sort();
  }, [records]);
  const filteredRecords = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return records.filter((record) => {
      const byTerm = termFilter === 'all' ? true : record.term === termFilter;
      const byClass = classFilter ? (record.classLabel || 'Class Pending') === classFilter : true;
      const totalScore = (Number(record.arabicScore || 0) + Number(record.islamicScore || 0)) / 2;
      const byPerformance =
        performanceFilter === 'high'
          ? totalScore >= 70
          : performanceFilter === 'mid'
            ? totalScore >= 50 && totalScore < 70
            : performanceFilter === 'low'
              ? totalScore < 50
              : true;
      const searchable = `${record.studentName || ''} ${record.classLabel || ''} ${record.quranPortion || ''} ${record.tajweedLevel || ''}`.toLowerCase();
      const bySearch = !query || searchable.includes(query);
      return byTerm && byClass && byPerformance && bySearch;
    });
  }, [classFilter, debouncedSearch, performanceFilter, records, termFilter]);

  return (
    <PortalLayout
      role="teacher"
      title="Madrasa Learning Records"
      subtitle="Track Qur'an memorization, Tajweed progress, and Islamic studies for your assigned students."
    >
      {loading && <p className="text-sm text-slate-600">Loading madrasa data...</p>}
      {!loading && !hasStudents && (
        <p className="text-sm text-slate-600">No assigned students yet. Once a class is assigned to you, it will appear here.</p>
      )}

      <form
        onSubmit={submitRecord}
        className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <select
          value={form.studentId}
          onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
          disabled={!hasStudents}
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName} {student.classLabel ? `• ${student.classLabel}` : ''} ({buildStudentCode(student)})
            </option>
          ))}
        </select>
        <select
          value={form.term}
          onChange={(e) => setForm((prev) => ({ ...prev, term: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
          disabled={!hasStudents}
        >
          {['First Term', 'Second Term', 'Third Term'].map((term) => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>
        <input
          value={form.quranPortion}
          onChange={(e) => setForm((prev) => ({ ...prev, quranPortion: e.target.value }))}
          placeholder="Qur'an portion covered"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
          disabled={!hasStudents}
        />
        <select
          value={form.tajweedLevel}
          onChange={(e) => setForm((prev) => ({ ...prev, tajweedLevel: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
          disabled={!hasStudents}
        >
          {['Beginner', 'Intermediate', 'Advanced', 'Fluent'].map((level) => (
            <option key={level} value={level}>{level}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          max="100"
          value={form.arabicScore}
          onChange={(e) => setForm((prev) => ({ ...prev, arabicScore: e.target.value }))}
          placeholder="Arabic score"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          disabled={!hasStudents}
        />
        <input
          type="number"
          min="0"
          max="100"
          value={form.islamicScore}
          onChange={(e) => setForm((prev) => ({ ...prev, islamicScore: e.target.value }))}
          placeholder="Islamic Studies score"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          disabled={!hasStudents}
        />
        <input
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Notes"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
          disabled={!hasStudents}
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white lg:col-span-4 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit}
        >
          {editingId ? 'Update Record' : 'Create Record'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

      <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student or notes"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={termFilter}
          onChange={(e) => setTermFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All Terms</option>
          {['First Term', 'Second Term', 'Third Term'].map((term) => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Classes</option>
          {classOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          value={performanceFilter}
          onChange={(e) => setPerformanceFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All Performance</option>
          <option value="high">70+ (High)</option>
          <option value="mid">50–69 (Mid)</option>
          <option value="low">Below 50 (Low)</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Madrasa records table</span>
          <button
            type="button"
            onClick={() => setShowRows((prev) => !prev)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          >
            {showRows ? 'Hide rows' : 'Show rows'}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">Qur'an Progress</th>
              <th className="px-3 py-2">Tajweed</th>
              <th className="px-3 py-2">Arabic</th>
              <th className="px-3 py-2">Islamic</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!showRows && (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-slate-600 text-center">
                  Rows are hidden. Click “Show rows” to display records.
                </td>
              </tr>
            )}
            {showRows && filteredRecords.map((record) => (
              <tr key={record.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {record.studentName || buildStudentCode({ id: record.studentId })}
                </td>
                <td className="px-3 py-2">{record.classLabel || '-'}</td>
                <td className="px-3 py-2">{record.term}</td>
                <td className="px-3 py-2">{record.quranPortion}</td>
                <td className="px-3 py-2">{record.tajweedLevel}</td>
                <td className="px-3 py-2">{record.arabicScore}</td>
                <td className="px-3 py-2">{record.islamicScore}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(record)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRecord(record.id)}
                      disabled={deletingId === record.id}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === record.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {showRows && !filteredRecords.length && (
              <tr>
                <td className="px-3 py-3 text-slate-600" colSpan={8}>No madrasa records yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default TeacherMadrasaRecords;
