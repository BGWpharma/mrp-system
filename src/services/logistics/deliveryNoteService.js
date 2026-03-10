/**
 * Delivery Note Service for CMR documents.
 * Generates delivery notes grouped per Customer Order (CO) and product type (ECO / Standard).
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

const DN_TYPE_ECO = 'ECO';
const DN_TYPE_STD = 'STD';
const DN_GROUP_MISC = 'MISC';

const DIACRITICS_MAP = {
  'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
  'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z',
  'č':'c','ė':'e','į':'i','š':'s','ų':'u','ū':'u','ž':'z',
  'Č':'C','Ė':'E','Į':'I','Š':'S','Ų':'U','Ū':'U','Ž':'Z',
  'ď':'d','ě':'e','ň':'n','ř':'r','ť':'t','ů':'u','ý':'y','ľ':'l',
  'Ď':'D','Ě':'E','Ň':'N','Ř':'R','Ť':'T','Ů':'U','Ý':'Y','Ľ':'L',
  'á':'a','é':'e','í':'i','ú':'u','ö':'o','ü':'u','ő':'o','ű':'u',
  'Á':'A','É':'E','Í':'I','Ú':'U','Ö':'O','Ü':'U','Ő':'O','Ű':'U',
  'â':'a','ă':'a','î':'i','ș':'s','ț':'t',
  'Â':'A','Ă':'A','Î':'I','Ș':'S','Ț':'T',
  'ä':'a','ß':'ss','Ä':'A',
  'à':'a','è':'e','ê':'e','ë':'e','ï':'i','ô':'o','ù':'u','û':'u','ç':'c','œ':'oe',
  'À':'A','È':'E','Ê':'E','Ë':'E','Ï':'I','Ô':'O','Ù':'U','Û':'U','Ç':'C','Œ':'OE',
  'å':'a','æ':'ae','ø':'o','Å':'A','Æ':'AE','Ø':'O',
  'ğ':'g','ı':'i','ş':'s','Ğ':'G','İ':'I','Ş':'S',
  'ā':'a','ē':'e','ģ':'g','ī':'i','ķ':'k','ļ':'l','ņ':'n',
  'Ā':'A','Ē':'E','Ģ':'G','Ī':'I','Ķ':'K','Ļ':'L','Ņ':'N',
  'ñ':'n','Ñ':'N','ã':'a','õ':'o','Ã':'A','Õ':'O'
};

function sanitize(text) {
  if (!text) return '';
  return String(text).replace(/[^\x00-\x7F]/g, ch => DIACRITICS_MAP[ch] || ch);
}

/**
 * Resolves ECO status for CMR items that don't have the isEco flag set.
 * Fetches ECO recipes from Firestore and matches them against item descriptions/recipeIds.
 * Returns a new array of items with isEco resolved.
 */
export const resolveItemsEcoStatus = async (items) => {
  if (!items || items.length === 0) return items;

  const needsResolution = items.some(item => item.isEco === undefined || item.isEco === null);
  if (!needsResolution) return items;

  try {
    // Fetch all ECO recipes
    const ecoQuery = query(
      collection(db, 'recipes'),
      where('certifications.eco', '==', true)
    );
    const ecoSnapshot = await getDocs(ecoQuery);
    const ecoRecipeNames = new Set();
    const ecoRecipeIds = new Set();

    ecoSnapshot.forEach(doc => {
      const recipe = doc.data();
      ecoRecipeIds.add(doc.id);
      if (recipe.name) {
        ecoRecipeNames.add(recipe.name.toLowerCase());
      }
    });

    // Also fetch all recipes to build inventoryItem -> eco mapping
    const allRecipesSnapshot = await getDocs(collection(db, 'recipes'));
    const recipeProductMaterialIds = new Set();
    allRecipesSnapshot.forEach(doc => {
      if (ecoRecipeIds.has(doc.id)) {
        const recipe = doc.data();
        if (recipe.productMaterialId) {
          recipeProductMaterialIds.add(recipe.productMaterialId);
        }
      }
    });

    return items.map(item => {
      if (item.isEco !== undefined && item.isEco !== null) return item;

      let isEco = false;

      // 1) Direct recipeId match
      if (item.recipeId && ecoRecipeIds.has(item.recipeId)) {
        isEco = true;
      }

      // 2) Match via originalOrderItem.recipeId
      if (!isEco && item.originalOrderItem?.recipeId && ecoRecipeIds.has(item.originalOrderItem.recipeId)) {
        isEco = true;
      }

      // 3) Name-based matching against ECO recipe names
      if (!isEco && item.description) {
        const descLower = item.description.toLowerCase();
        for (const ecoName of ecoRecipeNames) {
          if (descLower === ecoName || descLower.includes(ecoName) || ecoName.includes(descLower)) {
            isEco = true;
            break;
          }
        }
      }

      // 4) inventoryItemId match via productMaterialId
      if (!isEco && item.inventoryItemId && recipeProductMaterialIds.has(item.inventoryItemId)) {
        isEco = true;
      }

      return { ...item, isEco };
    });
  } catch (error) {
    console.error('Failed to resolve ECO status for CMR items:', error);
    return items.map(item => ({
      ...item,
      isEco: item.isEco ?? false
    }));
  }
};

/**
 * Groups CMR items by orderNumber + ECO/Standard type.
 * Returns a Map: key = "CO00001-ECO" | "CO00001-STD" | "MISC-ECO" | "MISC-STD", value = array of items.
 */
export const groupCmrItemsForDeliveryNotes = (items) => {
  const groups = {};

  for (const item of items) {
    const orderPart = item.orderNumber || DN_GROUP_MISC;
    const typePart = item.isEco ? DN_TYPE_ECO : DN_TYPE_STD;
    const key = `${orderPart}|${typePart}`;

    if (!groups[key]) {
      groups[key] = {
        orderNumber: item.orderNumber || null,
        type: typePart,
        dnNumber: generateDeliveryNoteNumber(orderPart, item.isEco),
        items: []
      };
    }
    groups[key].items.push(item);
  }

  return groups;
};

/**
 * Generates a delivery note number: DN-{orderNumber}-{ECO|STD}
 */
export const generateDeliveryNoteNumber = (orderNumber, isEco) => {
  const typeSuffix = isEco ? DN_TYPE_ECO : DN_TYPE_STD;
  return `DN-${orderNumber}-${typeSuffix}`;
};

/**
 * Generates text summary for the CMR "attached documents" field (English).
 * Accepts items with or without isEco resolved — resolves dynamically if needed.
 */
export const generateDeliveryNoteText = async (items) => {
  if (!items || items.length === 0) return '';

  const resolvedItems = await resolveItemsEcoStatus(items);
  const groups = groupCmrItemsForDeliveryNotes(resolvedItems);
  const groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) return '';

  const lines = groupKeys.map(key => {
    const group = groups[key];
    const totalItems = group.items.length;
    const totalWeight = group.items.reduce((sum, it) => {
      const w = parseFloat(it.weight) || 0;
      return sum + w;
    }, 0);
    const totalQty = group.items.reduce((sum, it) => {
      const q = parseFloat(it.quantity) || 0;
      return sum + q;
    }, 0);

    let summary = `${group.dnNumber} (${totalItems} item${totalItems !== 1 ? 's' : ''}`;
    if (totalQty > 0) {
      const unit = group.items[0]?.unit || 'pcs';
      summary += `, ${totalQty} ${unit}`;
    }
    if (totalWeight > 0) {
      summary += `, ${totalWeight.toFixed(2)} kg`;
    }
    summary += ')';
    return summary;
  });

  return 'Delivery Notes:\n' + lines.join('\n');
};

/**
 * Generates delivery note metadata to store on the CMR document.
 */
export const generateDeliveryNoteMetadata = async (items) => {
  if (!items || items.length === 0) return [];

  const resolvedItems = await resolveItemsEcoStatus(items);
  const groups = groupCmrItemsForDeliveryNotes(resolvedItems);
  return Object.values(groups).map(group => ({
    number: group.dnNumber,
    type: group.type,
    orderNumber: group.orderNumber,
    itemCount: group.items.length,
    totalWeight: group.items.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0)
  }));
};

/**
 * Generates a full delivery note PDF using jsPDF.
 * Returns an object with { pdf, filename } for each DN group, or opens a combined PDF in a new window.
 */
export const generateDeliveryNotePdf = async (items, cmrData) => {
  const { jsPDF } = await import('jspdf');

  const resolvedItems = await resolveItemsEcoStatus(items);
  const groups = groupCmrItemsForDeliveryNotes(resolvedItems);
  const groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) {
    throw new Error('No items to generate delivery notes for');
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let isFirstPage = true;

  for (const key of groupKeys) {
    const group = groups[key];

    if (!isFirstPage) {
      pdf.addPage();
    }
    isFirstPage = false;

    renderDeliveryNotePage(pdf, group, cmrData);
  }

  const cmrNum = (cmrData.cmrNumber || 'CMR').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
  const dateStr = new Date().toISOString().slice(0, 10);
  return {
    pdf,
    filename: `DN-${cmrNum}-${dateStr}.pdf`
  };
};

function renderDeliveryNotePage(pdf, group, cmrData) {
  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  // --- Header ---
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DELIVERY NOTE', pageWidth / 2, y, { align: 'center' });
  y += 8;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(sanitize(group.dnNumber), pageWidth / 2, y, { align: 'center' });
  y += 6;

  const typeLabel = group.type === DN_TYPE_ECO ? 'ECO Product' : 'Standard Product';
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'italic');
  pdf.text(`Type: ${typeLabel}`, pageWidth / 2, y, { align: 'center' });
  y += 10;

  // --- Reference info ---
  pdf.setDrawColor(180);
  pdf.line(margin, y, margin + contentWidth, y);
  y += 6;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');

  const formatDate = (date) => {
    if (!date) return '-';
    if (date.toDate) date = date.toDate();
    if (typeof date === 'string') date = new Date(date);
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB');
    }
    return '-';
  };

  const leftCol = margin;
  const rightCol = margin + contentWidth / 2 + 5;

  pdf.setFont('helvetica', 'bold');
  pdf.text('CMR Reference:', leftCol, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(sanitize(cmrData.cmrNumber || '-'), leftCol + 30, y);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Date:', rightCol, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(formatDate(cmrData.issueDate || cmrData.loadingDate), rightCol + 15, y);
  y += 5;

  if (group.orderNumber) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Customer Order:', leftCol, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(sanitize(group.orderNumber), leftCol + 30, y);
    y += 5;
  }

  y += 3;

  // --- Sender / Recipient ---
  pdf.setDrawColor(180);
  pdf.line(margin, y, margin + contentWidth, y);
  y += 6;

  const senderLines = [
    cmrData.sender,
    cmrData.senderAddress,
    [cmrData.senderPostalCode, cmrData.senderCity].filter(Boolean).join(' '),
    cmrData.senderCountry
  ].filter(Boolean).map(sanitize);

  const recipientLines = [
    cmrData.recipient,
    cmrData.recipientAddress
  ].filter(Boolean).map(sanitize);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Sender:', leftCol, y);
  pdf.text('Recipient:', rightCol, y);
  y += 5;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const maxPartyLines = Math.max(senderLines.length, recipientLines.length);
  for (let i = 0; i < maxPartyLines; i++) {
    if (senderLines[i]) pdf.text(senderLines[i], leftCol, y);
    if (recipientLines[i]) pdf.text(recipientLines[i], rightCol, y);
    y += 4;
  }
  y += 4;

  // --- Items table ---
  pdf.setDrawColor(180);
  pdf.line(margin, y, margin + contentWidth, y);
  y += 6;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Items', leftCol, y);
  y += 6;

  const colX = {
    no: margin,
    desc: margin + 8,
    qty: margin + contentWidth - 65,
    unit: margin + contentWidth - 45,
    weight: margin + contentWidth - 25,
  };

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('No.', colX.no, y);
  pdf.text('Description', colX.desc, y);
  pdf.text('Qty', colX.qty, y, { align: 'right' });
  pdf.text('Unit', colX.unit, y);
  pdf.text('Weight (kg)', colX.weight, y);
  y += 2;
  pdf.setDrawColor(200);
  pdf.line(margin, y, margin + contentWidth, y);
  y += 4;

  pdf.setFont('helvetica', 'normal');
  let totalWeight = 0;
  let totalQty = 0;

  group.items.forEach((item, idx) => {
    const qty = parseFloat(item.quantity) || 0;
    const weight = parseFloat(item.weight) || 0;
    totalQty += qty;
    totalWeight += weight;

    const desc = sanitize(item.description || item.name || '-');
    const truncatedDesc = desc.length > 60 ? desc.substring(0, 57) + '...' : desc;

    pdf.text(`${idx + 1}.`, colX.no, y);
    pdf.text(truncatedDesc, colX.desc, y);
    pdf.text(qty > 0 ? qty.toString() : '-', colX.qty, y, { align: 'right' });
    pdf.text(sanitize(item.unit || 'pcs'), colX.unit, y);
    pdf.text(weight > 0 ? weight.toFixed(2) : '-', colX.weight, y);
    y += 5;

    if (y > 270) {
      pdf.addPage();
      y = margin;
    }
  });

  // Totals
  y += 2;
  pdf.setDrawColor(180);
  pdf.line(margin, y, margin + contentWidth, y);
  y += 4;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Total:', colX.desc, y);
  pdf.text(totalQty > 0 ? totalQty.toString() : '-', colX.qty, y, { align: 'right' });
  pdf.text(totalWeight > 0 ? totalWeight.toFixed(2) : '-', colX.weight, y);

  // Eco badge at bottom
  if (group.type === DN_TYPE_ECO) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    const ecoY = 282;
    pdf.setDrawColor(34, 139, 34);
    pdf.setFillColor(240, 255, 240);
    pdf.roundedRect(margin, ecoY - 4, contentWidth, 8, 2, 2, 'FD');
    pdf.setTextColor(34, 139, 34);
    pdf.text('ECO CERTIFIED PRODUCTS', pageWidth / 2, ecoY, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }
}
