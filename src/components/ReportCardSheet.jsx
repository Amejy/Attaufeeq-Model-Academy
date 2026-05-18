import SmartImage from './SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import { buildStudentCode } from '../utils/studentCode';
import { buildQrCodeUrl, buildResultCheckerUrl, buildVerificationCode } from '../utils/resultVerification';

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
        <SmartImage
          src={logoSrc}
          fallbackSrc="/images/logo.png"
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

function ReportCardSheet({ reportCard }) {
  const { siteContent } = useSiteContent();
  if (!reportCard) return null;
  const signatureImage = siteContent?.about?.signatureImage || '';
  const student = reportCard.student || {};
  const studentPhoto = resolveStudentPhoto(student);
  const classInfo = reportCard.classInfo || {};
  const termLabel = reportCard.term || '—';
  const sessionLabel = reportCard.sessionId || '—';
  const publishState = reportCard.publishState || 'Published';
  const studentCode = buildStudentCode(reportCard.student, { institution: reportCard.institution });
  const verificationLink = buildResultCheckerUrl({
    studentIdentifier: studentCode || student.id || '',
    term: reportCard.term || '',
    sessionId: reportCard.sessionId || '',
    origin: typeof window !== 'undefined' ? window.location.origin : ''
  });
  const verificationCode = buildVerificationCode({
    studentIdentifier: studentCode || student.id || '',
    term: reportCard.term || '',
    sessionId: reportCard.sessionId || ''
  });
  const qrCodeUrl = buildQrCodeUrl(verificationLink, 180);
  const classPosition = reportCard.classRank && reportCard.classSize
    ? `${reportCard.classRank}/${reportCard.classSize}`
    : reportCard.classRank || reportCard.classSize || '—';
  const totalStudents = reportCard.classSize || '—';
  const scoreCell = (score, note) => (
    <>
      <span>{score}</span>
      {note ? <div style={{ marginTop: '2px', fontSize: '8px', fontWeight: 700, color: '#b45309' }}>{note}</div> : null}
    </>
  );

  return (
    <section className="report-sheet mt-6 bg-white text-[11px] text-slate-900 print:mt-0">
      <style>{`
        @page { size: A4; margin: 10mm; }
        .report-sheet { font-family: "Times New Roman", Times, serif; }
        .report-sheet table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .report-sheet th, .report-sheet td { border: 1px solid #cbd5e1; padding: 3px 5px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
        .report-sheet th { background: #2f8bd8; color: #ffffff; font-weight: 700; }
        .report-sheet .soft-head { background: #eaf4ff; color: #0f172a; }
        .report-sheet .blue-panel { background: #2f8bd8; color: white; }
        .report-sheet .no-border td { border: none; padding: 0; }
      `}</style>

      <div>
        <table className="no-border" style={{ marginBottom: '6px' }}>
          <tbody>
            <tr>
              <td style={{ width: '65%' }}>
                <SchoolReportMark institution={reportCard.institution} />
                <div style={{ marginTop: '4px', textAlign: 'center', fontSize: '13px', fontWeight: 700 }}>
                  {termLabel} Pupil's Performance Report
                </div>
              </td>
              <td style={{ width: '20%', textAlign: 'right', verticalAlign: 'top' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b' }}>
                  Academic Report Sheet
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700 }}>{publishState}</div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  {new Date(reportCard.generatedAt).toLocaleString()}
                </div>
                <div style={{ marginTop: '8px', fontSize: '9px', color: '#475569' }}>
                  {verificationCode}
                </div>
              </td>
              <td style={{ width: '15%', textAlign: 'right', verticalAlign: 'top' }}>
                <div style={{ border: '1px solid #d1d5db', width: '70px', height: '80px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {studentPhoto ? (
                    <SmartImage
                      src={studentPhoto}
                      fallbackSrc="/images/logo.png"
                      alt={student.fullName || 'Student'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>{initials(student.fullName || '')}</span>
                  )}
                </div>
                <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>Passport</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ marginBottom: '6px' }}>
          <tbody>
            <tr>
              <th style={{ width: '20%' }}>Student Name</th>
              <td style={{ width: '30%', overflowWrap: 'anywhere' }}>{student.fullName || '—'}</td>
              <th style={{ width: '20%' }}>Student Code</th>
              <td style={{ width: '30%', overflowWrap: 'anywhere' }}>{studentCode}</td>
            </tr>
            <tr>
              <th>Class</th>
              <td>{classInfo ? `${classInfo.name} ${classInfo.arm || ''}` : '—'}</td>
              <th>Institution</th>
              <td style={{ overflowWrap: 'anywhere' }}>{reportCard.institution || '—'}</td>
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
              <th>Verification</th>
              <td style={{ wordBreak: 'break-word' }}>{verificationCode}</td>
              <th>Result Link</th>
              <td style={{ wordBreak: 'break-word' }}>{verificationLink}</td>
            </tr>
            <tr>
              <th>Behavior</th>
              <td>{reportCard.behavior || '—'}</td>
              <th>Signature / Stamp</th>
              <td>
                {signatureImage ? (
                  <SmartImage
                    src={signatureImage}
                    fallbackSrc="/images/logo.png"
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 148px', gap: '8px', alignItems: 'start' }}>
        <div>
        <div className="blue-panel" style={{ padding: '4px 6px', fontWeight: 700, marginBottom: '0' }}>Cognitive Domain</div>
        <table>
          <thead>
            <tr>
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
                <td>{scoreCell(row.ca, row.caNote)}</td>
                <td>{scoreCell(row.exam, row.examNote)}</td>
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
              <th className="soft-head">Total Subjects</th>
              <td>{reportCard.totalSubjects}</td>
              <th className="soft-head">Total Score</th>
              <td>{reportCard.totalScore}</td>
              <th className="soft-head">Average</th>
              <td>{reportCard.averageScore}</td>
            </tr>
            <tr>
              <th className="soft-head">Overall Grade</th>
              <td>{reportCard.overallGrade}</td>
              <th className="soft-head">Remarks</th>
              <td colSpan={3}>{reportCard.overallGrade ? 'See subject remarks' : '—'}</td>
            </tr>
          </tbody>
        </table>
        </div>
        <aside>
          <div className="blue-panel" style={{ padding: '6px', fontWeight: 700, textAlign: 'center' }}>Performance Summary</div>
          <table>
            <tbody>
              <tr><th className="soft-head">Total Obtainable</th><td>{reportCard.totalSubjects * 100}</td></tr>
              <tr><th className="soft-head">Total Score</th><td>{reportCard.totalScore}</td></tr>
              <tr><th className="soft-head">Average</th><td>{reportCard.averageScore}</td></tr>
              <tr><th className="soft-head">Grade</th><td>{reportCard.overallGrade}</td></tr>
              <tr><th className="soft-head">Position</th><td>{classPosition}</td></tr>
            </tbody>
          </table>
          <div className="blue-panel" style={{ marginTop: '8px', padding: '6px', fontWeight: 700, textAlign: 'center' }}>Attendance Summary</div>
          <table>
            <tbody>
              <tr><th className="soft-head">Attendance</th><td>{reportCard.attendance || '—'}</td></tr>
              <tr><th className="soft-head">Behavior</th><td>{reportCard.behavior || '—'}</td></tr>
            </tbody>
          </table>
        </aside>
      </div>
        {qrCodeUrl ? (
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
            <div style={{ fontSize: '10px', color: '#475569', maxWidth: '70%' }}>
              Scan the QR code or open this link to re-open the published result for verification:
              <div style={{ marginTop: '4px', wordBreak: 'break-word' }}>{verificationLink}</div>
            </div>
            <div style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '6px', background: '#fff' }}>
              <SmartImage
                src={qrCodeUrl}
                alt="Result verification QR code"
                style={{ width: '92px', height: '92px', objectFit: 'contain' }}
              />
            </div>
          </div>
        ) : null}
    </section>
  );
}

export default ReportCardSheet;
