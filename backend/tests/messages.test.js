import './testEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { adminStore } from '../src/data/adminStore.js';
import { createUser } from '../src/repositories/userRepository.js';
import { hashPassword } from '../src/utils/passwords.js';
import {
  authHeader,
  buildAdminCredentials,
  cleanupUser,
  createAdminAccount,
  loginAs,
  withAdminStoreLock
} from './testUtils.js';

async function createRoleAccount({ fullName, email, password, role }) {
  const passwordHash = await hashPassword(password);
  return createUser({
    fullName,
    email,
    passwordHash,
    role,
    mustChangePassword: false
  });
}

test('message threads expose unread state until the recipient opens the conversation', async () => {
  await withAdminStoreLock(async () => {
    const credentials = buildAdminCredentials();
    const teacherPassword = `${credentials.password}-teacher`;
    const teacherEmail = `teacher.${Date.now()}@attaufiq.local`;
    const adminUser = await createAdminAccount(credentials);
    const teacherUser = await createRoleAccount({
      fullName: 'Automation Teacher',
      email: teacherEmail,
      password: teacherPassword,
      role: 'teacher'
    });

    const teacherRecord = {
      id: `tch-test-${Date.now()}`,
      fullName: 'Automation Teacher',
      email: teacherEmail,
      institution: 'ATTAUFEEQ Model Academy',
      userId: teacherUser.id
    };
    adminStore.teachers.push(teacherRecord);

    try {
      const adminLogin = await loginAs(credentials);
      const teacherLogin = await loginAs({ email: teacherEmail, password: teacherPassword });
      assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));
      assert.equal(teacherLogin.status, 200, JSON.stringify(teacherLogin.body));

      const createThread = await request(app)
        .post('/api/messages/threads')
        .set(authHeader(adminLogin.body.token))
        .send({
          title: 'Class follow-up',
          contactId: `teacher:${teacherRecord.id}`
        });
      assert.equal(createThread.status, 201, JSON.stringify(createThread.body));

      const threadId = createThread.body.thread?.id;
      assert.ok(threadId);

      const sendMessage = await request(app)
        .post(`/api/messages/threads/${threadId}/messages`)
        .set(authHeader(adminLogin.body.token))
        .send({ body: 'Please confirm lesson coverage for this week.' });
      assert.equal(sendMessage.status, 201, JSON.stringify(sendMessage.body));

      const beforeRead = await request(app)
        .get('/api/messages/threads')
        .set(authHeader(teacherLogin.body.token));
      assert.equal(beforeRead.status, 200, JSON.stringify(beforeRead.body));
      const unreadThread = beforeRead.body.threads?.find((thread) => thread.id === threadId);
      assert.ok(unreadThread);
      assert.equal(unreadThread.unread, true);

      const openThread = await request(app)
        .get(`/api/messages/threads/${threadId}`)
        .set(authHeader(teacherLogin.body.token));
      assert.equal(openThread.status, 200, JSON.stringify(openThread.body));
      assert.equal(openThread.body.messages?.length, 1);
      assert.ok(openThread.body.thread?.readBy?.[teacherUser.id]);

      const afterRead = await request(app)
        .get('/api/messages/threads')
        .set(authHeader(teacherLogin.body.token));
      assert.equal(afterRead.status, 200, JSON.stringify(afterRead.body));
      const readThread = afterRead.body.threads?.find((thread) => thread.id === threadId);
      assert.ok(readThread);
      assert.equal(readThread.unread, false);
      assert.ok(readThread.lastReadAt);
    } finally {
      adminStore.teachers = adminStore.teachers.filter((teacher) => teacher.id !== teacherRecord.id);
      adminStore.messageThreads = adminStore.messageThreads.filter((thread) => thread.contactId !== `teacher:${teacherRecord.id}`);
      const activeThreadIds = new Set(adminStore.messageThreads.map((thread) => thread.id));
      adminStore.messages = adminStore.messages.filter((message) => activeThreadIds.has(message.threadId));
      await cleanupUser(teacherUser.id);
      await cleanupUser(adminUser.id);
    }
  });
});
