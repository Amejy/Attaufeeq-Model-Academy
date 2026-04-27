import SmartImage from '../components/SmartImage';
import { PremiumHero, SectionIntro } from '../components/public/PremiumPublic';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_GALLERY_PHOTOS, DEFAULT_IMAGES } from '../utils/defaultImages';

function captionFromPhoto(photo, index) {
  const alt = String(photo?.alt || '').trim();
  return alt || `Gallery Activity ${index + 1}`;
}

function Gallery() {
  const { siteContent } = useSiteContent();
  const gallery = siteContent.gallery || {};
  const photos = [...(gallery.photos || [])];
  const galleryPhotos = photos.length >= 15 ? photos : [...photos, ...DEFAULT_GALLERY_PHOTOS].slice(0, 15);

  return (
    <main className="premium-page">
      <PremiumHero
        accent="school"
        badge="Gallery"
        title={gallery.title}
        kicker="Campus Moments"
        description={gallery.description}
        image={galleryPhotos[0]?.url || DEFAULT_IMAGES.gallery}
        imageAlt={galleryPhotos[0]?.alt || 'School gallery'}
      />

      <section className="section-wrap premium-band">
        <SectionIntro
          eyebrow="Visual Story"
          title="School life in motion, memory, and atmosphere"
          description={gallery.description}
          align="center"
        />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {galleryPhotos.map((photo, index) => (
          <figure
            key={`${photo.url}-${index}`}
            className={`group overflow-hidden border border-white/70 bg-white/75 shadow-[0_20px_50px_rgba(8,_112,_184,_0.07)] ${
              index % 5 === 0 ? 'rounded-[28px]' : 'rounded-[22px]'
            }`}
          >
            <SmartImage
              src={photo.url}
              fallbackSrc={DEFAULT_IMAGES.gallery}
              alt={captionFromPhoto(photo, index)}
              className={`w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
                index % 5 === 0 ? 'h-72' : 'h-56'
              }`}
              loading="lazy"
            />
            <figcaption className="border-t border-slate-200/80 px-4 py-3 text-sm font-medium leading-6 text-slate-700">
              {captionFromPhoto(photo, index)}
            </figcaption>
          </figure>
        ))}
      </div>
      </section>
    </main>
  );
}

export default Gallery;
