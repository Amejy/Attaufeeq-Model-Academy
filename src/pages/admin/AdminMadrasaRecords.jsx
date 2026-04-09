import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { buildStudentCode } from '../../utils/studentCode';

function AdminMadrasaRecords() {
  const { apiJson } = useAuth();
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
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
    setError('');
    if (!preserveSuccess) {
      setSuccess('');
    }
    setStudents([]);
    setRecords([]);
    try {
      const [studentsData, recordsData] = await Promise.all([
        apiJson('/admin/students'),
        apiJson('/madrasa/admin/records')
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
    }
  }, [apiJson]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData({ preserveSuccess: true });
    });
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
    const endpoint = editingId ? `/madrasa/admin/records/${editingId}` : '/madrasa/admin/records';

    try {
      await apiJson(endpoint, {
        method,
        body: form
      });

      setSuccess(editingId ? 'Madrasa record updated.' : 'Madrasa record created.');
      resetForm(form.studentId || students[0]?.id || '');
      void loadData();
    } catch (err) {
      setError(err.message || 'Unable to save record.');
    }
  }

  async function deleteRecord(id) {
    setError('');
    setSuccess('');

    try {
      setDeletingId(id);
      await apiJson(`/madrasa/admin/records/${id}`, { method: 'DELETE' });

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

  return (
    <PortalLayout
      role="admin"
      title="Madrasa Learning Module"
      subtitle="Track Qur'an memorization, Tajweed progress, and Islamic studies assessments."
    >
      {!hasStudents && (
        <p className="text-sm text-slate-600">
          No students are available yet. Add a student before creating madrasa records.
        </p>
      )}

      <form onSubmit={submitRecord} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <select
          value={form.studentId}
          onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
          disabled={!hasStudents}
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName} ({buildStudentCode(student)})
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
          disabled={!canSubmit}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white lg:col-span-4 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {editingId ? 'Update Record' : 'Create Record'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">Qur'an Progress</th>
              <th className="px-3 py-2">Tajweed</th>
              <th className="px-3 py-2">Arabic</th>
              <th className="px-3 py-2">Islamic</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {record.studentName || buildStudentCode({ id: record.studentId })}
                </td>
                <td className="px-3 py-2">{record.term}</td>
                <td className="px-3 py-2">{record.quranPortion}</td>
                <td className="px-3 py-2">{record.tajweedLevel}</td>
                <td className="px-3 py-2">{record.arabicScore}</td>
                <td className="px-3 py-2">{record.islamicScore}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(record)} className="rounded-md border border-slate-300 px-3 py-1 text-xs">Edit</button>
                    <button type="button" disabled={deletingId === record.id} onClick={() => deleteRecord(record.id)} className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60">{deletingId === record.id ? 'Deleting...' : 'Delete'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default AdminMadrasaRecords;
