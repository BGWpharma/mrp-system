// src/services/taskboardAttachmentService.js
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase/config';
import { nanoid } from 'nanoid';

// Maksymalny rozmiar pliku (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Dozwolone typy plików
const ALLOWED_FILE_TYPES = {
  // Obrazy
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  // Dokumenty
  'application/pdf': 'pdf',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
  // Archiwa
  'application/zip': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/x-7z-compressed': 'archive',
};

/**
 * Walidacja pliku przed uploadem
 */
export const validateFile = (file) => {
  const errors = [];

  if (!file) {
    errors.push('Nie wybrano pliku');
    return { valid: false, errors };
  }

  // Sprawdź rozmiar
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`Plik jest za duży. Maksymalny rozmiar to ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  // Sprawdź typ
  if (!ALLOWED_FILE_TYPES[file.type]) {
    errors.push('Nieobsługiwany typ pliku. Dozwolone: obrazy, PDF, dokumenty Office, archiwa');
  }

  return {
    valid: errors.length === 0,
    errors,
    fileType: ALLOWED_FILE_TYPES[file.type] || 'other'
  };
};

/**
 * Upload pliku do Firebase Storage
 * @param {File} file - Plik do uploadu
 * @param {string} taskId - ID zadania
 * @param {function} onProgress - Callback dla postępu uploadu (0-100)
 * @returns {Promise<{url: string, name: string, type: string, size: number, storagePath: string}>}
 */
export const uploadTaskAttachment = async (file, taskId, onProgress = () => {}) => {
  // Walidacja
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  // Generuj unikalną nazwę pliku
  const fileExtension = file.name.split('.').pop();
  const uniqueFileName = `${nanoid()}_${Date.now()}.${fileExtension}`;
  const storagePath = `taskboard-attachments/${taskId}/${uniqueFileName}`;
  
  // Referencja do Storage
  const storageRef = ref(storage, storagePath);

  // Upload z monitorowaniem postępu
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString()
      }
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress(progress);
      },
      (error) => {
        console.error('Błąd podczas uploadu:', error);
        reject(new Error('Nie udało się przesłać pliku. Spróbuj ponownie.'));
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            id: nanoid(),
            name: file.name,
            url: downloadURL,
            type: validation.fileType,
            size: file.size,
            mimeType: file.type,
            storagePath,
            isUploaded: true,
            addedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error('Błąd podczas pobierania URL:', error);
          reject(new Error('Nie udało się uzyskać linku do pliku.'));
        }
      }
    );
  });
};

/**
 * Usuń załącznik z Firebase Storage
 * @param {string} storagePath - Ścieżka do pliku w Storage
 */
export const deleteTaskAttachment = async (storagePath) => {
  if (!storagePath) return;
  
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    // Ignoruj błąd jeśli plik nie istnieje
    if (error.code !== 'storage/object-not-found') {
      console.error('Błąd podczas usuwania załącznika:', error);
      throw error;
    }
  }
};

/**
 * Formatowanie rozmiaru pliku
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Pobierz ikonę dla typu pliku
 */
export const getFileTypeIcon = (type) => {
  switch (type) {
    case 'image':
      return 'ImageIcon';
    case 'pdf':
      return 'PictureAsPdfIcon';
    case 'document':
      return 'DescriptionIcon';
    case 'archive':
      return 'FolderZipIcon';
    default:
      return 'InsertDriveFileIcon';
  }
};
