import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_GALLERY_PHOTOS, DEFAULT_IMAGES } from '../utils/defaultImages';

function Gallery() {
  const { siteContent } = useSiteContent();
  const gallery = siteContent.gallery || {};
  const photos = [...(gallery.photos || [])];
  const galleryPhotos = photos.length >= 15 ? photos : [...photos, ...DEFAULT_GALLERY_PHOTOS].slice(0, 15);

  return (
    <main className="section-wrap py-14">
      <h1 className="font-heading text-4xl text-primary">{gallery.title}</h1>
      <p className="mt-4 text-sm text-slate-700">{gallery.description}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {galleryPhotos.map((photo, index) => (
          <SmartImage
            key={`${photo.url}-${index}`}
            src={photo.url}
            fallbackSrc={DEFAULT_IMAGES.gallery}
            alt={photo.alt || 'School gallery'}
            className="h-56 w-full rounded-lg object-cover"
            loading="lazy"
          />
        ))}
      </div>
    </main>
  );
}

export default Gallery;
