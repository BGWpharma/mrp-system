/**
 * PO Payment Sync Cloud Function Trigger
 *
 * Nasłuchuje na zmiany w kolekcji purchaseInvoices.
 * Gdy zmieni się status płatności faktury lub kwota wpłat,
 * automatycznie przelicza i aktualizuje status płatności
 * powiązanego zamówienia zakupowego (PO).
 *
 * Logika: sumuje bezpośrednie wpłaty (payments[]) ze wszystkich
 * faktur/proform powiązanych z PO i porównuje z wartością brutto PO.
 * Nie uwzględnia settledFromProformas, aby uniknąć podwójnego liczenia
 * (te kwoty pochodzą z payments[] na proformach).
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onPurchaseInvoicePaymentChange
 */

const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const PO_PAYMENT_STATUSES = {
  UNPAID: "unpaid",
  TO_BE_PAID: "to_be_paid",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
};

/**
 * Sprawdza, czy zmieniły się pola związane z płatnościami
 * @param {object|null} before - Dane dokumentu przed zmianą
 * @param {object|null} after - Dane dokumentu po zmianie
 * @return {boolean}
 */
const hasPaymentFieldChanged = (before, after) => {
  if (!before || !after) return true;

  if (before.paymentStatus !== after.paymentStatus) return true;
  if (before.totalPaid !== after.totalPaid) return true;
  if (before.settledFromProformas !== after.settledFromProformas) return true;

  const beforeLen = (before.payments || []).length;
  const afterLen = (after.payments || []).length;
  if (beforeLen !== afterLen) return true;

  return false;
};

/**
 * Sumuje bezpośrednie wpłaty z tablicy payments[] faktury.
 * Nie uwzględnia settledFromProformas — te kwoty pochodzą
 * z payments[] na proformach i byłyby liczone podwójnie.
 * @param {object} invoiceData - Dane dokumentu faktury
 * @return {number}
 */
const getDirectPaymentsTotal = (invoiceData) => {
  const payments = invoiceData.payments || [];
  return payments.reduce(
      (sum, p) => sum + (parseFloat(p.amount) || 0), 0,
  );
};

/**
 * Oblicza status płatności PO na podstawie zagregowanych wpłat
 * @param {number} totalPaid - Suma wpłat na wszystkie faktury PO
 * @param {number} poTotalGross - Wartość brutto PO
 * @param {boolean} hasAnyDueDate - Czy istnieje termin płatności
 * @return {string}
 */
const calculatePOPaymentStatus = (totalPaid, poTotalGross, hasAnyDueDate) => {
  if (poTotalGross <= 0) return PO_PAYMENT_STATUSES.UNPAID;

  if (totalPaid >= poTotalGross - 0.01) return PO_PAYMENT_STATUSES.PAID;
  if (totalPaid > 0.01) return PO_PAYMENT_STATUSES.PARTIALLY_PAID;
  if (hasAnyDueDate) return PO_PAYMENT_STATUSES.TO_BE_PAID;

  return PO_PAYMENT_STATUSES.UNPAID;
};

/**
 * Trigger: nasłuchuje na zmiany w purchaseInvoices
 * i synchronizuje status płatności powiązanego PO
 */
const onPurchaseInvoicePaymentChange = onDocumentWritten(
    {
      document: "purchaseInvoices/{invoiceId}",
      region: "europe-central2",
      memory: "256MiB",
      timeoutSeconds: 60,
    },
    async (event) => {
      const invoiceId = event.params.invoiceId;
      const db = admin.firestore();

      const beforeData = event.data?.before?.exists ?
        event.data.before.data() : null;
      const afterData = event.data?.after?.exists ?
        event.data.after.data() : null;

      const currentData = afterData || beforeData;
      if (!currentData) {
        return null;
      }

      if (currentData.sourceType !== "po" || !currentData.sourceId) {
        return null;
      }

      if (!hasPaymentFieldChanged(beforeData, afterData)) {
        return null;
      }

      const purchaseOrderId = currentData.sourceId;

      logger.info("[POPaymentSync] Wykryto zmianę płatności na fakturze", {
        invoiceId,
        purchaseOrderId,
        beforeStatus: beforeData?.paymentStatus,
        afterStatus: afterData?.paymentStatus,
      });

      try {
        const poRef = db.collection("purchaseOrders").doc(purchaseOrderId);
        const poDoc = await poRef.get();

        if (!poDoc.exists) {
          logger.warn("[POPaymentSync] Nie znaleziono PO", {purchaseOrderId});
          return null;
        }

        const poData = poDoc.data();
        const poTotalGross = parseFloat(poData.totalGross) || 0;

        const invoicesSnapshot = await db
            .collection("purchaseInvoices")
            .where("sourceId", "==", purchaseOrderId)
            .where("sourceType", "==", "po")
            .get();

        let totalPaidForPO = 0;
        let hasAnyDueDate = false;

        invoicesSnapshot.forEach((doc) => {
          const inv = doc.data();
          if (inv.status === "rejected") return;
          totalPaidForPO += getDirectPaymentsTotal(inv);
          if (inv.dueDate) hasAnyDueDate = true;
        });

        const poItems = poData.items || [];
        if (poItems.some((item) => item.paymentDueDate)) {
          hasAnyDueDate = true;
        }

        const newPaymentStatus = calculatePOPaymentStatus(
            totalPaidForPO, poTotalGross, hasAnyDueDate,
        );

        const oldPaymentStatus =
          poData.paymentStatus || PO_PAYMENT_STATUSES.UNPAID;

        if (oldPaymentStatus === newPaymentStatus &&
            poData.totalPaidFromInvoices === totalPaidForPO) {
          logger.info("[POPaymentSync] Brak zmian statusu", {
            purchaseOrderId,
            status: newPaymentStatus,
            totalPaid: totalPaidForPO,
            poTotal: poTotalGross,
          });
          return null;
        }

        const paymentStatusHistory = poData.paymentStatusHistory || [];

        if (oldPaymentStatus !== newPaymentStatus) {
          paymentStatusHistory.push({
            from: oldPaymentStatus,
            to: newPaymentStatus,
            changedBy: "system:payment-sync",
            changedAt: new Date(),
            timestamp: new Date().toISOString(),
            totalPaid: totalPaidForPO,
            poTotalGross,
            triggerInvoiceId: invoiceId,
          });
        }

        const updateData = {
          paymentStatus: newPaymentStatus,
          totalPaidFromInvoices: totalPaidForPO,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (oldPaymentStatus !== newPaymentStatus) {
          updateData.paymentStatusHistory = paymentStatusHistory;
        }

        await poRef.update(updateData);

        logger.info("[POPaymentSync] Zaktualizowano status płatności PO", {
          purchaseOrderId,
          poNumber: poData.number,
          oldStatus: oldPaymentStatus,
          newStatus: newPaymentStatus,
          totalPaid: totalPaidForPO,
          poTotal: poTotalGross,
          coveragePercent: poTotalGross > 0 ?
            Math.round((totalPaidForPO / poTotalGross) * 100) : 0,
        });

        return {
          purchaseOrderId,
          oldStatus: oldPaymentStatus,
          newStatus: newPaymentStatus,
          totalPaid: totalPaidForPO,
          poTotal: poTotalGross,
        };
      } catch (error) {
        logger.error("[POPaymentSync] Błąd aktualizacji statusu PO", {
          error: error.message,
          purchaseOrderId,
          invoiceId,
        });
        throw error;
      }
    },
);

module.exports = {onPurchaseInvoicePaymentChange};
