import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import SmartImage from '../../components/SmartImage';
import { ADMIN_INSTITUTIONS } from '../../utils/adminInstitution';

const DEFAULT_INSTITUTION = ADMIN_INSTITUTIONS[0];
const CATEGORY_ALIASES = {
  announcement: 'announcement',
  announcements: 'announcement',
  event: 'event',
  events: 'event',
  academic: 'academic',
  academics: 'academic',
  program: 'program',
  programme: 'program',
  programs: 'program',
  programmes: 'program',
  exam: 'exam',
  exams: 'exam',
  examination: 'exam',
  examinations: 'exam',
  holiday: 'holiday',
  holidays: 'holiday',
  achievement: 'achievement',
  achievements: 'achievement'
};

function normalizeCategory(value) {
  const trimmed = String(value || '').trim().toLowerCase();
  return CATEGORY_ALIASES[trimmed] || 'announcement';
}

function createEmptyForm() {
  return {
    title: '',
    category: 'announcement',
    institution: DEFAULT_INSTITUTION,
    excerpt: '',
    content: '',
    status: 'published',
    publishDate: '',
    images: [],
    videos: []
  };
}

function ManageNewsEvents() {
  const { apiFetch, apiJson, user } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(createEmptyForm);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [showRows, setShowRows] = useState(true);
  const loadItemsSeq = useRef(0);
  const canSubmit = Boolean(form.title.trim() && form.content.trim()) && !uploading && !submitting;

  const loadItems = useCallback(async () => {
    const seq = ++loadItemsSeq.current;
    setError('');
    setSuccess('');
    setItems([]);
    try {
      const data = await apiJson('/news/admin/all');
      if (seq !== loadItemsSeq.current) return;
      const nextItems = data.news || [];
      setItems(nextItems);
      if (editingId && !nextItems.some((item) => item.id === editingId)) {
        resetForm();
      }
    } catch (err) {
      if (seq !== loadItemsSeq.current) return;
      setError(err.message || 'Unable to load news items.');
    }
  }, [apiJson, editingId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  function resetForm() {
    setEditingId('');
    setForm(createEmptyForm());
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/news/admin/${editingId}` : '/news/admin';

    try {
      await apiJson(url, {
        method,
        body: form
      });

      setSuccess(editingId ? 'News item updated.' : 'News item created.');
      resetForm();
      void loadItems();
    } catch (err) {
      setError(err.message || 'Unable to save news item.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: normalizeCategory(item.category),
      institution: item.institution,
      excerpt: item.excerpt || '',
      content: item.content,
      status: 'published',
      publishDate: item.publishDate ? item.publishDate.slice(0, 16) : '',
      images: Array.isArray(item.images) ? [...item.images] : [],
      videos: Array.isArray(item.videos) ? [...item.videos] : []
    });
  }

  async function handleFileUpload(e, type) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setError('');
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (type === 'image' && !file.type.startsWith('image/')) {
          setError('Please select image files only for the image uploader.');
          continue;
        }
        if (type === 'video' && !file.type.startsWith('video/')) {
          setError('Please select video files only for the video uploader.');
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiFetch('/news/admin/upload', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Upload failed.');
        if (type === 'image') {
          setForm((prev) => ({ ...prev, images: [...(prev.images || []), data.url] }));
        } else {
          setForm((prev) => ({ ...prev, videos: [...(prev.videos || []), data.url] }));
        }
      }
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeMedia(type, index) {
    if (type === 'image') {
      setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
    } else {
      setForm((prev) => ({ ...prev, videos: prev.videos.filter((_, i) => i !== index) }));
    }
  }

  async function remove(id) {
    setError('');
    setSuccess('');
    setDeletingId(id);

    try {
      await apiJson(`/news/admin/${id}`, { method: 'DELETE' });

      setSuccess('News item deleted.');
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (err) {
      setError(err.message || 'Unable to delete news item.');
    } finally {
      setDeletingId('');
    }
  }

  return (
    <PortalLayout
      role={user?.role || 'admin'}
      title="Manage News & Events"
      subtitle="Create, publish, and manage school updates across ATTAUFEEQ Model Academy, Madrastul ATTAUFEEQ, and Quran Memorization."
    >
      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Title"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
          required
        />
        <select
          value={form.category}
          onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {['announcement', 'event', 'academic', 'program', 'exam', 'holiday', 'achievement'].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          value={form.institution}
          onChange={(e) => setForm((prev) => ({ ...prev, institution: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {ADMIN_INSTITUTIONS.map((institution) => (
            <option key={institution} value={institution}>{institution}</option>
          ))}
        </select>
        <input
          value={form.excerpt}
          onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
          placeholder="Short excerpt"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
        />
        <input
          type="datetime-local"
          value={form.publishDate}
          onChange={(e) => setForm((prev) => ({ ...prev, publishDate: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={form.content}
          onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
          placeholder="Full content"
          rows={5}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-4"
          required
        />
        <div className="lg:col-span-4 space-y-2">
          <p className="text-sm font-medium text-slate-700">Images &amp; videos</p>
          <div className="flex flex-wrap gap-2">
            <label className="rounded-md border border-slate-300 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
              {uploading ? 'Uploading...' : 'Add image(s)'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                disabled={uploading}
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'image')}
              />
            </label>
            <label className="rounded-md border border-slate-300 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
              {uploading ? 'Uploading...' : 'Add video(s)'}
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                multiple
                disabled={uploading}
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'video')}
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Images</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.images || []).map((url, i) => (
                  <div key={`img-${i}`} className="relative inline-block">
                    <SmartImage
                      src={url}
                      fallbackSrc="/images/campus.jpg"
                      alt="News image preview"
                      className="h-20 w-20 rounded border object-cover"
                    />
                    <button type="button" onClick={() => removeMedia('image', i)} className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-xs w-5 h-5">×</button>
                  </div>
                ))}
                {!form.images?.length && (
                  <p className="text-xs text-slate-500">No images uploaded yet.</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Videos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.videos || []).map((url, i) => (
                  <div key={`vid-${i}`} className="relative inline-block">
                    <video src={url} className="h-20 w-24 object-cover rounded border" muted />
                    <button type="button" onClick={() => removeMedia('video', i)} className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-xs w-5 h-5">×</button>
                  </div>
                ))}
                {!form.videos?.length && (
                  <p className="text-xs text-slate-500">No videos uploaded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-4"
        >
          {submitting ? (editingId ? 'Updating...' : 'Creating...') : (editingId ? 'Update News Item' : 'Create News Item')}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>News & events table</span>
          <button
            type="button"
            onClick={() => setShowRows((prev) => !prev)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          >
            {showRows ? 'Hide rows' : 'Show rows'}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Institution</th>
              <th className="px-3 py-2">Published</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!showRows && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-slate-600">
                  Rows are hidden. Click “Show rows” to display news & events.
                </td>
              </tr>
            )}
            {showRows && items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{item.title}</td>
                <td className="px-3 py-2">{item.category}</td>
                <td className="px-3 py-2">{item.institution}</td>
                <td className="px-3 py-2">{new Date(item.publishDate || item.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button type="button" disabled={deletingId === item.id} onClick={() => startEdit(item)} className="rounded-md border border-slate-300 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60">Edit</button>
                    <button type="button" disabled={deletingId === item.id} onClick={() => remove(item.id)} className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60">{deletingId === item.id ? 'Deleting...' : 'Delete'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default ManageNewsEvents;
