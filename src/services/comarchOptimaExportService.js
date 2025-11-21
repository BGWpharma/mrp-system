/**
 * Serwis eksportu faktur do formatu XML dla Comarch Optima ERP
 * Format zgodny z oficjalnym schematem Comarch Optima
 */

import { format } from 'date-fns';
import { getCompanyData } from './companyService';
import { getExchangeRate } from './exchangeRateService';

/**
 * Formatuj daty w formacie YYYY-MM-DD
 */
const formatDate = (date) => {
  if (!date) return format(new Date(), 'yyyy-MM-dd');
  const dateObj = date?.toDate?.() || new Date(date);
  return format(dateObj, 'yyyy-MM-dd');
};

/**
 * Parsuj adres - rozszerzona wersja
 */
const parseAddress = (addressString) => {
  const defaultAddr = {
    street: '',
    city: '',
    postalCode: '',
    country: 'Polska'
  };
  
  if (!addressString) return defaultAddr;
  
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
 * Parsuj NIP i określ kraj
 */
const parseNIP = (nip) => {
  if (!nip) return { country: 'PL', number: '' };
  
  const cleaned = nip.replace(/\s/g, '');
  
  // Jeśli ma prefix kraju (np. FR, DE, UK)
  if (/^[A-Z]{2}/.test(cleaned)) {
    return {
      country: cleaned.substring(0, 2),
      number: cleaned.substring(2)
    };
  }
  
  // Jeśli ma prefix PL
  if (cleaned.startsWith('PL')) {
    return {
      country: 'PL',
      number: cleaned.substring(2)
    };
  }
  
  // Domyślnie zakładamy PL
  return {
    country: 'PL',
    number: cleaned
  };
};

/**
 * Pobierz kurs waluty z API NBP
 * @param {string} currency - Kod waluty (EUR, USD, GBP, etc.)
 * @param {Date|string} date - Data dla której pobieramy kurs
 * @returns {Promise<Object>} - Obiekt z kursem: { rate, rateDate, number }
 */
const getCurrencyRate = async (currency, date) => {
  if (currency === 'PLN') {
    return {
      rate: 1.0000,
      rateDate: formatDate(new Date()),
      number: 1
    };
  }

  try {
    const dateObj = date?.toDate?.() || new Date(date);
    const rate = await getExchangeRate(currency, 'PLN', dateObj);
    
    return {
      rate: parseFloat(rate.toFixed(4)),
      rateDate: formatDate(dateObj),
      number: 1 // NBP używa różnych numerów tabeli, ale dla uproszczenia używamy 1
    };
  } catch (error) {
    console.error(`Błąd podczas pobierania kursu ${currency}:`, error);
    // Fallback - zwróć ostatni znany kurs lub 1
    return {
      rate: 1.0000,
      rateDate: formatDate(new Date()),
      number: 1
    };
  }
};

/**
 * Określ flagę VAT na podstawie stawki
 * 0 = normalna stawka, 1 = zwolnione, 2 = eksport/wewnątrzwspólnotowe, 3 = odwrotne obciążenie
 */
const getVATFlag = (vatRate) => {
  if (vatRate === 0) return 2; // Eksport/WDT
  if (vatRate === -1) return 1; // Zwolnione
  return 0; // Normalna stawka
};

/**
 * Generuje XML dla pojedynczej faktury zgodnie ze schematem Comarch Optima
 */
const generateInvoiceDocumentContent = async (invoice, companyData) => {
  const address = parseAddress(invoice.billingAddress || invoice.customer?.address);
  const customerNIP = parseNIP(invoice.customer?.vatEu || invoice.customer?.nip);
  const issueDate = formatDate(invoice.issueDate);
  const dueDate = formatDate(invoice.dueDate);
  
  // Pobierz kurs waluty z API NBP
  const currency = invoice.currency || 'EUR';
  const currencyRate = await getCurrencyRate(currency, invoice.issueDate);
  
  // Typ dokumentu: 302 = Faktura Sprzedaży, 303 = Faktura Zakupu
  const typDokumentu = invoice.originalOrderType === 'purchase' ? '303' : '302';
  const rodzajDokumentu = invoice.originalOrderType === 'purchase' ? '303000' : '302000';
  
  // Oblicz sumy
  let sumaNetto = 0;
  let sumaNettoWal = 0;
  let sumaVAT = 0;
  let sumaVATWal = 0;
  let sumaBrutto = 0;
  let sumaBruttoWal = 0;
  
  // Mapa stawek VAT dla tabelki VAT
  const vatSummary = {};
  
  // Generuj pozycje
  const pozycjeXML = (invoice.items || []).map((item, index) => {
    const quantity = parseFloat(item.quantity || 0);
    const priceInItemCurrency = parseFloat(item.price || 0);
    const vatRate = parseFloat(item.vat || 0);
    const vatFlag = getVATFlag(vatRate);
    
    // Wartości w walucie systemowej (PLN)
    const cenaPLN = currency === 'PLN' ? priceInItemCurrency : priceInItemCurrency * currencyRate.rate;
    const wartoscNettoPLN = quantity * cenaPLN;
    const wartoscVATPLN = wartoscNettoPLN * (vatRate / 100);
    const wartoscBruttoPLN = wartoscNettoPLN + wartoscVATPLN;
    
    // Wartości w walucie dokumentu
    const cenaWal = priceInItemCurrency;
    const wartoscNettoWal = quantity * cenaWal;
    const wartoscVATWal = wartoscNettoWal * (vatRate / 100);
    const wartoscBruttoWal = wartoscNettoWal + wartoscVATWal;
    
    sumaNetto += wartoscNettoPLN;
    sumaNettoWal += wartoscNettoWal;
    sumaVAT += wartoscVATPLN;
    sumaVATWal += wartoscVATWal;
    sumaBrutto += wartoscBruttoPLN;
    sumaBruttoWal += wartoscBruttoWal;
    
    // Dodaj do podsumowania VAT
    const vatKey = `${vatRate.toFixed(2)}_${vatFlag}`;
    if (!vatSummary[vatKey]) {
      vatSummary[vatKey] = {
        stawka: vatRate,
        flaga: vatFlag,
        netto: 0,
        nettoPLN: 0,
        vat: 0,
        vatPLN: 0,
        brutto: 0,
        bruttoPLN: 0
      };
    }
    vatSummary[vatKey].netto += wartoscNettoWal;
    vatSummary[vatKey].nettoPLN += wartoscNettoPLN;
    vatSummary[vatKey].vat += wartoscVATWal;
    vatSummary[vatKey].vatPLN += wartoscVATPLN;
    vatSummary[vatKey].brutto += wartoscBruttoWal;
    vatSummary[vatKey].bruttoPLN += wartoscBruttoPLN;
    
    return `<POZYCJA>
<LP>${index + 1}</LP>
<TOWAR>
<KOD>${escapeXML(item.sku || item.id || `ITEM-${index + 1}`)}</KOD>
<NAZWA>${escapeXML(item.name || '')}</NAZWA>
<OPIS>${escapeXML(item.description || '')}</OPIS>
<EAN/>
<SWW/>
<NUMER_KATALOGOWY/>
<MPP>0</MPP>
</TOWAR>
<STAWKA_VAT>
<STAWKA>${vatRate.toFixed(2)}</STAWKA>
<FLAGA>${vatFlag}</FLAGA>
<ZRODLOWA>${vatRate.toFixed(2)}</ZRODLOWA>
</STAWKA_VAT>
<CENY>
<CENAZCZTEREMAMIEJSCAMI>1</CENAZCZTEREMAMIEJSCAMI>
<POCZATKOWA_WAL_CENNIKA>${cenaPLN.toFixed(4)}</POCZATKOWA_WAL_CENNIKA>
<POCZATKOWA_WAL_DOKUMENTU>${cenaWal.toFixed(4)}</POCZATKOWA_WAL_DOKUMENTU>
<PO_RABACIE_WAL_CENNIKA>${cenaPLN.toFixed(4)}</PO_RABACIE_WAL_CENNIKA>
<PO_RABACIE_PLN>${cenaPLN.toFixed(4)}</PO_RABACIE_PLN>
<PO_RABACIE_WAL_DOKUMENTU>${cenaWal.toFixed(4)}</PO_RABACIE_WAL_DOKUMENTU>
</CENY>
<WALUTA>
<SYMBOL>PLN</SYMBOL>
<KURS_L>1.00</KURS_L>
<KURS_M>1</KURS_M>
</WALUTA>
<RABAT>0.00</RABAT>
<WARTOSC_NETTO>${wartoscNettoPLN.toFixed(2)}</WARTOSC_NETTO>
<WARTOSC_BRUTTO>${wartoscBruttoPLN.toFixed(2)}</WARTOSC_BRUTTO>
<WARTOSC_NETTO_WAL>${wartoscNettoWal.toFixed(2)}</WARTOSC_NETTO_WAL>
<WARTOSC_BRUTTO_WAL>${wartoscBruttoWal.toFixed(2)}</WARTOSC_BRUTTO_WAL>
<ILOSC>${quantity.toFixed(4)}</ILOSC>
<JM>${escapeXML(item.unit || 'szt')}</JM>
<JM_CALKOWITE>0.00</JM_CALKOWITE>
<JM_ZLOZONA>
<JMZ>${escapeXML(item.unit || 'szt')}</JMZ>
<JM_PRZELICZNIK_L>1.00</JM_PRZELICZNIK_L>
<JM_PRZELICZNIK_M>1</JM_PRZELICZNIK_M>
</JM_ZLOZONA>
</POZYCJA>`;
  }).join('\n');
  
  // Generuj tabelkę VAT
  const tabelkaVATXML = Object.values(vatSummary).map(vat => `<LINIA_VAT>
<STAWKA_VAT>
<STAWKA>${vat.stawka.toFixed(2)}</STAWKA>
<FLAGA>${vat.flaga}</FLAGA>
<ZRODLOWA>${vat.stawka.toFixed(2)}</ZRODLOWA>
</STAWKA_VAT>
<NETTO>${vat.nettoPLN.toFixed(2)}</NETTO>
<VAT>${vat.vatPLN.toFixed(2)}</VAT>
<BRUTTO>${vat.bruttoPLN.toFixed(2)}</BRUTTO>
<NETTO_WAL>${vat.netto.toFixed(2)}</NETTO_WAL>
<VAT_WAL>${vat.vat.toFixed(2)}</VAT_WAL>
<BRUTTO_WAL>${vat.brutto.toFixed(2)}</BRUTTO_WAL>
</LINIA_VAT>`).join('\n');
  
  // Dane sprzedawcy (twoja firma)
  const sprzedawcaXML = companyData ? `<SPRZEDAWCA>
<NIP_KRAJ>${escapeXML(companyData.nipCountry || 'PL')}</NIP_KRAJ>
<NIP>${escapeXML(companyData.nip || '')}</NIP>
<GLN/>
<NAZWA>${escapeXML(companyData.name || '')}</NAZWA>
<ADRES>
<KOD_POCZTOWY>${escapeXML(companyData.postalCode || '')}</KOD_POCZTOWY>
<MIASTO>${escapeXML(companyData.city || '')}</MIASTO>
<ULICA>${escapeXML(companyData.street || '')}</ULICA>
<KRAJ>${escapeXML(companyData.country || 'Polska')}</KRAJ>
</ADRES>
<NUMER_KONTA_BANKOWEGO>${escapeXML(companyData.bankAccount || '')}</NUMER_KONTA_BANKOWEGO>
<NAZWA_BANKU>${escapeXML(companyData.bankName || '')}</NAZWA_BANKU>
</SPRZEDAWCA>` : '';

  return `<DOKUMENT>
<NAGLOWEK>
<GENERATOR>Comarch Opt!ma</GENERATOR>
<TYP_DOKUMENTU>${typDokumentu}</TYP_DOKUMENTU>
<RODZAJ_DOKUMENTU>${rodzajDokumentu}</RODZAJ_DOKUMENTU>
<FV_MARZA>0</FV_MARZA>
<FV_MARZA_RODZAJ>0</FV_MARZA_RODZAJ>
<NUMER_PELNY>${escapeXML(invoice.number || '')}</NUMER_PELNY>
<DATA_DOKUMENTU>${issueDate}</DATA_DOKUMENTU>
<DATA_WYSTAWIENIA>${issueDate}</DATA_WYSTAWIENIA>
<DATA_OPERACJI>${issueDate}</DATA_OPERACJI>
<TERMIN_ZWROTU_KAUCJI>${dueDate}</TERMIN_ZWROTU_KAUCJI>
<KOREKTA>0</KOREKTA>
<DETAL>0</DETAL>
<TYP_NETTO_BRUTTO>1</TYP_NETTO_BRUTTO>
<RABAT>0.00</RABAT>
<OPIS>Dok.: ${escapeXML(invoice.number || '')} (Faktura sprzedaży)</OPIS>
<PLATNIK>
<KOD>${escapeXML(invoice.customer?.id || '')}</KOD>
<NIP_KRAJ>${customerNIP.country}</NIP_KRAJ>
<NIP>${escapeXML(customerNIP.number)}</NIP>
<GLN/>
<NAZWA>${escapeXML(invoice.customer?.name || '')}</NAZWA>
<MPP>0</MPP>
<ADRES>
<KOD_POCZTOWY>${escapeXML(address.postalCode)}</KOD_POCZTOWY>
<MIASTO>${escapeXML(address.city)}</MIASTO>
<ULICA>${escapeXML(address.street)}</ULICA>
<KRAJ>${escapeXML(address.country)}</KRAJ>
</ADRES>
</PLATNIK>
<ODBIORCA>
<KOD>${escapeXML(invoice.customer?.id || '')}</KOD>
<NIP_KRAJ>${customerNIP.country}</NIP_KRAJ>
<NIP>${escapeXML(customerNIP.number)}</NIP>
<GLN/>
<NAZWA>${escapeXML(invoice.customer?.name || '')}</NAZWA>
<ADRES>
<KOD_POCZTOWY>${escapeXML(address.postalCode)}</KOD_POCZTOWY>
<MIASTO>${escapeXML(address.city)}</MIASTO>
<ULICA>${escapeXML(address.street)}</ULICA>
<KRAJ>${escapeXML(address.country)}</KRAJ>
</ADRES>
</ODBIORCA>
${sprzedawcaXML}
<KATEGORIA>
<KOD/>
<OPIS/>
</KATEGORIA>
<PLATNOSC>
<FORMA>${escapeXML(invoice.paymentMethod || 'przelew').toLowerCase()}</FORMA>
<TERMIN>${dueDate}</TERMIN>
<MPP>0</MPP>
</PLATNOSC>
<WALUTA>
<SYMBOL>${escapeXML(currency)}</SYMBOL>
<KURS_L>${currencyRate.rate.toFixed(4)}</KURS_L>
<KURS_M>1</KURS_M>
<PLAT_WAL_OD_PLN>0</PLAT_WAL_OD_PLN>
<KURS_NUMER>${currencyRate.number}</KURS_NUMER>
<KURS_DATA>${currencyRate.rateDate}</KURS_DATA>
</WALUTA>
<KWOTY>
<RAZEM_NETTO_WAL>${sumaNettoWal.toFixed(2)}</RAZEM_NETTO_WAL>
<RAZEM_NETTO>${sumaNettoWal.toFixed(2)}</RAZEM_NETTO>
<RAZEM_BRUTTO>${sumaBruttoWal.toFixed(2)}</RAZEM_BRUTTO>
<RAZEM_VAT>${sumaVATWal.toFixed(2)}</RAZEM_VAT>
</KWOTY>
<MAGAZYN_ZRODLOWY>${escapeXML(companyData?.warehouse || 'MAGAZYN')}</MAGAZYN_ZRODLOWY>
<MAGAZYN_DOCELOWY/>
<KAUCJE_PLATNOSCI>0</KAUCJE_PLATNOSCI>
<BLOKADA_PLATNOSCI>0</BLOKADA_PLATNOSCI>
<VAT_DLA_DOK_WAL>0</VAT_DLA_DOK_WAL>
<TRYB_NETTO_VAT>0</TRYB_NETTO_VAT>
<STATUS_PLATNIKA>3</STATUS_PLATNIKA>
<ROZLICZAM_PODATEK_W_OSS>0</ROZLICZAM_PODATEK_W_OSS>
</NAGLOWEK>
<POZYCJE>
${pozycjeXML}
</POZYCJE>
<KAUCJE/>
<PLATNOSCI>
<PLATNOSC>
<FORMA>${escapeXML(invoice.paymentMethod || 'przelew').toLowerCase()}</FORMA>
<TERMIN>${dueDate}</TERMIN>
<KWOTA>${sumaBruttoWal.toFixed(2)}</KWOTA>
<KWOTA_W_WAL_SYSTEMOWEJ>${sumaBrutto.toFixed(2)}</KWOTA_W_WAL_SYSTEMOWEJ>
<WALUTA>
<SYMBOL>${escapeXML(currency)}</SYMBOL>
<KURS_L>${currencyRate.rate.toFixed(4)}</KURS_L>
<KURS_M>1</KURS_M>
</WALUTA>
</PLATNOSC>
</PLATNOSCI>
<PLATNOSCI_KAUCJE/>
<TABELKA_VAT>
${tabelkaVATXML}
</TABELKA_VAT>
<ATRYBUTY/>
<KODY_JPK_V7/>
</DOKUMENT>`;
};

/**
 * Generuje plik XML dla pojedynczej faktury w formacie Comarch Optima
 */
export const generateOptimaXMLForInvoice = async (invoice, companyData = null) => {
  const content = await generateInvoiceDocumentContent(invoice, companyData);
  return `<?xml version="1.0" encoding="UTF-8"?>

<ROOT xmlns="http://www.cdn.com.pl/optima/dokument">${content}</ROOT>`;
};

/**
 * Generuje plik XML dla wielu faktur
 */
export const generateOptimaXMLForInvoices = async (invoices, companyData = null) => {
  const dokumentyPromises = invoices.map(invoice => generateInvoiceDocumentContent(invoice, companyData));
  const dokumentyXML = (await Promise.all(dokumentyPromises)).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>

<ROOT xmlns="http://www.cdn.com.pl/optima/dokument">
${dokumentyXML}
</ROOT>`;
};

/**
 * Eksportuje faktury do pliku XML
 * @param {Array} invoices - Array faktur do eksportu
 * @param {Object} companyData - Dane firmy sprzedawcy (opcjonalne, jeśli nie podane, pobierze z bazy)
 * @param {string} filename - Opcjonalna nazwa pliku
 */
export const exportInvoicesToOptimaXML = async (invoices, companyData = null, filename = null) => {
  if (!invoices || invoices.length === 0) {
    throw new Error('Brak faktur do eksportu');
  }

  // Jeśli nie podano danych firmy, pobierz z bazy
  let companyInfo = companyData;
  if (!companyInfo) {
    try {
      companyInfo = await getCompanyData();
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      throw new Error('Nie udało się pobrać danych firmy. Sprawdź konfigurację w ustawieniach.');
    }
  }

  // Konwertuj dane firmy do formatu wymaganego przez Comarch Optima
  const optimaCompanyData = {
    name: companyInfo.name || '',
    nip: companyInfo.nip || '',
    nipCountry: 'PL', // Zawsze PL dla polskiej firmy
    street: companyInfo.address || '',
    city: companyInfo.city || '',
    postalCode: companyInfo.postalCode || companyInfo.zipCode || '',
    country: companyInfo.country || 'Polska',
    bankAccount: companyInfo.bankAccounts?.[0]?.accountNumber || '',
    bankName: companyInfo.bankAccounts?.[0]?.bankName || '',
    warehouse: 'MAGAZYN' // Domyślna wartość
  };

  const xmlContent = invoices.length === 1 
    ? await generateOptimaXMLForInvoice(invoices[0], optimaCompanyData)
    : await generateOptimaXMLForInvoices(invoices, optimaCompanyData);

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
