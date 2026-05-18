import SmartImage from './SmartImage';
import { buildQrCodeUrl, buildResultCheckerUrl } from '../utils/resultVerification';

function ScratchIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.8 2.8 8.9 7 10 4.2-1.1 7-5.2 7-10V6l-7-3Z" />
      <path d="M9.5 12.5V11a2.5 2.5 0 1 1 5 0v1.5" />
      <path d="M8.5 12.5h7v5h-7z" />
    </svg>
  );
}

function ArrowIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className} aria-hidden="true">
      <path d="M2 12c10 0 16-8 26-8 8 0 14 6 20 10" />
      <path d="m42 8 8 6-8 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetaIcon({ type }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', className: 'h-6 w-6', 'aria-hidden': 'true' };

  if (type === 'student') {
    return (
      <svg {...common}>
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </svg>
    );
  }

  if (type === 'admission') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h4M7 13h3M14 9h3M14 13h3" />
        <circle cx="8.5" cy="15.5" r="1.5" />
      </svg>
    );
  }

  if (type === 'institution') {
    return (
      <svg {...common}>
        <path d="M3 10h18" />
        <path d="M5 10v8M10 10v8M14 10v8M19 10v8" />
        <path d="M2 18h20" />
        <path d="m12 3 9 4H3l9-4Z" />
      </svg>
    );
  }

  if (type === 'code') {
    return (
      <svg {...common}>
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13 4l-2 16" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 18h8" />
    </svg>
  );
}

function ScratchMetaRow({ icon, label, value, code = false }) {
  return (
    <div className="result-scratch-card__meta-row">
      <div className="result-scratch-card__meta-icon">
        <MetaIcon type={icon} />
      </div>
      <div className="min-w-0">
        <p className="result-scratch-card__meta-line">
          <span className="result-scratch-card__meta-label">{label}:</span>{' '}
          <span className={code ? 'text-code-break' : 'text-wrap-safe'}>{value || '—'}</span>
        </p>
      </div>
    </div>
  );
}

function ResultScratchCard({
  logoSrc = '/images/logo.png',
  schoolName = 'ATTAUFEEQ MODEL ACADEMY',
  title = 'ATTAUFEEQ RESULT TOKEN',
  studentName = '—',
  admissionNo = '—',
  institution = 'Model Academy',
  studentCode = '—',
  term = 'First Term',
  sessionId = '',
  token = '',
  secureLabel = 'Secure Token',
  secureNote = 'Keep this card safe'
}) {
  const verificationUrl = buildResultCheckerUrl({
    studentIdentifier: studentCode || admissionNo || '',
    term: term || '',
    sessionId: sessionId || '',
    token: token || '',
    origin: typeof window !== 'undefined' ? window.location.origin : ''
  });
  const qrCodeUrl = buildQrCodeUrl(verificationUrl, 220);

  return (
    <article className="result-scratch-card">
      <div className="result-scratch-card__hero">
        <div className="result-scratch-card__brand-block">
          <div className="result-scratch-card__logo-shell">
            <SmartImage src={logoSrc} fallbackSrc="/images/logo.png" alt={`${schoolName} logo`} className="result-scratch-card__logo" />
          </div>
          <div className="min-w-0">
            <h2 className="result-scratch-card__title">{title}</h2>
            <p className="result-scratch-card__school">{schoolName}</p>
          </div>
        </div>

        <div className="result-scratch-card__secure-pill">
          <ScratchIcon className="h-8 w-8" />
          <div className="min-w-0">
            <p className="result-scratch-card__secure-title">{secureLabel}</p>
            <p className="result-scratch-card__secure-note">{secureNote}</p>
          </div>
        </div>
      </div>

      <div className="result-scratch-card__content">
        <div className="result-scratch-card__details">
          <ScratchMetaRow icon="student" label="Student" value={studentName} />
          <ScratchMetaRow icon="admission" label="Admission No" value={admissionNo} code />
          <ScratchMetaRow icon="institution" label="Institution" value={institution} />
          <ScratchMetaRow icon="code" label="Student Code" value={studentCode} code />
          <ScratchMetaRow icon="calendar" label="Term" value={term} />
        </div>

        <div className="result-scratch-card__qr-panel">
          <div className="result-scratch-card__wave" aria-hidden="true" />
          <div className="result-scratch-card__qr-shell">
            <img src={qrCodeUrl} alt="Scan to verify result token" className="result-scratch-card__qr-image" />
            <p className="result-scratch-card__qr-caption">Scan to verify result token</p>
          </div>
        </div>
      </div>

      <div className="result-scratch-card__scratch-band">
        <div className="result-scratch-card__scratch-guide">
          <div className="result-scratch-card__scratch-icon-shell">
            <ScratchIcon className="h-10 w-10" />
          </div>
          <div className="result-scratch-card__scratch-copy-block">
            <p className="result-scratch-card__scratch-copy">Scratch gently to reveal code</p>
            <ArrowIcon className="result-scratch-card__scratch-arrow" />
          </div>
        </div>

        <div className="result-scratch-card__scratch-token">
          <span className="text-code-break">{token || 'PENDING TOKEN RELEASE'}</span>
        </div>
      </div>

      <div className="result-scratch-card__footer">
        <div className="result-scratch-card__footer-crest" aria-hidden="true">
          <div className="result-scratch-card__footer-crest-inner">
            <span className="result-scratch-card__footer-star">★</span>
          </div>
        </div>
        <p className="result-scratch-card__footer-note">This is a secure token. Do not share it with anyone.</p>
        <p className="result-scratch-card__footer-school">Thank you for choosing Attaufeeq Model Academy.</p>
      </div>
    </article>
  );
}

export default ResultScratchCard;
