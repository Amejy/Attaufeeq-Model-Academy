import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function Staff() {
  const { siteContent } = useSiteContent();
  const staff = siteContent.staff || {};
  const featuredStaff = staff.featuredStaff || [];

  return (
    <main className="section-wrap py-14">
      <h1 className="font-heading text-4xl text-primary">{staff.title}</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700">
        {staff.intro}
      </p>
      {featuredStaff.length > 0 && (
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {featuredStaff.map((person) => (
            <article key={`${person.name}-${person.role}`} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              {person.image && (
                <SmartImage
                  src={person.image}
                  fallbackSrc={DEFAULT_IMAGES.community}
                  alt={person.name}
                  className="h-48 w-full rounded-xl object-cover"
                  loading="lazy"
                />
              )}
              <h2 className="mt-4 font-heading text-2xl text-primary">{person.name}</h2>
              <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{person.role}</p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{person.bio}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export default Staff;
