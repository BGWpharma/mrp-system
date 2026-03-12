import React, { useState } from 'react';
import { Chip } from '@mui/material';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import {
  updateCmrStatus,
  CMR_STATUSES,
  CMR_PAYMENT_STATUSES,
  translatePaymentStatus,
  updateCmrPaymentStatus,
  updateCmrDocument,
  uploadCmrDeliveryNote
} from '../../services/logistics';
import { generateAllDeliveryNoteData, buildAttachedDocumentsWithDN } from '../../services/logistics/deliveryNoteService';
import { logger } from '../../utils/logger';

export function useCmrStatus({ id, cmrData, setCmrData, fetchCmrDocument, loadingFormResponses, fetchDeliveryNoteAttachments }) {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('cmr');

  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  const [loadingFormValidationDialogOpen, setLoadingFormValidationDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);

  const handleTransportValidation = (newStatus) => {
    if (newStatus === CMR_STATUSES.IN_TRANSIT) {
      if (loadingFormResponses.length === 0) {
        showError(t('details.errors.cannotStartTransport'));
        return;
      }
      setPendingStatusChange(newStatus);
      setLoadingFormValidationDialogOpen(true);
    } else {
      executeStatusChange(newStatus);
    }
  };

  const executeStatusChange = async (newStatus) => {
    try {
      const result = await updateCmrStatus(id, newStatus, currentUser.uid);

      if (newStatus === CMR_STATUSES.IN_TRANSIT && result.reservationResult) {
        const { reservationResult } = result;

        let message = `Status dokumentu CMR zmieniony na: ${newStatus}.`;

        if (reservationResult.success) {
          message += ` Pomyślnie zarezerwowano wszystkie partie.`;

          if (reservationResult.reservationResults && reservationResult.reservationResults.length > 0) {
            const details = reservationResult.reservationResults.map(res =>
              `• ${res.itemName}: ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            message += `\n\nSzczegóły rezerwacji:\n${details}`;
          }

          showSuccess(message);
        } else {
          message += ` Wystąpiły problemy z rezerwacją partii.`;

          if (reservationResult.errors && reservationResult.errors.length > 0) {
            const errorDetails = reservationResult.errors.map(err =>
              `• ${err.itemName} (partia ${err.batchNumber}): ${err.error}`
            ).join('\n');
            message += `\n\nBłędy:\n${errorDetails}`;
          }

          if (reservationResult.reservationResults && reservationResult.reservationResults.length > 0) {
            const successDetails = reservationResult.reservationResults.map(res =>
              `• ${res.itemName}: ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            message += `\n\nPomyślne rezerwacje:\n${successDetails}`;
          }

          showError(message);
        }

        if (reservationResult.statistics) {
          const stats = reservationResult.statistics;
          logger.log(`Statystyki rezerwacji: ${stats.successCount} sukces(ów), ${stats.errorCount} błąd(ów) z ${stats.totalAttempted} prób`);
        }
      } else if (newStatus === CMR_STATUSES.DELIVERED && result.deliveryResult) {
        const { deliveryResult } = result;

        let message = `Status dokumentu CMR zmieniony na: ${newStatus}.`;

        if (deliveryResult.success) {
          message += ` Pomyślnie przetworzono dostarczenie - anulowano rezerwacje i wydano produkty.`;

          if (deliveryResult.deliveryResults && deliveryResult.deliveryResults.length > 0) {
            const details = deliveryResult.deliveryResults.map(res =>
              `• ${res.itemName}: wydano ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            message += `\n\nSzczegóły wydania:\n${details}`;
          }

          showSuccess(message);
        } else {
          message += ` Wystąpiły problemy podczas przetwarzania dostarczenia.`;

          if (deliveryResult.errors && deliveryResult.errors.length > 0) {
            const errorDetails = deliveryResult.errors.map(err =>
              `• ${err.itemName} ${err.batchNumber ? `(partia ${err.batchNumber})` : ''}: ${err.error}`
            ).join('\n');
            message += `\n\nBłędy:\n${errorDetails}`;
          }

          if (deliveryResult.deliveryResults && deliveryResult.deliveryResults.length > 0) {
            const successDetails = deliveryResult.deliveryResults.map(res =>
              `• ${res.itemName}: wydano ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            message += `\n\nPomyślne operacje:\n${successDetails}`;
          }

          showError(message);
        }

        if (deliveryResult.statistics) {
          const stats = deliveryResult.statistics;
          logger.log(`Statystyki dostarczenia: ${stats.successCount} sukces(ów), ${stats.errorCount} błąd(ów) z ${stats.totalAttempted} prób`);
        }
      } else {
        showSuccess(`Status dokumentu CMR zmieniony na: ${newStatus}`);
      }

      if (newStatus === CMR_STATUSES.IN_TRANSIT && cmrData.items && cmrData.items.length > 0) {
        try {
          const { pdf, filename, text: dnText, metadata: dnMetadata } =
            await generateAllDeliveryNoteData(cmrData.items, cmrData);

          const pdfBlob = pdf.output('blob');
          await uploadCmrDeliveryNote(pdfBlob, id, currentUser.uid, filename);

          if (dnText) {
            const newAttachedDocs = buildAttachedDocumentsWithDN(cmrData.attachedDocuments, dnText);
            await updateCmrDocument(id, {
              attachedDocuments: newAttachedDocs,
              deliveryNotes: dnMetadata
            }, currentUser.uid);
          }

          fetchDeliveryNoteAttachments();
          showSuccess(t('details.deliveryNotes.autoGenerated'));
        } catch (dnError) {
          console.error('Error auto-generating Delivery Notes:', dnError);
        }
      }

      fetchCmrDocument();
    } catch (error) {
      console.error('Błąd podczas zmiany statusu dokumentu CMR:', error);
      showError('Nie udało się zmienić statusu dokumentu CMR: ' + error.message);
    }
  };

  const handleConfirmStatusChange = () => {
    setLoadingFormValidationDialogOpen(false);
    if (pendingStatusChange) {
      executeStatusChange(pendingStatusChange);
      setPendingStatusChange(null);
    }
  };

  const handleCancelStatusChange = () => {
    setLoadingFormValidationDialogOpen(false);
    setPendingStatusChange(null);
  };

  const handlePaymentStatusClick = () => {
    setNewPaymentStatus(cmrData?.paymentStatus || CMR_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updateCmrPaymentStatus(id, newPaymentStatus, currentUser.uid);
      setPaymentStatusDialogOpen(false);
      await fetchCmrDocument();
      showSuccess('Status płatności został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu płatności:', error);
      showError('Nie udało się zaktualizować statusu płatności');
    } finally {
      setNewPaymentStatus('');
      setPaymentStatusDialogOpen(false);
    }
  };

  const getPaymentStatusChip = (paymentStatus) => {
    const status = paymentStatus || CMR_PAYMENT_STATUSES.UNPAID;
    const label = translatePaymentStatus(status);
    let color = '#f44336';

    switch (status) {
      case CMR_PAYMENT_STATUSES.PAID:
        color = '#4caf50';
        break;
      case CMR_PAYMENT_STATUSES.UNPAID:
      default:
        color = '#f44336';
        break;
    }

    return (
      <Chip
        label={label}
        size="small"
        clickable
        onClick={handlePaymentStatusClick}
        sx={{
          backgroundColor: color,
          color: 'white',
          cursor: 'pointer',
          '&:hover': {
            opacity: 0.8
          }
        }}
      />
    );
  };

  return {
    paymentStatusDialogOpen,
    setPaymentStatusDialogOpen,
    newPaymentStatus,
    setNewPaymentStatus,
    loadingFormValidationDialogOpen,
    pendingStatusChange,
    handleTransportValidation,
    handleConfirmStatusChange,
    handleCancelStatusChange,
    handlePaymentStatusClick,
    handlePaymentStatusUpdate,
    getPaymentStatusChip
  };
}
