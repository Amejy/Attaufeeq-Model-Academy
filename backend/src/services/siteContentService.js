import { env } from '../config/env.js';
import { loadAppState, saveAppState } from '../repositories/appStateRepository.js';
import { deleteCacheByPrefix, setCacheJson, withCache } from './cacheService.js';

const SITE_CONTENT_KEY = 'public_site_content';
const SITE_CONTENT_CACHE_KEY = 'site-content:public';

export const defaultSiteContent = {
  branding: {
    name: 'ATTAUFEEQ Model Academy',
    motto: 'Learning & Implementation',
    domain: 'attaufiqschools.com',
    intro:
      'ATTAUFEEQ Model Academy is a modern educational institution committed to nurturing excellence in both Western and Islamic education. Our mission is to develop students who are academically strong, morally upright, and prepared for the future.',
    address: 'No 6, Ahmed Ali Close Off Zambia Road Barnawa Kaduna South, Kaduna.',
    phone: '02014539252, 07030383103',
    email: 'attaufeeqmodelacademybarnawa@gmail.com',
    navSubtitle: 'Family-first school portal with modern and madrasa pathways.',
    logoUrl: '/images/logo.png'
  },
  landing: {
    badge: 'Premium Digital Campus',
    title: 'One beautiful school portal for academic strength, discipline, and faith.',
    description:
      'ATTAUFEEQ Model Academy brings public school identity, portal access, admissions, news, and parent communication into one modern experience.',
    stats: [
      { value: '4+', title: 'Portal Roles', text: 'Students, parents, teachers, and admin under one system' },
      { value: '2', title: 'Institutions', text: 'ATTAUFEEQ Model Academy and Madrasa flows stay clearly separated' },
      { value: '1', title: 'Shared Portal', text: 'One polished experience across admissions, results, and communication' }
    ],
    snapshotTitle: 'Fast, calm, high-trust school experience',
    snapshotItems: ['Admissions Tracking', 'Role Dashboards', 'Parent Messaging', 'News & Media'],
    institutions: [
      {
        title: 'ATTAUFEEQ Model Academy',
        description:
          'Western academic education with strong exam preparation, confidence-building instruction, and a disciplined growth culture.',
        image: '/images/classroom.jpg',
        to: '/modern-academy',
        badge: 'Model Track',
        accent: 'from-emerald-950 via-emerald-800 to-amber-500'
      },
      {
        title: 'Madrastul ATTAUFEEQ',
        description:
          "Qur'an memorization, Tajweed, Arabic, and strong Islamic values delivered in a calm, focused learning environment.",
        image: '/images/islamic-class.jpg',
        to: '/madrastul-attaufiq',
        badge: 'Madrasa Track',
        accent: 'from-slate-900 via-amber-700 to-yellow-400'
      }
    ]
  },
  home: {
    heroBadge: 'ATTAUFEEQ Model Academy',
    heroTitle: 'A school website that feels alive, confident, and trusted.',
    heroDescription:
      'ATTAUFEEQ Model Academy is a modern educational institution committed to nurturing excellence in both Western and Islamic education. Our mission is to develop students who are academically strong, morally upright, and prepared for the future.',
    heroStats: [
      { value: '2', title: 'Tracks', text: 'Model + Madrasa' },
      { value: '1', title: 'Portal', text: 'All core roles' },
      { value: '24/7', title: 'Access', text: 'News, access, records' }
    ],
    heroImages: [
      { url: '/images/hero-school.jpg', alt: 'ATTAUFEEQ school environment' },
      { url: '/images/students.jpg', alt: 'Students learning in class' },
      { url: '/images/campus.jpg', alt: 'School campus and facilities' }
    ],
    highlightsEyebrow: 'School Highlights',
    highlightsTitle: 'A brighter, stronger public presence',
    highlightsDescription:
      'Every card, section, and CTA now carries the same premium visual language so the school feels intentional instead of generic.',
    highlights: [
      {
        title: 'Academic Excellence',
        text: 'Our students consistently perform well in WAEC and NECO examinations.',
        image: '/images/students.jpg'
      },
      {
        title: 'Qualified Teachers',
        text: 'Our experienced teachers are dedicated to delivering quality education.',
        image: '/images/classroom.jpg'
      },
      {
        title: 'Modern Facilities',
        text: 'The school provides well-equipped classrooms and learning environments.',
        image: '/images/campus.jpg'
      },
      {
        title: 'Islamic Education',
        text: 'Students receive strong Islamic training through Madrastul ATTAUFEEQ.',
        image: '/images/islamic-class.jpg'
      }
    ],
    storyEyebrow: 'School Story',
    storyTitle: 'Education with structure, confidence, and values',
    storyText:
      'ATTAUFEEQ Model Academy was founded with the vision of providing a balanced education that combines academic excellence with strong moral and Islamic values.',
    storyImage: '/images/campus.jpg',
    programsEyebrow: 'Academic Programs',
    programsTitle: 'Two institutions. One polished digital identity.',
    programsDescription:
      'Each program keeps its own personality while still feeling part of one well-crafted brand experience.',
    programs: [
      {
        title: 'ATTAUFEEQ Model Academy',
        description:
          'Western academic education in Mathematics, English, Science, Social Studies, and Technology using national standards and exam preparation pathways.',
        standards: ['WAEC', 'NECO', 'National Education Standards'],
        image: '/images/classroom.jpg'
      },
      {
        title: 'Madrastul ATTAUFEEQ',
        description:
          "Islamic education with Qur'an memorization, Tajweed, Arabic language, and foundational Islamic studies.",
        standards: ['Quran Memorization', 'Tajweed', 'Arabic Language'],
        image: '/images/islamic-class.jpg'
      }
    ],
    ctaEyebrow: 'Ready to join?',
    ctaTitle: 'Give your child a portal and campus experience that feels first-class.',
    ctaDescription:
      'The public site should invite trust immediately, and the portal should feel organized, calm, and modern on every screen size.'
  },
  about: {
    title: 'About Us',
    historyTitle: 'School History',
    historyText:
      'ATTAUFEEQ Model Academy was established with the goal of providing a comprehensive educational system that blends modern academic knowledge with Islamic moral values. The school has continued to expand while maintaining high standards of discipline and excellence.',
    historySections: [
      {
        title: 'Establishment and Meaning',
        paragraphs: [
          'ATTAUFEEQ Model Academy was established on the 2nd of October, 2017, with a clear vision of providing quality education and nurturing excellence among young learners.',
          'The name "ATTAUFEEQ" is derived from the Arabic language, meaning success or divine guidance towards achievement. This name reflects the school mission to guide students toward academic excellence and moral uprightness.'
        ],
        bullets: []
      },
      {
        title: 'Humble Beginnings',
        paragraphs: [
          'The school began with only a few pioneering students, namely:',
          'At inception, the institution operated with just three classes and four teachers, supported by a cashier and a nanny. Despite these modest beginnings, the school was driven by dedication, discipline, and a passion for quality education.'
        ],
        bullets: ['Muhsin Musa', 'Uthman Yunus Muazu', 'Khadija Adam', 'Mustapha Ismail']
      },
      {
        title: 'Growth and Development',
        paragraphs: [
          'Over time, the school experienced steady growth as more pupils enrolled. This expansion was largely attributed to the positive academic impact and strong commitment of the teachers, which significantly improved student performance.',
          'Today, ATTAUFEEQ Model Academy has grown into a well-structured institution with multiple classes, qualified teaching staff, and distinct sections, including:',
          'This growth stands as a testament to the school consistency and commitment to excellence.'
        ],
        bullets: ['Nursery Section', 'Primary Section', 'Secondary Section']
      },
      {
        title: 'A Trial and Resilience',
        paragraphs: [
          'On the 12th of January, 2020, the school faced a major setback when a devastating fire outbreak destroyed more than 80% of the school facilities, including desks, textbooks, registers, and other essential materials.',
          'Despite this tragic event, the school community remained steadfast. With faith in Almighty Allah and unwavering determination, the institution was able to recover and resume operations within just two weeks.',
          'This remarkable resilience not only restored the school but also strengthened its foundation, making it even more determined and capable than before.'
        ],
        bullets: []
      },
      {
        title: 'Present Day',
        paragraphs: [
          'Today, ATTAUFEEQ Model Academy stands as a symbol of perseverance, growth, and academic excellence. The school continues to uphold its mission of nurturing students intellectually, morally, and socially, preparing them for a successful future.'
        ],
        bullets: []
      }
    ],
    signLabel: 'Sign',
    signatureImage: '/images/admin-signature.svg',
    image: '/images/campus.jpg',
    visionTitle: 'Vision',
    visionText:
      'To become a leading educational institution that develops intellectually capable, morally upright, and socially responsible students.',
    missionTitle: 'Mission',
    missionText:
      'Our mission is to provide high-quality education that nurtures academic excellence, character development, and spiritual growth.',
    valuesTitle: 'Core Values',
    values: ['Discipline', 'Integrity', 'Academic Excellence', 'Faith and Morality', 'Community Service']
  },
  academics: {
    title: 'Academics',
    intro:
      'ATTAUFEEQ Model Academy provides structured learning pathways across nursery, primary, secondary, and madrasa programs to support all-round student development.',
    levelsTitle: 'Educational Levels',
    levels: ['Nursery School', 'Primary School', 'Secondary School', 'Madrasa Program'],
    image: '/images/students.jpg',
    subjectsTitle: 'Subjects Offered',
    subjectsText:
      'Mathematics, English Language, Basic Science, Computer Studies, Social Studies, Arabic Language, and Islamic Studies.',
    curriculumTitle: 'Curriculum Standards',
    curriculumText:
      "ATTAUFEEQ Model Academy follows national educational standards including WAEC and NECO preparation, while the Madrasa program focuses on Qur'an studies, Tajweed, Arabic language, and Islamic knowledge."
  },
  staff: {
    title: 'Staff and Teachers',
    intro:
      'Meet the educators and school staff who support academic growth, discipline, and day-to-day student care.',
    featuredStaff: []
  },
  gallery: {
    title: 'Gallery',
    description: 'School life, classes, and student activities.',
    photos: [
      { url: '/images/hero-school.jpg', alt: 'School gallery hero view' },
      { url: '/images/students.jpg', alt: 'Students learning in class' },
      { url: '/images/classroom.jpg', alt: 'Classroom session' },
      { url: '/images/campus.jpg', alt: 'School campus' },
      { url: '/images/islamic-class.jpg', alt: 'Islamic learning session' }
    ]
  },
  madrasa: {
    eyebrow: 'Institution',
    title: 'Madrastul ATTAUFEEQ',
    description:
      "A dedicated Islamic learning environment supporting Qur'anic excellence, moral training, and spiritual growth for every learner.",
    image: '/images/islamic-class.jpg',
    modulesTitle: 'Madrasa Learning Modules',
    modulesSubtitle: 'Core components designed for academic and spiritual depth.',
    modules: [
      {
        title: "Qur'an Memorization",
        text: 'Structured memorization goals with progress tracking and revision cycles.'
      },
      {
        title: 'Tajweed',
        text: "Guided pronunciation and recitation standards for accurate Qur'anic reading."
      },
      {
        title: 'Arabic Language',
        text: 'Foundational to intermediate Arabic for comprehension, writing, and communication.'
      },
      {
        title: 'Islamic Studies',
        text: 'Core teachings in Aqeedah, Fiqh, Seerah, and Islamic character development.'
      }
    ]
  },
  contact: {
    title: 'Contact',
    infoTitle: 'Get in Touch',
    formTitle: 'Send a Message',
    formDescription:
      'Questions about admissions, school life, or portal access can be sent here and will be recorded for follow-up.',
    submitLabel: 'Send Message',
    successMessage: 'Message sent successfully. The school will follow up shortly.'
  }
};

function normalizeSchoolNameText(value = '') {
  if (!value) return value;
  let next = String(value);
  next = next.replace(/madrastul\s+atta(feeq|f[eui]eq|f[eu]iq|fueeq|fiq)/gi, 'Madrastul ATTAUFEEQ');
  next = next.replace(/atta(feeq|f[eui]eq|f[eu]iq|fueeq|fiq)/gi, 'ATTAUFEEQ');
  return next;
}

function cleanText(value, fallback = '') {
  const normalized = typeof value === 'string' ? normalizeSchoolNameText(value.trim()) : '';
  return normalized || fallback;
}

function cleanStringArray(values, fallback = []) {
  const rows = Array.isArray(values) ? values : fallback;
  return rows
    .map((value) => cleanText(value))
    .filter(Boolean);
}

function cleanObjectArray(values, fallback, mapper) {
  const rows = Array.isArray(values) ? values : fallback;
  return rows.map((row, index) => mapper(row || {}, fallback[index] || {})).filter(Boolean);
}

export function normalizeSiteContent(payload = {}) {
  const branding = payload.branding || {};
  const landing = payload.landing || {};
  const home = payload.home || {};
  const about = payload.about || {};
  const academics = payload.academics || {};
  const staff = payload.staff || {};
  const gallery = payload.gallery || {};
  const madrasa = payload.madrasa || {};
  const contact = payload.contact || {};

  return {
    branding: {
      name: cleanText(branding.name, defaultSiteContent.branding.name),
      motto: cleanText(branding.motto, defaultSiteContent.branding.motto),
      domain: cleanText(branding.domain, defaultSiteContent.branding.domain),
      intro: cleanText(branding.intro, defaultSiteContent.branding.intro),
      address: cleanText(branding.address, defaultSiteContent.branding.address),
      phone: cleanText(branding.phone, defaultSiteContent.branding.phone),
      email: cleanText(branding.email, defaultSiteContent.branding.email),
      navSubtitle: cleanText(branding.navSubtitle, defaultSiteContent.branding.navSubtitle)
    },
    landing: {
      badge: cleanText(landing.badge, defaultSiteContent.landing.badge),
      title: cleanText(landing.title, defaultSiteContent.landing.title),
      description: cleanText(landing.description, defaultSiteContent.landing.description),
      stats: cleanObjectArray(landing.stats, defaultSiteContent.landing.stats, (row, fallback) => ({
        value: cleanText(row.value, fallback.value),
        title: cleanText(row.title, fallback.title),
        text: cleanText(row.text, fallback.text)
      })),
      snapshotTitle: cleanText(landing.snapshotTitle, defaultSiteContent.landing.snapshotTitle),
      snapshotItems: cleanStringArray(landing.snapshotItems, defaultSiteContent.landing.snapshotItems),
      institutions: cleanObjectArray(landing.institutions, defaultSiteContent.landing.institutions, (row, fallback) => ({
        title: cleanText(row.title, fallback.title),
        description: cleanText(row.description, fallback.description),
        image: cleanText(row.image, fallback.image),
        to: cleanText(row.to, fallback.to),
        badge: cleanText(row.badge, fallback.badge),
        accent: cleanText(row.accent, fallback.accent)
      }))
    },
    home: {
      heroBadge: cleanText(home.heroBadge, defaultSiteContent.home.heroBadge),
      heroTitle: cleanText(home.heroTitle, defaultSiteContent.home.heroTitle),
      heroDescription: cleanText(home.heroDescription, defaultSiteContent.home.heroDescription),
      heroStats: cleanObjectArray(home.heroStats, defaultSiteContent.home.heroStats, (row, fallback) => ({
        value: cleanText(row.value, fallback.value),
        title: cleanText(row.title, fallback.title),
        text: cleanText(row.text, fallback.text)
      })),
      heroImages: cleanObjectArray(home.heroImages, defaultSiteContent.home.heroImages, (row, fallback) => ({
        url: cleanText(row.url, fallback.url),
        alt: cleanText(row.alt, fallback.alt)
      })),
      highlightsEyebrow: cleanText(home.highlightsEyebrow, defaultSiteContent.home.highlightsEyebrow),
      highlightsTitle: cleanText(home.highlightsTitle, defaultSiteContent.home.highlightsTitle),
      highlightsDescription: cleanText(home.highlightsDescription, defaultSiteContent.home.highlightsDescription),
      highlights: cleanObjectArray(home.highlights, defaultSiteContent.home.highlights, (row, fallback) => ({
        title: cleanText(row.title, fallback.title),
        text: cleanText(row.text, fallback.text),
        image: cleanText(row.image, fallback.image)
      })),
      storyEyebrow: cleanText(home.storyEyebrow, defaultSiteContent.home.storyEyebrow),
      storyTitle: cleanText(home.storyTitle, defaultSiteContent.home.storyTitle),
      storyText: cleanText(home.storyText, defaultSiteContent.home.storyText),
      storyImage: cleanText(home.storyImage, defaultSiteContent.home.storyImage),
      programsEyebrow: cleanText(home.programsEyebrow, defaultSiteContent.home.programsEyebrow),
      programsTitle: cleanText(home.programsTitle, defaultSiteContent.home.programsTitle),
      programsDescription: cleanText(home.programsDescription, defaultSiteContent.home.programsDescription),
      programs: cleanObjectArray(home.programs, defaultSiteContent.home.programs, (row, fallback) => ({
        title: cleanText(row.title, fallback.title),
        description: cleanText(row.description, fallback.description),
        standards: cleanStringArray(row.standards, fallback.standards),
        image: cleanText(row.image, fallback.image)
      })),
      ctaEyebrow: cleanText(home.ctaEyebrow, defaultSiteContent.home.ctaEyebrow),
      ctaTitle: cleanText(home.ctaTitle, defaultSiteContent.home.ctaTitle),
      ctaDescription: cleanText(home.ctaDescription, defaultSiteContent.home.ctaDescription)
    },
    about: {
      title: cleanText(about.title, defaultSiteContent.about.title),
      historyTitle: cleanText(about.historyTitle, defaultSiteContent.about.historyTitle),
      historyText: cleanText(about.historyText, defaultSiteContent.about.historyText),
      historySections: cleanObjectArray(about.historySections, defaultSiteContent.about.historySections, (row, fallback = {}) => ({
        title: cleanText(row.title, fallback.title || ''),
        paragraphs: cleanStringArray(row.paragraphs, fallback.paragraphs || []),
        bullets: cleanStringArray(row.bullets, fallback.bullets || [])
      })),
      signLabel: cleanText(about.signLabel, defaultSiteContent.about.signLabel),
      signatureImage: cleanText(about.signatureImage, defaultSiteContent.about.signatureImage),
      image: cleanText(about.image, defaultSiteContent.about.image),
      visionTitle: cleanText(about.visionTitle, defaultSiteContent.about.visionTitle),
      visionText: cleanText(about.visionText, defaultSiteContent.about.visionText),
      missionTitle: cleanText(about.missionTitle, defaultSiteContent.about.missionTitle),
      missionText: cleanText(about.missionText, defaultSiteContent.about.missionText),
      valuesTitle: cleanText(about.valuesTitle, defaultSiteContent.about.valuesTitle),
      values: cleanStringArray(about.values, defaultSiteContent.about.values)
    },
    academics: {
      title: cleanText(academics.title, defaultSiteContent.academics.title),
      intro: cleanText(academics.intro, defaultSiteContent.academics.intro),
      levelsTitle: cleanText(academics.levelsTitle, defaultSiteContent.academics.levelsTitle),
      levels: cleanStringArray(academics.levels, defaultSiteContent.academics.levels),
      image: cleanText(academics.image, defaultSiteContent.academics.image),
      subjectsTitle: cleanText(academics.subjectsTitle, defaultSiteContent.academics.subjectsTitle),
      subjectsText: cleanText(academics.subjectsText, defaultSiteContent.academics.subjectsText),
      curriculumTitle: cleanText(academics.curriculumTitle, defaultSiteContent.academics.curriculumTitle),
      curriculumText: cleanText(academics.curriculumText, defaultSiteContent.academics.curriculumText)
    },
    staff: {
      title: cleanText(staff.title, defaultSiteContent.staff.title),
      intro: cleanText(staff.intro, defaultSiteContent.staff.intro),
      featuredStaff: cleanObjectArray(staff.featuredStaff, defaultSiteContent.staff.featuredStaff, (row, fallback = {}) => ({
        name: cleanText(row.name, fallback.name || ''),
        role: cleanText(row.role, fallback.role || ''),
        bio: cleanText(row.bio, fallback.bio || ''),
        image: cleanText(row.image, fallback.image || '')
      }))
    },
    gallery: {
      title: cleanText(gallery.title, defaultSiteContent.gallery.title),
      description: cleanText(gallery.description, defaultSiteContent.gallery.description),
      photos: cleanObjectArray(gallery.photos, defaultSiteContent.gallery.photos, (row, fallback) => ({
        url: cleanText(row.url, fallback.url),
        alt: cleanText(row.alt, fallback.alt)
      }))
    },
    madrasa: {
      eyebrow: cleanText(madrasa.eyebrow, defaultSiteContent.madrasa.eyebrow),
      title: cleanText(madrasa.title, defaultSiteContent.madrasa.title),
      description: cleanText(madrasa.description, defaultSiteContent.madrasa.description),
      image: cleanText(madrasa.image, defaultSiteContent.madrasa.image),
      modulesTitle: cleanText(madrasa.modulesTitle, defaultSiteContent.madrasa.modulesTitle),
      modulesSubtitle: cleanText(madrasa.modulesSubtitle, defaultSiteContent.madrasa.modulesSubtitle),
      modules: cleanObjectArray(madrasa.modules, defaultSiteContent.madrasa.modules, (row, fallback) => ({
        title: cleanText(row.title, fallback.title),
        text: cleanText(row.text, fallback.text)
      }))
    },
    contact: {
      title: cleanText(contact.title, defaultSiteContent.contact.title),
      infoTitle: cleanText(contact.infoTitle, defaultSiteContent.contact.infoTitle),
      formTitle: cleanText(contact.formTitle, defaultSiteContent.contact.formTitle),
      formDescription: cleanText(contact.formDescription, defaultSiteContent.contact.formDescription),
      submitLabel: cleanText(contact.submitLabel, defaultSiteContent.contact.submitLabel),
      successMessage: cleanText(contact.successMessage, defaultSiteContent.contact.successMessage)
    }
  };
}

export async function loadSiteContent(options = {}) {
  const shouldBypassCache = Boolean(options?.executor?.query || options.skipCache);
  const loader = async () => {
    const row = await loadAppState(SITE_CONTENT_KEY, options);
    if (!row?.payload) {
      const saved = await saveAppState(SITE_CONTENT_KEY, defaultSiteContent, options);
      return saved?.payload ? normalizeSiteContent(saved.payload) : normalizeSiteContent(defaultSiteContent);
    }

    return normalizeSiteContent(row.payload);
  };

  if (shouldBypassCache) {
    return loader();
  }

  const cached = await withCache(SITE_CONTENT_CACHE_KEY, loader, {
    ttlSeconds: Math.max(60, env.cacheDefaultTtlSeconds)
  });
  return normalizeSiteContent(cached);
}

export async function saveSiteContent(payload, options = {}) {
  const normalized = normalizeSiteContent(payload);
  const row = await saveAppState(SITE_CONTENT_KEY, normalized, options);
  const content = row?.payload ? normalizeSiteContent(row.payload) : normalized;
  await deleteCacheByPrefix('site-content:');
  await setCacheJson(SITE_CONTENT_CACHE_KEY, content, {
    ttlSeconds: Math.max(60, env.cacheDefaultTtlSeconds)
  });
  return {
    content,
    updatedAt: row?.updated_at || null
  };
}

export async function normalizeAndPersistSiteContent(options = {}) {
  const row = await loadAppState(SITE_CONTENT_KEY, options);
  const current = row?.payload ? normalizeSiteContent(row.payload) : normalizeSiteContent(defaultSiteContent);
  const saved = await saveAppState(SITE_CONTENT_KEY, current, options);
  const content = saved?.payload ? normalizeSiteContent(saved.payload) : current;
  await deleteCacheByPrefix('site-content:');
  await setCacheJson(SITE_CONTENT_CACHE_KEY, content, {
    ttlSeconds: Math.max(60, env.cacheDefaultTtlSeconds)
  });
  return content;
}
