import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';

const fallbackPhotos = [
  { url: '/images/hero-school.jpg', alt: 'School front view' },
  { url: '/images/students.jpg', alt: 'Students learning together' },
  { url: '/images/classroom.jpg', alt: 'Classroom activity' },
  { url: '/images/campus.jpg', alt: 'Campus environment' },
  { url: '/images/islamic-class.jpg', alt: 'Islamic learning session' },
  { url: '/images/hero-school.jpg', alt: 'School entrance view' },
  { url: '/images/students.jpg', alt: 'Students in active lesson' },
  { url: '/images/classroom.jpg', alt: 'Academic work in class' },
  { url: '/images/campus.jpg', alt: 'School building and grounds' },
  { url: '/images/islamic-class.jpg', alt: 'Madrasa classroom moment' },
  { url: '/images/hero-school.jpg', alt: 'School atmosphere' },
  { url: '/images/students.jpg', alt: 'Collaborative student session' },
  { url: '/images/classroom.jpg', alt: 'Learning resources in class' },
  { url: '/images/campus.jpg', alt: 'Campus daylight scene' },
  { url: '/images/islamic-class.jpg', alt: 'Focused madrasa study' }
];

function Gallery() {
  const { siteContent } = useSiteContent();
  const gallery = siteContent.gallery || {};
  const photos = [...(gallery.photos || [])];
  const galleryPhotos = photos.length >= 15 ? photos : [...photos, ...fallbackPhotos].slice(0, 15);

  return (
    <main className="section-wrap py-14">
      <h1 className="font-heading text-4xl text-primary">{gallery.title}</h1>
      <p className="mt-4 text-sm text-slate-700">{gallery.description}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {galleryPhotos.map((photo, index) => (
          <SmartImage
            key={`${photo.url}-${index}`}
            src={photo.url}
            fallbackSrc="/images/campus.jpg"
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
