import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAssetUrl } from './assetUrl.js';

test('resolveAssetUrl keeps public assets stable', () => {
  assert.equal(resolveAssetUrl('/images/logo.png'), '/images/logo.png');
  assert.equal(resolveAssetUrl('images/logo.png'), '/images/logo.png');
});

test('resolveAssetUrl canonicalizes upload paths', () => {
  assert.equal(resolveAssetUrl('/uploads/public/upl-123'), '/api/uploads/public/upl-123');
  assert.equal(resolveAssetUrl('/api/uploads/public/upl-123'), '/api/uploads/public/upl-123');
  assert.equal(resolveAssetUrl('/api/api/uploads/public/upl-123'), '/api/uploads/public/upl-123');
  assert.equal(
    resolveAssetUrl('https://old-backend.example.com/api/uploads/public/upl-123'),
    '/api/uploads/public/upl-123'
  );
});
