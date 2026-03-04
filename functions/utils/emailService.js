/**
 * Email Service for BGW-MRP System
 * Sends transactional email notifications via Google Workspace SMTP Relay.
 * Authentication: IP-based (Cloud NAT static IP: 34.118.11.47)
 * No user credentials required.
 *
 * Requires VPC Connector "smtp-connector" with ALL_TRAFFIC egress
 * so outbound traffic routes through Cloud NAT.
 *
 * From addresses use Google Groups (no Workspace license needed):
 * - accounting@bgwpharma.com  → invoice notifications
 * - warehouse@bgwpharma.com   → CMR shipment notifications
 */

const nodemailer = require("nodemailer");
const logger = require("firebase-functions/logger");

const FROM_ACCOUNTING = "BGW Pharma - Accounting <accounting@bgwpharma.com>";
const FROM_WAREHOUSE = "BGW Pharma - Warehouse <warehouse@bgwpharma.com>";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

const createTransporter = () => nodemailer.createTransport({
  host: "smtp-relay.gmail.com",
  port: 587,
  secure: false,
  tls: {rejectUnauthorized: true},
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
});

/**
 * Send mail with retry & exponential backoff.
 * Creates a fresh transporter on each retry to avoid stale connections.
 * @param {Object} mailOptions - nodemailer mail options
 * @return {Promise<Object>} nodemailer send result
 */
const sendMailWithRetry = async (mailOptions) => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const transporter = createTransporter();
      const result = await transporter.sendMail(mailOptions);
      return result;
    } catch (error) {
      lastError = error;
      logger.warn(`[Email] Próba ${attempt}/${MAX_RETRIES} nieudana`, {
        to: mailOptions.to,
        error: error.message,
        code: error.code,
        command: error.command,
      });
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
};

/**
 * @param {Object} dateValue - Firestore Timestamp, Date, or string
 * @return {string} Formatted date string (en-GB: DD/MM/YYYY)
 */
const formatDate = (dateValue) => {
  if (!dateValue) return "-";
  try {
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return date.toLocaleDateString("en-GB");
  } catch {
    return "-";
  }
};

/**
 * Send invoice notification email to customer
 * @param {Object} invoice - Invoice document data (with id)
 * @return {Promise<Object|null>} nodemailer send result or null if skipped
 */
const sendInvoiceNotification = async (invoice) => {
  const customerEmail = invoice.customer?.email;
  if (!customerEmail) {
    logger.warn("[Email] Brak emaila klienta — pomijam powiadomienie", {
      invoiceId: invoice.id,
      customerName: invoice.customer?.name,
    });
    return null;
  }

  const invoiceType = invoice.isProforma ?
    "Proforma Invoice" : "Invoice";
  const subject = `${invoiceType} No. ${invoice.number} — BGW Pharma`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;
      margin: 0 auto;">
      <h2 style="color: #1a237e;">
        ${invoiceType} No. ${invoice.number}
      </h2>
      <p>Dear Customer,</p>
      <p>Please find below the details of the issued document:</p>
      <table style="border-collapse: collapse; width: 100%;
        margin: 16px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold; width: 40%;">
            Document number</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${invoice.number}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold;">Issue date</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${formatDate(invoice.issueDate)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold;">Due date</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${formatDate(invoice.dueDate)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold;">Amount</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${invoice.total || "-"} ${invoice.currency || "EUR"}</td>
        </tr>
      </table>
      <p style="color: #666; font-size: 13px;">
        This message was generated automatically by the BGW MRP
        system.<br/>
        For any questions please contact us at
        accounting@bgwpharma.com.
      </p>
    </div>
  `;

  const mailOptions = {
    from: FROM_ACCOUNTING,
    to: customerEmail,
    subject,
    html,
  };

  if (invoice.pdfAttachment?.downloadURL) {
    const safeNumber = invoice.number.replace(/\//g, "-");
    mailOptions.attachments = [{
      filename: `${invoiceType.replace(/ /g, "_")}_${safeNumber}.pdf`,
      path: invoice.pdfAttachment.downloadURL,
    }];
  }

  const result = await sendMailWithRetry(mailOptions);
  logger.info("[Email] Wysłano powiadomienie o fakturze", {
    invoiceId: invoice.id,
    to: customerEmail,
    messageId: result.messageId,
  });
  return result;
};

/**
 * Send CMR shipment notification email to customer
 * @param {Object} cmrData - CMR document data
 * @param {string} cmrId - CMR document ID
 * @param {Object} customerData - Customer object from linked order (needs .email)
 * @return {Promise<Object|null>} nodemailer send result or null if skipped
 */
const sendCmrShipmentNotification = async (cmrData, cmrId, customerData) => {
  const customerEmail = customerData?.email;
  if (!customerEmail) {
    logger.warn("[Email] Brak emaila klienta — pomijam powiadomienie CMR", {
      cmrId,
      recipient: cmrData.recipient,
    });
    return null;
  }

  const subject =
    `Shipment in transit — CMR ${cmrData.cmrNumber}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;
      margin: 0 auto;">
      <h2 style="color: #1a237e;">Shipment in transit</h2>
      <p>Dear Customer,</p>
      <p>We would like to inform you that your shipment has been
        dispatched.</p>
      <table style="border-collapse: collapse; width: 100%;
        margin: 16px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold; width: 40%;">
            CMR number</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${cmrData.cmrNumber || "-"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold;">Recipient</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${cmrData.recipient || "-"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold;">
            Delivery location</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${cmrData.deliveryPlace || "-"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0;
            background: #f5f5f5; font-weight: bold;">Carrier</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${cmrData.carrier || "-"}</td>
        </tr>
      </table>
      <p style="color: #666; font-size: 13px;">
        This message was generated automatically by the BGW MRP
        system.<br/>
        For any questions please contact us at
        warehouse@bgwpharma.com.
      </p>
    </div>
  `;

  const result = await sendMailWithRetry({
    from: FROM_WAREHOUSE,
    to: customerEmail,
    subject,
    html,
  });

  logger.info("[Email] Wysłano powiadomienie CMR", {
    cmrId,
    to: customerEmail,
    messageId: result.messageId,
  });
  return result;
};

module.exports = {
  sendInvoiceNotification,
  sendCmrShipmentNotification,
};
