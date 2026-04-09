import { Buffer } from 'node:buffer';
import multer from 'multer';
import { createFileUpload } from '../repositories/fileUploadRepository.js';

const memoryStorage = multer.memoryStorage();

const publicUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const privateUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

function bufferStartsWith(buffer, signature) {
  if (!buffer || buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

function bufferIncludesAscii(buffer, value) {
  if (!buffer || !value) return false;
  return buffer.includes(Buffer.from(String(value), 'ascii'));
}

function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  if (bufferStartsWith(buffer, [0x25, 0x50, 0x44, 0x46])) {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  if (bufferStartsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (bufferStartsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bufferStartsWith(buffer, [0x47, 0x49, 0x46, 0x38])) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (
    bufferStartsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length > 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (bufferStartsWith(buffer, [0x4f, 0x67, 0x67, 0x53])) {
    return { mime: 'video/ogg', ext: 'ogv' };
  }
  if (bufferStartsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mime: 'video/webm', ext: 'webm' };
  }
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.slice(8, 12).toString('ascii');
    if (brand === 'qt  ') {
      return { mime: 'video/quicktime', ext: 'mov' };
    }
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  if (bufferStartsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { mime: 'application/msword', ext: 'doc' };
  }
  if (bufferStartsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const looksLikeDocx =
      bufferIncludesAscii(buffer, '[Content_Types].xml') &&
      bufferIncludesAscii(buffer, 'word/');

    if (!looksLikeDocx) {
      return null;
    }
    return {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: 'docx'
    };
  }

  return null;
}

async function saveUploadedFile(file, { visibility, allowedMimes }) {
  if (!visibility || !['public', 'private'].includes(visibility)) {
    throw new Error('Upload visibility is not configured.');
  }
  if (!file?.buffer) {
    throw new Error('Invalid upload payload.');
  }

  const detected = detectFileType(file.buffer);
  if (!detected || !allowedMimes.includes(detected.mime)) {
    throw new Error('File type not allowed.');
  }

  const upload = await createFileUpload({
    originalName: file.originalname || 'upload',
    visibility,
    mime: detected.mime,
    extension: detected.ext,
    size: file.size || file.buffer.length,
    data: file.buffer
  });

  return {
    id: upload.id,
    filename: upload.id,
    mime: upload.mime,
    size: upload.size
  };
}

export {
  publicUpload,
  privateUpload,
  saveUploadedFile
};
