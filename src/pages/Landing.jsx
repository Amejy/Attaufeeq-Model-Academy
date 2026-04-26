import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import FeatureCard from '../components/FeatureCard';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import { Grid, Section } from '../components/layout/LayoutPrimitives';
import { getInstitutionImageFallback } from '../utils/defaultImages';

function normalizeText(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function buildFeatureItems(landing, branding) {
  const stats = Array.isArray(landing.stats) ? landing.stats : [];
  const institutions = Array.isArray(landing.institutions) ? landing.institutions : [];
  const snapshotItems = Array.isArray(landing.snapshotItems) ? landing.snapshotItems : [];

  const statItems = stats.map((item, index) => ({
    key: `stat-${item.title || index}`,
    title: normalizeText(item.title, `Highlight ${index + 1}`),
    description: normalizeText(item.text, `Metric: ${item.value || 'N/A'}`),
    iconLabel: normalizeText(item.value, `H${index + 1}`),
    ctaLabel: 'Open',
    ctaTo: '/login',
    featured: index === 0,
    accent: index === 0 ? 'gold' : 'emerald',
    className: index === 0 ? 'lg:col-span-2 lg:row-span-2 min-h-[18rem]' : 'min-h-[15rem]'
  }));

  const institutionItems = institutions.map((item, index) => ({
    key: `institution-${item.title || index}`,
    title: normalizeText(item.title, `School Track ${index + 1}`),
    description: normalizeText(item.description, 'Program overview container.'),
    image: item.image || getInstitutionImageFallback(item.to || item.title),
    imageAlt: item.title,
    ctaLabel: 'Learn more',
    ctaTo: item.to || '/',
    featured: index === 0 && stats.length === 0,
    accent: 'sky',
    className: index === 0 ? 'min-h-[16rem]' : 'min-h-[15rem]'
  }));

  const snapshotFeatureItems = snapshotItems.map((item, index) => ({
    key: `snapshot-${item}-${index}`,
    title: `Portal Flow ${index + 1}`,
    description: normalizeText(item, 'Portal activity container.'),
    iconLabel: 'PT',
    ctaLabel: 'Open',
    ctaTo: '/login',
    featured: index === 0,
    accent: 'slate',
    className: index === 0 ? 'lg:row-span-2 min-h-[18rem]' : 'min-h-[14rem]'
  }));

  const fallbackItems = [
    {
      key: 'fallback-portal',
      title: `${normalizeText(branding.name, 'School')} Portal`,
      description: 'Core school access point for parents, students, and staff.',
      iconLabel: 'SP',
      ctaLabel: 'Open',
      ctaTo: '/login',
      featured: true,
      accent: 'gold',
      className: 'lg:col-span-2 lg:row-span-2 min-h-[18rem]'
    },
    {
      key: 'fallback-admissions',
      title: 'Admissions',
      description: 'Application entry and enrollment information container.',
      iconLabel: 'AD',
      ctaLabel: 'Learn more',
      ctaTo: '/admissions',
      accent: 'emerald',
      className: 'min-h-[15rem]'
    },
    {
      key: 'fallback-academics',
      title: 'Academics',
      description: 'Curriculum, classes, and learning updates container.',
      iconLabel: 'AC',
      ctaLabel: 'Explore',
      ctaTo: '/academics',
      featured: true,
      accent: 'sky',
      className: 'lg:row-span-2 min-h-[18rem]'
    },
    {
      key: 'fallback-news',
      title: 'News & Events',
      description: 'Announcements and school activity container.',
      iconLabel: 'NE',
      ctaLabel: 'Open',
      ctaTo: '/news',
      accent: 'slate',
      className: 'min-h-[14rem]'
    }
  ];

  return [...statItems, ...institutionItems, ...snapshotFeatureItems].slice(0, 6).length
    ? [...statItems, ...institutionItems, ...snapshotFeatureItems].slice(0, 6)
    : fallbackItems;
}

function Landing() {
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const { siteContent } = useSiteContent();
  const admissionsAvailable = !isLoading && periodOpen;
  const branding = siteContent.branding || {};
  const landing = siteContent.landing || {};
  const featureItems = buildFeatureItems(landing, branding);
  const heading = normalizeText(landing.title, branding.name || 'School Portal');
  const description = normalizeText(
    landing.description,
    `${normalizeText(branding.name, 'The school')} brings admissions, communication, and portal access into one organized experience.`
  );

  return (
    <main className="overflow-x-clip pb-12 pt-4 sm:pt-6">
      <Section className="pt-6 sm:pt-8 lg:pt-10">
        <Grid className="items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="min-w-0 space-y-6">
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-600">
                {normalizeText(landing.badge, 'School Portal')}
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
                {heading}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                {description}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to={admissionsAvailable ? '/admissions' : '/login'}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900"
              >
                {admissionsAvailable ? 'Start Admission' : 'Open Portal'}
              </Link>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex min-h-[280px] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 p-6 sm:min-h-[340px]">
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 px-6 py-10 text-center text-sm text-slate-500">
                Placeholder image / illustration container
              </div>
            </div>
          </div>
        </Grid>
      </Section>

      <Section>
        <div className="space-y-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-medium text-slate-600">Features</p>
            <h2 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              Clean blocks for the main school portal sections
            </h2>
            <p className="text-base leading-7 text-slate-600">
              This grid is intentionally lightweight so we can style each area in the next pass without changing the page structure.
            </p>
          </div>

          <Grid className="auto-rows-[minmax(11rem,auto)] gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featureItems.map((item) => (
              <FeatureCard
                key={item.key}
                title={item.title}
                description={item.description}
                image={item.image}
                imageAlt={item.imageAlt}
                iconLabel={item.iconLabel}
                ctaLabel={item.ctaLabel}
                ctaTo={item.ctaTo}
                featured={item.featured}
                accent={item.accent}
                className={item.className}
              />
            ))}
          </Grid>
        </div>
      </Section>
    </main>
  );
}

export default Landing;
