import SmartImage from '../SmartImage';
import { SectionIntro } from './PremiumPublic';
import { DEFAULT_IMAGES } from '../../utils/defaultImages';

function SectionPhotoGrid({
  eyebrow = 'Photo Highlights',
  title = 'More Views',
  description = '',
  photos = [],
  fallbackSrc = DEFAULT_IMAGES.campus
}) {
  if (!Array.isArray(photos) || !photos.length) {
    return null;
  }

  return (
    <section className="section-wrap premium-band pt-0">
      <SectionIntro eyebrow={eyebrow} title={title} description={description} align="center" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, index) => (
          <figure
            key={`${photo.url}-${index}`}
            className="overflow-hidden rounded-[24px] border border-white/70 bg-white/75 shadow-[0_20px_50px_rgba(8,_112,_184,_0.07)]"
          >
            <SmartImage
              src={photo.url}
              fallbackSrc={fallbackSrc}
              alt={photo.alt || `${title} ${index + 1}`}
              className="h-56 w-full object-cover"
              loading="lazy"
            />
          </figure>
        ))}
      </div>
    </section>
  );
}

export default SectionPhotoGrid;
