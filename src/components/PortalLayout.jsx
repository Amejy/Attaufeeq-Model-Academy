import { useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from './PageHeader';
import SmartImage from './SmartImage';
import ThemeToggle from './ThemeToggle';
import Tooltip from './Tooltip';

const roleNav = {
  admin: [
    { label: 'Overview', to: '/portal/admin', feature: 'overview' },
    { label: 'Students', to: '/portal/admin/students', feature: 'students' },
    { label: 'Teachers', to: '/portal/admin/teachers', feature: 'teachers' },
    { label: 'Classes', to: '/portal/admin/classes', feature: 'classes' },
    { label: 'Subjects', to: '/portal/admin/subjects', feature: 'subjects' },
    { label: 'Assignments', to: '/portal/admin/teacher-assignments', feature: 'assignments' },
    { label: 'Results', to: '/portal/admin/results', feature: 'results' },
    { label: 'Result Tokens', to: '/portal/admin/result-tokens', feature: 'results' },
    { label: 'Promotion', to: '/portal/admin/promotions', feature: 'promotions' },
    { label: 'Admissions Access', to: '/portal/admin/admissions-access', feature: 'admissions' },
    { label: 'Library', to: '/portal/admin/library', feature: 'library' },
    { label: 'Timetable', to: '/portal/admin/timetable', feature: 'timetable' },
    { label: 'Attendance', to: '/portal/admin/attendance', feature: 'attendance' },
    { label: 'Notifications', to: '/portal/admin/notifications', feature: 'notifications' },
    { label: 'News & Events', to: '/portal/admin/news', feature: 'news' },
    { label: 'Website Content', to: '/portal/admin/website', feature: 'website' },
    { label: 'Reports', to: '/portal/admin/reports', feature: 'reports' },
    { label: 'Messages', to: '/portal/admin/messages', feature: 'messages' },
    { label: 'Security & Access', to: '/portal/admin/security', feature: 'security' },
    { label: 'System', to: '/portal/admin/system', feature: 'system' },
    { label: 'Settings', to: '/portal/settings' }
  ],
  admissions: [
    { label: 'Overview', to: '/portal/admissions', feature: 'overview' },
    { label: 'Admission Desk', to: '/portal/admissions/review', feature: 'admissions' },
    { label: 'Students', to: '/portal/admissions/students', feature: 'students' },
    { label: 'Fees', to: '/portal/admissions/fees', feature: 'fees' },
    { label: 'Result Tokens', to: '/portal/admissions/result-tokens', feature: 'result-tokens' },
    { label: 'News & Events', to: '/portal/admissions/news', feature: 'news' },
    { label: 'Library', to: '/portal/admissions/library', feature: 'library' },
    { label: 'Messages', to: '/portal/admissions/messages', feature: 'messages' },
    { label: 'Settings', to: '/portal/settings' }
  ],
  teacher: [
    { label: 'Overview', to: '/portal/teacher', feature: 'overview' },
    { label: 'Results', to: '/portal/teacher/results', feature: 'results' },
    { label: 'Attendance', to: '/portal/teacher/attendance', feature: 'attendance' },
    { label: 'Timetable', to: '/portal/teacher/timetable', feature: 'timetable' },
    { label: 'Upcoming Items', to: '/portal/teacher/upcoming' },
    { label: 'Madrasa Records', to: '/portal/teacher/madrasa', feature: 'madrasa' },
    { label: 'Notifications', to: '/portal/teacher/notifications', feature: 'notifications' },
    { label: 'Messages', to: '/portal/teacher/messages', feature: 'messages' },
    { label: 'Settings', to: '/portal/settings' }
  ],
  student: [
    { label: 'Overview', to: '/portal/student', feature: 'overview' },
    { label: 'Announcements', to: '/portal/student/announcements' },
    { label: 'Timetable', to: '/portal/student/timetable', feature: 'timetable' },
    { label: 'Attendance', to: '/portal/student/attendance', feature: 'attendance' },
    { label: 'Results', to: '/portal/student/results', feature: 'results' },
    { label: 'Fees', to: '/portal/student/fees', feature: 'fees' },
    { label: 'Library', to: '/portal/student/library', feature: 'library' },
    { label: 'Madrasa', to: '/portal/student/madrasa', feature: 'madrasa' },
    { label: 'Notifications', to: '/portal/student/notifications', feature: 'notifications' },
    { label: 'Messages', to: '/portal/student/messages', feature: 'messages' },
    { label: 'Settings', to: '/portal/settings' }
  ],
  parent: [
    { label: 'Overview', to: '/portal/parent', feature: 'overview' },
    { label: 'Timetable', to: '/portal/parent/timetable', feature: 'timetable' },
    { label: 'Attendance', to: '/portal/parent/attendance', feature: 'attendance' },
    { label: 'Results', to: '/portal/parent/results', feature: 'results' },
    { label: 'Fees', to: '/portal/parent/fees', feature: 'fees' },
    { label: 'Library', to: '/portal/parent/library', feature: 'library' },
    { label: 'Madrasa', to: '/portal/parent/madrasa', feature: 'madrasa' },
    { label: 'Notifications', to: '/portal/parent/notifications', feature: 'notifications' },
    { label: 'Messages', to: '/portal/parent/messages', feature: 'messages' },
    { label: 'Settings', to: '/portal/settings' }
  ]
};

function initials(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function PortalLayout({ role, title, subtitle, children, actions = null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const avatarUrl = user?.avatarUrl || user?.profile?.avatarUrl || '';

  const navItems = useMemo(() => {
    const items = roleNav[role] || [];
    if (role === 'admin' || user?.scope?.features?.includes('all')) return items;
    const allowedFeatures = user?.scope?.features || [];
    return items.filter((item) => !item.feature || allowedFeatures.includes(item.feature));
  }, [role, user?.scope?.features]);

  const institutionLabel = user?.scope?.institutionLabel || user?.profile?.institution || '';

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(13,148,136,0.12),transparent_42%),radial-gradient(circle_at_bottom,rgba(245,158,11,0.14),transparent_40%)]">
      <div className="mx-auto flex w-full max-w-[1600px] gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:px-8">
        <aside className="gradient-shell hidden w-80 shrink-0 overflow-hidden rounded-[34px] p-5 text-white shadow-[0_28px_80px_rgba(8,37,26,0.22)] lg:block">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[26px] border border-white/12 bg-white/10 p-4 backdrop-blur-md">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/18 text-sm font-bold">
                {avatarUrl ? (
                  <SmartImage src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                ) : (
                  initials(user?.fullName || 'U')
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{user?.fullName || 'User'}</p>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/70">{role} portal</p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          {institutionLabel && (
            <p className="mt-4 inline-flex rounded-full border border-white/18 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
              {institutionLabel}
            </p>
          )}

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    isActive ? 'bg-white text-primary shadow-lg' : 'bg-white/8 text-white/86 hover:bg-white/14'
                  }`
                }
              >
                <span className="block break-words">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 grid gap-2 border-t border-white/12 pt-5">
            <Tooltip text="Return to the public website">
              <Link to="/" className="interactive-button rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/14">
                Public Website
              </Link>
            </Tooltip>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[24px] border border-white/50 bg-white/74 p-3 shadow-[0_18px_40px_rgba(8,37,26,0.08)] backdrop-blur-xl sm:items-center sm:rounded-[28px] sm:p-4 lg:hidden">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{role} portal</p>
              <p className="break-words text-sm font-semibold text-primary sm:text-base">{user?.fullName || 'User'}</p>
              {institutionLabel && <p className="mt-1 break-words text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{institutionLabel}</p>}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-white/80">
                {avatarUrl ? (
                  <SmartImage src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                    {initials(user?.fullName || 'U')}
                  </div>
                )}
              </div>
              <ThemeToggle />
              <Tooltip text={open ? 'Close navigation menu' : 'Open navigation menu'}>
                <button
                  type="button"
                  onClick={() => setOpen((prev) => !prev)}
                  className="interactive-button rounded-full border border-slate-300 bg-white/85 px-3 py-2 text-[11px] font-semibold text-slate-700 sm:px-4 sm:text-xs"
                  aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
                >
                  Menu
                </button>
              </Tooltip>
            </div>
          </div>

          {open && (
            <div className="mb-4 glass-panel p-3 sm:p-4 lg:hidden">
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `block rounded-2xl px-3 py-2.5 text-sm font-semibold transition sm:px-4 sm:py-3 ${
                        isActive ? 'bg-primary text-white' : 'bg-white/70 text-slate-700 hover:bg-white'
                      }`
                    }
                  >
                    <span className="block break-words">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Tooltip text="Return to the public website">
                  <Link to="/" className="interactive-button rounded-full border border-slate-300 px-4 py-2 text-center text-xs font-semibold text-slate-700">
                    Website
                  </Link>
                </Tooltip>
              </div>
            </div>
          )}

          <section className="glass-panel relative overflow-hidden p-4 sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,81,50,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(217,179,84,0.12),transparent_30%)]" />
            <div className="relative">
              <PageHeader role={role} title={title} subtitle={subtitle} actions={actions} />
            </div>
            <div className="relative">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default PortalLayout;
