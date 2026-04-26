import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { updateUserAvatar } from '../repositories/userRepository.js';
import { publicUpload, saveUploadedFile } from './upload.js';

const profileRouter = Router();
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

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
    return res.status(400).json({ message: error.message || 'Unable to upload profile image.' });
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
    return res.status(400).json({ message: error.message || 'Unable to remove profile image.' });
  }
});

export default profileRouter;
