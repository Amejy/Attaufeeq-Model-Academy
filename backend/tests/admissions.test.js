import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { normalizeAdmissionPeriod } from '../src/utils/admissionPeriod.js';
import { withAdminStoreLock } from './testUtils.js';

test('admissions submission accepts valid payload and detects duplicates', async () => {
  await withAdminStoreLock(async () => {
    const classId = `cls-test-${Date.now()}`;
    const classRecord = {
      id: classId,
      name: 'JSS 1',
      arm: 'A',
      institution: 'ATTAUFEEQ Model Academy'
    };
    adminStore.classes.push(classRecord);
    adminStore.admissionPeriod = normalizeAdmissionPeriod({
      enabled: true,
      startDate: '2020-01-01',
      endDate: '2099-12-31',
      programs: {
        modern: { enabled: true, startDate: '2020-01-01', endDate: '2099-12-31' },
        madrasa: { enabled: true, startDate: '2020-01-01', endDate: '2099-12-31' },
        memorization: { enabled: true, startDate: '2020-01-01', endDate: '2099-12-31' }
      }
    });

    const payload = {
      program: 'modern',
      fullName: 'Test Student',
      guardianName: 'Test Guardian',
      phone: '08000000000',
      email: 'guardian.test@attaufiq.local',
      studentEmail: 'student.test@attaufiq.local',
      classId,
      dateOfBirth: '2015-01-01',
      gender: 'Male',
      previousSchool: 'Sample Primary',
      address: 'Barnawa',
      documents: []
    };

    const first = await request(app).post('/api/admissions').send(payload);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.admission?.fullName, payload.fullName);

    const second = await request(app).post('/api/admissions').send(payload);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.duplicate, true);

    adminStore.classes = adminStore.classes.filter((item) => item.id !== classId);
    adminStore.admissions = adminStore.admissions.filter((item) => item.studentEmail !== payload.studentEmail);
  });
});
