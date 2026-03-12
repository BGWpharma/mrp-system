import { useState, useEffect } from 'react';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import {
  uploadCmrAttachment,
  getCmrAttachments,
  deleteCmrAttachment,
  uploadCmrInvoice,
  getCmrInvoices,
  deleteCmrInvoice,
  uploadCmrOtherAttachment,
  getCmrOtherAttachments,
  deleteCmrOtherAttachment,
  uploadCmrDeliveryNote,
  getCmrDeliveryNotes,
  deleteCmrDeliveryNote,
  updateCmrStatus,
  CMR_STATUSES
} from '../../services/logistics';

export function useCmrAttachments(id, cmrData, fetchCmrDocument) {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('cmr');

  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  const [otherAttachments, setOtherAttachments] = useState([]);
  const [otherAttachmentsLoading, setOtherAttachmentsLoading] = useState(false);
  const [uploadingOtherAttachment, setUploadingOtherAttachment] = useState(false);

  const [deliveryNoteAttachments, setDeliveryNoteAttachments] = useState([]);
  const [deliveryNoteAttachmentsLoading, setDeliveryNoteAttachmentsLoading] = useState(false);
  const [uploadingDeliveryNote, setUploadingDeliveryNote] = useState(false);

  useEffect(() => {
    if (id) {
      fetchAttachments();
      fetchInvoices();
      fetchOtherAttachments();
      fetchDeliveryNoteAttachments();
    }
  }, [id]);

  const fetchAttachments = async () => {
    try {
      setAttachmentsLoading(true);
      const attachmentsList = await getCmrAttachments(id);
      setAttachments(attachmentsList);
    } catch (error) {
      console.error('Błąd podczas pobierania załączników:', error);
      showError('Nie udało się pobrać załączników');
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const handleAttachmentUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    try {
      setUploadingAttachment(true);
      const newAttachment = await uploadCmrAttachment(file, id, currentUser.uid);
      setAttachments(prev => [newAttachment, ...prev]);
      showSuccess(`Załącznik "${file.name}" został przesłany pomyślnie`);

      if (cmrData.status === CMR_STATUSES.DELIVERED) {
        try {
          const result = await updateCmrStatus(id, CMR_STATUSES.COMPLETED, currentUser.uid);
          if (result.success) {
            await fetchCmrDocument();
            showSuccess('Status CMR został automatycznie zmieniony na "Zakończone"');
          }
        } catch (statusError) {
          console.error('Błąd podczas automatycznej zmiany statusu CMR:', statusError);
          showError(`Załącznik dodano, ale nie udało się zmienić statusu: ${statusError.message}`);
        }
      }
    } catch (error) {
      console.error('Błąd podczas przesyłania załącznika:', error);
      showError(error.message || 'Nie udało się przesłać załącznika');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleAttachmentDelete = async (attachmentId, fileName) => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: `Czy na pewno chcesz usunąć załącznik "${fileName}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await deleteCmrAttachment(attachmentId, currentUser.uid);
          setAttachments(prev => prev.filter(att => att.id !== attachmentId));
          showSuccess(`Załącznik "${fileName}" został usunięty`);
        } catch (error) {
          console.error('Błąd podczas usuwania załącznika:', error);
          showError('Nie udało się usunąć załącznika');
        }
      }
    });
  };

  const fetchInvoices = async () => {
    try {
      setInvoicesLoading(true);
      const invoicesList = await getCmrInvoices(id);
      setInvoices(invoicesList);
    } catch (error) {
      console.error('Błąd podczas pobierania faktur:', error);
      showError('Nie udało się pobrać faktur');
    } finally {
      setInvoicesLoading(false);
    }
  };

  const handleInvoiceUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    try {
      setUploadingInvoice(true);
      const newInvoice = await uploadCmrInvoice(file, id, currentUser.uid);
      setInvoices(prev => [newInvoice, ...prev]);
      showSuccess(`Faktura "${file.name}" została przesłana pomyślnie`);
    } catch (error) {
      console.error('Błąd podczas przesyłania faktury:', error);
      showError(error.message || 'Nie udało się przesłać faktury');
    } finally {
      setUploadingInvoice(false);
    }
  };

  const handleInvoiceDelete = async (invoiceId, fileName) => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: `Czy na pewno chcesz usunąć fakturę "${fileName}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await deleteCmrInvoice(invoiceId, currentUser.uid);
          setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
          showSuccess(`Faktura "${fileName}" została usunięta`);
        } catch (error) {
          console.error('Błąd podczas usuwania faktury:', error);
          showError('Nie udało się usunąć faktury');
        }
      }
    });
  };

  const fetchOtherAttachments = async () => {
    try {
      setOtherAttachmentsLoading(true);
      const attachmentsList = await getCmrOtherAttachments(id);
      setOtherAttachments(attachmentsList);
    } catch (error) {
      console.error('Błąd podczas pobierania innych załączników:', error);
      showError('Nie udało się pobrać innych załączników');
    } finally {
      setOtherAttachmentsLoading(false);
    }
  };

  const fetchDeliveryNoteAttachments = async () => {
    try {
      setDeliveryNoteAttachmentsLoading(true);
      const notesList = await getCmrDeliveryNotes(id);
      setDeliveryNoteAttachments(notesList);
    } catch (error) {
      console.error('Błąd podczas pobierania Delivery Notes:', error);
    } finally {
      setDeliveryNoteAttachmentsLoading(false);
    }
  };

  const handleDeliveryNoteUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingDeliveryNote(true);
    try {
      let uploadedCount = 0;
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) {
          showError(`Plik "${file.name}" przekracza limit 20MB`);
          continue;
        }
        await uploadCmrDeliveryNote(file, id, currentUser.uid, file.name);
        uploadedCount++;
      }
      if (uploadedCount > 0) {
        fetchDeliveryNoteAttachments();
        showSuccess('Delivery Note przesłany pomyślnie');
      }
    } catch (error) {
      console.error('Błąd podczas przesyłania Delivery Note:', error);
      showError(error.message || 'Nie udało się przesłać Delivery Note');
    } finally {
      setUploadingDeliveryNote(false);
      event.target.value = '';
    }
  };

  const handleOtherAttachmentUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    try {
      setUploadingOtherAttachment(true);
      const newAttachment = await uploadCmrOtherAttachment(file, id, currentUser.uid);
      setOtherAttachments(prev => [newAttachment, ...prev]);
      showSuccess(`Załącznik "${file.name}" został przesłany pomyślnie`);
    } catch (error) {
      console.error('Błąd podczas przesyłania załącznika:', error);
      showError(error.message || 'Nie udało się przesłać załącznika');
    } finally {
      setUploadingOtherAttachment(false);
    }
  };

  const handleOtherAttachmentDelete = async (attachmentId, fileName) => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: `Czy na pewno chcesz usunąć załącznik "${fileName}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await deleteCmrOtherAttachment(attachmentId, currentUser.uid);
          setOtherAttachments(prev => prev.filter(att => att.id !== attachmentId));
          showSuccess(`Załącznik "${fileName}" został usunięty`);
        } catch (error) {
          console.error('Błąd podczas usuwania załącznika:', error);
          showError('Nie udało się usunąć załącznika');
        }
      }
    });
  };

  const handleDeliveryNoteDelete = (noteId, fileName) => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: t('details.attachments.confirmDeleteFile', { name: fileName }),
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await deleteCmrDeliveryNote(noteId, currentUser.uid);
          setDeliveryNoteAttachments(prev => prev.filter(n => n.id !== noteId));
          showSuccess(t('details.attachments.deleted'));
        } catch (err) {
          showError(err.message);
        }
      }
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return {
    confirmDialog,
    setConfirmDialog,
    attachments,
    attachmentsLoading,
    uploadingAttachment,
    invoices,
    invoicesLoading,
    uploadingInvoice,
    otherAttachments,
    otherAttachmentsLoading,
    uploadingOtherAttachment,
    deliveryNoteAttachments,
    deliveryNoteAttachmentsLoading,
    uploadingDeliveryNote,
    fetchAttachments,
    handleAttachmentUpload,
    handleAttachmentDelete,
    fetchInvoices,
    handleInvoiceUpload,
    handleInvoiceDelete,
    fetchOtherAttachments,
    handleOtherAttachmentUpload,
    handleOtherAttachmentDelete,
    fetchDeliveryNoteAttachments,
    handleDeliveryNoteUpload,
    handleDeliveryNoteDelete,
    formatFileSize
  };
}
