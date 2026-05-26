import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REFRESH_SECRET = process.env.REFRESH_SECRET || 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/attaufiqschools_test';

const { normalizeSiteContent, defaultSiteContent } = await import('../src/services/siteContentService.js');

test('normalizeSiteContent preserves branding logo URL', () => {
  const content = normalizeSiteContent({
    branding: {
      ...defaultSiteContent.branding,
      logoUrl: 'https://cdn.example.com/custom-logo.png'
    }
  });

  assert.equal(content.branding.logoUrl, 'https://cdn.example.com/custom-logo.png');
});

test('normalizeSiteContent does not rewrite asset URLs containing the school name', () => {
  const content = normalizeSiteContent({
    about: {
      ...defaultSiteContent.about,
      signatureImage: 'https://attaufeeq-assets.example.com/signature.png'
    }
  });

  assert.equal(
    content.about.signatureImage,
    'https://attaufeeq-assets.example.com/signature.png'
  );
});
