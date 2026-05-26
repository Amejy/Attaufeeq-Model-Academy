import { getSectionMedia } from './publicSectionImages';

const schoolWebsiteMedia = getSectionMedia('schoolwebsite');
const galleryMedia = getSectionMedia('gallery');
const madrasaMedia = getSectionMedia('madrasawebsite');
const homeMedia = getSectionMedia('home');

export const DEFAULT_IMAGES = {
  campus: schoolWebsiteMedia.headerImage?.url || '/images/logo.png',
  classroom: schoolWebsiteMedia.supportingImages[0]?.url || schoolWebsiteMedia.headerImage?.url || '/images/logo.png',
  students: homeMedia.supportingImages[0]?.url || schoolWebsiteMedia.supportingImages[1]?.url || schoolWebsiteMedia.headerImage?.url || '/images/logo.png',
  community: schoolWebsiteMedia.supportingImages[2]?.url || schoolWebsiteMedia.supportingImages[0]?.url || schoolWebsiteMedia.headerImage?.url || '/images/logo.png',
  gallery: galleryMedia.headerImage?.url || schoolWebsiteMedia.headerImage?.url || '/images/logo.png',
  galleryAlt: galleryMedia.supportingImages[0]?.url || galleryMedia.headerImage?.url || '/images/logo.png',
  galleryWide: galleryMedia.supportingImages[1]?.url || galleryMedia.headerImage?.url || '/images/logo.png',
  galleryEvent: galleryMedia.supportingImages[2]?.url || galleryMedia.headerImage?.url || '/images/logo.png',
  madrasa: madrasaMedia.headerImage?.url || schoolWebsiteMedia.headerImage?.url || '/images/logo.png',
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
