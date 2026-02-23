import ExcelJS from 'exceljs';
import { format } from 'date-fns';

const COLORS = {
  headerBg: '1E293B',
  headerText: 'FFFFFF',
  errorBg: 'FEE2E2',
  errorText: 'DC2626',
  warningBg: 'FEF3C7',
  warningText: 'D97706',
  successBg: 'D1FAE5',
  successText: '059669',
  infoBg: 'DBEAFE',
  infoText: '2563EB',
  borderColor: 'E5E7EB',
  titleBg: '0F172A',
  subtitleBg: '334155'
};

function buildForecastSheet(workbook, data, { formatDateDisplay, startDate, endDate }) {
  const sheet = workbook.addWorksheet('Material Forecast', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 7 }]
  });

  const totalCost = data.reduce((sum, item) => sum + (item.cost || 0), 0);
  const shortageValue = data
    .filter(item => item.balance < 0)
    .reduce((sum, item) => sum + (Math.abs(item.balance) * (item.price || 0)), 0);
  const shortageValueAfterDeliveries = data
    .filter(item => item.balanceWithFutureDeliveries < 0)
    .reduce((sum, item) => sum + (Math.abs(item.balanceWithFutureDeliveries) * (item.price || 0)), 0);
  const materialsWithShortage = data.filter(item => item.balance < 0).length;
  const materialsWithShortageAfterDeliveries = data.filter(item => item.balanceWithFutureDeliveries < 0).length;

  sheet.columns = [
    { header: '', key: 'material', width: 40 },
    { header: '', key: 'available', width: 18 },
    { header: '', key: 'required', width: 18 },
    { header: '', key: 'balance', width: 18 },
    { header: '', key: 'deliveries', width: 18 },
    { header: '', key: 'eta', width: 16 },
    { header: '', key: 'balanceWithDeliveries', width: 22 },
    { header: '', key: 'price', width: 14 },
    { header: '', key: 'cost', width: 16 },
    { header: '', key: 'status', width: 24 }
  ];

  sheet.mergeCells('A1:J1');
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = 'MATERIAL DEMAND FORECAST REPORT';
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 30;

  sheet.mergeCells('A2:J2');
  const infoRow = sheet.getRow(2);
  infoRow.getCell(1).value = `Period: ${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}  |  Generated: ${formatDateDisplay(new Date())} at ${format(new Date(), 'HH:mm')}`;
  infoRow.getCell(1).font = { size: 10, color: { argb: 'FFFFFF' } };
  infoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtitleBg } };
  infoRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  infoRow.height = 22;

  sheet.mergeCells('A3:E3');
  sheet.mergeCells('F3:J3');
  const statsRow1 = sheet.getRow(3);
  statsRow1.getCell(1).value = `📊 Total materials: ${data.length}  |  ⚠️ Requiring purchase: ${materialsWithShortage}  |  ❌ Shortage after deliveries: ${materialsWithShortageAfterDeliveries}`;
  statsRow1.getCell(1).font = { size: 10, bold: true };
  statsRow1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.infoBg } };
  statsRow1.getCell(6).value = `💰 Shortage value: ${shortageValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} €  |  After deliveries: ${shortageValueAfterDeliveries.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`;
  statsRow1.getCell(6).font = { size: 10, bold: true };
  statsRow1.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.infoBg } };
  statsRow1.height = 24;

  sheet.getRow(4).height = 8;

  sheet.mergeCells('A5:J5');
  const legendRow = sheet.getRow(5);
  legendRow.getCell(1).value = '🔴 Shortage  |  🟡 Replenished by deliveries  |  🟢 Sufficient';
  legendRow.getCell(1).font = { size: 9, italic: true };
  legendRow.getCell(1).alignment = { horizontal: 'center' };
  legendRow.height = 20;

  sheet.getRow(6).height = 6;

  const headers = ['MATERIAL', 'AVAILABLE QTY', 'REQUIRED', 'BALANCE', 'PENDING DELIVERIES', 'ETA', 'BALANCE W/ DELIVERIES', 'PRICE', 'ESTIMATED COST', 'STATUS'];
  const headerRow = sheet.getRow(7);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: index === 0 ? 'left' : 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: COLORS.borderColor } } };
  });
  headerRow.height = 26;

  data.forEach((item, index) => {
    const rowNum = 8 + index;
    const row = sheet.getRow(rowNum);

    const balance = item.balance || 0;
    const balanceWithDeliveries = item.balanceWithFutureDeliveries || 0;
    const unit = item.unit || 'pcs';

    const eta = item.futureDeliveries && item.futureDeliveries.length > 0 && item.futureDeliveries[0].expectedDeliveryDate
      ? formatDateDisplay(new Date(item.futureDeliveries[0].expectedDeliveryDate))
      : '—';
    const deliveriesCount = item.futureDeliveries?.length || 0;
    const etaWithMore = deliveriesCount > 1 ? `${eta} (+${deliveriesCount - 1})` : eta;

    let statusText, statusColor, rowBgColor;
    if (balanceWithDeliveries < 0) {
      statusText = '❌ Shortage';
      statusColor = COLORS.errorText;
      rowBgColor = COLORS.errorBg;
    } else if (balance < 0 && balanceWithDeliveries >= 0) {
      statusText = '⏱️ Replenished';
      statusColor = COLORS.warningText;
      rowBgColor = COLORS.warningBg;
    } else {
      statusText = '✅ Sufficient';
      statusColor = COLORS.successText;
      rowBgColor = null;
    }

    const values = [
      `${item.name || ''}\n${item.category || 'Other'}`,
      `${(item.availableQuantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
      `${(item.requiredQuantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
      `${balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
      `${(item.futureDeliveriesTotal || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
      etaWithMore,
      `${balanceWithDeliveries.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
      item.price ? `${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €` : '—',
      item.cost ? `${item.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })} €` : '—',
      statusText
    ];

    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.alignment = {
        horizontal: colIndex === 0 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: colIndex === 0
      };
      if (rowBgColor) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
      }
      if (colIndex === 3 && balance < 0) {
        cell.font = { bold: true, color: { argb: COLORS.errorText } };
      }
      if (colIndex === 6 && balanceWithDeliveries < 0) {
        cell.font = { bold: true, color: { argb: COLORS.errorText } };
      }
      if (colIndex === 9) {
        cell.font = { bold: true, color: { argb: statusColor } };
      }
      cell.border = { bottom: { style: 'thin', color: { argb: COLORS.borderColor } } };
    });

    row.height = 32;
  });

  return { totalCost, shortageValue, shortageValueAfterDeliveries, materialsWithShortage, materialsWithShortageAfterDeliveries };
}

function buildUnusedMaterialsSheet(workbook, unusedData, unusedDeliveries, { formatDateDisplay }) {
  if (unusedData.length === 0) return;

  const sheet = workbook.addWorksheet('Unused Materials', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
  });

  sheet.columns = [
    { header: '', key: 'material', width: 40 },
    { header: '', key: 'available', width: 20 },
    { header: '', key: 'deliveries', width: 20 },
    { header: '', key: 'eta', width: 18 },
    { header: '', key: 'total', width: 22 }
  ];

  sheet.mergeCells('A1:E1');
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = 'UNUSED MATERIALS (NOT IN ANY MANUFACTURING ORDER)';
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 28;

  sheet.mergeCells('A2:E2');
  const infoRow = sheet.getRow(2);
  infoRow.getCell(1).value = `Total: ${unusedData.length} materials  |  Excluded: "Inne", "Gotowe produkty" categories and materials with quantity 0`;
  infoRow.getCell(1).font = { size: 10, color: { argb: 'FFFFFF' } };
  infoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtitleBg } };
  infoRow.getCell(1).alignment = { horizontal: 'center' };
  infoRow.height = 22;

  sheet.getRow(3).height = 6;

  const headers = ['MATERIAL', 'AVAILABLE QTY', 'PENDING DELIVERIES', 'ETA', 'TOTAL AVAILABLE'];
  const headerRow = sheet.getRow(4);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: index === 0 ? 'left' : 'center', vertical: 'middle' };
  });
  headerRow.height = 24;

  unusedData.forEach((item, index) => {
    const rowNum = 5 + index;
    const row = sheet.getRow(rowNum);

    const deliveryData = unusedDeliveries[item.id];
    const availableQty = parseFloat(item.quantity) || 0;
    const pendingDeliveries = deliveryData?.total || 0;
    const unit = item.unit || 'pcs';
    const eta = deliveryData?.deliveries?.[0]?.expectedDeliveryDate
      ? formatDateDisplay(new Date(deliveryData.deliveries[0].expectedDeliveryDate))
      : '—';
    const deliveriesCount = deliveryData?.deliveries?.length || 0;
    const etaWithMore = deliveriesCount > 1 ? `${eta} (+${deliveriesCount - 1})` : eta;
    const totalAvailable = availableQty + pendingDeliveries;

    const values = [
      `${item.name || ''}\n${item.category || 'Other'}`,
      `${availableQty.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
      `${pendingDeliveries.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
      etaWithMore,
      `${totalAvailable.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`
    ];

    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.alignment = {
        horizontal: colIndex === 0 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: colIndex === 0
      };
      cell.border = { bottom: { style: 'thin', color: { argb: COLORS.borderColor } } };
      if (pendingDeliveries > 0 && colIndex === 2) {
        cell.font = { color: { argb: COLORS.infoText }, bold: true };
      }
    });

    row.height = 30;
  });
}

function buildSummarySheet(workbook, stats, { formatDateDisplay, startDate, endDate, unusedCount }) {
  const sheet = workbook.addWorksheet('Summary');

  sheet.columns = [
    { header: '', key: 'label', width: 40 },
    { header: '', key: 'value', width: 30 }
  ];

  sheet.mergeCells('A1:B1');
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = 'FORECAST SUMMARY';
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 30;

  const summaryData = [
    ['', ''],
    ['📅 REPORT DETAILS', ''],
    ['Forecast Period', `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`],
    ['Generated On', `${formatDateDisplay(new Date())} at ${format(new Date(), 'HH:mm')}`],
    ['', ''],
    ['📊 MATERIALS STATISTICS', ''],
    ['Total Materials in Forecast', stats.totalMaterials],
    ['Materials Requiring Purchase', stats.materialsWithShortage],
    ['Materials with Shortage After Deliveries', stats.materialsWithShortageAfterDeliveries],
    ['Materials with Sufficient Stock', stats.totalMaterials - stats.materialsWithShortage],
    ['', ''],
    ['💰 FINANCIAL SUMMARY', ''],
    ['Total Shortage Value', `${stats.shortageValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`],
    ['Shortage After Deliveries', `${stats.shortageValueAfterDeliveries.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`],
    ['Total Estimated Cost', `${stats.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`],
    ['', ''],
    ['📦 UNUSED MATERIALS', ''],
    ['Total Unused Materials', unusedCount]
  ];

  summaryData.forEach((rowData, index) => {
    const rowNum = 2 + index;
    const row = sheet.getRow(rowNum);
    row.getCell(1).value = rowData[0];
    row.getCell(2).value = rowData[1];

    if (rowData[0].includes('📅') || rowData[0].includes('📊') || rowData[0].includes('💰') || rowData[0].includes('📦')) {
      row.getCell(1).font = { bold: true, size: 12, color: { argb: COLORS.infoText } };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.infoBg } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.infoBg } };
      row.height = 24;
    } else if (rowData[0]) {
      row.getCell(1).font = { size: 11 };
      row.getCell(2).font = { size: 11, bold: true };
      row.getCell(2).alignment = { horizontal: 'right' };
    }
  });
}

export async function generateForecastReport({
  forecastData,
  unusedMaterialsData,
  unusedMaterialsDeliveries,
  formatDateDisplay,
  startDate,
  endDate
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BGW MRP System';
  workbook.created = new Date();

  const stats = buildForecastSheet(workbook, forecastData, { formatDateDisplay, startDate, endDate });

  buildUnusedMaterialsSheet(workbook, unusedMaterialsData, unusedMaterialsDeliveries, { formatDateDisplay });

  buildSummarySheet(workbook, {
    ...stats,
    totalMaterials: forecastData.length
  }, {
    formatDateDisplay,
    startDate,
    endDate,
    unusedCount: unusedMaterialsData.length
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const fileName = `material_demand_forecast_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;

  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
