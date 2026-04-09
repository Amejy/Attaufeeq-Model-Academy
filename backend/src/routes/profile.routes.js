import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { updateUserAvatar } from '../repositories/userRepository.js';
import { publicUpload, saveUploadedFile } from './upload.js';

const profileRouter = Router();
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

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
      user: {
        id: updatedUser?.id || req.user?.sub || '',
        fullName: updatedUser?.fullName || req.user?.fullName || '',
        email: updatedUser?.email || req.user?.email || '',
        role: updatedUser?.role || req.user?.role || '',
        mustChangePassword: Boolean(updatedUser?.mustChangePassword ?? req.user?.mustChangePassword),
        avatarUrl: updatedUser?.avatarUrl || avatarUrl
      }
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to upload profile image.' });
  }
});

export default profileRouter;
