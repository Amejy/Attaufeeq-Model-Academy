import { useSiteContent } from '../context/SiteContentContext';
import { buildStudentCode } from '../utils/studentCode';

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

function SchoolReportMark({ institution }) {
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};
  const isMadrasa = String(institution || '').toLowerCase().includes('madrastul');
  const ring = isMadrasa ? '#b45309' : '#0f5132';
  const fill = isMadrasa ? '#fef3c7' : '#d1fae5';
  const logoSrc = branding.logoUrl || '/images/logo.png';

  return (
    <div className="flex items-center gap-4">
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={`${branding.name || 'ATTAUFEEQ'} logo`}
          className="h-16 w-16 rounded-2xl border border-slate-200 object-cover"
        />
      ) : (
        <svg viewBox="0 0 120 120" className="h-16 w-16" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill={fill} stroke={ring} strokeWidth="4" />
          <circle cx="60" cy="60" r="38" fill="white" stroke={ring} strokeWidth="3" />
          <path d="M34 73 60 35l26 38H34Z" fill={ring} opacity="0.95" />
          <path d="M46 67h28v6H46z" fill={fill} />
          <circle cx="60" cy="52" r="7" fill={fill} />
        </svg>
      )}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">{branding.domain || 'School Portal'}</p>
        <h2 className="font-heading text-2xl font-semibold text-primary">{branding.name || 'ATTAUFEEQ Model Academy'}</h2>
        <p className="text-xs text-slate-600">{branding.address || 'Barnawa, Kaduna South'}</p>
        <p className="text-xs text-slate-600">{branding.phone || '02014539252, 07030383103'}</p>
      </div>
    </div>
  );
}

function metricLabel(label, value) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function compactLabel(label, value) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-[12.5px] font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ReportCardSheet({ reportCard }) {
  if (!reportCard) return null;
  const { siteContent } = useSiteContent();
  const signatureImage = siteContent?.about?.signatureImage || '';
  const student = reportCard.student || {};
  const studentPhoto = resolveStudentPhoto(student);
  const classInfo = reportCard.classInfo || {};
  const termLabel = reportCard.term || '—';
  const sessionLabel = reportCard.sessionId || '—';
  const publishState = reportCard.publishState || 'Published';
  const studentCode = buildStudentCode(reportCard.student, { institution: reportCard.institution });
  const classPosition = reportCard.classRank && reportCard.classSize
    ? `${reportCard.classRank}/${reportCard.classSize}`
    : reportCard.classRank || reportCard.classSize || '—';
  const totalStudents = reportCard.classSize || '—';

  return (
    <section className="report-sheet mt-6 bg-white text-[11px] text-slate-900 print:mt-0">
      <style>{`
        @page { size: A4; margin: 20mm; }
        .report-sheet { font-family: "Times New Roman", Times, serif; }
        .report-sheet table { width: 100%; border-collapse: collapse; }
        .report-sheet th, .report-sheet td { border: 1px solid #d1d5db; padding: 4px 6px; }
        .report-sheet .page-break { page-break-before: always; break-before: page; }
        .report-sheet .no-border td { border: none; padding: 0; }
      `}</style>

      <div>
        <table className="no-border" style={{ marginBottom: '6px' }}>
          <tbody>
            <tr>
              <td style={{ width: '65%' }}>
                <SchoolReportMark institution={reportCard.institution} />
              </td>
              <td style={{ width: '20%', textAlign: 'right', verticalAlign: 'top' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b' }}>
                  Academic Report Sheet
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700 }}>{publishState}</div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  {new Date(reportCard.generatedAt).toLocaleString()}
                </div>
              </td>
              <td style={{ width: '15%', textAlign: 'right', verticalAlign: 'top' }}>
                <div style={{ border: '1px solid #d1d5db', width: '70px', height: '80px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {studentPhoto ? (
                    <img src={studentPhoto} alt={student.fullName || 'Student'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>{initials(student.fullName || '')}</span>
                  )}
                </div>
                <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>Passport</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr>
              <th style={{ width: '20%' }}>Student Name</th>
              <td style={{ width: '30%' }}>{student.fullName || '—'}</td>
              <th style={{ width: '20%' }}>Student Code</th>
              <td style={{ width: '30%' }}>{studentCode}</td>
            </tr>
            <tr>
              <th>Class</th>
              <td>{classInfo ? `${classInfo.name} ${classInfo.arm || ''}` : '—'}</td>
              <th>Institution</th>
              <td>{reportCard.institution || '—'}</td>
            </tr>
            <tr>
              <th>Term</th>
              <td>{termLabel}</td>
              <th>Session</th>
              <td>{sessionLabel}</td>
            </tr>
            <tr>
              <th>Class Position</th>
              <td>{classPosition}</td>
              <th>Total Students</th>
              <td>{totalStudents}</td>
            </tr>
            <tr>
              <th>Result Status</th>
              <td>{publishState}</td>
              <th>Attendance</th>
              <td>{reportCard.attendance || '—'}</td>
            </tr>
            <tr>
              <th>Behavior</th>
              <td>{reportCard.behavior || '—'}</td>
              <th>Signature / Stamp</th>
              <td>
                {signatureImage ? (
                  <img
                    src={signatureImage}
                    alt="Administrator signature"
                    style={{ height: '32px', maxWidth: '160px', objectFit: 'contain' }}
                  />
                ) : (
                  '______________________'
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="page-break" />

      <div>
        <table>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th>Subject</th>
              <th>CA</th>
              <th>Exam</th>
              <th>Total</th>
              <th>Grade</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {reportCard.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.subjectName}</td>
                <td>{row.ca}</td>
                <td>{row.exam}</td>
                <td>{row.total}</td>
                <td>{row.grade}</td>
                <td>{row.remark}</td>
              </tr>
            ))}
            {!reportCard.rows.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#64748b' }}>
                  No report rows available for this term yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <table style={{ marginTop: '6px' }}>
          <tbody>
            <tr>
              <th>Total Subjects</th>
              <td>{reportCard.totalSubjects}</td>
              <th>Total Score</th>
              <td>{reportCard.totalScore}</td>
              <th>Average</th>
              <td>{reportCard.averageScore}</td>
            </tr>
            <tr>
              <th>Overall Grade</th>
              <td>{reportCard.overallGrade}</td>
              <th>Remarks</th>
              <td colSpan={3}>{reportCard.overallGrade ? 'See subject remarks' : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ReportCardSheet;
