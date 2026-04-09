import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';
import { useSiteContent } from '../../context/SiteContentContext';

const emptyContent = {
  branding: {},
  landing: { stats: [], snapshotItems: [], institutions: [] },
  home: { heroStats: [], heroImages: [], highlights: [], programs: [] },
  about: { historySections: [], values: [] },
  academics: { levels: [] },
  staff: { featuredStaff: [] },
  gallery: { photos: [] },
  madrasa: { modules: [] },
  contact: {}
};

const emptyStat = { value: '', title: '', text: '' };
const emptyInstitution = { title: '', description: '', image: '', to: '', badge: '', accent: '' };
const emptyImage = { url: '', alt: '' };
const emptyHighlight = { title: '', text: '', image: '' };
const emptyProgram = { title: '', description: '', standards: [], image: '' };
const emptyHistorySection = { title: '', paragraphs: [], bullets: [] };
const emptyStaff = { name: '', role: '', image: '', bio: '' };
const emptyPhoto = { url: '', alt: '' };
const emptyModule = { title: '', text: '' };

function normalizeContent(content = {}) {
  return {
    branding: { ...(content.branding || {}) },
    landing: {
      ...(content.landing || {}),
      stats: Array.isArray(content?.landing?.stats) ? content.landing.stats : [],
      snapshotItems: Array.isArray(content?.landing?.snapshotItems) ? content.landing.snapshotItems : [],
      institutions: Array.isArray(content?.landing?.institutions) ? content.landing.institutions : []
    },
    home: {
      ...(content.home || {}),
      heroStats: Array.isArray(content?.home?.heroStats) ? content.home.heroStats : [],
      heroImages: Array.isArray(content?.home?.heroImages) ? content.home.heroImages : [],
      highlights: Array.isArray(content?.home?.highlights) ? content.home.highlights : [],
      programs: Array.isArray(content?.home?.programs) ? content.home.programs : []
    },
    about: {
      ...(content.about || {}),
      historySections: Array.isArray(content?.about?.historySections) ? content.about.historySections : [],
      values: Array.isArray(content?.about?.values) ? content.about.values : []
    },
    academics: {
      ...(content.academics || {}),
      levels: Array.isArray(content?.academics?.levels) ? content.academics.levels : []
    },
    staff: {
      ...(content.staff || {}),
      featuredStaff: Array.isArray(content?.staff?.featuredStaff) ? content.staff.featuredStaff : []
    },
    gallery: {
      ...(content.gallery || {}),
      photos: Array.isArray(content?.gallery?.photos) ? content.gallery.photos : []
    },
    madrasa: {
      ...(content.madrasa || {}),
      modules: Array.isArray(content?.madrasa?.modules) ? content.madrasa.modules : []
    },
    contact: { ...(content.contact || {}) }
  };
}

function TextField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value || ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder, rows = 4 }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <textarea
        value={value || ''}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function ListEditor({ label, items, onChange, placeholder }) {
  const list = Array.isArray(items) ? items : [];

  return (
    <div className="grid gap-2 text-sm">
      <div className="font-semibold text-slate-700">{label}</div>
      <div className="grid gap-2">
        {list.map((item, index) => (
          <div key={`${label}-${index}`} className="flex flex-wrap items-center gap-2">
            <input
              value={item}
              placeholder={placeholder}
              onChange={(event) => {
                const next = [...list];
                next[index] = event.target.value;
                onChange(next);
              }}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== index))}
              className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...list, ''])}
          className="w-fit rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Add Item
        </button>
      </div>
    </div>
  );
}

function ObjectListEditor({ label, items, onChange, fields, defaultItem }) {
  const list = Array.isArray(items) ? items : [];

  function updateItem(index, key, value) {
    const next = [...list];
    next[index] = { ...(next[index] || {}), [key]: value };
    onChange(next);
  }

  return (
    <div className="grid gap-3 text-sm">
      <div className="font-semibold text-slate-700">{label}</div>
      <div className="grid gap-4">
        {list.map((item, index) => (
          <div key={`${label}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((field) => (
                <TextField
                  key={field.key}
                  label={field.label}
                  value={item?.[field.key]}
                  onChange={(value) => updateItem(index, field.key, value)}
                  placeholder={field.placeholder}
                  type={field.type}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onChange(list.filter((_, idx) => idx !== index))}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...list, { ...defaultItem }])}
          className="w-fit rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Add {label}
        </button>
      </div>
    </div>
  );
}

function HistorySectionsEditor({ items, onChange }) {
  const list = Array.isArray(items) ? items : [];

  function updateItem(index, key, value) {
    const next = [...list];
    next[index] = { ...(next[index] || {}), [key]: value };
    onChange(next);
  }

  return (
    <div className="grid gap-3 text-sm">
      <div className="font-semibold text-slate-700">History Sections</div>
      <div className="grid gap-4">
        {list.map((section, index) => (
          <div key={`history-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3">
              <TextField
                label="Section Title"
                value={section?.title}
                onChange={(value) => updateItem(index, 'title', value)}
              />
              <TextAreaField
                label="Paragraphs (one per line)"
                value={(section?.paragraphs || []).join('\n')}
                onChange={(value) =>
                  updateItem(
                    index,
                    'paragraphs',
                    value.split('\n').map((line) => line.trim()).filter(Boolean)
                  )
                }
                rows={4}
              />
              <TextAreaField
                label="Bullets (one per line)"
                value={(section?.bullets || []).join('\n')}
                onChange={(value) =>
                  updateItem(
                    index,
                    'bullets',
                    value.split('\n').map((line) => line.trim()).filter(Boolean)
                  )
                }
                rows={3}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onChange(list.filter((_, idx) => idx !== index))}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Remove Section
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...list, { ...emptyHistorySection }])}
          className="w-fit rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Add History Section
        </button>
      </div>
    </div>
  );
}

function ProgramsEditor({ items, onChange }) {
  const list = Array.isArray(items) ? items : [];

  function updateItem(index, key, value) {
    const next = [...list];
    next[index] = { ...(next[index] || {}), [key]: value };
    onChange(next);
  }

  return (
    <div className="grid gap-3 text-sm">
      <div className="font-semibold text-slate-700">Programs</div>
      <div className="grid gap-4">
        {list.map((program, index) => (
          <div key={`program-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label="Title"
                value={program?.title}
                onChange={(value) => updateItem(index, 'title', value)}
              />
              <TextField
                label="Image URL"
                value={program?.image}
                onChange={(value) => updateItem(index, 'image', value)}
              />
            </div>
            <TextAreaField
              label="Description"
              value={program?.description}
              onChange={(value) => updateItem(index, 'description', value)}
              rows={3}
            />
            <TextAreaField
              label="Standards (one per line)"
              value={(program?.standards || []).join('\n')}
              onChange={(value) =>
                updateItem(
                  index,
                  'standards',
                  value.split('\n').map((line) => line.trim()).filter(Boolean)
                )
              }
              rows={3}
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onChange(list.filter((_, idx) => idx !== index))}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Remove Program
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...list, { ...emptyProgram }])}
          className="w-fit rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Add Program
        </button>
      </div>
    </div>
  );
}

function AdminWebsiteContent() {
  const { apiJson } = useAuth();
  const { reloadSiteContent } = useSiteContent();
  const [sections, setSections] = useState(() => normalizeContent(emptyContent));
  const [lastLoadedSections, setLastLoadedSections] = useState(() => normalizeContent(emptyContent));
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const loadDataSeq = useRef(0);

  const isDirty = useMemo(
    () => JSON.stringify(sections) !== JSON.stringify(lastLoadedSections),
    [lastLoadedSections, sections]
  );

  const loadData = useCallback(async () => {
    const seq = ++loadDataSeq.current;
    setLoading(true);
    setError('');
    setSubmissions([]);

    try {
      const [contentData, submissionsData] = await Promise.all([
        apiJson('/site-content/admin'),
        apiJson('/site-content/admin/contact-submissions?limit=20')
      ]);
      if (seq !== loadDataSeq.current) return;

      const nextSections = normalizeContent(contentData.content || {});
      setSections(nextSections);
      setLastLoadedSections(nextSections);
      setSubmissions(submissionsData.submissions || []);
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load website content.');
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await apiJson('/site-content/admin', {
        method: 'PUT',
        body: { content: sections }
      });

      await reloadSiteContent();
      setSuccess('Public website content saved to PostgreSQL successfully.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to save website content.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Website Content"
      subtitle="Update public website content with simple form fields (no JSON required)."
      actions={
        <button
          type="button"
          onClick={() => {
            if (saving) return;
            if (isDirty && !window.confirm('Discard unsaved website content changes and refresh?')) return;
            void loadData();
          }}
          disabled={saving}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
      }
    >
      {loading && <p className="text-sm text-slate-600">Loading website content...</p>}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mb-3 text-sm text-emerald-700">{success}</p>}

      <form onSubmit={handleSave} className="grid gap-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Branding</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="School Name" value={sections.branding.name} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, name: value }
            }))} />
            <TextField label="Motto" value={sections.branding.motto} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, motto: value }
            }))} />
            <TextField label="Domain" value={sections.branding.domain} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, domain: value }
            }))} />
            <TextField label="Logo URL" value={sections.branding.logoUrl} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, logoUrl: value }
            }))} />
            <TextField label="Address" value={sections.branding.address} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, address: value }
            }))} />
            <TextField label="Phone Numbers" value={sections.branding.phone} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, phone: value }
            }))} />
            <TextField label="Email" value={sections.branding.email} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, email: value }
            }))} />
            <TextField label="Navigation Subtitle" value={sections.branding.navSubtitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              branding: { ...prev.branding, navSubtitle: value }
            }))} />
          </div>
          <div className="mt-4">
            <TextAreaField
              label="Intro Paragraph"
              value={sections.branding.intro}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                branding: { ...prev.branding, intro: value }
              }))}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Landing</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="Badge" value={sections.landing.badge} onChange={(value) => setSections((prev) => ({
              ...prev,
              landing: { ...prev.landing, badge: value }
            }))} />
            <TextField label="Snapshot Title" value={sections.landing.snapshotTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              landing: { ...prev.landing, snapshotTitle: value }
            }))} />
          </div>
          <div className="mt-4 grid gap-4">
            <TextAreaField label="Title" value={sections.landing.title} onChange={(value) => setSections((prev) => ({
              ...prev,
              landing: { ...prev.landing, title: value }
            }))} rows={2} />
            <TextAreaField label="Description" value={sections.landing.description} onChange={(value) => setSections((prev) => ({
              ...prev,
              landing: { ...prev.landing, description: value }
            }))} />
          </div>
          <div className="mt-6 grid gap-6">
            <ObjectListEditor
              label="Stats"
              items={sections.landing.stats}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                landing: { ...prev.landing, stats: value }
              }))}
              defaultItem={emptyStat}
              fields={[
                { key: 'value', label: 'Value' },
                { key: 'title', label: 'Title' },
                { key: 'text', label: 'Description' }
              ]}
            />
            <ListEditor
              label="Snapshot Items"
              items={sections.landing.snapshotItems}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                landing: { ...prev.landing, snapshotItems: value }
              }))}
              placeholder="Add snapshot item"
            />
            <ObjectListEditor
              label="Institution"
              items={sections.landing.institutions}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                landing: { ...prev.landing, institutions: value }
              }))}
              defaultItem={emptyInstitution}
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'description', label: 'Description' },
                { key: 'image', label: 'Image URL' },
                { key: 'to', label: 'Route Link' },
                { key: 'badge', label: 'Badge' },
                { key: 'accent', label: 'Accent Gradient' }
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Home Page</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="Hero Badge" value={sections.home.heroBadge} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, heroBadge: value }
            }))} />
            <TextField label="Story Eyebrow" value={sections.home.storyEyebrow} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, storyEyebrow: value }
            }))} />
            <TextField label="Highlights Eyebrow" value={sections.home.highlightsEyebrow} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, highlightsEyebrow: value }
            }))} />
            <TextField label="Programs Eyebrow" value={sections.home.programsEyebrow} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, programsEyebrow: value }
            }))} />
            <TextField label="CTA Eyebrow" value={sections.home.ctaEyebrow} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, ctaEyebrow: value }
            }))} />
          </div>
          <div className="mt-4 grid gap-4">
            <TextAreaField label="Hero Title" value={sections.home.heroTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, heroTitle: value }
            }))} rows={2} />
            <TextAreaField label="Hero Description" value={sections.home.heroDescription} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, heroDescription: value }
            }))} />
          </div>
          <div className="mt-6 grid gap-6">
            <ObjectListEditor
              label="Hero Stats"
              items={sections.home.heroStats}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                home: { ...prev.home, heroStats: value }
              }))}
              defaultItem={emptyStat}
              fields={[
                { key: 'value', label: 'Value' },
                { key: 'title', label: 'Title' },
                { key: 'text', label: 'Description' }
              ]}
            />
            <ObjectListEditor
              label="Hero Image"
              items={sections.home.heroImages}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                home: { ...prev.home, heroImages: value }
              }))}
              defaultItem={emptyImage}
              fields={[
                { key: 'url', label: 'Image URL' },
                { key: 'alt', label: 'Alt Text' }
              ]}
            />
            <TextAreaField label="Highlights Title" value={sections.home.highlightsTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, highlightsTitle: value }
            }))} rows={2} />
            <TextAreaField label="Highlights Description" value={sections.home.highlightsDescription} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, highlightsDescription: value }
            }))} />
            <ObjectListEditor
              label="Highlight"
              items={sections.home.highlights}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                home: { ...prev.home, highlights: value }
              }))}
              defaultItem={emptyHighlight}
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'text', label: 'Text' },
                { key: 'image', label: 'Image URL' }
              ]}
            />
            <TextAreaField label="Story Title" value={sections.home.storyTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, storyTitle: value }
            }))} rows={2} />
            <TextAreaField label="Story Text" value={sections.home.storyText} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, storyText: value }
            }))} />
            <TextField label="Story Image URL" value={sections.home.storyImage} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, storyImage: value }
            }))} />
            <TextAreaField label="Programs Title" value={sections.home.programsTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, programsTitle: value }
            }))} rows={2} />
            <TextAreaField label="Programs Description" value={sections.home.programsDescription} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, programsDescription: value }
            }))} />
            <ProgramsEditor
              items={sections.home.programs}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                home: { ...prev.home, programs: value }
              }))}
            />
            <TextAreaField label="CTA Title" value={sections.home.ctaTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, ctaTitle: value }
            }))} rows={2} />
            <TextAreaField label="CTA Description" value={sections.home.ctaDescription} onChange={(value) => setSections((prev) => ({
              ...prev,
              home: { ...prev.home, ctaDescription: value }
            }))} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">About Page</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="Title" value={sections.about.title} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, title: value }
            }))} />
            <TextField label="History Title" value={sections.about.historyTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, historyTitle: value }
            }))} />
            <TextField label="Signature Label" value={sections.about.signLabel} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, signLabel: value }
            }))} />
            <TextField label="Signature Image URL" value={sections.about.signatureImage} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, signatureImage: value }
            }))} />
            <TextField label="Main Image URL" value={sections.about.image} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, image: value }
            }))} />
          </div>
          <div className="mt-4 grid gap-4">
            <TextAreaField label="History Text (fallback if no sections)" value={sections.about.historyText} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, historyText: value }
            }))} />
            <HistorySectionsEditor
              items={sections.about.historySections}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                about: { ...prev.about, historySections: value }
              }))}
            />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <TextField label="Vision Title" value={sections.about.visionTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, visionTitle: value }
            }))} />
            <TextField label="Mission Title" value={sections.about.missionTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, missionTitle: value }
            }))} />
            <TextAreaField label="Vision Text" value={sections.about.visionText} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, visionText: value }
            }))} />
            <TextAreaField label="Mission Text" value={sections.about.missionText} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, missionText: value }
            }))} />
          </div>
          <div className="mt-4">
            <TextField label="Values Title" value={sections.about.valuesTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              about: { ...prev.about, valuesTitle: value }
            }))} />
            <div className="mt-3">
              <ListEditor
                label="Values"
                items={sections.about.values}
                onChange={(value) => setSections((prev) => ({
                  ...prev,
                  about: { ...prev.about, values: value }
                }))}
                placeholder="Add value"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Academics</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="Title" value={sections.academics.title} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, title: value }
            }))} />
            <TextField label="Image URL" value={sections.academics.image} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, image: value }
            }))} />
            <TextField label="Levels Title" value={sections.academics.levelsTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, levelsTitle: value }
            }))} />
            <TextField label="Subjects Title" value={sections.academics.subjectsTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, subjectsTitle: value }
            }))} />
            <TextField label="Curriculum Title" value={sections.academics.curriculumTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, curriculumTitle: value }
            }))} />
          </div>
          <div className="mt-4 grid gap-4">
            <TextAreaField label="Intro" value={sections.academics.intro} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, intro: value }
            }))} />
            <ListEditor
              label="Levels"
              items={sections.academics.levels}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                academics: { ...prev.academics, levels: value }
              }))}
              placeholder="Add level"
            />
            <TextAreaField label="Subjects Text" value={sections.academics.subjectsText} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, subjectsText: value }
            }))} />
            <TextAreaField label="Curriculum Text" value={sections.academics.curriculumText} onChange={(value) => setSections((prev) => ({
              ...prev,
              academics: { ...prev.academics, curriculumText: value }
            }))} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Staff</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="Title" value={sections.staff.title} onChange={(value) => setSections((prev) => ({
              ...prev,
              staff: { ...prev.staff, title: value }
            }))} />
          </div>
          <div className="mt-4 grid gap-4">
            <TextAreaField label="Intro" value={sections.staff.intro} onChange={(value) => setSections((prev) => ({
              ...prev,
              staff: { ...prev.staff, intro: value }
            }))} />
            <ObjectListEditor
              label="Staff Member"
              items={sections.staff.featuredStaff}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                staff: { ...prev.staff, featuredStaff: value }
              }))}
              defaultItem={emptyStaff}
              fields={[
                { key: 'name', label: 'Name' },
                { key: 'role', label: 'Role' },
                { key: 'image', label: 'Image URL' },
                { key: 'bio', label: 'Bio' }
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Gallery</h2>
          <div className="mt-4 grid gap-4">
            <TextField label="Title" value={sections.gallery.title} onChange={(value) => setSections((prev) => ({
              ...prev,
              gallery: { ...prev.gallery, title: value }
            }))} />
            <TextAreaField label="Description" value={sections.gallery.description} onChange={(value) => setSections((prev) => ({
              ...prev,
              gallery: { ...prev.gallery, description: value }
            }))} />
            <ObjectListEditor
              label="Photo"
              items={sections.gallery.photos}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                gallery: { ...prev.gallery, photos: value }
              }))}
              defaultItem={emptyPhoto}
              fields={[
                { key: 'url', label: 'Image URL' },
                { key: 'alt', label: 'Alt Text' }
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Madrasa</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="Eyebrow" value={sections.madrasa.eyebrow} onChange={(value) => setSections((prev) => ({
              ...prev,
              madrasa: { ...prev.madrasa, eyebrow: value }
            }))} />
            <TextField label="Title" value={sections.madrasa.title} onChange={(value) => setSections((prev) => ({
              ...prev,
              madrasa: { ...prev.madrasa, title: value }
            }))} />
            <TextField label="Image URL" value={sections.madrasa.image} onChange={(value) => setSections((prev) => ({
              ...prev,
              madrasa: { ...prev.madrasa, image: value }
            }))} />
            <TextField label="Modules Title" value={sections.madrasa.modulesTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              madrasa: { ...prev.madrasa, modulesTitle: value }
            }))} />
          </div>
          <div className="mt-4 grid gap-4">
            <TextAreaField label="Description" value={sections.madrasa.description} onChange={(value) => setSections((prev) => ({
              ...prev,
              madrasa: { ...prev.madrasa, description: value }
            }))} />
            <TextAreaField label="Modules Subtitle" value={sections.madrasa.modulesSubtitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              madrasa: { ...prev.madrasa, modulesSubtitle: value }
            }))} />
            <ObjectListEditor
              label="Module"
              items={sections.madrasa.modules}
              onChange={(value) => setSections((prev) => ({
                ...prev,
                madrasa: { ...prev.madrasa, modules: value }
              }))}
              defaultItem={emptyModule}
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'text', label: 'Text' }
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-heading text-2xl text-primary">Contact Page</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="Title" value={sections.contact.title} onChange={(value) => setSections((prev) => ({
              ...prev,
              contact: { ...prev.contact, title: value }
            }))} />
            <TextField label="Info Title" value={sections.contact.infoTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              contact: { ...prev.contact, infoTitle: value }
            }))} />
            <TextField label="Form Title" value={sections.contact.formTitle} onChange={(value) => setSections((prev) => ({
              ...prev,
              contact: { ...prev.contact, formTitle: value }
            }))} />
            <TextField label="Submit Button Label" value={sections.contact.submitLabel} onChange={(value) => setSections((prev) => ({
              ...prev,
              contact: { ...prev.contact, submitLabel: value }
            }))} />
          </div>
          <div className="mt-4 grid gap-4">
            <TextAreaField label="Form Description" value={sections.contact.formDescription} onChange={(value) => setSections((prev) => ({
              ...prev,
              contact: { ...prev.contact, formDescription: value }
            }))} />
            <TextAreaField label="Success Message" value={sections.contact.successMessage} onChange={(value) => setSections((prev) => ({
              ...prev,
              contact: { ...prev.contact, successMessage: value }
            }))} />
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Website Content'}
          </button>
          {isDirty && <p className="text-sm text-amber-700">You have unsaved website content changes.</p>}
        </div>
      </form>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-heading text-2xl text-primary">Recent Contact Messages</h2>
        <div className="mt-4 space-y-3">
          {submissions.map((submission) => (
            <article key={submission.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{submission.full_name}</p>
                  <p className="text-xs text-slate-500">{submission.email}</p>
                </div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  {new Date(submission.created_at).toLocaleString()}
                </p>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-700">{submission.message}</p>
            </article>
          ))}
          {!submissions.length && (
            <p className="text-sm text-slate-600">No public contact submissions yet.</p>
          )}
        </div>
      </section>
    </PortalLayout>
  );
}

export default AdminWebsiteContent;
