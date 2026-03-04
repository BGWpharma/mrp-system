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
const https = require("https");
const logger = require("firebase-functions/logger");

const FROM_ACCOUNTING = "BGW Pharma - Accounting <accounting@bgwpharma.com>";
const FROM_WAREHOUSE = "BGW Pharma - Warehouse <warehouse@bgwpharma.com>";

const MAX_RETRIES = 4;
const RETRY_DELAYS_MS = [3_000, 8_000, 15_000, 25_000];

let _externalIpLogged = false;

/**
 * Logs the external (egress) IP once per cold start for NAT diagnostics.
 */
const logExternalIpOnce = async () => {
  if (_externalIpLogged) return;
  _externalIpLogged = true;
  try {
    const ip = await new Promise((resolve, reject) => {
      const req = https.get(
          "https://api.ipify.org",
          {timeout: 5_000},
          (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => resolve(data.trim()));
          },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout"));
      });
    });
    logger.info("[Email] Egress IP (NAT diagnostic)", {externalIp: ip});
  } catch (err) {
    logger.warn("[Email] Nie udało się sprawdzić egress IP", {
      error: err.message,
    });
  }
};

const createTransporter = () => nodemailer.createTransport({
  host: "smtp-relay.gmail.com",
  port: 587,
  secure: false,
  tls: {rejectUnauthorized: true},
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 30_000,
});

const is421Error = (error) =>
  error?.message?.includes("421") || error?.responseCode === 421;

/**
 * Send mail with retry & exponential backoff.
 * Creates a fresh transporter on each retry to avoid stale connections.
 * Uses longer delays for 421 (rate-limit / IP rejection) errors.
 * @param {Object} mailOptions - nodemailer mail options
 * @return {Promise<Object>} nodemailer send result
 */
const sendMailWithRetry = async (mailOptions) => {
  await logExternalIpOnce();

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
        responseCode: error.responseCode,
      });
      if (attempt < MAX_RETRIES) {
        const baseDelay = RETRY_DELAYS_MS[attempt - 1] || 25_000;
        const delay = is421Error(error) ? baseDelay * 2 : baseDelay;
        logger.info(`[Email] Retry za ${delay}ms...`);
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
 * Build HTML table rows for shipped items.
 * @param {Array} items - CMR items array
 * @return {string} HTML rows
 */
const buildItemsRowsHtml = (items) => {
  if (!items || items.length === 0) return "";
  return items.map((item) => {
    const desc = item.description || item.name || "-";
    const qty = item.quantity || item.numberOfPackages || "-";
    const unit = item.unit || "pcs";
    return `<tr>
      <td style="padding: 8px 10px; border: 1px solid #e0e0e0;">
        ${desc}</td>
      <td style="padding: 8px 10px; border: 1px solid #e0e0e0;
        text-align: center;">${qty} ${unit}</td>
    </tr>`;
  }).join("");
};

/**
 * Send CMR shipment notification email to customer
 * @param {Object} cmrData - CMR document data
 * @param {string} cmrId - CMR document ID
 * @param {Object} customerData - Customer object from linked order
 * @param {Array} cmrItems - Items shipped in this CMR
 * @return {Promise<Object|null>} nodemailer send result or null if skipped
 */
const sendCmrShipmentNotification = async (
    cmrData, cmrId, customerData, cmrItems = [],
) => {
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

  const itemsHtml = cmrItems.length > 0 ? `
      <h3 style="color: #1a237e; margin: 24px 0 8px;">
        Shipped items</h3>
      <table style="border-collapse: collapse; width: 100%;
        margin: 0 0 16px;">
        <tr>
          <th style="padding: 8px 10px; border: 1px solid #e0e0e0;
            background: #1a237e; color: #fff; text-align: left;">
            Description</th>
          <th style="padding: 8px 10px; border: 1px solid #e0e0e0;
            background: #1a237e; color: #fff; text-align: center;
            width: 120px;">Quantity</th>
        </tr>
        ${buildItemsRowsHtml(cmrItems)}
      </table>` : "";

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
            background: #f5f5f5; font-weight: bold;">
            Planned delivery date</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">
            ${formatDate(cmrData.deliveryDate)}</td>
        </tr>
      </table>
      ${itemsHtml}
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
    itemsCount: cmrItems.length,
  });
  return result;
};

module.exports = {
  sendInvoiceNotification,
  sendCmrShipmentNotification,
};
