import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';
import { buildStudentCode } from '../../utils/studentCode';

function ManageLibrary() {
  const { apiJson, user } = useAuth();
  const managementBase = user?.role === 'admissions' ? '/operations' : '/admin';
  const defaultInstitution = ADMIN_INSTITUTIONS[0];
  const [books, setBooks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removingBookId, setRemovingBookId] = useState('');
  const [processingIssueId, setProcessingIssueId] = useState('');
  const [addingBook, setAddingBook] = useState(false);
  const [issuingBook, setIssuingBook] = useState(false);
  const [institutionFilter, setInstitutionFilter] = useState(defaultInstitution);
  const [issueSearch, setIssueSearch] = useState('');
  const [showInventoryRows, setShowInventoryRows] = useState(true);
  const [showIssueRows, setShowIssueRows] = useState(true);

  const [bookForm, setBookForm] = useState({
    title: '',
    author: '',
    category: '',
    institution: defaultInstitution,
    classId: '',
    isbn: '',
    totalCopies: ''
  });

  const [issueForm, setIssueForm] = useState({
    bookId: '',
    studentId: '',
    dueDate: '',
    borrowerName: '',
    borrowerContact: '',
    borrowerClass: ''
  });
  const [manualBorrower, setManualBorrower] = useState(false);
  const loadDataSeq = useRef(0);

  const loadData = useCallback(async (options = {}) => {
    const requestId = loadDataSeq.current + 1;
    loadDataSeq.current = requestId;
    const preserveSuccess = Boolean(options.preserveSuccess);
    setError('');
    if (!preserveSuccess) {
      setSuccess('');
    }
    setBooks([]);
    setClasses([]);
    setStudents([]);
    setIssues([]);
    try {
      const [booksData, classesData, studentsData, issuesData] = await Promise.all([
        apiJson('/library/admin/books'),
        apiJson(`${managementBase}/classes`),
        apiJson(`${managementBase}/students`),
        apiJson('/library/admin/issues')
      ]);

      if (loadDataSeq.current !== requestId) return;
      setBooks(booksData.books || []);
      setClasses(classesData.classes || []);
      setStudents(studentsData.students || []);
      setIssues(issuesData.issues || []);
    } catch (err) {
      if (loadDataSeq.current !== requestId) return;
      setError(err.message || 'Unable to load library module.');
    }
  }, [apiJson, managementBase]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  const scopedBooks = useMemo(
    () => books.filter((book) => canonicalInstitution(book.institution) === canonicalInstitution(institutionFilter)),
    [books, institutionFilter]
  );
  const issuableBooks = useMemo(
    () => scopedBooks.filter((book) => Number(book.availableCopies || 0) > 0),
    [scopedBooks]
  );
  const scopedClasses = useMemo(
    () => classes.filter((classItem) => canonicalInstitution(classItem.institution) === canonicalInstitution(institutionFilter)),
    [classes, institutionFilter]
  );
  const scopedStudents = useMemo(
    () => students.filter((student) => canonicalInstitution(student.institution) === canonicalInstitution(institutionFilter)),
    [institutionFilter, students]
  );
  const scopedIssues = useMemo(
    () => issues.filter((issue) => canonicalInstitution(issue.institution || institutionFilter) === canonicalInstitution(institutionFilter)),
    [institutionFilter, issues]
  );
  const selectedBook = useMemo(
    () => issuableBooks.find((book) => book.id === issueForm.bookId) || null,
    [issueForm.bookId, issuableBooks]
  );
  const eligibleStudents = useMemo(
    () => scopedStudents.filter((student) => (selectedBook?.classId ? student.classId === selectedBook.classId : true)),
    [scopedStudents, selectedBook?.classId]
  );
  const filteredIssues = useMemo(() => {
    const needle = issueSearch.trim().toLowerCase();
    if (!needle) return scopedIssues;
    return scopedIssues.filter((issue) =>
      `${issue.studentName || ''} ${issue.borrowerName || ''} ${buildStudentCode({ id: issue.studentId, institution: issue.institution || institutionFilter })}`
        .toLowerCase()
        .includes(needle)
    );
  }, [institutionFilter, issueSearch, scopedIssues]);
  const bookTotalCopies = Number(bookForm.totalCopies);
  const canAddBook = Boolean(
    scopedClasses.length &&
    bookForm.classId &&
    bookForm.title.trim() &&
    bookForm.author.trim() &&
    bookForm.category.trim() &&
    bookForm.isbn.trim() &&
    Number.isFinite(bookTotalCopies) &&
    bookTotalCopies > 0
  );
  const canIssueToSelectedStudent = Boolean(selectedBook) && Boolean(issueForm.dueDate) && (
    manualBorrower
      ? Boolean(issueForm.borrowerName.trim())
      : eligibleStudents.some((student) => student.id === issueForm.studentId)
  );

  useEffect(() => {
    queueMicrotask(() => {
      setBookForm((prev) => ({
        ...prev,
        institution: institutionFilter,
        classId: scopedClasses.some((classItem) => classItem.id === prev.classId)
          ? prev.classId
          : scopedClasses[0]?.id || ''
      }));
      setIssueForm((prev) => ({
        ...prev,
        bookId: issuableBooks.some((book) => book.id === prev.bookId) ? prev.bookId : issuableBooks[0]?.id || '',
        studentId: manualBorrower
          ? ''
          : eligibleStudents.some((student) => student.id === prev.studentId)
            ? prev.studentId
            : eligibleStudents[0]?.id || ''
      }));
    });
  }, [eligibleStudents, institutionFilter, issuableBooks, manualBorrower, scopedStudents, scopedClasses]);

  const totalCopies = scopedBooks.reduce((sum, book) => sum + Number(book.totalCopies || 0), 0);
  const soldCopies = scopedBooks.reduce(
    (sum, book) => sum + (Number(book.totalCopies || 0) - Number(book.availableCopies || 0)),
    0
  );

  async function addBook(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setAddingBook(true);

    try {
      await apiJson('/library/admin/books', {
        method: 'POST',
        body: bookForm
      });
      setSuccess('Book added to library.');
      setBookForm({
        title: '',
        author: '',
        category: '',
        institution: institutionFilter,
        classId: scopedClasses[0]?.id || '',
        isbn: '',
        totalCopies: ''
      });
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to add book.');
    } finally {
      setAddingBook(false);
    }
  }

  async function issueBook(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIssuingBook(true);

    try {
      await apiJson('/library/admin/issue', {
        method: 'POST',
        body: {
          bookId: issueForm.bookId,
          studentId: manualBorrower ? '' : issueForm.studentId,
          dueDate: issueForm.dueDate,
          borrowerName: manualBorrower ? issueForm.borrowerName : '',
          borrowerContact: manualBorrower ? issueForm.borrowerContact : '',
          borrowerClass: manualBorrower ? issueForm.borrowerClass : ''
        }
      });
      setSuccess('Book issued successfully.');
      setIssueForm((prev) => ({
        ...prev,
        borrowerName: '',
        borrowerContact: '',
        borrowerClass: ''
      }));
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to issue book.');
    } finally {
      setIssuingBook(false);
    }
  }

  async function returnBook(issueId) {
    setError('');
    setSuccess('');
    setProcessingIssueId(issueId);

    try {
      await apiJson(`/library/admin/return/${issueId}`, { method: 'POST' });
      setSuccess('Book returned successfully.');
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to return book.');
    } finally {
      setProcessingIssueId('');
    }
  }

  async function deleteIssue(issueId) {
    if (!window.confirm('Delete this returned issue record?')) {
      return;
    }

    setError('');
    setSuccess('');
    setProcessingIssueId(issueId);

    try {
      await apiJson(`/library/admin/issues/${issueId}`, { method: 'DELETE' });
      setSuccess('Returned issue record deleted.');
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to delete issue record.');
    } finally {
      setProcessingIssueId('');
    }
  }

  async function removeBook(book) {
    if (!window.confirm(`Remove "${book.title}" from inventory?`)) {
      return;
    }

    setError('');
    setSuccess('');
    setRemovingBookId(book.id);

    try {
      await apiJson(`/library/admin/books/${book.id}`, { method: 'DELETE' });
      setSuccess('Library material removed successfully.');
      void loadData();
    } catch (err) {
      setError(err.message || 'Unable to remove library material.');
    } finally {
      setRemovingBookId('');
    }
  }


  return (
    <PortalLayout
      role={user?.role || 'admin'}
      title="Library and Materials Store"
      subtitle="New arrivals, sold copies, and remaining stock are now visible per institution."
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${institutionAccent(institutionFilter)}`}>
            {institutionFilter}
          </p>
          <p className="mt-4 text-3xl font-bold text-slate-900">{scopedBooks.length}</p>
          <p className="mt-2 text-sm text-slate-600">Titles in this institution inventory.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Arrived</p>
          <p className="mt-4 text-3xl font-bold text-slate-900">{totalCopies}</p>
          <p className="mt-2 text-sm text-slate-600">Total copies stocked.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sold</p>
          <p className="mt-4 text-3xl font-bold text-slate-900">{soldCopies}</p>
          <p className="mt-2 text-sm text-slate-600">Copies already issued out.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Remaining</p>
          <p className="mt-4 text-3xl font-bold text-slate-900">{totalCopies - soldCopies}</p>
          <p className="mt-2 text-sm text-slate-600">Copies still available.</p>
        </article>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 rounded-[28px] border border-slate-200 bg-white p-5">
        <select value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
          {ADMIN_INSTITUTIONS.map((institution) => <option key={institution}>{institution}</option>)}
        </select>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-2xl text-primary">Add Library Material</h2>
          <form onSubmit={addBook} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={bookForm.title} onChange={(e) => setBookForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="rounded-2xl border border-slate-300 px-3 py-3 text-sm" required />
            <input value={bookForm.author} onChange={(e) => setBookForm((p) => ({ ...p, author: e.target.value }))} placeholder="Author" className="rounded-2xl border border-slate-300 px-3 py-3 text-sm" required />
            <input value={bookForm.category} onChange={(e) => setBookForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category" className="rounded-2xl border border-slate-300 px-3 py-3 text-sm" required />
            {scopedClasses.length ? (
              <select
                value={bookForm.classId}
                onChange={(e) => setBookForm((p) => ({ ...p, classId: e.target.value }))}
                className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
                required
              >
                {scopedClasses.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.name} {classItem.arm}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Add a class to this institution before posting library materials.
              </p>
            )}
            <input value={bookForm.isbn} onChange={(e) => setBookForm((p) => ({ ...p, isbn: e.target.value }))} placeholder="ISBN" className="rounded-2xl border border-slate-300 px-3 py-3 text-sm" required />
            <input type="number" min="1" value={bookForm.totalCopies} onChange={(e) => setBookForm((p) => ({ ...p, totalCopies: e.target.value }))} placeholder="Quantity arrived" className="rounded-2xl border border-slate-300 px-3 py-3 text-sm" required />
            <button
              type="submit"
              disabled={addingBook || !canAddBook}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
            >
              {addingBook ? 'Posting...' : 'Post New Arrival'}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-2xl text-primary">Allocate Material</h2>
          <form onSubmit={issueBook} className="mt-3 grid gap-3 sm:grid-cols-3">
            {issuableBooks.length ? (
              <select value={issueForm.bookId} onChange={(e) => setIssueForm((p) => ({ ...p, bookId: e.target.value }))} className="rounded-2xl border border-slate-300 px-3 py-3 text-sm" required>
                {issuableBooks.map((book) => (
                  <option key={book.id} value={book.id}>{book.title} ({book.availableCopies} available)</option>
                ))}
              </select>
            ) : (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No library materials currently have available copies in this institution.
              </p>
            )}
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-xs sm:col-span-2">
              <span className="text-slate-600">Manual borrower name</span>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={manualBorrower}
                  onChange={(e) => setManualBorrower(e.target.checked)}
                />
                Enable
              </label>
            </div>
            {!manualBorrower ? (
              eligibleStudents.length ? (
                <select value={issueForm.studentId} onChange={(e) => setIssueForm((p) => ({ ...p, studentId: e.target.value }))} className="rounded-2xl border border-slate-300 px-3 py-3 text-sm sm:col-span-2" required>
                  {eligibleStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.fullName} - {student.level || student.classLabel || student.classId} ({buildStudentCode(student)})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
                  No eligible students are available for the selected material&apos;s class.
                </p>
              )
            ) : (
              <>
                <input
                  value={issueForm.borrowerName}
                  onChange={(e) => setIssueForm((p) => ({ ...p, borrowerName: e.target.value }))}
                  placeholder="Borrower full name"
                  className="rounded-2xl border border-slate-300 px-3 py-3 text-sm sm:col-span-2"
                  required
                />
                <input
                  value={issueForm.borrowerContact}
                  onChange={(e) => setIssueForm((p) => ({ ...p, borrowerContact: e.target.value }))}
                  placeholder="Borrower phone (optional)"
                  className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
                />
                <input
                  value={issueForm.borrowerClass}
                  onChange={(e) => setIssueForm((p) => ({ ...p, borrowerClass: e.target.value }))}
                  placeholder="Class / Level (optional)"
                  className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
                />
              </>
            )}
            <input type="date" value={issueForm.dueDate} onChange={(e) => setIssueForm((p) => ({ ...p, dueDate: e.target.value }))} className="rounded-2xl border border-slate-300 px-3 py-3 text-sm" required />
            <button
              type="submit"
              disabled={issuingBook || !canIssueToSelectedStudent}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-3"
            >
              {issuingBook ? 'Issuing...' : 'Issue Material'}
            </button>
          </form>
        </section>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-2xl text-primary">Inventory View</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Inventory table</span>
            <button
              type="button"
              onClick={() => setShowInventoryRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {showInventoryRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Arrived</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!showInventoryRows && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-sm text-slate-600 text-center">
                    Rows are hidden. Click “Show rows” to display inventory.
                  </td>
                </tr>
              )}
              {showInventoryRows && scopedBooks.map((book) => (
                <tr key={book.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{book.title}</td>
                  <td className="px-4 py-3">{book.classLabel || '-'}</td>
                  <td className="px-4 py-3">{book.category}</td>
                  <td className="px-4 py-3">{book.totalCopies}</td>
                  <td className="px-4 py-3">{Number(book.totalCopies || 0) - Number(book.availableCopies || 0)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{book.availableCopies}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => removeBook(book)}
                      disabled={removingBookId === book.id}
                      className="rounded-2xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {removingBookId === book.id ? 'Removing...' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
              {showInventoryRows && !scopedBooks.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-sm text-slate-600">No library materials found for this institution.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-2xl text-primary">Issue and Return Records</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={issueSearch}
            onChange={(e) => setIssueSearch(e.target.value)}
            placeholder="Search borrower name or code"
            className="w-full max-w-sm rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Issue & return table</span>
            <button
              type="button"
              onClick={() => setShowIssueRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {showIssueRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Material Collected</th>
                <th className="px-4 py-3">Borrower</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Returned</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!showIssueRows && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-sm text-slate-600 text-center">
                    Rows are hidden. Click “Show rows” to display issue records.
                  </td>
                </tr>
              )}
              {showIssueRows && filteredIssues.map((issue) => (
                <tr key={issue.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{issue.bookTitle}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{issue.studentName || issue.borrowerName || '-'}</div>
                    {issue.studentId && (
                      <div className="mt-1 text-xs text-slate-500">
                        {buildStudentCode({ id: issue.studentId, institution: issue.institution || institutionFilter })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{issue.borrowerContact || '-'}</td>
                  <td className="px-4 py-3">{issue.classLabel || '-'}</td>
                  <td className="px-4 py-3">{new Date(issue.issuedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{new Date(issue.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{issue.returnedAt ? new Date(issue.returnedAt).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${issue.status === 'returned' ? 'bg-emerald-100 text-emerald-800' : issue.overdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'}`}>
                      {issue.status === 'returned' ? 'returned' : issue.overdue ? 'overdue' : 'issued'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {issue.status === 'returned' ? (
                      <button
                        type="button"
                        onClick={() => deleteIssue(issue.id)}
                        disabled={processingIssueId === issue.id}
                        className="rounded-2xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {processingIssueId === issue.id ? 'Deleting...' : 'Delete Record'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={processingIssueId === issue.id}
                        onClick={() => returnBook(issue.id)}
                        className="rounded-2xl border border-slate-300 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {processingIssueId === issue.id ? 'Updating...' : 'Mark Returned'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {showIssueRows && !filteredIssues.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-sm text-slate-600">No issue records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PortalLayout>
  );
}

export default ManageLibrary;
