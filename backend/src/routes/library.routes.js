import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findChildForParent, findChildrenForParent, findStudentByUser } from '../utils/portalScope.js';
import { isCountableActiveStudent } from '../utils/studentLifecycle.js';

const libraryRouter = Router();

function normalizeIsbn(value) {
  return String(value || '').trim().toLowerCase();
}

function getActiveSessionId() {
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((session) => session.isActive) || sessions[0] || null;
  return active?.id || '';
}

function resolveEnrollmentClassId(studentId, sessionId = '') {
  if (!studentId || !sessionId) return '';
  const enrollment = (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && entry.sessionId === sessionId
  );
  return enrollment?.classId || '';
}

function resolveLibraryClassId(student) {
  const activeSessionId = getActiveSessionId();
  return resolveEnrollmentClassId(student?.id, activeSessionId) || student?.classId || '';
}

function withBookDetails(issue) {
  const book = adminStore.libraryBooks.find((item) => item.id === issue.bookId);
  const student = adminStore.students.find((item) => item.id === issue.studentId);
  const classId = student ? resolveLibraryClassId(student) : '';
  const classItem = adminStore.classes.find((item) => item.id === classId);
  return {
    ...issue,
    bookTitle: book?.title || issue.bookTitle || issue.bookId,
    studentName: student?.fullName || issue.borrowerName || issue.studentId,
    borrowerContact: issue.borrowerContact || '',
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : issue.borrowerClass || student?.level || '',
    institution: student?.institution || issue.institution || book?.institution || '',
    overdue:
      issue.status === 'issued' && issue.dueDate
        ? new Date(issue.dueDate).getTime() < Date.now()
        : false
  };
}

function withBookClass(book) {
  const classItem = adminStore.classes.find((item) => item.id === book.classId);
  return {
    ...book,
    classLabel: classItem ? `${classItem.name} ${classItem.arm}` : book.classId || ''
  };
}

libraryRouter.get('/admin/books', requireAuth, requireRole('admin', 'admissions'), (_req, res) => {
  return res.json({ books: adminStore.libraryBooks.map(withBookClass) });
});

libraryRouter.post('/admin/books', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { title, author, category, institution, isbn, totalCopies, classId } = req.body || {};
  const normalizedTitle = String(title || '').trim();
  const normalizedAuthor = String(author || '').trim();
  const normalizedCategory = String(category || '').trim();
  const normalizedInstitution = String(institution || '').trim();
  const normalizedIsbn = String(isbn || '').trim();
  const normalizedIsbnKey = normalizeIsbn(isbn);
  const normalizedClassId = String(classId || '').trim();

  if (
    !normalizedTitle ||
    !normalizedAuthor ||
    !normalizedCategory ||
    !normalizedInstitution ||
    !normalizedIsbn ||
    totalCopies === undefined ||
    !normalizedClassId
  ) {
    return res.status(400).json({ message: 'title, author, category, institution, isbn, totalCopies, classId are required.' });
  }

  const copies = Number(totalCopies);
  if (!Number.isFinite(copies) || copies <= 0) {
    return res.status(400).json({ message: 'totalCopies must be a positive number.' });
  }

  const duplicateIsbn = adminStore.libraryBooks.some((item) => normalizeIsbn(item.isbn) === normalizedIsbnKey);
  if (duplicateIsbn) {
    return res.status(409).json({ message: 'Book with this ISBN already exists.' });
  }

  const classItem = adminStore.classes.find((item) => item.id === normalizedClassId);
  if (!classItem || classItem.institution !== normalizedInstitution) {
    return res.status(400).json({ message: 'classId must belong to the selected institution.' });
  }

  const book = {
    id: makeId('lib'),
    title: normalizedTitle,
    author: normalizedAuthor,
    category: normalizedCategory,
    institution: normalizedInstitution,
    classId: classItem.id,
    isbn: normalizedIsbn,
    totalCopies: copies,
    availableCopies: copies
  };

  adminStore.libraryBooks.unshift(book);
  return res.status(201).json({ book: withBookClass(book) });
});

libraryRouter.put('/admin/books/:id', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { id } = req.params;
  const index = adminStore.libraryBooks.findIndex((item) => item.id === id);

  if (index === -1) return res.status(404).json({ message: 'Book not found.' });

  const current = adminStore.libraryBooks[index];
  const issuedCount = adminStore.libraryIssues.filter(
    (issue) => issue.bookId === id && issue.status === 'issued'
  ).length;
  const nextTitle = String(req.body?.title ?? current.title).trim();
  const nextAuthor = String(req.body?.author ?? current.author).trim();
  const nextCategory = String(req.body?.category ?? current.category).trim();
  const nextInstitution = String(req.body?.institution ?? current.institution).trim();
  const nextIsbn = String(req.body?.isbn ?? current.isbn).trim();
  const nextIsbnKey = normalizeIsbn(nextIsbn);

  if (!nextTitle || !nextAuthor || !nextCategory || !nextInstitution || !nextIsbn) {
    return res.status(400).json({ message: 'title, author, category, institution, isbn are required.' });
  }

  const duplicateIsbn = adminStore.libraryBooks.some(
    (item) => item.id !== id && normalizeIsbn(item.isbn) === nextIsbnKey
  );
  if (duplicateIsbn) {
    return res.status(409).json({ message: 'Book with this ISBN already exists.' });
  }

  let nextClassId = current.classId || '';
  if (req.body?.classId !== undefined) {
    const requestedClassId = String(req.body.classId || '').trim();
    if (!requestedClassId) {
      return res.status(400).json({ message: 'classId is required for strict class-only visibility.' });
    }
    const classItem = adminStore.classes.find((item) => item.id === requestedClassId);
    if (!classItem || classItem.institution !== nextInstitution) {
      return res.status(400).json({ message: 'classId must belong to the selected institution.' });
    }
    nextClassId = classItem.id;
  }
  const nextClass = adminStore.classes.find((item) => item.id === nextClassId);
  if (!nextClass || nextClass.institution !== nextInstitution) {
    return res.status(400).json({ message: 'classId must belong to the selected institution.' });
  }

  const nextTotal = Number(req.body?.totalCopies ?? current.totalCopies);
  if (!Number.isFinite(nextTotal) || nextTotal < issuedCount) {
    return res.status(400).json({ message: `totalCopies cannot be less than issued copies (${issuedCount}).` });
  }

  const nextAvailable = Math.max(0, nextTotal - issuedCount);

  adminStore.libraryBooks[index] = {
    ...current,
    title: nextTitle,
    author: nextAuthor,
    category: nextCategory,
    institution: nextInstitution,
    classId: nextClassId,
    isbn: nextIsbn,
    totalCopies: nextTotal,
    availableCopies: nextAvailable
  };

  return res.json({ book: withBookClass(adminStore.libraryBooks[index]) });
});

libraryRouter.delete('/admin/books/:id', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { id } = req.params;
  const index = adminStore.libraryBooks.findIndex((item) => item.id === id);
  if (index === -1) return res.status(404).json({ message: 'Book not found.' });

  const activeIssue = adminStore.libraryIssues.some((issue) => issue.bookId === id && issue.status === 'issued');
  if (activeIssue) {
    return res.status(400).json({ message: 'Cannot delete a book with active issued records.' });
  }

  const hasIssueHistory = adminStore.libraryIssues.some((issue) => issue.bookId === id);
  if (hasIssueHistory) {
    return res.status(400).json({ message: 'Cannot delete a book with issue history. Remove the related issue records first.' });
  }

  adminStore.libraryBooks.splice(index, 1);
  return res.status(204).send();
});

libraryRouter.get('/admin/issues', requireAuth, requireRole('admin', 'admissions'), (_req, res) => {
  const rows = adminStore.libraryIssues
    .map(withBookDetails)
    .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
  return res.json({ issues: rows });
});

libraryRouter.post('/admin/issue', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { bookId, studentId, dueDate, borrowerName, borrowerContact, borrowerClass } = req.body || {};
  const normalizedBookId = String(bookId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();
  const normalizedBorrowerName = String(borrowerName || '').trim();
  const parsedDueDate = new Date(dueDate);

  if (!normalizedBookId || !dueDate || (!normalizedStudentId && !normalizedBorrowerName)) {
    return res.status(400).json({ message: 'bookId, dueDate, and borrowerName or studentId are required.' });
  }
  if (Number.isNaN(parsedDueDate.getTime())) {
    return res.status(400).json({ message: 'dueDate must be a valid date.' });
  }

  const book = adminStore.libraryBooks.find((item) => item.id === normalizedBookId);
  if (!book) return res.status(400).json({ message: 'Invalid bookId.' });

  const student = normalizedStudentId ? adminStore.students.find((item) => item.id === normalizedStudentId) : null;
  if (normalizedStudentId && !student) return res.status(400).json({ message: 'Invalid studentId.' });
  if (student && !isCountableActiveStudent(student)) {
    return res.status(400).json({ message: 'Only active students can borrow library books.' });
  }

  if (student && (student.institution || '') !== (book.institution || '')) {
    return res.status(400).json({ message: 'Book and student must belong to the same institution.' });
  }

  const studentClassId = student ? resolveLibraryClassId(student) : '';
  if (student && book.classId && studentClassId !== book.classId) {
    return res.status(400).json({ message: 'Book is restricted to a different class.' });
  }

  if (Number(book.availableCopies || 0) <= 0) {
    return res.status(400).json({ message: 'No available copies for this book.' });
  }

  const duplicateActiveIssue = adminStore.libraryIssues.some((issue) => {
    if (issue.bookId !== normalizedBookId || issue.status !== 'issued') {
      return false;
    }

    if (student?.id) {
      return issue.studentId === student.id;
    }

    return (
      !issue.studentId &&
      String(issue.borrowerName || '').trim().toLowerCase() === normalizedBorrowerName.toLowerCase()
    );
  });
  if (duplicateActiveIssue) {
    return res.status(409).json({ message: 'This borrower already has an active issued copy of the selected book.' });
  }

  const issue = {
    id: makeId('iss'),
    bookId: normalizedBookId,
    bookTitle: book.title,
    studentId: student?.id || '',
    borrowerName: student ? '' : normalizedBorrowerName,
    borrowerContact: String(borrowerContact || '').trim(),
    borrowerClass: String(borrowerClass || '').trim(),
    institution: student?.institution || book.institution || '',
    issuedAt: new Date().toISOString(),
    dueDate: parsedDueDate.toISOString(),
    returnedAt: '',
    status: 'issued'
  };

  adminStore.libraryIssues.unshift(issue);
  book.availableCopies = Number(book.availableCopies || 0) - 1;

  return res.status(201).json({ issue: withBookDetails(issue) });
});

libraryRouter.post('/admin/return/:issueId', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { issueId } = req.params;
  const issueIndex = adminStore.libraryIssues.findIndex((item) => item.id === issueId);

  if (issueIndex === -1) return res.status(404).json({ message: 'Issue record not found.' });

  const issue = adminStore.libraryIssues[issueIndex];
  if (issue.status === 'returned') {
    return res.status(400).json({ message: 'This issue record has already been marked as returned.' });
  }

  const book = adminStore.libraryBooks.find((item) => item.id === issue.bookId);
  if (book) {
    book.availableCopies = Math.min(book.totalCopies, Number(book.availableCopies || 0) + 1);
  }
  const returnedIssue = {
    ...issue,
    returnedAt: new Date().toISOString(),
    status: 'returned'
  };
  adminStore.libraryIssues[issueIndex] = returnedIssue;

  return res.json({ message: 'Book returned successfully.', issue: withBookDetails(returnedIssue) });
});

libraryRouter.delete('/admin/issues/:issueId', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { issueId } = req.params;
  const issueIndex = adminStore.libraryIssues.findIndex((item) => item.id === issueId);

  if (issueIndex === -1) return res.status(404).json({ message: 'Issue record not found.' });

  const issue = adminStore.libraryIssues[issueIndex];
  if (issue.status !== 'returned') {
    return res.status(400).json({ message: 'Only returned records can be deleted.' });
  }

  adminStore.libraryIssues.splice(issueIndex, 1);
  return res.json({ message: 'Issue record deleted.' });
});

libraryRouter.get('/student', requireAuth, requireRole('student'), (req, res) => {
  const student = findStudentByUser(req.user);
  const studentClassId = student ? resolveLibraryClassId(student) : '';
  const books = student
    ? adminStore.libraryBooks
        .filter((book) => book.institution === student.institution)
        .filter((book) => book.classId === studentClassId)
        .map(withBookClass)
    : [];

  if (!student) return res.json({ student: null, books, myIssues: [] });

  const myIssues = adminStore.libraryIssues
    .filter((item) => item.studentId === student.id)
    .map(withBookDetails)
    .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

  return res.json({ student, books, myIssues });
});

libraryRouter.get('/parent', requireAuth, requireRole('parent'), (req, res) => {
  const children = findChildrenForParent(req.user);
  const child = findChildForParent(req.user, String(req.query.childId || '')) || children[0] || null;
  const childClassId = child ? resolveLibraryClassId(child) : '';
  const books = child
    ? adminStore.libraryBooks
        .filter((book) => book.institution === child.institution)
        .filter((book) => book.classId === childClassId)
        .map(withBookClass)
    : [];

  if (!child) return res.json({ child: null, children, books, childIssues: [] });

  const childIssues = adminStore.libraryIssues
    .filter((item) => item.studentId === child.id)
    .map(withBookDetails)
    .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

  return res.json({ child, children, books, childIssues });
});

export default libraryRouter;
