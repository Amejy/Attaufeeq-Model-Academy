function asPublicPath(path) {
  return encodeURI(String(path || '').trim());
}

function startCase(value = '') {
  return String(value || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toAltText(path, label, index) {
  const fileName = String(path || '').split('/').pop() || '';
  if (/main image/i.test(fileName)) {
    return `${label} main image`;
  }
  const normalized = startCase(fileName);
  return normalized || `${label} image ${index + 1}`;
}

function buildSectionMedia(paths = [], label = 'School') {
  const images = paths.map((path, index) => ({
    url: asPublicPath(path),
    alt: toAltText(path, label, index)
  }));
  const mainIndex = paths.findIndex((path) => /main image/i.test(String(path || '')));
  const normalizedMainIndex = mainIndex >= 0 ? mainIndex : 0;
  const headerImage = images[normalizedMainIndex] || null;
  const supportingImages = images.filter((_, index) => index !== normalizedMainIndex);

  return {
    headerImage,
    supportingImages,
    allImages: headerImage ? [headerImage, ...supportingImages] : supportingImages
  };
}

const SECTION_IMAGE_FOLDERS = {
  home: [
    '/images/Home/Pasted image (2).png',
    '/images/Home/Pasted image (3).png',
    '/images/Home/Pasted image (4).png',
    '/images/Home/Pasted image (5).png',
    '/images/Home/main image.png'
  ],
  academics: [
    '/images/academics/Pasted image.png',
    '/images/academics/main image (2).png'
  ],
  admission: [
    '/images/admission/Pasted image.png'
  ],
  contact: [
    '/images/contact/Pasted image.png',
    '/images/contact/main image (2).png'
  ],
  gallery: [
    '/images/gallery/Pasted image (10).png',
    '/images/gallery/Pasted image (11).png',
    '/images/gallery/Pasted image (12).png',
    '/images/gallery/Pasted image (13).png',
    '/images/gallery/Pasted image (14).png',
    '/images/gallery/Pasted image (15).png',
    '/images/gallery/Pasted image (2).png',
    '/images/gallery/Pasted image (3).png',
    '/images/gallery/Pasted image (4).png',
    '/images/gallery/Pasted image (5).png',
    '/images/gallery/Pasted image (6).png',
    '/images/gallery/Pasted image (7).png',
    '/images/gallery/Pasted image (8).png',
    '/images/gallery/Pasted image (9).png',
    '/images/gallery/Pasted image.png',
    '/images/gallery/main image (16).png'
  ],
  madrasawebsite: [
    '/images/madrasawebsite/Pasted image (2).png',
    '/images/madrasawebsite/main image.png'
  ],
  result: [
    '/images/result/Pasted image.png'
  ],
  schoolwebsite: [
    '/images/schoolwebsite/Pasted image (2).png',
    '/images/schoolwebsite/Pasted image (3).png',
    '/images/schoolwebsite/Pasted image (4).png',
    '/images/schoolwebsite/Pasted image (5).png',
    '/images/schoolwebsite/Pasted image (7).png',
    '/images/schoolwebsite/Pasted image (8).png',
    '/images/schoolwebsite/Pasted image.png',
    '/images/schoolwebsite/main image (6).png'
  ]
};

const SECTION_ALIASES = {
  about: 'schoolwebsite',
  landing: 'schoolwebsite',
  madrasa: 'madrasawebsite'
};

const SECTION_LABELS = {
  home: 'Home',
  academics: 'Academics',
  admission: 'Admissions',
  contact: 'Contact',
  gallery: 'Gallery',
  madrasawebsite: 'Madrasa Website',
  result: 'Result',
  schoolwebsite: 'School Website'
};

const SECTION_MEDIA = Object.fromEntries(
  Object.entries(SECTION_IMAGE_FOLDERS).map(([key, paths]) => [
    key,
    buildSectionMedia(paths, SECTION_LABELS[key] || 'School')
  ])
);

export function getSectionMedia(section) {
  const normalized = SECTION_ALIASES[String(section || '').trim().toLowerCase()] || String(section || '').trim().toLowerCase();
  return SECTION_MEDIA[normalized] || { headerImage: null, supportingImages: [], allImages: [] };
}
