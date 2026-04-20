export const DEFAULT_IMAGES = {
  campus: '/images/schoolwebsite1.png',
  classroom: '/images/schoolweb2.png',
  students: '/images/schoolweb3.png',
  community: '/images/schoolweb4.png',
  gallery: '/images/gallery1.png',
  galleryAlt: '/images/gallery2.png',
  galleryWide: '/images/gallery3.png',
  galleryEvent: '/images/gallery4.png',
  madrasa: '/images/gallery5.png',
};

export const DEFAULT_HERO_IMAGES = [
  { url: DEFAULT_IMAGES.campus, alt: 'ATTAUFEEQ school campus' },
  { url: DEFAULT_IMAGES.students, alt: 'Students learning together' },
  { url: DEFAULT_IMAGES.community, alt: 'School life and community moments' },
];

export function getInstitutionImageFallback(target) {
  const normalizedTarget = String(target || '').trim().toLowerCase();

  if (normalizedTarget.includes('madrasa')) {
    return DEFAULT_IMAGES.madrasa;
  }

  if (normalizedTarget.includes('quran') || normalizedTarget.includes('memor')) {
    return DEFAULT_IMAGES.galleryEvent;
  }

  return DEFAULT_IMAGES.classroom;
}

export const DEFAULT_GALLERY_PHOTOS = [
  { url: DEFAULT_IMAGES.campus, alt: 'School front view' },
  { url: DEFAULT_IMAGES.classroom, alt: 'Classroom activity' },
  { url: DEFAULT_IMAGES.students, alt: 'Students learning together' },
  { url: DEFAULT_IMAGES.community, alt: 'School community event' },
  { url: DEFAULT_IMAGES.gallery, alt: 'Students in assembly' },
  { url: DEFAULT_IMAGES.galleryAlt, alt: 'School learning environment' },
  { url: DEFAULT_IMAGES.galleryWide, alt: 'School grounds and atmosphere' },
  { url: DEFAULT_IMAGES.galleryEvent, alt: 'Special school event moment' },
  { url: DEFAULT_IMAGES.madrasa, alt: 'Madrasa learning session' },
  { url: DEFAULT_IMAGES.campus, alt: 'Main school entry view' },
  { url: DEFAULT_IMAGES.classroom, alt: 'Focused classroom instruction' },
  { url: DEFAULT_IMAGES.students, alt: 'Students collaborating in class' },
  { url: DEFAULT_IMAGES.community, alt: 'Parents and students on campus' },
  { url: DEFAULT_IMAGES.galleryWide, alt: 'Campus daylight scene' },
  { url: DEFAULT_IMAGES.madrasa, alt: 'Focused Islamic study session' },
];
