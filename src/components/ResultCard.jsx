import { useMemo } from 'react';
import { useSiteContent } from '../context/SiteContentContext';

function initials(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function resolveStudentPhoto(student = {}) {
  return student.photoUrl || student.avatarUrl || student.passportUrl || '';
}

function ResultCard({ reportCard }) {
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};
  const about = siteContent.about || {};

  const student = reportCard?.student || {};
  const classInfo = reportCard?.classInfo || {};
  const schoolName = branding.name || 'ATTAUFEEQ Model Academy';
  const logoSrc = branding.logoUrl || '/images/logo.png';
  const signature = about.signatureImage || '';
  const signLabel = about.signLabel || 'Authorized Signature';

  const remarks = useMemo(() => {
    const grade = reportCard?.overallGrade || '';
    if (!grade) return '—';
    return grade === 'F' ? 'Fail' : 'Pass';
  }, [reportCard?.overallGrade]);

  if (!reportCard) return null;

  return (
    <div className="result-card" id="result-card-print">
      <header className="result-card__header">
        <div className="result-card__brand">
          <img src={logoSrc} alt={`${schoolName} logo`} className="result-card__logo" />
          <div>
            <p className="result-card__school">{schoolName}</p>
            <p className="result-card__tag">Academic Result Card</p>
          </div>
        </div>
        <div className="result-card__meta">
          <p><span>Session:</span> {reportCard.sessionId || '—'}</p>
          <p><span>Term:</span> {reportCard.term}</p>
          <p><span>Status:</span> {reportCard.publishState}</p>
        </div>
      </header>

      <section className="result-card__student">
        <div className="result-card__photo">
          {resolveStudentPhoto(student) ? (
            <img src={resolveStudentPhoto(student)} alt={student.fullName || 'Student'} />
          ) : (
            <span>{initials(student.fullName || '')}</span>
          )}
        </div>
        <div className="result-card__details">
          <div>
            <p>Student Name</p>
            <h3>{student.fullName || '—'}</h3>
          </div>
          <div>
            <p>Admission Number</p>
            <h3>{student.id || '—'}</h3>
          </div>
          <div>
            <p>Class / Level</p>
            <h3>{classInfo.name ? `${classInfo.name} ${classInfo.arm || ''}` : student.level || '—'}</h3>
          </div>
          <div>
            <p>Institution</p>
            <h3>{reportCard.institution}</h3>
          </div>
        </div>
      </section>

      <section className="result-card__scores">
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
                <td>{row.ca}</td>
                <td>{row.exam}</td>
                <td>{row.total}</td>
                <td>{row.grade}</td>
                <td>{row.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="result-card__summary">
        <div>
          <p>Total Subjects</p>
          <h3>{reportCard.totalSubjects}</h3>
        </div>
        <div>
          <p>Total Score</p>
          <h3>{reportCard.totalScore}</h3>
        </div>
        <div>
          <p>Average</p>
          <h3>{reportCard.averageScore}</h3>
        </div>
        <div>
          <p>Overall Grade</p>
          <h3>{reportCard.overallGrade}</h3>
        </div>
        <div>
          <p>Remarks</p>
          <h3>{remarks}</h3>
        </div>
      </section>

      <footer className="result-card__footer">
        <div>
          <p>{signLabel}</p>
          {signature ? (
            <img src={signature} alt="Signature" />
          ) : (
            <div className="result-card__signature-line" />
          )}
        </div>
        <div>
          <p>Result Status</p>
          <h4>{reportCard.publishState}</h4>
        </div>
      </footer>
    </div>
  );
}

export default ResultCard;
