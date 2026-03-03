/**
 * Email Service for BGW-MRP System
 * Sends transactional email notifications via Google Workspace SMTP Relay.
 * Authentication: IP-based (Cloud NAT static IP: 34.118.11.47)
 * No user credentials required.
 *
 * From addresses use Google Groups (no Workspace license needed):
 * - accounting@bgwpharma.com  → invoice notifications
 * - warehouse@bgwpharma.com   → CMR shipment notifications
 */

const nodemailer = require("nodemailer");
const logger = require("firebase-functions/logger");

const FROM_ACCOUNTING = "BGW Pharma - Księgowość <accounting@bgwpharma.com>";
const FROM_WAREHOUSE = "BGW Pharma - Magazyn <warehouse@bgwpharma.com>";

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp-relay.gmail.com",
      port: 587,
      secure: false,
      tls: {rejectUnauthorized: true},
    });
  }
  return transporter;
};

/**
 * @param {Object} dateValue - Firestore Timestamp, Date, or string
 * @return {string} Formatted date string (pl-PL)
 */
const formatDate = (dateValue) => {
  if (!dateValue) return "-";
  try {
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return date.toLocaleDateString("pl-PL");
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

  const invoiceType = invoice.isProforma ? "Proforma" : "Faktura";
  const subject = `${invoiceType} nr ${invoice.number} — BGW Pharma`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a237e;">${invoiceType} nr ${invoice.number}</h2>
      <p>Szanowni Państwo,</p>
      <p>informujemy o wystawieniu dokumentu:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold; width: 40%;">Numer dokumentu</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${invoice.number}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold;">Data wystawienia</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${formatDate(invoice.issueDate)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold;">Termin płatności</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${formatDate(invoice.dueDate)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold;">Kwota</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${invoice.total || "-"} ${invoice.currency || "EUR"}</td>
        </tr>
      </table>
      <p style="color: #666; font-size: 13px;">
        Wiadomość wygenerowana automatycznie przez system BGW MRP.<br/>
        W razie pytań prosimy o kontakt pod adresem accounting@bgwpharma.com.
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
    mailOptions.attachments = [{
      filename: `${invoiceType}_${invoice.number.replace(/\//g, "-")}.pdf`,
      path: invoice.pdfAttachment.downloadURL,
    }];
  }

  const result = await getTransporter().sendMail(mailOptions);
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

  const subject = `Przesyłka w transporcie — CMR ${cmrData.cmrNumber}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a237e;">Przesyłka w transporcie</h2>
      <p>Szanowni Państwo,</p>
      <p>informujemy, że Państwa przesyłka została wysłana.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold; width: 40%;">Numer CMR</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${cmrData.cmrNumber || "-"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold;">Odbiorca</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${cmrData.recipient || "-"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold;">Miejsce dostawy</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${cmrData.deliveryPlace || "-"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; background: #f5f5f5; font-weight: bold;">Przewoźnik</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${cmrData.carrier || "-"}</td>
        </tr>
      </table>
      <p style="color: #666; font-size: 13px;">
        Wiadomość wygenerowana automatycznie przez system BGW MRP.<br/>
        W razie pytań prosimy o kontakt pod adresem warehouse@bgwpharma.com.
      </p>
    </div>
  `;

  const result = await getTransporter().sendMail({
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
