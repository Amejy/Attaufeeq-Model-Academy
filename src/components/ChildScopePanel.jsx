import { buildStudentCode } from '../utils/studentCode';

function ChildScopePanel({ children = [], activeChildId = '', onChange, heading = 'Linked Child', description = '' }) {
  if (!children.length) {
    return (
      <section className="mt-4 rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,rgba(250,204,21,0.12),rgba(251,146,60,0.08))] p-4 sm:rounded-[28px] sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Parent scope</p>
        <h3 className="mt-2 font-heading text-xl text-primary sm:text-2xl">{heading}</h3>
        <p className="mt-2 text-sm text-slate-700">
          No child is linked to this parent account yet. Ask admin to assign the correct guardian email on the student record.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(15,118,110,0.12),rgba(249,115,22,0.08))] p-4 sm:rounded-[28px] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Parent scope</p>
          <h3 className="mt-2 font-heading text-xl text-primary sm:text-2xl">{heading}</h3>
          {description && <p className="mt-2 max-w-3xl text-sm text-slate-700">{description}</p>}
        </div>
        {children.length > 1 && (
          <select
            value={activeChildId}
            onChange={(event) => onChange?.(event.target.value)}
            className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm sm:w-auto sm:px-4 sm:py-3"
          >
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.fullName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {children.map((child) => {
          const active = child.id === activeChildId;
          return (
            <article
              key={child.id}
              className={`rounded-[24px] border p-3 shadow-sm transition sm:p-4 ${
                active
                  ? 'border-teal-500 bg-white text-slate-900'
                  : 'surface-outline text-slate-700'
              }`}
            >
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold sm:text-lg">{child.fullName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{child.classLabel || child.level || 'Class pending'}</p>
                </div>
                <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:items-end">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${active ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
                    {active ? 'Active child' : 'Linked child'}
                  </span>
                  {child.accountStatus === 'graduated' && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-700">
                      Graduated
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Institution</p>
                  <p className="mt-2 text-sm font-medium">{child.institution || 'Unassigned'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Student Code</p>
                  <p className="mt-2 text-sm font-medium">{buildStudentCode(child)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default ChildScopePanel;
