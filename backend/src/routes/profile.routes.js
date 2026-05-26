import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { updateTeacherSignatureImage } from '../repositories/teacherRepository.js';
import { updateUserAvatar } from '../repositories/userRepository.js';
import { findTeacherByUser } from '../utils/portalScope.js';
import { publicUpload, saveUploadedFile } from './upload.js';
import { toPublicErrorMessage } from '../utils/publicError.js';

const profileRouter = Router();
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

function buildProfilePayload(user, fallback = {}) {
  return {
    id: user?.id || fallback?.sub || '',
    fullName: user?.fullName || fallback?.fullName || '',
    email: user?.email || fallback?.email || '',
    role: user?.role || fallback?.role || '',
    mustChangePassword: Boolean(user?.mustChangePassword ?? fallback?.mustChangePassword),
    avatarUrl: user?.avatarUrl || ''
  };
}

function buildTeacherPayload(teacher) {
  return {
    id: teacher?.id || '',
    fullName: teacher?.fullName || '',
    email: teacher?.email || teacher?.portalEmail || '',
    institution: teacher?.institution || '',
    signatureImage: teacher?.signatureImage || ''
  };
}

profileRouter.post('/avatar', requireAuth, publicUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: 'No profile image uploaded.' });
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return res.status(400).json({ message: 'Profile image must be 4MB or smaller.' });
  }

  try {
    const saved = await saveUploadedFile(file, {
      visibility: 'public',
      allowedMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });
    const avatarUrl = `/api/uploads/public/${saved.id}`;
    const updatedUser = await updateUserAvatar(String(req.user?.sub || ''), avatarUrl);

    return res.status(200).json({
      avatarUrl,
      user: buildProfilePayload(updatedUser, req.user)
    });
  } catch (error) {
    return res.status(400).json({ message: toPublicErrorMessage(error, 'We could not upload the profile image.') });
  }
});

profileRouter.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const updatedUser = await updateUserAvatar(String(req.user?.sub || ''), null);
    return res.status(200).json({
      avatarUrl: '',
      user: buildProfilePayload(updatedUser, req.user)
    });
  } catch (error) {
    return res.status(400).json({ message: toPublicErrorMessage(error, 'We could not remove the profile image.') });
  }
});

profileRouter.post('/teacher-signature', requireAuth, publicUpload.single('file'), async (req, res) => {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ message: 'Only teachers can upload a class teacher signature.' });
  }

  const teacher = findTeacherByUser(req.user);
  if (!teacher) {
    return res.status(404).json({ message: 'Teacher profile not found.' });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: 'No signature image uploaded.' });
  }
  if (file.size > MAX_SIGNATURE_BYTES) {
    return res.status(400).json({ message: 'Signature image must be 2MB or smaller.' });
  }

  try {
    const saved = await saveUploadedFile(file, {
      visibility: 'public',
      allowedMimes: ['image/jpeg', 'image/png', 'image/webp']
    });
    const signatureImage = `/api/uploads/public/${saved.id}`;
    const updatedTeacher = await updateTeacherSignatureImage(teacher.id, signatureImage);

    return res.status(200).json({
      signatureImage,
      teacher: buildTeacherPayload(updatedTeacher || { ...teacher, signatureImage })
    });
  } catch (error) {
    return res.status(400).json({ message: toPublicErrorMessage(error, 'We could not upload the signature image.') });
  }
});

profileRouter.delete('/teacher-signature', requireAuth, async (req, res) => {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ message: 'Only teachers can remove a class teacher signature.' });
  }

  const teacher = findTeacherByUser(req.user);
  if (!teacher) {
    return res.status(404).json({ message: 'Teacher profile not found.' });
  }

  try {
    const updatedTeacher = await updateTeacherSignatureImage(teacher.id, '');
    return res.status(200).json({
      signatureImage: '',
      teacher: buildTeacherPayload(updatedTeacher || { ...teacher, signatureImage: '' })
    });
  } catch (error) {
    return res.status(400).json({ message: toPublicErrorMessage(error, 'We could not remove the signature image.') });
  }
});

export default profileRouter;
