import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { buildStudentCode } from '../utils/studentCode';
import PortalLayout from '../components/PortalLayout';
import ChildScopePanel from '../components/ChildScopePanel';
import AnimatedCounter from '../components/AnimatedCounter';
import { InsightBars, OrbitChart } from '../components/InsightChart';
import { DashboardSkeleton } from '../components/Skeleton';
import useParentChildSelection from '../hooks/useParentChildSelection';

function filterActions(actions, scopeFeatures = [], role = '') {
  if (role === 'admin' || scopeFeatures.includes('all')) return actions;
  return actions.filter((action) => !action.feature || scopeFeatures.includes(action.feature));
}

function parseNumber(value) {
  const digits = String(value ?? '').replace(/[^0-9.]/g, '');
  return digits ? Number(digits) : 0;
}

function normalizeBadge(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized
    .replace(/\s+/g, ' ')
    .replace(/(^|\\s)lead(\\s|$)/i, ' Lead ')
    .replace(/(^|\\s)class\\s+lead(\\s|$)/i, 'Class Lead')
    .replace(/\\bassigned\\b/i, 'Assigned')
    .trim();
}

function renderLeadRole(classLead) {
  return classLead?.assignmentRole || 'Not assigned yet';
}

function renderLeadContact(classLead) {
  return classLead?.email || 'Not assigned yet';
}

function MetricCard({ label, value, note, accent = 'linear-gradient(135deg, #0f5132, #d9b354)' }) {
  return (
    <article className="glass-card dashboard-tile floating-card relative overflow-hidden p-4 sm:p-5">
      <div className="absolute inset-x-4 top-0 h-1 rounded-full sm:inset-x-5" style={{ background: accent }} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 break-words font-heading text-[1.85rem] leading-none text-primary sm:mt-4 sm:text-[2.5rem]">
        <AnimatedCounter value={value} />
      </p>
      {note && <p className="mt-2.5 text-sm leading-6 text-slate-600 sm:mt-3">{note}</p>}
    </article>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="glass-card admin-surface p-4 sm:p-6">
      {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>}
      <h2 className="mt-2 font-heading text-[1.35rem] leading-tight text-primary sm:text-[1.7rem]">{title}</h2>
      <div className="mt-5 sm:mt-6">{children}</div>
    </section>
  );
}

function ActionGrid({ actions }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => (
        <Link
          key={action.label}
          to={action.to}
          className="surface-outline interactive-card rounded-[22px] px-3.5 py-3.5 text-sm font-semibold text-slate-700 sm:px-4 sm:py-4"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function DetailList({ items = [], emptyMessage }) {
  if (!items.length) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <DetailListItem key={item.title} item={item} />
      ))}
    </div>
  );
}

function DetailListItem({ item }) {
  const badge = normalizeBadge(item.badge);

  return (
    <article className="surface-outline dashboard-tile rounded-[22px] px-3.5 py-3.5 sm:px-4 sm:py-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          {item.description && <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>}
        </div>
        {badge && (
          <span className="max-w-full whitespace-normal break-words rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800 sm:text-[11px]">
            {badge}
          </span>
        )}
      </div>
    </article>
  );
}

function AdminView({ data }) {
  const metrics = data?.metrics || {};
  const balanceItems = [
    { label: 'Model Enrolled', value: metrics.modernEnrolled ?? 0, color: 'linear-gradient(90deg, #0f766e, #14b8a6)' },
    { label: 'Madrasa Enrolled', value: metrics.madrasaEnrolled ?? 0, color: 'linear-gradient(90deg, #a16207, #f59e0b)' },
    { label: 'Memorization Enrolled', value: metrics.memorizationEnrolled ?? 0, color: 'linear-gradient(90deg, #1e3a8a, #60a5fa)' },
    { label: 'Model Admitted', value: metrics.modernAdmitted ?? 0, color: 'linear-gradient(90deg, #166534, #22c55e)' },
    { label: 'Madrasa Admitted', value: metrics.madrasaAdmitted ?? 0, color: 'linear-gradient(90deg, #7c2d12, #fb923c)' },
    { label: 'Memorization Admitted', value: metrics.memorizationAdmitted ?? 0, color: 'linear-gradient(90deg, #1e40af, #93c5fd)' }
  ];
  const totalAdmitted = (metrics.modernAdmitted ?? 0) + (metrics.madrasaAdmitted ?? 0) + (metrics.memorizationAdmitted ?? 0);
  const totalEnrolled = Math.max(metrics.totalStudents ?? 0, totalAdmitted, 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Model Enrolled" value={metrics.modernEnrolled ?? 0} note="Students already inside the academy register." />
        <MetricCard label="Madrasa Enrolled" value={metrics.madrasaEnrolled ?? 0} note="Students already active in the madrasa register." accent="linear-gradient(135deg, #7c2d12, #f59e0b)" />
        <MetricCard label="Memorization Enrolled" value={metrics.memorizationEnrolled ?? 0} note="Students active in the memorization register." accent="linear-gradient(135deg, #1e3a8a, #60a5fa)" />
        <MetricCard label="ATTAUFEEQ Admitted" value={metrics.modernAdmitted ?? 0} note="Fully admitted into ATTAUFEEQ Model Academy with portal access." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard label="Madrasa Admitted" value={metrics.madrasaAdmitted ?? 0} note="Fully admitted into Madrastul ATTAUFEEQ." accent="linear-gradient(135deg, #92400e, #fbbf24)" />
        <MetricCard label="Memorization Admitted" value={metrics.memorizationAdmitted ?? 0} note="Fully admitted into Quran Memorization Academy." accent="linear-gradient(135deg, #1e40af, #93c5fd)" />
        <MetricCard label="Total Students" value={metrics.totalStudents ?? 0} note="Whole-school active count across both institutions." accent="linear-gradient(135deg, #0f172a, #475569)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <InsightBars
          title="Institution Balance"
          subtitle="A quick read on where admitted and fully active numbers are sitting across Model and Madrasa."
          items={balanceItems}
        />
        <OrbitChart
          title="Admitted To Active"
          value={totalAdmitted}
          maxValue={totalEnrolled}
          detail="This ring compares approved admissions against the current active student base."
          ringColor="#0f5132"
          glowColor="rgba(15,81,50,0.2)"
        />
      </div>

      <Panel title="Admin Quick Actions" eyebrow="Operations">
        <ActionGrid
          actions={[
            { label: 'Manage Students', to: '/portal/admin/students' },
            { label: 'Manage Teachers', to: '/portal/admin/teachers' },
            { label: 'Manage Classes', to: '/portal/admin/classes' },
            { label: 'Manage Subjects', to: '/portal/admin/subjects' },
            { label: 'Teacher Assignments', to: '/portal/admin/teacher-assignments' },
            { label: 'Publish Results', to: '/portal/admin/results' },
            { label: 'Result Tokens', to: '/portal/admin/result-tokens' },
            { label: 'Promote Students', to: '/portal/admin/promotions' },
            { label: 'Library Management', to: '/portal/admin/library' },
            { label: 'Timetable Management', to: '/portal/admin/timetable' },
            { label: 'Attendance Overview', to: '/portal/admin/attendance' },
            { label: 'Notifications', to: '/portal/admin/notifications' },
            { label: 'News & Events', to: '/portal/admin/news' },
            { label: 'Messages', to: '/portal/admin/messages' },
            { label: 'Admissions Access', to: '/portal/admin/admissions-access' },
            { label: 'System Tools', to: '/portal/admin/system' },
            { label: 'Generate Reports', to: '/portal/admin/reports' }
          ]}
        />
      </Panel>
    </div>
  );
}

function AdmissionsView({ data, scopeFeatures = [] }) {
  const actions = filterActions(
    [
      { label: 'Review Applications', to: '/portal/admissions/review', feature: 'admissions' },
      { label: 'Student Roster', to: '/portal/admissions/students', feature: 'students' },
      { label: 'Fee Management', to: '/portal/admissions/fees', feature: 'fees' },
      { label: 'Result Tokens', to: '/portal/admissions/result-tokens', feature: 'result-tokens' },
      { label: 'Publish News', to: '/portal/admissions/news', feature: 'news' },
      { label: 'Manage Library', to: '/portal/admissions/library', feature: 'library' },
      { label: 'Message Admin', to: '/portal/admissions/messages', feature: 'messages' }
    ],
    scopeFeatures
  );

  const metrics = data?.metrics || {};
  const workflowItems = [
    { label: 'Model Pending', value: metrics.modernPending ?? 0, color: 'linear-gradient(90deg, #155e75, #38bdf8)' },
    { label: 'Madrasa Pending', value: metrics.madrasaPending ?? 0, color: 'linear-gradient(90deg, #92400e, #f59e0b)' },
    { label: 'Memorization Pending', value: metrics.memorizationPending ?? 0, color: 'linear-gradient(90deg, #1e3a8a, #60a5fa)' },
    { label: 'Model Admitted', value: metrics.modernAdmitted ?? 0, color: 'linear-gradient(90deg, #166534, #22c55e)' },
    { label: 'Madrasa Admitted', value: metrics.madrasaAdmitted ?? 0, color: 'linear-gradient(90deg, #78350f, #fbbf24)' },
    { label: 'Memorization Admitted', value: metrics.memorizationAdmitted ?? 0, color: 'linear-gradient(90deg, #1e40af, #93c5fd)' }
  ];
  const totalPending = (metrics.modernPending ?? 0) + (metrics.madrasaPending ?? 0) + (metrics.memorizationPending ?? 0);
  const totalAdmitted = metrics.totalApprovedAdmissions ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Model Pending" value={metrics.modernPending ?? 0} note="Applications waiting for desk review." accent="linear-gradient(135deg, #155e75, #38bdf8)" />
        <MetricCard label="Madrasa Pending" value={metrics.madrasaPending ?? 0} note="Islamic track submissions awaiting review." accent="linear-gradient(135deg, #92400e, #f59e0b)" />
        <MetricCard label="Memorization Pending" value={metrics.memorizationPending ?? 0} note="Memorization applications awaiting review." accent="linear-gradient(135deg, #1e3a8a, #60a5fa)" />
        <MetricCard label="ATTAUFEEQ Admitted" value={metrics.modernAdmitted ?? 0} note="Fully admitted into ATTAUFEEQ Model Academy classes." accent="linear-gradient(135deg, #166534, #22c55e)" />
        <MetricCard label="Madrasa Admitted" value={metrics.madrasaAdmitted ?? 0} note="Fully admitted into Madrastul ATTAUFEEQ classes." accent="linear-gradient(135deg, #78350f, #fbbf24)" />
        <MetricCard label="Memorization Admitted" value={metrics.memorizationAdmitted ?? 0} note="Fully admitted into Quran Memorization Academy." accent="linear-gradient(135deg, #1e40af, #93c5fd)" />
        <MetricCard label="Total Admitted" value={totalAdmitted} note="Students fully admitted with completed desk processing." accent="linear-gradient(135deg, #0f172a, #475569)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <InsightBars
          title="Admission Workflow"
          subtitle="Pending and approved counts split by institution, so workload stays visible at a glance."
          items={workflowItems}
        />
        <OrbitChart
          title="Approval Pace"
          value={totalAdmitted}
          maxValue={Math.max(totalAdmitted + totalPending, 1)}
          detail="As pending work drops, this ring moves closer to full completion."
          ringColor="#d9b354"
          glowColor="rgba(217,179,84,0.22)"
        />
      </div>

      <Panel title="Admissions Desk Actions" eyebrow="Workflow">
        <ActionGrid actions={actions} />
      </Panel>
    </div>
  );
}

function TeacherView({ data, scopeFeatures = [] }) {
  const actions = filterActions(
    [
      { label: 'Result Entry', to: '/portal/teacher/results', feature: 'results' },
      { label: 'Attendance', to: '/portal/teacher/attendance', feature: 'attendance' },
      { label: 'Timetable', to: '/portal/teacher/timetable', feature: 'timetable' },
      { label: 'Upcoming Items', to: '/portal/teacher/upcoming' },
      { label: 'Madrasa Records', to: '/portal/teacher/madrasa', feature: 'madrasa' },
      { label: 'Notifications', to: '/portal/teacher/notifications', feature: 'notifications' },
      { label: 'Messages', to: '/portal/teacher/messages', feature: 'messages' }
    ],
    scopeFeatures
  );

  const classLoads = data?.classLoads || [];
  const loadItems = classLoads.map((item) => ({
    label: item.classLabel,
    value: item.studentCount,
    color: item.isLead ? 'linear-gradient(90deg, #0f5132, #22c55e)' : 'linear-gradient(90deg, #334155, #94a3b8)'
  }));
  const maxLoad = Math.max(...classLoads.map((item) => item.studentCount), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Assigned Classes" value={classLoads.length} note="Classes currently tied to your profile." />
        <MetricCard label="Students Handling" value={data?.totalStudents ?? 0} note="Current student load across all assigned classes." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard label="Assigned Subjects" value={(data?.assignedSubjects || []).length} note="Subjects you are expected to teach or supervise." accent="linear-gradient(135deg, #92400e, #f59e0b)" />
        <MetricCard label="Lead Classes" value={classLoads.filter((item) => item.isLead).length} note="Classes where you are marked as class lead." accent="linear-gradient(135deg, #0f172a, #475569)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <InsightBars
          title="Student Load By Class"
          subtitle="A teacher should be able to read the class burden immediately, especially when lead responsibility is involved."
          items={loadItems}
        />
        <OrbitChart
          title="Load Spread"
          value={data?.totalStudents ?? 0}
          maxValue={Math.max(maxLoad * Math.max(classLoads.length, 1), 1)}
          detail="This ring gives a rough sense of how full your combined class capacity feels."
          ringColor="#0f766e"
          glowColor="rgba(20,184,166,0.18)"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Teaching Load" eyebrow="Assignments">
          <DetailList
            items={classLoads.map((item) => ({
              title: item.classLabel,
              description: `${item.studentCount} students under your care.`,
              badge: item.isLead ? 'Class Lead' : 'Assigned'
            }))}
            emptyMessage="No class load assigned yet."
          />
        </Panel>
        <Panel title="Assigned Subjects" eyebrow="Curriculum">
          <DetailList
            items={(data?.assignedSubjects || []).map((item) => ({
              title: item,
              description: 'Available in your teaching scope.'
            }))}
            emptyMessage="No subjects assigned yet."
          />
        </Panel>
      </div>

      <Panel title="Pending Tasks" eyebrow="Next Actions">
        <DetailList
          items={(data?.pendingTasks || []).map((item) => ({
            title: item,
            description: 'Keep this moving so your class flow stays current.'
          }))}
          emptyMessage="No pending tasks."
        />
        <div className="mt-5">
          <ActionGrid actions={actions} />
        </div>
      </Panel>
    </div>
  );
}

function StudentView({ data, scopeFeatures = [] }) {
  const actions = filterActions(
    [
      { label: 'My Results', to: '/portal/student/results', feature: 'results' },
      { label: 'Announcements', to: '/portal/student/announcements' },
      { label: 'Timetable', to: '/portal/student/timetable', feature: 'timetable' },
      { label: 'Attendance', to: '/portal/student/attendance', feature: 'attendance' },
      { label: 'Fee Status', to: '/portal/student/fees', feature: 'fees' },
      { label: 'Notifications', to: '/portal/student/notifications', feature: 'notifications' },
      { label: 'Madrasa', to: '/portal/student/madrasa', feature: 'madrasa' },
      { label: 'Library', to: '/portal/student/library', feature: 'library' },
      { label: 'Messages', to: '/portal/student/messages', feature: 'messages' }
    ],
    scopeFeatures
  );

  const upcomingItems = data?.upcomingItems || [];
  const normalizedUpcoming = upcomingItems
    .map((item) => (typeof item === 'string' ? { title: item } : item))
    .filter(Boolean);
  const attendanceValue = parseNumber(data?.attendance);
  const normalizedInstitution = String(data?.institution || '').toLowerCase();
  const isIslamicTrack = normalizedInstitution.includes('madrastul')
    || normalizedInstitution.includes('quran');
  const chartMax = isIslamicTrack ? 10 : 100;
  const chartValue = isIslamicTrack ? normalizedUpcoming.length : attendanceValue;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Upcoming Items" value={normalizedUpcoming.length} note="Tests, submissions, or school tasks waiting ahead." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard label="Attendance" value={data?.attendance || 'N/A'} note="Current attendance reading from the school ledger." accent="linear-gradient(135deg, #92400e, #f59e0b)" />
        <MetricCard
          label="Class"
          value={data?.student?.classLabel || data?.student?.level || 'Pending'}
          note="Your active class placement."
          accent="linear-gradient(135deg, #0f172a, #475569)"
        />
      </div>
      <Panel title="Student Code" eyebrow="Identity">
        <div className="rounded-[22px] border border-white/55 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Your student code</p>
          <p className="mt-3 text-2xl font-semibold text-primary">
            {buildStudentCode(data?.student || {})}
          </p>
          <p className="mt-2 text-xs text-slate-500">Keep this code handy for official records.</p>
        </div>
      </Panel>

      {data?.student?.accountStatus === 'graduated' && (
        <Panel title="Graduation Status" eyebrow="Alumni">
          <p className="text-sm text-slate-600">
            You have completed the highest class level in this track. Your results remain available in your portal history.
          </p>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <Panel title="Upcoming Items" eyebrow="Focus">
          <DetailList
            items={normalizedUpcoming.map((item) => {
              const hasDate = item?.dueDate && !Number.isNaN(new Date(item.dueDate).getTime());
              const dueLabel = hasDate ? `Due ${new Date(item.dueDate).toLocaleDateString()}` : '';
              const teacherLabel = item?.teacherName ? `Posted by ${item.teacherName}` : 'Posted by class teacher';
              const description = dueLabel ? `${dueLabel} • ${teacherLabel}` : teacherLabel;
              return {
                title: item?.title || 'Upcoming item',
                description
              };
            })}
            emptyMessage="No upcoming items right now."
          />
        </Panel>
        <OrbitChart
          title={isIslamicTrack ? 'Upcoming Load' : 'Attendance Pulse'}
          value={chartValue}
          maxValue={chartMax}
          detail={isIslamicTrack
            ? 'This ring scales against a simple ten-item load so the dashboard still feels alive.'
            : 'Attendance is visualized so students can read consistency at a glance.'}
          ringColor={isIslamicTrack ? '#d9b354' : '#0f766e'}
          glowColor={isIslamicTrack ? 'rgba(217,179,84,0.2)' : 'rgba(20,184,166,0.18)'}
        />
      </div>

      <Panel title="Class Lead" eyebrow="Support">
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Teacher</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{data?.classLead?.fullName || 'Not assigned yet'}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Role</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{renderLeadRole(data?.classLead)}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{renderLeadContact(data?.classLead)}</p>
          </article>
        </div>
        <div className="mt-5">
          <ActionGrid actions={actions} />
        </div>
      </Panel>
    </div>
  );
}

function ParentView({ data, onChildChange, onTermChange, selectedTerm, scopeFeatures = [] }) {
  const children = data?.children || [];
  const child = data?.child || null;
  const actions = filterActions(
    [
      { label: 'View Timetable', to: '/portal/parent/timetable', feature: 'timetable' },
      { label: 'View Attendance', to: '/portal/parent/attendance', feature: 'attendance' },
      { label: 'View Results', to: '/portal/parent/results', feature: 'results' },
      { label: 'Check Fees', to: '/portal/parent/fees', feature: 'fees' },
      { label: 'Notifications', to: '/portal/parent/notifications', feature: 'notifications' },
      { label: 'Madrasa Progress', to: '/portal/parent/madrasa', feature: 'madrasa' },
      { label: 'Messages', to: '/portal/parent/messages', feature: 'messages' },
      { label: 'Library', to: '/portal/parent/library', feature: 'library' }
    ],
    scopeFeatures
  );

  const attendanceValue = parseNumber(data?.attendance);

  return (
    <div className="space-y-6">
      <ChildScopePanel
        children={children}
        activeChildId={child?.id || ''}
        onChange={onChildChange}
        heading="Linked Children"
        description="Every parent view is pinned to the selected child, so overview, results, attendance, and fees stay aligned."
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={selectedTerm}
          onChange={(event) => onTermChange(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-auto"
        >
          <option value="">Latest Term</option>
          {['First Term', 'Second Term', 'Third Term'].map((term) => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Linked Children" value={data?.linkedChildrenCount ?? children.length ?? 0} note="Total students connected to this parent account." />
        <MetricCard label="Active Child" value={child?.fullName || 'N/A'} note="The current child in focus across the portal." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard
          label={`Attendance${data?.attendanceTerm ? ` (${data.attendanceTerm})` : ''}`}
          value={data?.attendance || 'N/A'}
          note="Attendance readout for the selected child."
          accent="linear-gradient(135deg, #92400e, #f59e0b)"
        />
        <MetricCard label="Payment Status" value={data?.paymentStatus || 'N/A'} note="Fee position for the active child." accent="linear-gradient(135deg, #0f172a, #475569)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <Panel title="Child Identity" eyebrow="Profile">
          {child ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Class</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{child.classLabel || child.level || 'Pending'}</p>
              </article>
              <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Institution</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{child.institution || 'Pending'}</p>
              </article>
              <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Student Record</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{child.id}</p>
              </article>
              {child.accountStatus === 'graduated' && (
                <article className="rounded-[22px] border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Status</p>
                  <p className="mt-2 text-lg font-semibold text-amber-800">Graduated</p>
                </article>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Select a child to view details.</p>
          )}
        </Panel>
        <OrbitChart
          title="Attendance Pulse"
          value={attendanceValue}
          maxValue={100}
          detail="Parents get a quick visual signal before they dive into the detailed attendance ledger."
          ringColor="#0f5132"
          glowColor="rgba(15,81,50,0.18)"
        />
      </div>

      <Panel title="Class Lead" eyebrow="School Contact">
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Teacher</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{data?.classLead?.fullName || 'Not assigned yet'}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Role</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{renderLeadRole(data?.classLead)}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{renderLeadContact(data?.classLead)}</p>
          </article>
        </div>
      </Panel>

      <Panel title="Parent Actions" eyebrow="Shortcuts">
        <ActionGrid actions={actions} />
      </Panel>
    </div>
  );
}

function renderRoleContent(role, data, options = {}) {
  if (role === 'admin') return <AdminView data={data} />;
  if (role === 'admissions') return <AdmissionsView data={data} scopeFeatures={options.scopeFeatures} />;
  if (role === 'teacher') return <TeacherView data={data} scopeFeatures={options.scopeFeatures} />;
  if (role === 'student') return <StudentView data={data} scopeFeatures={options.scopeFeatures} />;
  if (role === 'parent') {
    return (
      <ParentView
        data={data}
        onChildChange={options.onChildChange}
        onTermChange={options.onTermChange}
        selectedTerm={options.selectedTerm}
        scopeFeatures={options.scopeFeatures}
      />
    );
  }
  return null;
}

function RoleDashboard({ role }) {
  const navigate = useNavigate();
  const { apiJson, logout, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(role, user);
  const [selectedTerm, setSelectedTerm] = useState('');

  useEffect(() => {
    if (role !== 'parent') return;
    setSelectedTerm('');
  }, [role, selectedChildId]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();
        if (role === 'parent' && selectedChildId) params.set('childId', selectedChildId);
        if (role === 'parent' && selectedTerm) params.set('term', selectedTerm);
        const query = params.toString() ? `?${params.toString()}` : '';
        const payload = await apiJson(`/dashboard/${role}${query}`);

        setData(payload);
        if (role === 'parent' && payload.child?.id && payload.child.id !== selectedChildId) {
          setSelectedChildId(payload.child.id);
        }
      } catch (err) {
        setError(err.message || 'Unable to load dashboard.');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [role, apiJson, logout, navigate, selectedChildId, selectedTerm, setSelectedChildId]);

  const subtitle = useMemo(() => {
    if (role === 'admin') return 'High-level school operations, admissions access control, and institution health in one view.';
    if (role === 'admissions') return 'Keep the review desk moving, split workload by institution, and watch approval flow in real time.';
    if (role === 'teacher') return 'Your class responsibility, subject scope, and next actions are organized into one calm workspace.';
    if (role === 'student') return 'A focused portal for learning, communication, and class guidance without clutter.';
    if (role === 'parent') return 'Track the selected child, view class leadership, and move quickly into the records that matter.';
    return 'Track activities, manage records, and move quickly between core school operations.';
  }, [role]);

  return (
    <PortalLayout
      role={role}
      title={`${role.toUpperCase()} Dashboard`}
      subtitle={subtitle}
    >
      {loading && <DashboardSkeleton />}
      {error && <p className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && data && renderRoleContent(role, data, {
        onChildChange: setSelectedChildId,
        onTermChange: setSelectedTerm,
        selectedTerm,
        scopeFeatures: user?.scope?.features || []
      })}
    </PortalLayout>
  );
}

export default RoleDashboard;
