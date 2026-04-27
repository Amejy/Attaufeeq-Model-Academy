import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import FeatureCard from '../components/FeatureCard';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import { Grid, Section } from '../components/layout/LayoutPrimitives';
import {
  GlassPanel,
  IdentityCard,
  LiveTicker,
  PremiumHero,
  SectionIntro
} from '../components/public/PremiumPublic';
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
    className: index === 0 ? 'lg:col-span-2 min-h-[12.25rem]' : 'min-h-[11rem]'
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
    className: 'min-h-[11.5rem]'
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
    className: index === 0 ? 'min-h-[12.25rem]' : 'min-h-[10.75rem]'
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
      className: 'lg:col-span-2 min-h-[12.25rem]'
    },
    {
      key: 'fallback-admissions',
      title: 'Admissions',
      description: 'Application entry and enrollment information container.',
      iconLabel: 'AD',
      ctaLabel: 'Learn more',
      ctaTo: '/admissions',
      accent: 'emerald',
      className: 'min-h-[11rem]'
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
      className: 'min-h-[12.25rem]'
    },
    {
      key: 'fallback-news',
      title: 'News & Events',
      description: 'Announcements and school activity container.',
      iconLabel: 'NE',
      ctaLabel: 'Open',
      ctaTo: '/news',
      accent: 'slate',
      className: 'min-h-[10.75rem]'
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
    <main className="premium-page overflow-x-clip">
      <PremiumHero
        badge={normalizeText(landing.badge, 'School Portal')}
        title={heading}
        kicker={branding.motto}
        description={description}
        image={getInstitutionImageFallback('campus')}
        imageAlt={branding.name || 'School campus'}
        stats={(landing.stats || []).slice(0, 3)}
        primaryAction={{ to: admissionsAvailable ? '/admissions' : '/login', label: admissionsAvailable ? 'Start Admission' : 'Open Portal' }}
        secondaryAction={{ to: '/news', label: 'View Updates' }}
      />

      <section className="section-wrap premium-band">
        <SectionIntro
          eyebrow="Two Learning Tracks"
          title="Choose the live campus experience you want to enter"
          description="The school and madrasa pathways stay visually connected while each keeps its own identity, tone, and entry flow."
          align="center"
        />
        <div className="premium-grid premium-grid--2">
          {(landing.institutions || []).slice(0, 2).map((item, index) => (
            <IdentityCard
              key={item.title}
              title={item.title}
              badge={item.badge}
              description={item.description}
              to={item.to || '/'}
              image={item.image || getInstitutionImageFallback(item.title)}
              imageAlt={item.title}
              accent={index === 0 ? 'school' : 'madrasa'}
            />
          ))}
        </div>
      </section>

      <section className="section-wrap pb-6">
        <LiveTicker items={landing.snapshotItems || []} />
      </section>

      <Section className="premium-band pt-10">
        <SectionIntro
          eyebrow="Portal Features"
          title={normalizeText(landing.snapshotTitle, 'Fast, calm, high-trust school experience')}
          description="The public-facing sections now present admissions, academics, results, announcements, and family access as one modern system."
        />

        <Grid className="auto-rows-[minmax(11rem,auto)] gap-5 md:grid-cols-2 xl:grid-cols-3">
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
              className={`${item.className || ''} card-feature`}
            />
          ))}
        </Grid>
      </Section>

      <section className="section-wrap pb-20">
        <GlassPanel className="premium-split-card p-6 sm:p-8">
          <div>
            <p className="premium-section-intro__eyebrow">Unified Access</p>
            <h2 className="premium-section-intro__title text-[clamp(1.8rem,4vw,2.8rem)]">
              Admissions, updates, and student access all move through one polished system
            </h2>
            <p className="premium-section-intro__description">
              Families can move from public information to portal actions without losing context, while staff keeps the school and madrasa flows clearly separated.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/modern-academy" className="premium-button premium-button--primary">Open School Website</Link>
            <Link to="/madrastul-attaufiq" className="premium-button rounded-full border border-slate-300 bg-white px-6 text-slate-800">Open Madrasa Website</Link>
          </div>
        </GlassPanel>
      </section>
    </main>
  );
}

export default Landing;
