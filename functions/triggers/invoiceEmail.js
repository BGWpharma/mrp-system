/**
 * Invoice Email Notification Trigger
 * Sends email to customer when invoice status changes to 'issued'.
 * Attaches invoice PDF if available.
 * Uses Google Workspace SMTP Relay with IP-based auth (Cloud NAT).
 *
 * VPC Connector "smtp-connector" routes all egress through Cloud NAT
 * so the function exits with the whitelisted static IP.
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onInvoiceStatusChange --force
 *
 * PRE-REQUISITE (one-time):
 * gcloud compute networks vpc-access connectors create smtp-connector \
 *   --region=europe-central2 --network=default --range=10.8.0.0/28
 */

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");
const {sendInvoiceNotification} = require("../utils/emailService");

const onInvoiceStatusChange = onDocumentUpdated(
    {
      document: "invoices/{invoiceId}",
      region: "europe-central2",
      memory: "256MiB",
      timeoutSeconds: 120,
      vpcConnector: "smtp-connector",
      vpcConnectorEgressSettings: "ALL_TRAFFIC",
    },
    async (event) => {
      const before = event.data.before.data();
      const after = event.data.after.data();
      const invoiceId = event.params.invoiceId;

      // Only when status changes TO 'issued'
      if (before.status === "issued" || after.status !== "issued") {
        return null;
      }

      logger.info("[Email] Status faktury zmieniony na 'issued'", {
        invoiceId,
        previousStatus: before.status,
        invoiceNumber: after.number,
      });

      // Skip purchase invoices
      if (after.originalOrderType === "purchase" && !after.isRefInvoice) {
        logger.info("[Email] Faktura zakupowa — pomijam", {invoiceId});
        return null;
      }

      // PDF may not yet be written if status and PDF are saved
      // in separate updates. Wait briefly and re-read if needed.
      let invoiceData = {id: invoiceId, ...after};

      if (!invoiceData.pdfAttachment?.downloadURL) {
        logger.info("[Email] PDF jeszcze niedostępny, czekam 3s...", {
          invoiceId,
        });
        await new Promise((r) => setTimeout(r, 3000));

        const db = admin.firestore();
        const freshDoc = await db.collection("invoices").doc(invoiceId).get();
        if (freshDoc.exists) {
          invoiceData = {id: invoiceId, ...freshDoc.data()};
        }
      }

      try {
        await sendInvoiceNotification(invoiceData);
      } catch (error) {
        logger.error("[Email] Błąd wysyłki powiadomienia (non-fatal)", {
          invoiceId,
          error: error.message,
        });
      }

      return null;
    },
);

module.exports = {onInvoiceStatusChange};
