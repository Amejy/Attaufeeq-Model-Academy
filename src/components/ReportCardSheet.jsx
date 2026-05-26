import SmartImage from './SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import { buildStudentCode } from '../utils/studentCode';
import { buildVerificationCode } from '../utils/resultVerification';

function resolveStudentPhoto(student = {}) {
  return student.photoUrl || student.avatarUrl || student.passportUrl || '';
}

function initials(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function cssUrl(value = '') {
  return `url("${String(value).replace(/"/g, '\\"')}")`;
}

function buildReportNumber(reportCard) {
  const institutionCode = String(reportCard?.institution || 'ATTAUFEEQ')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'ATF';
  const sessionCode = String(reportCard?.sessionId || '')
    .replace(/[^0-9]/g, '')
    .slice(-4) || new Date(reportCard?.generatedAt || Date.now()).getFullYear();
  const termCodeMap = {
    'First Term': 'FT',
    'Second Term': 'ST',
    'Third Term': 'TT'
  };
  const termCode = termCodeMap[reportCard?.term] || 'TR';
  const studentIdCode = String(reportCard?.student?.id || '0').replace(/[^0-9]/g, '').slice(-6).padStart(6, '0');
  return `${institutionCode}-${sessionCode}-${termCode}-${studentIdCode}`;
}

function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value, fallback = '—') {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function sumTestScore(row = {}) {
  return numericValue(row.test1) + numericValue(row.test2);
}

function buildGradeDistribution(rows = []) {
  const buckets = [
    { grade: 'A', color: '#16a34a', count: 0 },
    { grade: 'B', color: '#0ea5e9', count: 0 },
    { grade: 'C', color: '#f59e0b', count: 0 },
    { grade: 'D', color: '#f97316', count: 0 },
    { grade: 'E', color: '#ef4444', count: 0 },
    { grade: 'F', color: '#7f1d1d', count: 0 }
  ];
  const bucketMap = new Map(buckets.map((item) => [item.grade, item]));
  rows.forEach((row) => {
    const raw = String(row.grade || '').trim().toUpperCase();
    const key = bucketMap.has(raw)
      ? raw
      : raw.startsWith('A')
        ? 'A'
        : raw.startsWith('B')
          ? 'B'
          : raw.startsWith('C')
            ? 'C'
            : raw.startsWith('D')
              ? 'D'
              : raw.startsWith('E')
                ? 'E'
                : 'F';
    if (bucketMap.has(key)) {
      bucketMap.get(key).count += 1;
    }
  });
  const max = Math.max(1, ...buckets.map((item) => item.count));
  return buckets.map((item) => ({
    ...item,
    width: `${Math.max(item.count ? 22 : 0, (item.count / max) * 100)}%`
  }));
}

function resolveRemarkMeaning(remark = '') {
  const normalized = String(remark || '').trim().toLowerCase();
  if (normalized === 'outstanding') return 'Excellent performance';
  if (normalized === 'excellent') return 'Above average performance';
  if (normalized === 'very good') return 'Good performance';
  if (normalized === 'good') return 'Strong performance';
  if (normalized === 'satisfactory') return 'Average performance';
  if (normalized === 'needs improvement') return 'Below average performance';
  if (normalized === 'fair') return 'Average performance';
  if (normalized === 'pass') return 'Pass';
  if (normalized === 'fail') return 'Needs improvement';
  return '—';
}

const behaviorRows = [
  ['discipline', 'Discipline'],
  ['responsibility', 'Responsibility'],
  ['cooperation', 'Cooperation'],
  ['respect', 'Respect'],
  ['initiative', 'Initiative']
];

const defaultRemarkKeys = [
  ['Outstanding', 'Excellent performance'],
  ['Excellent', 'Above average performance'],
  ['Very Good', 'Good performance'],
  ['Satisfactory', 'Average performance'],
  ['Needs Improvement', 'Below average performance']
];

function InfoRow({ label, value, labelWidth = '95px' }) {
  return (
    <div className="sheet-info-row">
      <span className="sheet-info-label" style={{ width: labelWidth }}>{label}</span>
      <span className="sheet-info-colon">:</span>
      <span className="sheet-info-value">{value || '—'}</span>
    </div>
  );
}

function ReportCardSheet({ reportCard }) {
  const { siteContent } = useSiteContent();
  if (!reportCard) return null;

  const branding = siteContent?.branding || {};
  const about = siteContent?.about || {};
  const reportSettings = reportCard.reportSettings || {};
  const student = reportCard.student || {};
  const classInfo = reportCard.classInfo || {};
  const classLead = reportCard.classLead || {};
  const studentPhoto = resolveStudentPhoto(student);
  const studentCode = buildStudentCode(student, { institution: reportCard.institution });
  const verificationCode = buildVerificationCode({
    studentIdentifier: studentCode || student.id || '',
    term: reportCard.term || '',
    sessionId: reportCard.sessionId || ''
  });
  const attendanceSummary = reportCard.attendanceSummary || {};
  const behaviorRatings = reportCard.behaviorRatings || (typeof reportCard.behavior === 'object' ? reportCard.behavior : {});
  const issueDate = formatDate(reportCard.generatedAt);
  const schoolName = branding.name || 'ATTAUFEEQ International Academy';
  const watermarkSrc = branding.logoUrl || '/images/logo.png';
  const classLabel = classInfo.name ? `${classInfo.name} ${classInfo.arm || ''}`.trim() : student.level || '—';
  const remarksLegend = [...new Map(
    [
      ...defaultRemarkKeys,
      ...reportCard.rows
        .map((row) => String(row.remark || '').trim())
        .filter(Boolean)
        .map((remark) => [remark, resolveRemarkMeaning(remark)])
    ].map(([label, meaning]) => [label.toLowerCase(), [label, meaning]])
  ).values()];
  const gradeDistribution = buildGradeDistribution(reportCard.rows || []);
  const totalTest1 = (reportCard.rows || []).reduce((sum, row) => sum + numericValue(row.test1), 0);
  const totalTest2 = (reportCard.rows || []).reduce((sum, row) => sum + numericValue(row.test2), 0);
  const totalCa = (reportCard.rows || []).reduce((sum, row) => sum + numericValue(row.ca), 0);
  const totalExam = (reportCard.rows || []).reduce((sum, row) => sum + numericValue(row.exam), 0);
  const totalScore = formatScore(reportCard.totalScore);
  const averageScore = formatScore(reportCard.averageScore);
  const attendanceRate = attendanceSummary.totalSchoolDays
    ? `${attendanceSummary.attendanceRate}%`
    : reportCard.attendance || '—';
  const house = student.house || student.team || student.group || '—';
  const nextTermBegins = reportCard.nextTermBegins || 'Academic calendar not set.';
  const headTeacherName = reportSettings.headName || about.signatureName || about.signLabel || 'Head Teacher';
  const headTeacherTitle = reportSettings.headTitle || 'Head Teacher';
  const headTeacherSignature = reportSettings.signatureImage || about.signatureImage || '';
  const parentAcknowledgementText = reportSettings.parentAcknowledgementText || 'I have received and read this report.';
  const footerNote = reportSettings.footerNote || '';

  return (
    <section
      className="report-sheet report-sheet--reference mt-6 bg-white text-slate-900 print:mt-0"
      style={{ '--report-watermark-logo': cssUrl(watermarkSrc) }}
    >
      <style>{`
        @page { size: A4; margin: 8mm; }
        .report-sheet--reference {
          position: relative;
          isolation: isolate;
          font-family: "Arial", "Helvetica Neue", sans-serif;
          color: #1e293b;
          font-size: 11px;
          line-height: 1.35;
        }
        .report-sheet--reference::before {
          content: "";
          position: absolute;
          inset: 10% 4% 8%;
          z-index: -1;
          background-image:
            radial-gradient(circle at center, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.34) 54%, rgba(255, 255, 255, 0.58) 100%),
            var(--report-watermark-logo);
          background-position: center center, center 56%;
          background-repeat: no-repeat;
          background-size: 100% 100%, min(82%, 620px);
          opacity: 0.17;
          filter: saturate(1.22) contrast(1.1);
          pointer-events: none;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .report-sheet--reference * { box-sizing: border-box; }
        .report-sheet--reference > * {
          position: relative;
          z-index: 1;
        }
        .report-sheet--reference table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .report-sheet--reference th,
        .report-sheet--reference td {
          border: 1px solid rgba(148, 163, 184, 0.32);
          padding: 6px 8px;
          vertical-align: middle;
          overflow-wrap: anywhere;
        }
        .report-sheet--reference .sheet-topbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 18px;
          align-items: start;
        }
        .report-sheet--reference .sheet-brand {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          min-width: 0;
        }
        .report-sheet--reference .sheet-brand-logo {
          width: 76px;
          height: 76px;
          flex-shrink: 0;
          object-fit: contain;
        }
        .report-sheet--reference .sheet-school-name {
          margin: 2px 0 0;
          color: #133b76;
          font-size: 25px;
          font-weight: 800;
          letter-spacing: 0.08em;
          line-height: 1.05;
          text-transform: uppercase;
        }
        .report-sheet--reference .sheet-school-subtitle {
          margin-top: 4px;
          color: #334155;
          font-size: 12px;
          letter-spacing: 0.26em;
          text-transform: uppercase;
        }
        .report-sheet--reference .sheet-motto {
          margin-top: 10px;
          color: #475569;
          font-size: 11px;
        }
        .report-sheet--reference .sheet-meta {
          display: grid;
          gap: 8px;
          padding-top: 4px;
        }
        .report-sheet--reference .sheet-meta-row {
          display: grid;
          grid-template-columns: 104px 8px minmax(0, 1fr);
          gap: 6px;
          align-items: center;
          font-size: 11px;
        }
        .report-sheet--reference .sheet-meta-label {
          font-weight: 700;
          color: #334155;
        }
        .report-sheet--reference .sheet-meta-value {
          text-align: right;
          font-weight: 700;
          color: #0f172a;
        }
        .report-sheet--reference .sheet-title {
          margin: 18px 0 16px;
          color: #133b76;
          text-align: center;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .report-sheet--reference .sheet-card {
          border: 1px solid #93aace;
          border-radius: 6px;
          background: #fff;
          overflow: hidden;
        }
        .report-sheet--reference .sheet-card-title {
          background: #123b74;
          color: #fff;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .report-sheet--reference .sheet-student-band {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 150px;
          gap: 16px;
          align-items: stretch;
          padding: 10px 14px;
        }
        .report-sheet--reference .sheet-info-column {
          display: grid;
          gap: 12px;
          align-content: start;
        }
        .report-sheet--reference .sheet-info-row {
          display: grid;
          grid-template-columns: auto 10px minmax(0, 1fr);
          gap: 6px;
          align-items: start;
        }
        .report-sheet--reference .sheet-info-label {
          font-weight: 700;
          color: #334155;
          white-space: nowrap;
        }
        .report-sheet--reference .sheet-info-colon {
          text-align: center;
          color: #64748b;
        }
        .report-sheet--reference .sheet-info-value {
          font-weight: 700;
          color: #0f172a;
        }
        .report-sheet--reference .sheet-photo-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 124px;
          border-left: 1px solid rgba(148, 163, 184, 0.32);
          padding-left: 10px;
        }
        .report-sheet--reference .sheet-photo {
          width: 118px;
          height: 118px;
          object-fit: cover;
          border: 1px solid rgba(148, 163, 184, 0.4);
          background: #f8fafc;
        }
        .report-sheet--reference .sheet-body-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 238px;
          gap: 14px;
          align-items: start;
          margin-top: 14px;
        }
        .report-sheet--reference .sheet-side-stack {
          display: grid;
          gap: 10px;
        }
        .report-sheet--reference .sheet-table-head th {
          background: #f8fafc;
          color: #334155;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          text-align: left;
        }
        .report-sheet--reference .sheet-main-table tbody td {
          font-size: 10.5px;
        }
        .report-sheet--reference .sheet-center { text-align: center; }
        .report-sheet--reference .sheet-grade {
          font-weight: 800;
          color: #1f7a38;
        }
        .report-sheet--reference .sheet-total-row td {
          font-weight: 800;
          background: #f8fafc;
        }
        .report-sheet--reference .sheet-grade-scale {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          padding: 8px 10px 2px;
          color: #334155;
          font-size: 10px;
        }
        .report-sheet--reference .sheet-grade-scale strong {
          color: #0f172a;
        }
        .report-sheet--reference .sheet-side-table td:first-child {
          color: #334155;
          font-weight: 700;
        }
        .report-sheet--reference .sheet-attendance-rate {
          padding: 10px;
          text-align: center;
          border-top: 1px solid rgba(148, 163, 184, 0.32);
        }
        .report-sheet--reference .sheet-attendance-rate-label {
          color: #123b74;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .report-sheet--reference .sheet-attendance-rate-value {
          margin-top: 4px;
          color: #15803d;
          font-size: 20px;
          font-weight: 900;
        }
        .report-sheet--reference .sheet-tests-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 238px;
          gap: 14px;
          align-items: start;
          margin-top: 10px;
        }
        .report-sheet--reference .sheet-remark-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
          margin-top: 14px;
        }
        .report-sheet--reference .sheet-remark-copy {
          min-height: 90px;
          padding: 10px 12px;
          font-size: 11px;
          line-height: 1.6;
        }
        .report-sheet--reference .sheet-signature-row {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          margin-top: 12px;
        }
        .report-sheet--reference .sheet-signature-label {
          font-weight: 800;
          color: #0f172a;
        }
        .report-sheet--reference .sheet-signature-role {
          color: #334155;
          font-size: 10px;
        }
        .report-sheet--reference .sheet-signature-image {
          height: 42px;
          max-width: 120px;
          object-fit: contain;
        }
        .report-sheet--reference .sheet-bottom-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.95fr 0.95fr;
          gap: 14px;
          margin-top: 14px;
        }
        .report-sheet--reference .sheet-mini-card {
          border: 1px solid #93aace;
          border-radius: 6px;
          background: #fff;
          overflow: hidden;
        }
        .report-sheet--reference .sheet-mini-title {
          padding: 8px 10px 0;
          color: #123b74;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .report-sheet--reference .sheet-mini-body {
          padding: 8px 10px 10px;
        }
        .report-sheet--reference .sheet-line-field {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          align-items: center;
          color: #334155;
        }
        .report-sheet--reference .sheet-line-fill {
          flex: 1;
          border-bottom: 1px solid #64748b;
          height: 12px;
        }
        .report-sheet--reference .sheet-inline-icon {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 52px;
        }
        .report-sheet--reference .sheet-icon-badge {
          display: flex;
          width: 42px;
          height: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #eff6ff;
          color: #123b74;
          font-size: 19px;
          font-weight: 800;
          flex-shrink: 0;
        }
        .report-sheet--reference .sheet-inline-title {
          font-weight: 800;
          color: #0f172a;
        }
        .report-sheet--reference .sheet-inline-text {
          color: #334155;
          font-size: 11px;
        }
        .report-sheet--reference .sheet-summary-list {
          display: grid;
          gap: 9px;
          margin-top: 2px;
        }
        .report-sheet--reference .sheet-summary-row {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr) 18px;
          gap: 8px;
          align-items: center;
        }
        .report-sheet--reference .sheet-summary-bar {
          height: 7px;
          border-radius: 999px;
          background: #eef2f7;
          overflow: hidden;
        }
        .report-sheet--reference .sheet-summary-fill {
          height: 100%;
          border-radius: inherit;
        }
        .report-sheet--reference .sheet-summary-count {
          text-align: right;
          font-weight: 800;
          color: #334155;
        }
        .report-sheet--reference .sheet-footer {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 12px;
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid rgba(148, 163, 184, 0.45);
          color: #334155;
          font-size: 11px;
        }
        .report-sheet--reference .sheet-footer-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        @media screen and (max-width: 960px) {
          .report-sheet--reference .sheet-topbar,
          .report-sheet--reference .sheet-body-grid,
          .report-sheet--reference .sheet-tests-grid,
          .report-sheet--reference .sheet-remark-grid,
          .report-sheet--reference .sheet-bottom-grid,
          .report-sheet--reference .sheet-student-band {
            grid-template-columns: minmax(0, 1fr);
          }
          .report-sheet--reference .sheet-photo-wrap {
            border-left: 0;
            border-top: 1px solid rgba(148, 163, 184, 0.32);
            padding: 12px 0 0;
          }
        }
      `}</style>

      <div className="sheet-topbar">
        <div className="sheet-brand">
          <SmartImage
            src={branding.logoUrl || '/images/logo.png'}
            fallbackSrc="/images/logo.png"
            alt={`${schoolName} logo`}
            className="sheet-brand-logo"
          />
          <div className="min-w-0">
            <h1 className="sheet-school-name">{schoolName}</h1>
            <p className="sheet-school-subtitle">International Academy</p>
            <p className="sheet-motto">{branding.motto || 'Knowledge • Character • Excellence'}</p>
          </div>
        </div>

        <div className="sheet-meta">
          <div className="sheet-meta-row">
            <span className="sheet-meta-label">Report No.</span>
            <span>:</span>
            <span className="sheet-meta-value">{buildReportNumber(reportCard)}</span>
          </div>
          <div className="sheet-meta-row">
            <span className="sheet-meta-label">Academic Session</span>
            <span>:</span>
            <span className="sheet-meta-value">{reportCard.sessionId || '—'}</span>
          </div>
          <div className="sheet-meta-row">
            <span className="sheet-meta-label">Term</span>
            <span>:</span>
            <span className="sheet-meta-value">{reportCard.term || '—'}</span>
          </div>
          <div className="sheet-meta-row">
            <span className="sheet-meta-label">Date Issued</span>
            <span>:</span>
            <span className="sheet-meta-value">{issueDate}</span>
          </div>
        </div>
      </div>

      <h2 className="sheet-title">{String(reportCard.term || 'Term').toUpperCase()} REPORT SHEET</h2>

      <div className="sheet-card">
        <div className="sheet-student-band">
          <div className="sheet-info-column">
            <InfoRow label="Student Name" value={student.fullName || '—'} />
            <InfoRow label="Admission No." value={student.id || '—'} />
            <InfoRow label="Class" value={classLabel} />
            <InfoRow label="Form Teacher" value={classLead.fullName || '—'} />
          </div>
          <div className="sheet-info-column">
            <InfoRow label="Date of Birth" value={formatDate(student.dateOfBirth)} />
            <InfoRow label="Gender" value={student.gender || '—'} />
            <InfoRow label="House" value={house} />
            <InfoRow label="Code" value={studentCode || verificationCode} />
          </div>
          <div className="sheet-photo-wrap">
            {studentPhoto ? (
              <SmartImage
                src={studentPhoto}
                fallbackSrc="/images/logo.png"
                alt={student.fullName || 'Student'}
                className="sheet-photo"
              />
            ) : (
              <div className="sheet-photo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 800 }}>
                {initials(student.fullName || '')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sheet-body-grid">
        <div className="sheet-card">
          <div className="sheet-card-title">Academic Performance</div>
          <table className="sheet-main-table">
            <thead className="sheet-table-head">
              <tr>
                <th style={{ width: '5%' }}>S/N</th>
                <th style={{ width: '23%' }}>Subject</th>
                <th style={{ width: '10%' }}>Test 1 (20)</th>
                <th style={{ width: '10%' }}>Test 2 (20)</th>
                <th style={{ width: '10%' }}>CA (40)</th>
                <th style={{ width: '10%' }}>Exam (60)</th>
                <th style={{ width: '12%' }}>Total (100)</th>
                <th style={{ width: '10%' }}>Grade</th>
                <th style={{ width: '20%' }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {(reportCard.rows || []).map((row, index) => (
                <tr key={row.id || `${row.subjectName}-${index}`}>
                  <td className="sheet-center">{index + 1}</td>
                  <td>{row.subjectName || '—'}</td>
                  <td className="sheet-center">{formatScore(row.test1)}</td>
                  <td className="sheet-center">{formatScore(row.test2)}</td>
                  <td className="sheet-center">{formatScore(row.ca)}</td>
                  <td className="sheet-center">{formatScore(row.exam)}</td>
                  <td className="sheet-center">{formatScore(row.total)}</td>
                  <td className="sheet-center sheet-grade">{row.grade || '—'}</td>
                  <td>{row.remark || '—'}</td>
                </tr>
              ))}
              {!reportCard.rows?.length && (
                <tr>
                  <td colSpan={8} className="sheet-center">No report rows available for this term yet.</td>
                </tr>
              )}
              <tr className="sheet-total-row">
                <td colSpan={2} className="sheet-center">TOTAL</td>
                <td className="sheet-center">{formatScore(totalTest1)}</td>
                <td className="sheet-center">{formatScore(totalTest2)}</td>
                <td className="sheet-center">{formatScore(totalCa)}</td>
                <td className="sheet-center">{formatScore(totalExam)}</td>
                <td className="sheet-center">{totalScore}</td>
                <td className="sheet-center sheet-grade">{reportCard.overallGrade || '—'}</td>
                <td className="sheet-center">{averageScore}</td>
              </tr>
            </tbody>
          </table>
          <div className="sheet-grade-scale">
            <strong>Grade Scale:</strong>
            <span>70 - 100 (A)</span>
            <span>60 - 69 (B)</span>
            <span>50 - 59 (C)</span>
            <span>45 - 49 (D)</span>
            <span>40 - 44 (E)</span>
            <span>0 - 39 (F)</span>
          </div>
        </div>

        <div className="sheet-side-stack">
          <div className="sheet-card">
            <div className="sheet-card-title">Attendance</div>
            <table className="sheet-side-table">
              <tbody>
                <tr><td>Total School Days</td><td className="sheet-center">{attendanceSummary.totalSchoolDays ?? '—'}</td></tr>
                <tr><td>Days Present</td><td className="sheet-center">{attendanceSummary.daysPresent ?? '—'}</td></tr>
                <tr><td>Days Absent</td><td className="sheet-center">{attendanceSummary.daysAbsent ?? '—'}</td></tr>
                <tr><td>Late Coming</td><td className="sheet-center">{attendanceSummary.lateComing ?? '—'}</td></tr>
              </tbody>
            </table>
            <div className="sheet-attendance-rate">
              <div className="sheet-attendance-rate-label">Attendance %</div>
              <div className="sheet-attendance-rate-value">{attendanceRate}</div>
            </div>
          </div>

          <div className="sheet-card">
            <div className="sheet-card-title">Behaviour</div>
            <table className="sheet-side-table">
              <tbody>
                {behaviorRows.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="sheet-center sheet-grade">{behaviorRatings[key] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sheet-tests-grid">
        <div className="sheet-card">
          <div className="sheet-card-title">Assessment Breakdown</div>
          <table>
            <thead className="sheet-table-head">
              <tr>
                <th style={{ width: '26%' }}>Subject</th>
                <th style={{ width: '14%' }}>Test 1</th>
                <th style={{ width: '14%' }}>Test 2</th>
                <th style={{ width: '14%' }}>CA</th>
                <th style={{ width: '14%' }}>Exam</th>
                <th style={{ width: '18%' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(reportCard.rows || []).map((row, index) => (
                <tr key={`test-${row.id || index}`}>
                  <td>{row.subjectName || '—'}</td>
                  <td className="sheet-center">{formatScore(row.test1)}</td>
                  <td className="sheet-center">{formatScore(row.test2)}</td>
                  <td className="sheet-center">{formatScore(row.ca)}</td>
                  <td className="sheet-center">{formatScore(row.exam)}</td>
                  <td className="sheet-center">{formatScore(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sheet-card">
          <div className="sheet-card-title">Key To Remarks</div>
          <table className="sheet-side-table">
            <tbody>
              {remarksLegend.map(([label, meaning]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sheet-remark-grid">
        <div className="sheet-card">
          <div className="sheet-card-title">Class Teacher&apos;s Remark</div>
          <div className="sheet-remark-copy">
            <div>{reportCard.classTeacherRemark || 'No class teacher remark entered yet.'}</div>
            <div className="sheet-signature-row">
              <div>
                <div className="sheet-signature-label">{classLead.fullName || 'Class Teacher'}</div>
                <div className="sheet-signature-role">Class Teacher</div>
              </div>
              {classLead.signatureImage ? (
                <SmartImage
                  src={classLead.signatureImage}
                  fallbackSrc="/images/logo.png"
                  alt="Class teacher signature"
                  className="sheet-signature-image"
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="sheet-card">
          <div className="sheet-card-title">Head Teacher&apos;s Remark</div>
          <div className="sheet-remark-copy">
            <div>{reportCard.headTeacherRemark || 'No head teacher remark entered yet.'}</div>
            <div className="sheet-signature-row">
              <div>
                <div className="sheet-signature-label">{headTeacherName}</div>
                <div className="sheet-signature-role">{headTeacherTitle}</div>
              </div>
              {headTeacherSignature ? (
                <SmartImage
                  src={headTeacherSignature}
                  fallbackSrc="/images/logo.png"
                  alt="Head teacher signature"
                  className="sheet-signature-image"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="sheet-bottom-grid">
        <div className="sheet-mini-card">
          <div className="sheet-mini-title">Parent/Guardian Remark</div>
          <div className="sheet-mini-body">
            <div>{parentAcknowledgementText}</div>
            <div className="sheet-line-field"><span>Name:</span><span className="sheet-line-fill" /></div>
            <div className="sheet-line-field"><span>Signature:</span><span className="sheet-line-fill" /></div>
            <div className="sheet-line-field"><span>Date:</span><span className="sheet-line-fill" /></div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '14px' }}>
          <div className="sheet-mini-card">
            <div className="sheet-mini-title">Next Term Begins</div>
            <div className="sheet-mini-body">
              <div className="sheet-inline-icon">
                <div className="sheet-icon-badge">NT</div>
                <div>
                  <div className="sheet-inline-title">{nextTermBegins}</div>
                  <div className="sheet-inline-text">Next session resumption date</div>
                </div>
              </div>
            </div>
          </div>

          <div className="sheet-mini-card">
            <div className="sheet-mini-title">School Motto</div>
            <div className="sheet-mini-body">
              <div className="sheet-inline-icon">
                <div className="sheet-icon-badge">SM</div>
                <div>
                  <div className="sheet-inline-title">{branding.motto || 'Knowledge • Character • Excellence'}</div>
                  <div className="sheet-inline-text">{reportCard.institution || schoolName}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sheet-mini-card">
          <div className="sheet-mini-title">Grading Summary</div>
          <div className="sheet-mini-body">
            <div className="sheet-summary-list">
              {gradeDistribution.map((item) => (
                <div key={item.grade} className="sheet-summary-row">
                  <div className="sheet-signature-label">{item.grade}</div>
                  <div className="sheet-summary-bar">
                    <div className="sheet-summary-fill" style={{ width: item.width, background: item.color }} />
                  </div>
                  <div className="sheet-summary-count">{item.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sheet-footer">
        <div className="sheet-footer-item"><span>Tel</span><span>{branding.phone || '+234 800 123 4567'}</span></div>
        <div className="sheet-footer-item"><span>Email</span><span>{branding.email || 'info@attaufeeqacademy.sch.ng'}</span></div>
        <div className="sheet-footer-item"><span>Web</span><span>{branding.website || branding.domain || 'www.attaufeeqacademy.sch.ng'}</span></div>
        <div className="sheet-footer-item"><span>Address</span><span>{branding.address || 'Abuja, Nigeria'}</span></div>
      </div>
      {footerNote ? <div className="mt-3 text-center text-[10px] font-semibold text-slate-600">{footerNote}</div> : null}
    </section>
  );
}

export default ReportCardSheet;
