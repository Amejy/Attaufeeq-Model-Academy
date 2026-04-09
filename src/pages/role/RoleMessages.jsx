import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ChildScopePanel from '../../components/ChildScopePanel';
import useParentChildSelection from '../../hooks/useParentChildSelection';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const EMPTY_OPTIONS = [];
const TARGET_OPTIONS_BY_ROLE = {
  admin: ['teacher', 'parent'],
  admissions: ['admin'],
  teacher: ['parent', 'student', 'admin'],
  parent: ['teacher', 'admin']
};

function RoleMessages() {
  const { apiJson, user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [children, setChildren] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const [threadRoleFilter, setThreadRoleFilter] = useState('all');
  const [threadSort, setThreadSort] = useState('recent');
  const [hiddenThreadIds, setHiddenThreadIds] = useState(() => new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyWithMessages, setOnlyWithMessages] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [form, setForm] = useState(() => ({
    title: '',
    participantRole: TARGET_OPTIONS_BY_ROLE[user?.role]?.[0] || '',
    contactId: ''
  }));
  const [body, setBody] = useState('');
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(user?.role || '', user);
  const currentUserId = String(user?.id || user?.sub || '');
  const loadContactsSeq = useRef(0);
  const loadThreadsSeq = useRef(0);
  const openThreadSeq = useRef(0);
  const debouncedThreadSearch = useDebouncedValue(threadSearch.trim(), 300);
  const debouncedContactSearch = useDebouncedValue(contactSearch.trim(), 300);

  const loadContacts = useCallback(async () => {
    if (!['admin', 'admissions', 'teacher', 'parent'].includes(user?.role || '')) return;

    const requestId = loadContactsSeq.current + 1;
    loadContactsSeq.current = requestId;
    setContacts([]);
    setChildren([]);
    const query = user?.role === 'parent' && selectedChildId
      ? `?childId=${encodeURIComponent(selectedChildId)}`
      : '';
    const data = await apiJson(`/messages/contacts${query}`);
    if (loadContactsSeq.current !== requestId) return;
    setContacts(data.contacts || []);
    setChildren(data.children || []);
    if (user?.role === 'parent' && data.child?.id && data.child.id !== selectedChildId) {
      setSelectedChildId(data.child.id);
    }
  }, [apiJson, selectedChildId, setSelectedChildId, user?.role]);

  const scopedThreadQuery = useMemo(() => {
    if (user?.role === 'parent' && selectedChildId) {
      return `?childId=${encodeURIComponent(selectedChildId)}`;
    }
    return '';
  }, [selectedChildId, user?.role]);

  const openThread = useCallback(async (threadId) => {
    const requestId = openThreadSeq.current + 1;
    openThreadSeq.current = requestId;
    setError('');
    setMessages([]);
    try {
      const data = await apiJson(`/messages/threads/${threadId}${scopedThreadQuery}`);
      if (openThreadSeq.current !== requestId) return;
      setActiveThread(data.thread);
      setMessages(data.messages || []);
    } catch (err) {
      if (openThreadSeq.current !== requestId) return;
      setError(err.message || 'Unable to open thread.');
    }
  }, [apiJson, scopedThreadQuery]);

  const loadThreads = useCallback(async ({ nextActiveThreadId = '' } = {}) => {
    const requestId = loadThreadsSeq.current + 1;
    loadThreadsSeq.current = requestId;
    setError('');
    setLoading(true);
    setThreads([]);
    try {
      const data = await apiJson(`/messages/threads${scopedThreadQuery}`);
      if (loadThreadsSeq.current !== requestId) return;
      const rows = data.threads || [];
      setThreads(rows);

      if (!rows.length) {
        setActiveThread(null);
        setMessages([]);
        return;
      }

      const fallbackThreadId =
        nextActiveThreadId ||
        (rows.some((thread) => thread.id === activeThread?.id) ? activeThread?.id : '') ||
        rows[0]?.id ||
        '';

      if (!fallbackThreadId) {
        setActiveThread(null);
        setMessages([]);
        return;
      }

      if (fallbackThreadId !== activeThread?.id) {
        openThreadSeq.current += 1;
        setActiveThread(null);
        setMessages([]);
        void openThread(fallbackThreadId);
      }
    } catch (err) {
      if (loadThreadsSeq.current !== requestId) return;
      setError(err.message || 'Unable to load threads.');
    } finally {
      if (loadThreadsSeq.current === requestId) {
        setLoading(false);
      }
    }
  }, [activeThread, apiJson, openThread, scopedThreadQuery]);

  useEffect(() => {
    if (user?.role !== 'parent') return;
    loadContactsSeq.current += 1;
    loadThreadsSeq.current += 1;
    openThreadSeq.current += 1;
    setThreads([]);
    setActiveThread(null);
    setMessages([]);
    setBody('');
  }, [selectedChildId, user?.role]);

  useEffect(() => {
    queueMicrotask(() => {
      if (user?.role === 'parent' && !selectedChildId) {
        void loadContacts().catch((err) => setError(err.message || 'Unable to load contacts.'));
        return;
      }

      void loadThreads();
      void loadContacts().catch((err) => setError(err.message || 'Unable to load contacts.'));
    });
  }, [loadContacts, loadThreads, selectedChildId, user?.role]);

  const canCreateThread = ['admin', 'admissions', 'teacher', 'parent'].includes(user?.role || '');
  const canReply = user?.role !== 'student';
  const targetOptions = useMemo(
    () => TARGET_OPTIONS_BY_ROLE[user?.role] ?? EMPTY_OPTIONS,
    [user?.role]
  );
  const contactOptions = useMemo(
    () => {
      const base = contacts.filter((item) => item.role === form.participantRole);
      if (!debouncedContactSearch) return base;
      const query = debouncedContactSearch.toLowerCase();
      return base.filter((item) =>
        `${item.label || ''} ${item.subtitle || ''}`.toLowerCase().includes(query)
      );
    },
    [contacts, debouncedContactSearch, form.participantRole]
  );
  const canSubmitThread = Boolean(
    form.title.trim() &&
    contactOptions.some((item) => item.id === form.contactId)
  ) && !creatingThread;
  const canSendMessage = Boolean(activeThread && canReply && body.trim()) && !sendingMessage;
  const visibleThreads = useMemo(() => {
    const query = debouncedThreadSearch.toLowerCase();
    return threads
      .filter((thread) => (showHidden ? true : !hiddenThreadIds.has(thread.id)))
      .filter((thread) => {
        if (threadRoleFilter === 'all') return true;
        return (thread.participants || []).includes(threadRoleFilter);
      })
      .filter((thread) => {
        if (!onlyMine) return true;
        return String(thread.createdByUserId || '') === currentUserId;
      })
      .filter((thread) => {
        if (!onlyWithMessages) return true;
        return Boolean(thread.lastMessage && thread.lastMessage.body);
      })
      .filter((thread) => {
        if (!query) return true;
        const lastMessageText = thread.lastMessage?.body || '';
        const haystack = `${thread.title} ${thread.contextLabel || ''} ${thread.contextSubtitle || ''} ${lastMessageText}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (threadSort === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
        if (threadSort === 'oldest') return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
  }, [
    currentUserId,
    debouncedThreadSearch,
    hiddenThreadIds,
    onlyMine,
    onlyWithMessages,
    showHidden,
    threadRoleFilter,
    threadSort,
    threads
  ]);

  useEffect(() => {
    if (targetOptions.length && !targetOptions.includes(form.participantRole)) {
      queueMicrotask(() => {
        setForm((prev) => ({ ...prev, participantRole: targetOptions[0], contactId: '' }));
      });
    }
  }, [form.participantRole, targetOptions]);

  useEffect(() => {
    if (!contactOptions.length) {
      queueMicrotask(() => {
        setForm((prev) => ({ ...prev, contactId: '' }));
      });
      return;
    }

    if (!contactOptions.some((item) => item.id === form.contactId)) {
      queueMicrotask(() => {
        setForm((prev) => ({ ...prev, contactId: contactOptions[0].id }));
      });
    }
  }, [contactOptions, form.contactId]);

  async function createThread(event) {
    event.preventDefault();
    setError('');
    setCreatingThread(true);

    try {
      const data = await apiJson('/messages/threads', {
        method: 'POST',
        body: {
          title: form.title,
          contactId: form.contactId || undefined,
          childId: user?.role === 'parent' ? selectedChildId || undefined : undefined
        }
      });
      setForm((prev) => ({ ...prev, title: '' }));
      await loadThreads({ nextActiveThreadId: data.thread.id });
      await openThread(data.thread.id);
    } catch (err) {
      setError(err.message || 'Unable to create thread.');
    } finally {
      setCreatingThread(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!activeThread || !body.trim()) return;
    if (!canReply) return;
    setError('');
    setSendingMessage(true);

    try {
      const data = await apiJson(`/messages/threads/${activeThread.id}/messages${scopedThreadQuery}`, {
        method: 'POST',
        body: { body }
      });

      setBody('');
      setMessages((prev) => [...prev, data.message]);
      void loadThreads({ nextActiveThreadId: activeThread.id });
    } catch (err) {
      setError(err.message || 'Unable to send message.');
    } finally {
      setSendingMessage(false);
    }
  }

  const canDeleteThread = activeThread && (user?.role === 'admin' || activeThread.createdByUserId === currentUserId);

  async function deleteThread() {
    if (!activeThread) return;
    if (!window.confirm('Delete this thread and all messages?')) return;
    setError('');
    setDeletingThread(true);
    try {
      await apiJson(`/messages/threads/${activeThread.id}${scopedThreadQuery}`, { method: 'DELETE' });
      await loadThreads();
    } catch (err) {
      setError(err.message || 'Unable to delete thread.');
    } finally {
      setDeletingThread(false);
    }
  }

  function toggleHideThread(threadId) {
    setHiddenThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }

  return (
    <PortalLayout
      role={user?.role || 'student'}
      title="Messages"
      subtitle="Start or continue conversations with the right portal-linked contacts. Family roles see class-linked communication, while the admissions desk can speak directly with admin."
    >
      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {user?.role === 'parent' && (
        <ChildScopePanel
          children={children}
          activeChildId={selectedChildId}
          onChange={setSelectedChildId}
          heading="Messaging Scope"
          description="Teacher contacts now follow the active child so you can start the right conversation for each student."
        />
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h2 className="font-heading text-xl text-primary">Threads</h2>
          <div className="mt-3 grid gap-2">
            <input
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
              placeholder="Search threads"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(event) => setOnlyMine(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Only my threads
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyWithMessages}
                  onChange={(event) => setOnlyWithMessages(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Only with activity
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) => setShowHidden(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Show hidden threads
            </label>
            <select
              value={threadRoleFilter}
              onChange={(event) => setThreadRoleFilter(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All participants</option>
              {['admin', 'teacher', 'parent', 'student'].map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={threadSort}
              onChange={(event) => setThreadSort(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="recent">Recent activity</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A-Z</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setThreadSearch('');
                setThreadRoleFilter('all');
                setThreadSort('recent');
                setOnlyMine(false);
                setOnlyWithMessages(false);
                setShowHidden(false);
                setHiddenThreadIds(new Set());
              }}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
            >
              Clear filters
            </button>
            {hiddenThreadIds.size > 0 && (
              <button
                type="button"
                onClick={() => setHiddenThreadIds(new Set())}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
              >
                Unhide all
              </button>
            )}
          </div>
          {canCreateThread ? (
            <form onSubmit={createThread} className="mt-3 space-y-2">
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="New thread title"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <select
                value={form.participantRole}
                onChange={(e) => setForm((prev) => ({ ...prev, participantRole: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {targetOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {contactOptions.length > 0 && (
                <select
                  value={form.contactId}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactId: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {contactOptions.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.label} {contact.subtitle ? `- ${contact.subtitle}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {!contactOptions.length && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  No contacts available for this role yet. Ask the admin to add contacts or check your child selection.
                </p>
              )}
              <button
                type="submit"
                disabled={!canSubmitThread}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingThread ? 'Creating...' : 'Create Thread'}
              </button>
            </form>
          ) : (
            <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              {user?.role === 'student'
                ? 'Messages are read-only for students. Your teachers can post updates here for you to read.'
                : 'New threads are started by admin or teachers. You can reply inside your own conversation threads here.'}
            </p>
          )}

          <div className="mt-4 space-y-2">
            {loading && !threads.length && (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                Loading conversations...
              </p>
            )}
            {visibleThreads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                onClick={() => openThread(thread.id)}
                className={`w-full rounded-md border px-3 py-2 text-left ${activeThread?.id === thread.id ? 'border-primary bg-emerald-50' : 'border-slate-200 bg-white'}`}
              >
                <p className="text-sm font-semibold text-slate-800">{thread.title}</p>
                <p className="text-xs text-slate-500">{thread.contextLabel || thread.participants.join(', ')}</p>
                {thread.lastMessage && (
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">{thread.lastMessage.body}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">
                  {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : 'No activity yet'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(user?.role === 'admin' || thread.createdByUserId === currentUserId) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActiveThread(thread);
                        void deleteThread();
                      }}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-600"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleHideThread(thread.id);
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    {hiddenThreadIds.has(thread.id) ? 'Show' : 'Hide'}
                  </button>
                </div>
              </button>
            ))}
            {!loading && !visibleThreads.length && (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                No conversations found for this scope yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl text-primary">{activeThread?.title || 'Select a thread'}</h2>
            {canDeleteThread && (
              <button
                type="button"
                onClick={deleteThread}
                disabled={deletingThread}
                className="rounded-md border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingThread ? 'Deleting...' : 'Delete Thread'}
              </button>
            )}
          </div>
          {activeThread?.contextLabel && (
            <p className="mt-1 text-sm text-slate-600">
              {activeThread.contextLabel}
              {activeThread.contextSubtitle ? ` • ${activeThread.contextSubtitle}` : ''}
            </p>
          )}

          <div className="mt-4 max-h-[24rem] space-y-3 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {messages.map((message) => (
              <article key={message.id} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{message.senderRole} - {message.senderName}</p>
                <p className="mt-1 text-sm text-slate-700">{message.body}</p>
              </article>
            ))}
            {!messages.length && <p className="text-sm text-slate-600">No messages yet.</p>}
          </div>

          {!canReply && (
            <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Students can only read messages. Replies are disabled in this portal.
            </p>
          )}
          <form onSubmit={sendMessage} className="mt-3 flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type message"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!activeThread || !canReply}
            />
            <button
              type="submit"
              disabled={!canSendMessage}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingMessage ? 'Sending...' : 'Send'}
            </button>
          </form>
        </section>
      </div>
    </PortalLayout>
  );
}

export default RoleMessages;
