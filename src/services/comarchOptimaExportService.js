/**
 * Serwis eksportu faktur do formatu XML dla Comarch Optima ERP
 */

import { format } from 'date-fns';

/**
 * Formatuj daty
 */
const formatDate = (date) => {
  if (!date) return format(new Date(), 'yyyy-MM-dd');
  const dateObj = date?.toDate?.() || new Date(date);
  return format(dateObj, 'yyyy-MM-dd');
};

/**
 * Parsuj adres
 */
const parseAddress = (addressString) => {
  const defaultAddr = {
    street: '',
    city: '',
    postalCode: '',
    country: 'Polska'
  };
  
  if (!addressString) return defaultAddr;
  
  // Prosta implementacja - można rozbudować
  const lines = addressString.split(',').map(s => s.trim());
  return {
    street: lines[0] || '',
    city: lines[1] || '',
    postalCode: lines[2] || '',
    country: lines[3] || 'Polska'
  };
};

/**
 * Escape special XML characters
 */
const escapeXML = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Generuje zawartość XML dla pojedynczej faktury (bez deklaracji XML)
 * @private
 */
const generateInvoiceDocumentContent = (invoice) => {
  // Typ dokumentu: FS = Faktura Sprzedaży, FZ = Faktura Zakupu
  const docType = invoice.originalOrderType === 'purchase' ? 'FZ' : 'FS';
  
  const address = parseAddress(invoice.billingAddress || invoice.customer?.address);
  
  // Oblicz sumy
  let sumaNetto = 0;
  let sumaVAT = 0;
  let sumaBrutto = 0;
  
  const pozycjeXML = (invoice.items || []).map((item, index) => {
    const quantity = parseFloat(item.quantity || 0);
    const price = parseFloat(item.price || 0);
    const vatRate = parseFloat(item.vat || 0);
    
    const wartoscNetto = quantity * price;
    const wartoscVAT = wartoscNetto * (vatRate / 100);
    const wartoscBrutto = wartoscNetto + wartoscVAT;
    
    sumaNetto += wartoscNetto;
    sumaVAT += wartoscVAT;
    sumaBrutto += wartoscBrutto;
    
    return `    <Pozycja>
      <Lp>${index + 1}</Lp>
      <Nazwa>${escapeXML(item.name || '')}</Nazwa>
      <Opis>${escapeXML(item.description || '')}</Opis>
      <Ilosc>${quantity.toFixed(2)}</Ilosc>
      <Jm>${escapeXML(item.unit || 'szt')}</Jm>
      <CenaNetto>${price.toFixed(4)}</CenaNetto>
      <StawkaVAT>${vatRate.toFixed(0)}</StawkaVAT>
      <WartoscNetto>${wartoscNetto.toFixed(2)}</WartoscNetto>
      <WartoscVAT>${wartoscVAT.toFixed(2)}</WartoscVAT>
      <WartoscBrutto>${wartoscBrutto.toFixed(2)}</WartoscBrutto>
    </Pozycja>`;
  }).join('\n');

  // Przygotuj NIP
  const nip = invoice.customer?.vatEu || '';
  
  return `<Dokument>
  <Naglowek>
    <Typ>${docType}</Typ>
    <Numer>${escapeXML(invoice.number || '')}</Numer>
    <DataWystawienia>${formatDate(invoice.issueDate)}</DataWystawienia>
    <DataSprzedazy>${formatDate(invoice.issueDate)}</DataSprzedazy>
    <TerminPlatnosci>${formatDate(invoice.dueDate)}</TerminPlatnosci>
    <FormaPlat>${escapeXML(invoice.paymentMethod || 'Przelew')}</FormaPlat>
    <Waluta>${escapeXML(invoice.currency || 'EUR')}</Waluta>
    <Status>${escapeXML(invoice.status || 'issued')}</Status>
    ${invoice.orderNumber ? `<NumerZamowienia>${escapeXML(invoice.orderNumber)}</NumerZamowienia>` : ''}
  </Naglowek>
  
  <Kontrahent>
    <Kod>${escapeXML(invoice.customer?.id || '')}</Kod>
    <Nazwa>${escapeXML(invoice.customer?.name || '')}</Nazwa>
    <NIP>${escapeXML(nip)}</NIP>
    <Email>${escapeXML(invoice.customer?.email || '')}</Email>
    <Telefon>${escapeXML(invoice.customer?.phone || '')}</Telefon>
    <Adres>
      <Ulica>${escapeXML(address.street)}</Ulica>
      <Miasto>${escapeXML(address.city)}</Miasto>
      <KodPocztowy>${escapeXML(address.postalCode)}</KodPocztowy>
      <Kraj>${escapeXML(address.country)}</Kraj>
    </Adres>
  </Kontrahent>
  
  <Pozycje>
${pozycjeXML}
  </Pozycje>
  
  <Podsumowanie>
    <SumaNetto>${sumaNetto.toFixed(2)}</SumaNetto>
    <SumaVAT>${sumaVAT.toFixed(2)}</SumaVAT>
    <SumaBrutto>${sumaBrutto.toFixed(2)}</SumaBrutto>
    <Waluta>${escapeXML(invoice.currency || 'EUR')}</Waluta>
  </Podsumowanie>
  
  ${invoice.notes ? `<Uwagi>${escapeXML(invoice.notes)}</Uwagi>` : ''}
  
  <Platnosci>
    <TotalPaid>${parseFloat(invoice.totalPaid || 0).toFixed(2)}</TotalPaid>
    <SettledAdvancePayments>${parseFloat(invoice.settledAdvancePayments || 0).toFixed(2)}</SettledAdvancePayments>
    <Remaining>${Math.max(0, parseFloat(invoice.total || 0) - parseFloat(invoice.totalPaid || 0) - parseFloat(invoice.settledAdvancePayments || 0)).toFixed(2)}</Remaining>
  </Platnosci>
  
  <Metadane>
    <DataEksportu>${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</DataEksportu>
    <SystemZrodlowy>BGW-MRP</SystemZrodlowy>
    <CzyProforma>${invoice.isProforma ? 'true' : 'false'}</CzyProforma>
    <CzyRefaktura>${invoice.isRefInvoice ? 'true' : 'false'}</CzyRefaktura>
  </Metadane>
</Dokument>`;
};

/**
 * Generuje plik XML dla pojedynczej faktury w formacie Comarch Optima
 */
export const generateOptimaXMLForInvoice = (invoice) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
${generateInvoiceDocumentContent(invoice)}`;
};

/**
 * Generuje plik XML dla wielu faktur
 */
export const generateOptimaXMLForInvoices = (invoices) => {
  const dokumentyXML = invoices.map(invoice => generateInvoiceDocumentContent(invoice)).join('\n\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<DokumentyOptima>
  <Info>
    <DataEksportu>${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</DataEksportu>
    <LiczbaFaktur>${invoices.length}</LiczbaFaktur>
    <SystemZrodlowy>BGW-MRP</SystemZrodlowy>
  </Info>
  
${dokumentyXML}
</DokumentyOptima>`;
};

/**
 * Eksportuje faktury do pliku XML
 */
export const exportInvoicesToOptimaXML = (invoices, filename = null) => {
  if (!invoices || invoices.length === 0) {
    throw new Error('Brak faktur do eksportu');
  }

  const xmlContent = invoices.length === 1 
    ? generateOptimaXMLForInvoice(invoices[0])
    : generateOptimaXMLForInvoices(invoices);

  // Utwórz nazwę pliku
  const defaultFilename = invoices.length === 1
    ? `Faktura_${invoices[0].number.replace(/\//g, '_')}_Optima.xml`
    : `Faktury_Optima_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.xml`;

  const finalFilename = filename || defaultFilename;

  // Utwórz i pobierz plik
  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', finalFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    success: true,
    filename: finalFilename,
    invoicesCount: invoices.length
  };
};

/**
 * Waliduje dane faktury przed eksportem
 */
export const validateInvoiceForOptima = (invoice) => {
  const errors = [];
  
  if (!invoice.number) errors.push('Brak numeru faktury');
  if (!invoice.customer?.name) errors.push('Brak nazwy klienta');
  if (!invoice.issueDate) errors.push('Brak daty wystawienia');
  if (!invoice.dueDate) errors.push('Brak terminu płatności');
  if (!invoice.items || invoice.items.length === 0) errors.push('Brak pozycji faktury');
  
  return {
    isValid: errors.length === 0,
    errors
  };
};
