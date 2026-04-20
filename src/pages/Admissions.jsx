import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiJson } from '../utils/publicApi';

const PROGRAM_INSTITUTIONS = {
  modern: 'ATTAUFEEQ Model Academy',
  madrasa: 'Madrastul ATTAUFEEQ',
  memorization: 'Quran Memorization Academy'
};
const PROGRAMS_REQUIRING_CLASS = new Set(['modern', 'madrasa', 'memorization']);
const ADMISSION_DOC_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const ADMISSION_DOC_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx']);
const MAX_ADMISSION_DOC_SIZE = 20 * 1024 * 1024;

function getFileExtension(fileName = '') {
  const parts = String(fileName).trim().toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function isAllowedAdmissionDoc(file) {
  if (!file) return false;
  if (ADMISSION_DOC_MIMES.has(file.type)) return true;
  const ext = getFileExtension(file.name);
  return Boolean(ext && ADMISSION_DOC_EXTENSIONS.has(ext));
}

function Admissions() {
  const [classes, setClasses] = useState([]);
  const [program, setProgram] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    dateOfBirth: '',
    gender: '',
    guardianName: '',
    phone: '',
    email: '',
    studentEmail: '',
    previousSchool: '',
    classId: '',
    address: '',
    age: '',
    quranLevel: '',
    memorizationLevel: '',
    previousMadrasa: '',
    documents: []
  });
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [admissionPeriod, setAdmissionPeriod] = useState({
    isOpen: false,
    guardianEmailRequired: false,
    startDate: '',
    endDate: '',
    enabled: false,
    programs: {
      modern: { enabled: true, startDate: '', endDate: '', isOpen: false },
      madrasa: { enabled: true, startDate: '', endDate: '', isOpen: false },
      memorization: { enabled: true, startDate: '', endDate: '', isOpen: false }
    }
  });
  const [documentFiles, setDocumentFiles] = useState([]);
  const [documentError, setDocumentError] = useState('');
  const fileInputRef = useRef(null);

  const programClasses = useMemo(() => {
    if (!program) return [];
    const institution = PROGRAM_INSTITUTIONS[program];
    if (!institution) return [];
    return classes.filter((item) => item.institution === institution);
  }, [classes, program]);

  const selectedClass = useMemo(
    () => programClasses.find((item) => item.id === form.classId),
    [programClasses, form.classId]
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadOptions() {
      setLoadingOptions(true);
      setError('');

      try {
        const [data, periodData] = await Promise.all([
          apiJson('/admissions/options'),
          apiJson('/admissions/period').catch(() => null)
        ]);
        if (!isCurrent) return;

        const classOptions = data.classes || [];
        setClasses(classOptions);
        setForm((prev) => ({ ...prev, classId: classOptions?.[0]?.id || '' }));

        if (periodData) {
          setAdmissionPeriod(periodData.admissionPeriod || {
            isOpen: false,
            guardianEmailRequired: false,
            enabled: false,
            startDate: '',
            endDate: '',
            programs: {
              modern: { enabled: true, startDate: '', endDate: '', isOpen: false },
              madrasa: { enabled: true, startDate: '', endDate: '', isOpen: false },
              memorization: { enabled: true, startDate: '', endDate: '', isOpen: false }
            }
          });
        } else {
          setAdmissionPeriod({
            isOpen: false,
            guardianEmailRequired: false,
            enabled: false,
            startDate: '',
            endDate: '',
            programs: {
              modern: { enabled: true, startDate: '', endDate: '', isOpen: false },
              madrasa: { enabled: true, startDate: '', endDate: '', isOpen: false },
              memorization: { enabled: true, startDate: '', endDate: '', isOpen: false }
            }
          });
        }
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load class options.');
      } finally {
        if (isCurrent) {
          setLoadingOptions(false);
        }
      }
    }

    loadOptions();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!PROGRAMS_REQUIRING_CLASS.has(program)) {
      setForm((prev) => ({ ...prev, classId: '' }));
      return;
    }

    if (!programClasses.length) {
      setForm((prev) => ({ ...prev, classId: '' }));
      return;
    }

    if (!programClasses.some((item) => item.id === form.classId)) {
      setForm((prev) => ({ ...prev, classId: programClasses[0].id }));
    }
  }, [program, programClasses, form.classId]);

  async function uploadDocuments(files) {
    if (!files.length) return [];

    const invalid = files.filter((file) => !isAllowedAdmissionDoc(file));
    if (invalid.length) {
      throw new Error('One or more files are not supported. Upload PDF, Word, or image files only.');
    }
    const oversized = files.find((file) => file.size > MAX_ADMISSION_DOC_SIZE);
    if (oversized) {
      throw new Error('One or more files exceed the 20MB limit.');
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await apiFetch('/admissions/upload', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to upload admission documents.');
    }

    return data.files || [];
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleDocumentSelection(event) {
    const selected = Array.from(event.target.files || []);
    setDocumentError('');

    if (!selected.length) {
      setDocumentFiles([]);
      return;
    }

    const invalid = selected.filter((file) => !isAllowedAdmissionDoc(file));
    if (invalid.length) {
      setDocumentError('Only PDF, Word, or image files are allowed.');
    }

    const oversized = selected.filter((file) => file.size > MAX_ADMISSION_DOC_SIZE);
    if (oversized.length) {
      setDocumentError('Each file must be 20MB or smaller.');
    }

    const validFiles = selected.filter(
      (file) => isAllowedAdmissionDoc(file) && file.size <= MAX_ADMISSION_DOC_SIZE
    );
    setDocumentFiles(validFiles);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!program) {
        throw new Error('Please choose an admissions program to continue.');
      }
      const programIsOpen =
        program === 'modern'
          ? modernOpen
          : program === 'madrasa'
            ? madrasaOpen
            : memorizationOpen;
      if (!programIsOpen) {
        throw new Error('Admissions are currently closed for the selected program.');
      }
      if (!canSubmitApplication) {
        throw new Error('Complete the required admission fields before submitting.');
      }

      if (documentError) {
        throw new Error(documentError);
      }

      const uploadedDocuments = await uploadDocuments(documentFiles);
      const payload = {
        program,
        fullName: form.fullName,
        guardianName: form.guardianName,
        phone: form.phone,
        email: form.email,
        studentEmail: form.studentEmail,
        address: form.address,
        documents: uploadedDocuments
      };

      if (PROGRAMS_REQUIRING_CLASS.has(program)) {
        payload.classId = form.classId;
      }

      if (program === 'modern') {
        payload.dateOfBirth = form.dateOfBirth;
        payload.gender = form.gender;
        payload.previousSchool = form.previousSchool;
      }

      if (program === 'madrasa' || program === 'memorization') {
        payload.age = form.age;
        payload.quranLevel = form.quranLevel;
        payload.memorizationLevel = form.memorizationLevel;
        payload.previousMadrasa = form.previousMadrasa;
      }

      const data = await apiJson('/admissions', {
        method: 'POST',
        body: payload
      });

      setSuccess(`Application submitted. Reference ID: ${data.admission.id}`);
      setForm({
        fullName: '',
        dateOfBirth: '',
        gender: '',
        guardianName: '',
        phone: '',
        email: '',
        studentEmail: '',
        previousSchool: '',
        classId: '',
        address: '',
        age: '',
        quranLevel: '',
        memorizationLevel: '',
        previousMadrasa: '',
        documents: []
      });
      setProgram('');
      setDocumentFiles([]);
      setDocumentError('');
    } catch (err) {
      setError(err.message || 'Unable to submit application.');
    } finally {
      setLoading(false);
    }
  }

  const periodOpen = admissionPeriod.isOpen !== false;
  const programPeriods = admissionPeriod.programs || {};
  const modernPeriod = programPeriods.modern || {};
  const madrasaPeriod = programPeriods.madrasa || {};
  const memorizationPeriod = programPeriods.memorization || {};
  const modernOpen = programPeriods.modern ? modernPeriod.isOpen !== false : periodOpen;
  const madrasaOpen = programPeriods.madrasa ? madrasaPeriod.isOpen !== false : periodOpen;
  const memorizationOpen = programPeriods.memorization ? memorizationPeriod.isOpen !== false : periodOpen;
  const selectedProgramOpen = program
    ? program === 'modern'
      ? modernOpen
      : program === 'madrasa'
        ? madrasaOpen
        : memorizationOpen
    : false;
  const isModern = program === 'modern';
  const isMadrasa = program === 'madrasa';
  const isMemorization = program === 'memorization';
  const usesClassSelection = isModern || isMadrasa || isMemorization;
  const guardianEmailRequired = admissionPeriod.guardianEmailRequired !== false;
  const hasRequiredBaseFields = Boolean(
    form.fullName.trim() &&
    form.guardianName.trim() &&
    form.phone.trim() &&
    (!guardianEmailRequired || form.email.trim()) &&
    form.studentEmail.trim() &&
    form.address.trim()
  );
  const hasProgramSpecificFields = isModern
    ? Boolean(form.dateOfBirth && form.gender && form.previousSchool.trim())
    : Boolean(form.age && form.quranLevel.trim() && form.memorizationLevel.trim());
  const canSubmitApplication = Boolean(
    selectedProgramOpen &&
    hasRequiredBaseFields &&
    hasProgramSpecificFields &&
    (!usesClassSelection || (!loadingOptions && Boolean(form.classId) && programClasses.length))
  );
  const selectedProgramLabel = isModern
    ? 'ATTAUFEEQ Model Academy'
    : isMadrasa
      ? 'Madrastul ATTAUFEEQ'
      : 'Quran Memorization Academy';

  return (
    <main className="section-wrap py-14">
      <h1 className="break-words font-heading text-4xl text-primary">Admissions</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
        Submit your child&apos;s application and choose the exact class requested for placement after full admission confirmation.
      </p>

      {!periodOpen ? (
        <section className="glass-panel mt-8 max-w-4xl p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Admissions Locked</p>
          <h2 className="mt-3 break-words font-heading text-3xl text-primary">The admissions portal is currently unavailable.</h2>
          <p className="mt-4 text-sm leading-8 text-slate-700">
            Admin has not opened the public admission window yet. This page stays inaccessible for applications until the admission period is enabled.
          </p>
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <p className="font-semibold">Admission window status: closed</p>
            <p className="mt-2 text-sm">
              {modernPeriod.startDate && modernPeriod.endDate
                ? `ATTAUFEEQ Model Academy window: ${new Date(modernPeriod.startDate).toLocaleString()} to ${new Date(modernPeriod.endDate).toLocaleString()}.`
                : 'ATTAUFEEQ Model Academy window has not been published yet.'}
            </p>
            <p className="mt-2 text-sm">
              {madrasaPeriod.startDate && madrasaPeriod.endDate
                ? `Madrastul ATTAUFEEQ window: ${new Date(madrasaPeriod.startDate).toLocaleString()} to ${new Date(madrasaPeriod.endDate).toLocaleString()}.`
                : 'Madrastul ATTAUFEEQ window has not been published yet.'}
            </p>
            <p className="mt-2 text-sm">
              {memorizationPeriod.startDate && memorizationPeriod.endDate
                ? `Quran Memorization window: ${new Date(memorizationPeriod.startDate).toLocaleString()} to ${new Date(memorizationPeriod.endDate).toLocaleString()}.`
                : 'Quran Memorization window has not been published yet.'}
            </p>
          </div>
        </section>
      ) : (
      <>
        {!program ? (
          <section className="glass-panel mt-8 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Choose Program</p>
            <h2 className="mt-3 break-words font-heading text-3xl text-primary">Select the admissions pathway</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
              Pick the exact program to unlock the right form. Requirements differ for ATTAUFEEQ Model Academy, Madrasa, and Quran Memorization applicants.
            </p>

            <div className="admissions-select mt-6">
              <button
                type="button"
                className={`admissions-card ${modernOpen ? '' : 'opacity-60 cursor-not-allowed'}`}
                onClick={() => modernOpen && setProgram('modern')}
                disabled={!modernOpen}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Model School</p>
                <h3 className="mt-2 font-heading text-2xl text-primary">ATTAUFEEQ Model Academy</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Full academic curriculum, structured class placement, and digital campus access.
                </p>
                {!modernOpen && (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Currently closed</p>
                )}
              </button>

              <button
                type="button"
                className={`admissions-card ${madrasaOpen ? '' : 'opacity-60 cursor-not-allowed'}`}
                onClick={() => madrasaOpen && setProgram('madrasa')}
                disabled={!madrasaOpen}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Madrasa Program</p>
                <h3 className="mt-2 font-heading text-2xl text-primary">Madrastul ATTAUFEEQ</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Quran recitation, memorization tracking, and Islamic studies pathway.
                </p>
                {!madrasaOpen && (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Currently closed</p>
                )}
              </button>

              <button
                type="button"
                className={`admissions-card ${memorizationOpen ? '' : 'opacity-60 cursor-not-allowed'}`}
                onClick={() => memorizationOpen && setProgram('memorization')}
                disabled={!memorizationOpen}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quran Memorization</p>
                <h3 className="mt-2 font-heading text-2xl text-primary">Quran Memorization Academy</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Focused hifz pathway with dedicated memorization goals and revision cycles.
                </p>
                {!memorizationOpen && (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Currently closed</p>
                )}
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="admissions-form mt-8 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="break-words font-semibold">
                Selected program: {selectedProgramLabel}
              </p>
              <button
                type="button"
                onClick={() => setProgram('')}
                className="w-full rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 sm:w-auto"
              >
                Change Program
              </button>
            </div>
            {!selectedProgramOpen && (
              <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Admissions are currently closed for the selected program. Please switch programs or check back later.
              </div>
            )}

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Student Full Name</span>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Enter student full name"
              />
            </label>

            {isModern ? (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Date of Birth</span>
                <input
                  required
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            ) : (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Student Age</span>
                <input
                  required
                  type="number"
                  min="2"
                  value={form.age}
                  onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Enter age"
                />
              </label>
            )}

            {isModern && (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Gender</span>
                <select
                  required
                  value={form.gender}
                  onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">Select gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
            )}

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">{isModern ? 'Parent Name' : 'Guardian Name'}</span>
              <input
                required
                value={form.guardianName}
                onChange={(e) => setForm((prev) => ({ ...prev, guardianName: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Enter guardian name"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">{isModern ? 'Parent Phone' : 'Guardian Phone'}</span>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="e.g. +234..."
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Guardian Email</span>
              <input
                type="email"
                required={guardianEmailRequired}
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="parent@email.com"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {guardianEmailRequired
                  ? 'Required so portal access, approval updates, and password delivery can be sent automatically.'
                  : 'Used for portal access updates and password delivery when email delivery is enabled.'}
              </span>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Student Email</span>
              <input
                type="email"
                required
                value={form.studentEmail}
                onChange={(e) => setForm((prev) => ({ ...prev, studentEmail: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="student@email.com"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Used for student portal access and delivery of the one-time password.
              </span>
            </label>

            {isModern && (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Previous School</span>
                <input
                  required
                  value={form.previousSchool}
                  onChange={(e) => setForm((prev) => ({ ...prev, previousSchool: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Enter previous school"
                />
              </label>
            )}

            {usesClassSelection && (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Class Applying For</span>
                <select
                  required
                  disabled={loadingOptions || !programClasses.length}
                  value={form.classId}
                  onChange={(e) => setForm((prev) => ({ ...prev, classId: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  {!programClasses.length && (
                    <option value="">
                      {loadingOptions ? 'Loading class options...' : 'No classes available for this program yet'}
                    </option>
                  )}
                  {programClasses.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>
                      {classOption.label}
                    </option>
                  ))}
                </select>
                {!loadingOptions && !programClasses.length && (
                  <span className="mt-1 block text-xs text-amber-700">
                    No class is available for this program yet. Please contact the school before submitting this application.
                  </span>
                )}
              </label>
            )}

            {(isMadrasa || isMemorization) && (
              <>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Quran Reading Level</span>
                  <input
                    required
                    value={form.quranLevel}
                    onChange={(e) => setForm((prev) => ({ ...prev, quranLevel: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="Beginner / Intermediate / Advanced"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Memorization Level</span>
                  <input
                    required
                    value={form.memorizationLevel}
                    onChange={(e) => setForm((prev) => ({ ...prev, memorizationLevel: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g. Juz 1-3"
                  />
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-slate-700">
                    {isMadrasa ? 'Previous Madrasa (Optional)' : 'Previous Memorization School (Optional)'}
                  </span>
                  <input
                    value={form.previousMadrasa}
                    onChange={(e) => setForm((prev) => ({ ...prev, previousMadrasa: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder={isMadrasa ? 'Enter previous madrasa' : 'Enter previous memorization school'}
                  />
                </label>
              </>
            )}

            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Address</span>
              <textarea
                required
                rows={3}
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Enter home address"
              />
            </label>

            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Admission Documents (Optional)</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 hover:border-slate-400"
                >
                  {documentFiles.length ? 'Replace Files' : 'Choose Files'}
                </button>
                {documentFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDocumentFiles([])}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:border-slate-300"
                  >
                    Clear
                  </button>
                )}
                <span className="text-xs text-slate-500">
                  PDF, Word, or image files. Max 20MB each.
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,image/*"
                onClick={(event) => {
                  event.currentTarget.value = '';
                }}
                onChange={handleDocumentSelection}
                className="sr-only"
              />
              {documentError && <p className="mt-2 text-xs text-red-600">{documentError}</p>}
              {!!documentFiles.length && (
                <div className="mt-3 space-y-1 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                  {documentFiles.map((file) => (
                    <p key={`${file.name}-${file.size}`}>{file.name}</p>
                  ))}
                </div>
              )}
            </label>

            {usesClassSelection && (
              <div className="sm:col-span-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  Selected Institution: <span className="font-semibold">{selectedClass?.institution || '-'}</span>
                </p>
                <p>
                  Selected Class Details:{' '}
                  <span className="font-semibold">
                    {selectedClass ? `${selectedClass.name} ${selectedClass.arm}` : '-'}
                  </span>
                </p>
              </div>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={loading || !canSubmitApplication}
                className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}
      </>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
    </main>
  );
}

export default Admissions;
