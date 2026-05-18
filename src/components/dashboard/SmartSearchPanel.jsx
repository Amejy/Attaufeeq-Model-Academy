import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const ENTITY_LABELS = {
  all: 'All records',
  students: 'Students',
  teachers: 'Teachers',
  applications: 'Applications',
  receipts: 'Receipts',
  classes: 'Classes',
  results: 'Results',
  tokens: 'Tokens',
  tasks: 'Tasks',
  parents: 'Parents'
};

const ROLE_CONFIG = {
  admin: {
    entities: ['all', 'students', 'teachers', 'parents', 'applications', 'receipts', 'classes', 'results'],
    title: 'Smart Search',
    eyebrow: 'Unified Search',
    placeholder: 'Search students, parents, receipts, results, teachers, classes...'
  },
  admissions: {
    entities: ['all', 'applications', 'students', 'parents', 'receipts', 'tokens'],
    title: 'Smart Search',
    eyebrow: 'Unified Search',
    placeholder: 'Search applications, admitted students, parents, receipts, tokens...'
  },
  teacher: {
    entities: ['all', 'students', 'parents', 'results', 'classes', 'tasks'],
    title: 'Smart Search',
    eyebrow: 'Unified Search',
    placeholder: 'Search students, parents, class tasks, classes, results...'
  }
};

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];
const DATE_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' }
];

function labelize(value = '') {
  if (!value) return '';
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function SearchMetaPill({ children, tone = 'default' }) {
  const toneClass = tone === 'accent'
    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-800'
    : tone === 'warm'
      ? 'border-amber-200/80 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-white/75 text-slate-600';

  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}>
      {children}
    </span>
  );
}

function ResultCard({ item }) {
  const metadata = [item.roleLabel, item.categoryLabel, item.classLabel, item.activityTypeLabel].filter(Boolean);

  return (
    <article className="dashboard-tile rounded-[24px] p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-wrap-safe text-sm font-semibold text-slate-900 sm:text-[0.95rem]">{item.title}</p>
            {item.matchLabel && <SearchMetaPill tone="accent">{item.matchLabel}</SearchMetaPill>}
          </div>
          <p className="text-wrap-safe mt-2 text-sm leading-6 text-slate-600">{item.subtitle}</p>
          {metadata.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {metadata.map((meta) => (
                <SearchMetaPill key={`${item.id}-${meta}`}>{meta}</SearchMetaPill>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {item.status && <SearchMetaPill tone="warm">{labelize(item.status)}</SearchMetaPill>}
          <SearchMetaPill>{ENTITY_LABELS[item.entity] || labelize(item.entity)}</SearchMetaPill>
        </div>
      </div>
    </article>
  );
}

function SuggestionsList({ suggestions = [], onSelect, visible }) {
  if (!visible || !suggestions.length) return null;

  return (
    <div className="absolute inset-x-0 top-[calc(100%+0.75rem)] z-20 overflow-hidden rounded-[24px] border border-white/70 bg-white/96 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur-xl">
      <div className="grid gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={`${suggestion.type}-${suggestion.value}`}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="flex items-start justify-between gap-3 rounded-[18px] px-3 py-3 text-left transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="text-wrap-safe text-sm font-semibold text-slate-900">{suggestion.label}</p>
              <p className="text-wrap-safe mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{labelize(suggestion.type)}</p>
            </div>
            {typeof suggestion.count === 'number' && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {suggestion.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, options, placeholder, className = '' }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`rounded-2xl border border-slate-300/90 bg-white/80 px-3 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="glass-card admin-surface p-4 sm:p-6">
      {eyebrow && <p className="text-wrap-safe text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:tracking-[0.24em]">{eyebrow}</p>}
      <h2 className="text-wrap-safe mt-2 font-heading text-[clamp(1.2rem,3.8vw,1.7rem)] leading-tight text-primary">{title}</h2>
      <div className="mt-5 sm:mt-6">{children}</div>
    </section>
  );
}

function SmartSearchPanel({ role, apiJson, classes = [] }) {
  const config = ROLE_CONFIG[role];
  const [query, setQuery] = useState('');
  const [entity, setEntity] = useState('all');
  const [status, setStatus] = useState('');
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [activityType, setActivityType] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [sortBy, setSortBy] = useState('smart');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 8, total: 0, totalPages: 1 });
  const [availableClasses, setAvailableClasses] = useState(classes);
  const [availableFilters, setAvailableFilters] = useState({
    statuses: [],
    roles: [],
    categories: [],
    activityTypes: [],
    classes: []
  });
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 120);
  const deferredResults = useDeferredValue(results);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setAvailableClasses(classes);
  }, [classes]);

  useEffect(() => {
    if (!apiJson || !config) return undefined;
    if (availableClasses.length) return undefined;
    let active = true;

    async function loadClasses() {
      try {
        if (role === 'teacher') {
          const data = await apiJson('/results/teacher/context');
          if (!active) return;
          setAvailableClasses(data.classes || []);
          return;
        }

        const data = await apiJson(role === 'admissions' ? '/operations/classes' : '/admin/classes');
        if (!active) return;
        setAvailableClasses(data.classes || []);
      } catch {
        if (active) setAvailableClasses([]);
      }
    }

    loadClasses();
    return () => {
      active = false;
    };
  }, [apiJson, availableClasses.length, config, role]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, entity, status, classId, term, category, activityType, roleFilter, datePreset, sortBy, sortDir]);

  useEffect(() => {
    if (!config) return undefined;
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    let active = true;

    async function loadSearch() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          entity,
          q: debouncedQuery,
          page: String(page),
          pageSize: '8',
          sortBy,
          sortDir
        });
        if (status) params.set('status', status);
        if (classId) params.set('classId', classId);
        if (term) params.set('term', term);
        if (category) params.set('category', category);
        if (activityType) params.set('activityType', activityType);
        if (roleFilter) params.set('role', roleFilter);
        if (datePreset) params.set('datePreset', datePreset);

        const data = await apiJson(`/dashboard/search?${params.toString()}`, { signal: controller.signal });
        if (!active || requestId !== requestIdRef.current) return;

        startTransition(() => {
          setResults(data.items || []);
          setPagination(data.pagination || { page: 1, pageSize: 8, total: 0, totalPages: 1 });
          setSuggestions(data.suggestions || []);
          setAvailableFilters({
            statuses: data.availableFilters?.statuses || [],
            roles: data.availableFilters?.roles || [],
            categories: data.availableFilters?.categories || [],
            activityTypes: data.availableFilters?.activityTypes || [],
            classes: data.availableFilters?.classes || []
          });
        });
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        setError(err.message || 'Unable to search dashboard data.');
      } finally {
        if (active && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    loadSearch();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activityType, apiJson, category, classId, config, datePreset, debouncedQuery, entity, page, roleFilter, sortBy, sortDir, status, term]);

  const activeFilterChips = useMemo(() => ([
    entity !== 'all' ? { key: 'entity', label: ENTITY_LABELS[entity] || labelize(entity), clear: () => setEntity('all') } : null,
    status ? { key: 'status', label: `Status: ${labelize(status)}`, clear: () => setStatus('') } : null,
    classId ? {
      key: 'classId',
      label: `Class: ${(availableFilters.classes.find((item) => item.value === classId)?.label || availableClasses.find((item) => item.id === classId)?.name || classId)}`,
      clear: () => setClassId('')
    } : null,
    term ? { key: 'term', label: term, clear: () => setTerm('') } : null,
    category ? { key: 'category', label: `Category: ${labelize(category)}`, clear: () => setCategory('') } : null,
    activityType ? { key: 'activityType', label: `Activity: ${labelize(activityType)}`, clear: () => setActivityType('') } : null,
    roleFilter ? { key: 'role', label: `Role: ${labelize(roleFilter)}`, clear: () => setRoleFilter('') } : null,
    datePreset ? { key: 'datePreset', label: `Date: ${DATE_OPTIONS.find((item) => item.value === datePreset)?.label || datePreset}`, clear: () => setDatePreset('') } : null
  ].filter(Boolean)), [activityType, availableClasses, availableFilters.classes, category, classId, datePreset, entity, roleFilter, status, term]);

  const appliedSuggestions = suggestions.slice(0, 6);

  if (!config) return null;

  return (
    <Panel title={config.title} eyebrow={config.eyebrow}>
      <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.97),rgba(248,250,252,0.92))] p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(217,179,84,0.12),transparent_30%)]" />
        <div className="relative">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
            <div className="relative">
              <div className="flex items-center gap-3 rounded-[24px] border border-slate-200/90 bg-white/88 px-4 py-3 shadow-sm ring-1 ring-transparent transition focus-within:border-emerald-300 focus-within:ring-emerald-100">
                <span className="text-lg text-slate-400" aria-hidden="true">⌕</span>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                  placeholder={config.placeholder}
                  className="w-full border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setShowSuggestions(false);
                    }}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              <SuggestionsList
                suggestions={appliedSuggestions}
                visible={showSuggestions && Boolean(query.trim())}
                onSelect={(suggestion) => {
                  if (suggestion.type === 'status') {
                    setStatus(suggestion.value);
                  } else if (suggestion.type === 'class') {
                    setClassId(suggestion.value);
                  } else if (suggestion.type === 'entity') {
                    setEntity(suggestion.value);
                  } else if (suggestion.type === 'role') {
                    setRoleFilter(suggestion.value);
                  } else if (suggestion.type === 'category') {
                    setCategory(suggestion.value);
                  } else if (suggestion.type === 'activity') {
                    setActivityType(suggestion.value);
                  } else {
                    setQuery(suggestion.value);
                  }
                  setShowSuggestions(false);
                }}
              />
            </div>

            <FilterSelect
              value={entity}
              onChange={setEntity}
              placeholder="All records"
              options={config.entities.map((option) => ({ value: option, label: ENTITY_LABELS[option] || labelize(option) }))}
            />

            <FilterSelect
              value={status}
              onChange={setStatus}
              placeholder="All statuses"
              options={availableFilters.statuses.map((option) => ({ value: option.value, label: option.label }))}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              value={classId}
              onChange={setClassId}
              placeholder="All classes"
              options={(availableFilters.classes.length ? availableFilters.classes : availableClasses.map((item) => ({
                value: item.id,
                label: `${item.name} ${item.arm || ''}`.trim()
              }))).map((option) => ({ value: option.value, label: option.label }))}
            />
            <FilterSelect
              value={term}
              onChange={setTerm}
              placeholder="All terms"
              options={TERM_OPTIONS.map((item) => ({ value: item, label: item }))}
            />
            <FilterSelect
              value={category}
              onChange={setCategory}
              placeholder="All categories"
              options={availableFilters.categories.map((option) => ({ value: option.value, label: option.label }))}
            />
            <FilterSelect
              value={activityType}
              onChange={setActivityType}
              placeholder="All activities"
              options={availableFilters.activityTypes.map((option) => ({ value: option.value, label: option.label }))}
            />
            <FilterSelect
              value={roleFilter}
              onChange={setRoleFilter}
              placeholder="All roles"
              options={availableFilters.roles.map((option) => ({ value: option.value, label: option.label }))}
            />
            <FilterSelect
              value={datePreset}
              onChange={setDatePreset}
              placeholder="Any time"
              options={DATE_OPTIONS.filter((item) => item.value).map((item) => ({ value: item.value, label: item.label }))}
            />
            <FilterSelect
              value={sortBy}
              onChange={setSortBy}
              placeholder="Smart sort"
              options={[
                { value: 'smart', label: 'Smart sort' },
                { value: 'updatedAt', label: 'Recently updated' },
                { value: 'createdAt', label: 'Recently created' },
                { value: 'title', label: 'Alphabetical' },
                { value: 'status', label: 'Status' }
              ]}
            />
            <FilterSelect
              value={sortDir}
              onChange={setSortDir}
              placeholder="Descending"
              options={[
                { value: 'desc', label: 'Descending' },
                { value: 'asc', label: 'Ascending' }
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="rounded-full border border-slate-200 bg-white/88 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
              >
                {chip.label} ×
              </button>
            ))}
            {activeFilterChips.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEntity('all');
                  setStatus('');
                  setClassId('');
                  setTerm('');
                  setCategory('');
                  setActivityType('');
                  setRoleFilter('');
                  setDatePreset('');
                  setSortBy('smart');
                  setSortDir('desc');
                }}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                Reset filters
              </button>
            )}
          </div>

          {appliedSuggestions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Suggestions</span>
              {appliedSuggestions.map((suggestion) => (
                <button
                  key={`chip-${suggestion.type}-${suggestion.value}`}
                  type="button"
                  onClick={() => {
                    if (suggestion.type === 'status') setStatus(suggestion.value);
                    else if (suggestion.type === 'class') setClassId(suggestion.value);
                    else if (suggestion.type === 'entity') setEntity(suggestion.value);
                    else if (suggestion.type === 'role') setRoleFilter(suggestion.value);
                    else if (suggestion.type === 'category') setCategory(suggestion.value);
                    else if (suggestion.type === 'activity') setActivityType(suggestion.value);
                    else setQuery(suggestion.value);
                  }}
                  className="rounded-full border border-white/90 bg-white/82 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700">{pagination.total} result(s)</span>
          {loading && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Refreshing</span>}
        </div>
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Real-time, ranked, role-aware
        </p>
      </div>

      <div className="mt-4 grid gap-3">
        {!loading && !deferredResults.length && (
          <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-4 text-sm text-slate-600">
            No dashboard records matched this search. Try a broader role, class, or status filter.
          </div>
        )}
        {deferredResults.map((item) => (
          <ResultCard key={`${item.entity}-${item.id}`} item={item} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>Page {pagination.page} of {pagination.totalPages}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={pagination.page <= 1}
            className="rounded-full border border-slate-300 bg-white/85 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
            disabled={pagination.page >= pagination.totalPages}
            className="rounded-full border border-slate-300 bg-white/85 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </Panel>
  );
}

export default SmartSearchPanel;
