import jsPDF from 'jspdf';
import { formatCurrency } from '../../utils/formatUtils';
import { getWarehouseById } from '../../services/inventoryService';
import { getCompanyInfo } from '../../services/companyService';

/**
 * Klasa odpowiedzialna za generowanie plików PDF dla zamówień zakupowych
 */
class PurchaseOrderPdfGenerator {
  constructor(purchaseOrder, options = {}) {
    this.purchaseOrder = purchaseOrder;
    this.options = {
      useTemplate: true,
      templatePath: '/templates/PO-template.png',
      language: 'en',
      imageQuality: 0.8,          // Jakość kompresji obrazu (0.1-1.0)
      enableCompression: true,     // Czy włączyć kompresję PDF
      hidePricing: false,          // Czy ukryć ceny i koszty
      ...options
    };
  }

  /**
   * Główna metoda generująca PDF
   */
  async generate() {
    try {
      // Pobierz dane wymagane do generowania PDF
      const { targetWarehouse, companyData } = await this.fetchRequiredData();
      
      // Utwórz dokument PDF z optymalizacjami
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: this.options.enableCompression, // Włącz kompresję PDF
        precision: 2    // Ogranicz precyzję do 2 miejsc po przecinku
      });

      // Ustaw właściwości dokumentu dla lepszej optymalizacji
      doc.setProperties({
        title: `Purchase Order ${this.purchaseOrder.number}`,
        subject: 'Purchase Order',
        author: 'BGW Pharma',
        creator: 'MRP System'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Sprawdź czy używać szablonu
      if (!this.options.useTemplate) {
        // Generuj PDF bez szablonu dla oszczędności miejsca
        await this.generatePdfContent(doc, pageWidth, pageHeight, null, targetWarehouse, companyData);
        return doc;
      }

      // Załaduj szablon tła z optymalizacją
      const template = await this.loadTemplate();
      
      // Generuj zawartość PDF
      await this.generatePdfContent(doc, pageWidth, pageHeight, template, targetWarehouse, companyData);
      
      return doc;
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      throw error;
    }
  }

  /**
   * Pobiera dane wymagane do generowania PDF
   */
  async fetchRequiredData() {
    let targetWarehouse = null;
    let companyData = null;

    // Pobierz informacje o magazynie docelowym
    if (this.purchaseOrder.targetWarehouseId) {
      try {
        targetWarehouse = await getWarehouseById(this.purchaseOrder.targetWarehouseId);
      } catch (error) {
        console.warn('Nie udało się pobrać danych magazynu docelowego:', error);
      }
    }

    // Pobierz dane firmy (buyer)
    try {
      companyData = await getCompanyInfo();
    } catch (error) {
      console.warn('Nie udało się pobrać danych firmy:', error);
    }

    return { targetWarehouse, companyData };
  }

  /**
   * Ładuje szablon tła dla PDF z optymalizacją rozmiaru
   */
  async loadTemplate() {
    if (!this.options.useTemplate) {
      return null;
    }

    return new Promise((resolve) => {
      const templateImg = new Image();
      templateImg.crossOrigin = 'anonymous';
      
      templateImg.onload = () => {
        // Optymalizuj obraz przed zwróceniem
        try {
          // Stwórz canvas do kompresji obrazu
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Ustaw rozmiar canvas na rozmiar PDF (A4: 210x297mm przy 72 DPI)
          const canvasWidth = Math.round(210 * 2.83); // 72 DPI to ~2.83 px/mm
          const canvasHeight = Math.round(297 * 2.83);
          
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          
          // Narysuj obraz na canvas z odpowiednim skalowaniem
          ctx.drawImage(templateImg, 0, 0, canvasWidth, canvasHeight);
          
          // Konwertuj do JPEG z kompresją (jakość z opcji)
          const compressedDataUrl = canvas.toDataURL('image/jpeg', this.options.imageQuality);
          
          // Stwórz nowy obraz z skompresowanymi danymi
          const optimizedImg = new Image();
          optimizedImg.onload = () => {
            console.log('Szablon PO zoptymalizowany dla rozmiaru PDF');
            resolve(optimizedImg);
          };
          optimizedImg.src = compressedDataUrl;
          
        } catch (error) {
          console.warn('Błąd podczas optymalizacji szablonu PO, używam oryginalnego:', error);
          resolve(templateImg);
        }
      };
      
      templateImg.onerror = () => {
        console.warn('Could not load PO-template.png template, using white background');
        resolve(null);
      };
      
      templateImg.src = this.options.templatePath;
    });
  }

  /**
   * Funkcja do konwersji polskich znaków
   */
  convertPolishChars(text) {
    if (!text) return '';
    return text
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
      .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
      .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
      .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E')
      .replace(/Ł/g, 'L').replace(/Ń/g, 'N').replace(/Ó/g, 'O')
      .replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
  }

  /**
   * Funkcja pomocnicza do sprawdzania czy potrzeba nowej strony
   */
  checkPageBreak(doc, currentY, requiredHeight, pageHeight, template, pageWidth) {
    if (currentY + requiredHeight > pageHeight - 20) {
      doc.addPage();
      if (template) {
        // Użyj JPEG zamiast PNG dla lepszej kompresji
        doc.addImage(template, 'JPEG', 0, 0, pageWidth, pageHeight);
      }
      return 30; // Nowy Y po dodaniu strony
    }
    return currentY;
  }

  /**
   * Formatuje adres dostawcy
   */
  formatAddress(address) {
    if (!address) return 'Brak adresu';
    return `${address.street || ''}, ${address.postalCode || ''} ${address.city || ''}, ${address.country || ''}`;
  }

  /**
   * Pobiera główny adres dostawcy
   */
  getSupplierMainAddress(supplier) {
    if (!supplier || !supplier.addresses || supplier.addresses.length === 0) {
      return null;
    }
    
    const mainAddress = supplier.addresses.find(addr => addr.isMain);
    return mainAddress || supplier.addresses[0];
  }

  /**
   * Oblicza wartości VAT dla pozycji zamówienia
   */
  calculateVATValues(items = [], additionalCostsItems = []) {
    let itemsNetTotal = 0;
    let itemsVatTotal = 0;
    
    items.forEach(item => {
      const itemNet = parseFloat(item.totalPrice) || 0;
      itemsNetTotal += itemNet;
      
      const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
      const itemVat = (itemNet * vatRate) / 100;
      itemsVatTotal += itemVat;
    });
    
    let additionalCostsNetTotal = 0;
    let additionalCostsVatTotal = 0;
    
    additionalCostsItems.forEach(cost => {
      const costNet = parseFloat(cost.value) || 0;
      additionalCostsNetTotal += costNet;
      
      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
      const costVat = (costNet * vatRate) / 100;
      additionalCostsVatTotal += costVat;
    });
    
    const totalNet = itemsNetTotal + additionalCostsNetTotal;
    const totalVat = itemsVatTotal + additionalCostsVatTotal;
    const totalGross = totalNet + totalVat;
    
    return {
      itemsNetTotal,
      itemsVatTotal,
      additionalCostsNetTotal,
      additionalCostsVatTotal,
      totalNet,
      totalVat,
      totalGross,
      vatRates: {
        items: Array.from(new Set(items.map(item => item.vatRate))),
        additionalCosts: Array.from(new Set(additionalCostsItems.map(cost => cost.vatRate)))
      }
    };
  }

  /**
   * Generuje zawartość PDF
   */
  async generatePdfContent(doc, pageWidth, pageHeight, template, targetWarehouse, companyData) {
    // Dodaj szablon jako tło (jeśli się załadował) z optymalizacją
    if (template) {
      // Użyj JPEG zamiast PNG dla lepszej kompresji (już zoptymalizowane w loadTemplate)
      doc.addImage(template, 'JPEG', 0, 0, pageWidth, pageHeight);
    }

    // Pozycje startowe (dostosowane do szablonu)
    let currentY = 45;
    const leftMargin = 20;
    
    // Numer zamówienia
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Order: ${this.purchaseOrder.number || ''}`, leftMargin, 35, { align: 'left' });

    // Data zamówienia
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Date: ${this.purchaseOrder.orderDate ? new Date(this.purchaseOrder.orderDate).toLocaleDateString('en-GB') : ''}`, leftMargin, 42, { align: 'left' });

    // Dane dostawcy (lewa strona)
    currentY = this.addSupplierSection(doc, 60, leftMargin);

    // ORDER DETAILS w lewej kolumnie (pod SUPPLIER)
    currentY = this.addOrderDetailsSection(doc, currentY + 10, leftMargin);

    // PRAWA KOLUMNA - BUYER i DELIVERY ADDRESS
    this.addBuyerAndDeliverySection(doc, pageWidth, companyData, targetWarehouse);

    // Tabela z pozycjami zamówienia
    currentY = this.addItemsTable(doc, Math.max(currentY, 160), leftMargin, pageWidth, pageHeight, template);

    // Podsumowanie
    currentY = this.addSummarySection(doc, currentY + 10, pageWidth, pageHeight, template, leftMargin);

    // Uwagi
    currentY = this.addNotesSection(doc, currentY + 15, pageWidth, pageHeight, template, leftMargin);

    // Stopka
    this.addFooter(doc, pageWidth, pageHeight);
  }

  /**
   * Dodaje sekcję z danymi dostawcy
   */
  addSupplierSection(doc, startY, leftMargin) {
    let currentY = startY;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('SUPPLIER:', leftMargin, currentY);
    
    currentY += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    if (this.purchaseOrder.supplier) {
      // Nazwa dostawcy
      doc.setFont('helvetica', 'bold');
      doc.text(this.convertPolishChars(this.purchaseOrder.supplier.name || ''), leftMargin, currentY);
      currentY += 6;
      
      doc.setFont('helvetica', 'normal');
      // Adres dostawcy
      const supplierAddress = this.getSupplierMainAddress(this.purchaseOrder.supplier);
      if (supplierAddress) {
        const addressFormatted = this.formatAddress(supplierAddress);
        const addressLines = doc.splitTextToSize(this.convertPolishChars(addressFormatted), 80);
        addressLines.forEach(line => {
          doc.text(line, leftMargin, currentY);
          currentY += 5;
        });
      }
      
      // Kontakt
      if (this.purchaseOrder.supplier.email) {
        doc.text(`Email: ${this.purchaseOrder.supplier.email}`, leftMargin, currentY);
        currentY += 5;
      }
      
      if (this.purchaseOrder.supplier.phone) {
        doc.text(`Phone: ${this.purchaseOrder.supplier.phone}`, leftMargin, currentY);
        currentY += 5;
      }
    }

    return currentY;
  }

  /**
   * Dodaje sekcję ORDER DETAILS
   */
  addOrderDetailsSection(doc, startY, leftMargin) {
    let currentY = startY;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('ORDER DETAILS:', leftMargin, currentY);
    
    currentY += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    if (this.purchaseOrder.expectedDeliveryDate) {
      doc.text(`Expected delivery: ${new Date(this.purchaseOrder.expectedDeliveryDate).toLocaleDateString('en-GB')}`, leftMargin, currentY);
      currentY += 6;
    }

    return currentY;
  }

  /**
   * Dodaje sekcję BUYER i DELIVERY ADDRESS
   */
  addBuyerAndDeliverySection(doc, pageWidth, companyData, targetWarehouse) {
    let rightY = 60;
    const rightColumnX = pageWidth / 2 + 10;
    
    // BUYER
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('BUYER:', rightColumnX, rightY);
    
    rightY += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    if (companyData) {
      // Nazwa firmy
      if (companyData.name) {
        doc.setFont('helvetica', 'bold');
        doc.text(this.convertPolishChars(companyData.name), rightColumnX, rightY);
        rightY += 6;
        doc.setFont('helvetica', 'normal');
      }
      
      // Adres firmy
      if (companyData.address) {
        doc.text(this.convertPolishChars(companyData.address), rightColumnX, rightY);
        rightY += 5;
      }
      
      // Miasto
      if (companyData.city) {
        doc.text(this.convertPolishChars(companyData.city), rightColumnX, rightY);
        rightY += 5;
      }
      
      // VAT-UE
      if (companyData.vatEu) {
        doc.text(`VAT-EU: ${companyData.vatEu}`, rightColumnX, rightY);
        rightY += 5;
      }
      
      // Email
      if (companyData.email) {
        doc.text(`Email: ${companyData.email}`, rightColumnX, rightY);
        rightY += 5;
      }
      
      // Telefon
      if (companyData.phone) {
        doc.text(`Phone: ${companyData.phone}`, rightColumnX, rightY);
        rightY += 5;
      }
    }
    
    // DELIVERY ADDRESS (pod BUYER)
    if (targetWarehouse) {
      rightY += 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('DELIVERY ADDRESS:', rightColumnX, rightY);
      rightY += 8;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      
      // Nazwa magazynu
      if (targetWarehouse.name) {
        doc.text(this.convertPolishChars(targetWarehouse.name), rightColumnX, rightY);
        rightY += 5;
      }
      
      // Adres magazynu
      if (targetWarehouse.address) {
        const addressLines = doc.splitTextToSize(this.convertPolishChars(targetWarehouse.address), 80);
        addressLines.forEach(line => {
          doc.text(line, rightColumnX, rightY);
          rightY += 5;
        });
      }
    }
  }

  /**
   * Dodaje tabelę z pozycjami zamówienia
   */
  addItemsTable(doc, startY, leftMargin, pageWidth, pageHeight, template) {
    let currentY = this.checkPageBreak(doc, startY, 60, pageHeight, template, pageWidth);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('ORDER ITEMS:', leftMargin, currentY);
    currentY += 10;

    // Nagłówki tabeli - dostosuj kolumny w zależności od opcji hidePricing
    let colWidths, headers;
    if (this.options.hidePricing) {
      colWidths = [60, 20, 20, 60]; // Bez kolumn cenowych
      headers = ['Product Name', 'Qty', 'Unit', 'Expected Date'];
    } else {
      colWidths = [50, 15, 15, 25, 25, 15, 25];
      headers = ['Product Name', 'Qty', 'Unit', 'Unit Price', 'Value', 'VAT', 'Expected Date'];
    }
    
    const startX = leftMargin;
    let currentX = startX;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setFillColor(240, 240, 240);
    doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), 8, 'F');
    
    headers.forEach((header, index) => {
      doc.text(header, currentX + 2, currentY + 6);
      currentX += colWidths[index];
    });
    
    currentY += 10;

    // Dane tabeli
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    if (this.purchaseOrder.items && this.purchaseOrder.items.length > 0) {
      this.purchaseOrder.items.forEach((item, index) => {
        currentY = this.checkPageBreak(doc, currentY, 8, pageHeight, template, pageWidth);
        
        currentX = startX;
        
        // Nazwa produktu (może być długa, dzielimy na linie)
        const nameLines = doc.splitTextToSize(this.convertPolishChars(item.name || ''), colWidths[0] - 4);
        const lineHeight = Math.max(6, nameLines.length * 4);
        
        // Tło wiersza
        if (index % 2 === 1) {
          doc.setFillColor(248, 248, 248);
          doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), lineHeight, 'F');
        }
        
        // Nazwa produktu
        nameLines.forEach((line, lineIndex) => {
          doc.text(line, currentX + 2, currentY + 4 + (lineIndex * 4));
        });
        currentX += colWidths[0];
        
        // Ilość
        doc.text((item.quantity || '').toString(), currentX + 2, currentY + 4);
        currentX += colWidths[1];
        
        // Jednostka
        doc.text(this.convertPolishChars(item.unit || ''), currentX + 2, currentY + 4);
        currentX += colWidths[2];
        
        if (!this.options.hidePricing) {
          // Cena jednostkowa
          doc.text(formatCurrency(item.unitPrice, this.purchaseOrder.currency, 2), currentX + 2, currentY + 4);
          currentX += colWidths[3];
          
          // Wartość
          doc.text(formatCurrency(item.totalPrice, this.purchaseOrder.currency), currentX + 2, currentY + 4);
          currentX += colWidths[4];
          
          // VAT
          doc.text(`${item.vatRate || 0}%`, currentX + 2, currentY + 4);
          currentX += colWidths[5];
        }
        
        // Expected Date - indeks zależy od tego czy ukrywamy ceny
        const expectedDateIndex = this.options.hidePricing ? 3 : 6;
        const expectedDate = item.plannedDeliveryDate ? 
          new Date(item.plannedDeliveryDate).toLocaleDateString('en-GB') : '-';
        doc.text(expectedDate, currentX + 2, currentY + 4);
        
        currentY += lineHeight;
      });
    }

    return currentY;
  }

  /**
   * Dodaje sekcję podsumowania
   */
  addSummarySection(doc, startY, pageWidth, pageHeight, template, leftMargin) {
    // Jeśli ukrywamy ceny, pomijamy całą sekcję podsumowania finansowego
    if (this.options.hidePricing) {
      return startY;
    }
    
    let currentY = this.checkPageBreak(doc, startY, 40, pageHeight, template, pageWidth);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('SUMMARY:', leftMargin, currentY);
    currentY += 8;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    const vatValues = this.calculateVATValues(this.purchaseOrder.items, this.purchaseOrder.additionalCostsItems);
    const summaryX = pageWidth - 80;
    
    doc.text(`Net value: ${formatCurrency(vatValues.totalNet, this.purchaseOrder.currency)}`, summaryX, currentY);
    currentY += 6;
    doc.text(`VAT: ${formatCurrency(vatValues.totalVat, this.purchaseOrder.currency)}`, summaryX, currentY);
    currentY += 6;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`TOTAL GROSS: ${formatCurrency(vatValues.totalGross, this.purchaseOrder.currency)}`, summaryX, currentY);

    return currentY;
  }

  /**
   * Dodaje sekcję uwag
   */
  addNotesSection(doc, startY, pageWidth, pageHeight, template, leftMargin) {
    if (!this.purchaseOrder.notes) {
      return startY;
    }

    let currentY = this.checkPageBreak(doc, startY, 30, pageHeight, template, pageWidth);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('NOTES:', leftMargin, currentY);
    currentY += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const notesLines = doc.splitTextToSize(this.convertPolishChars(this.purchaseOrder.notes), pageWidth - 40);
    notesLines.forEach(line => {
      currentY = this.checkPageBreak(doc, currentY, 5, pageHeight, template, pageWidth);
      doc.text(line, leftMargin, currentY);
      currentY += 5;
    });

    return currentY;
  }

  /**
   * Dodaje stopkę
   */
  addFooter(doc, pageWidth, pageHeight) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Generated: ${new Date().toLocaleString('en-GB')} | Page ${i} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }
  }

  /**
   * Pobiera i zapisuje PDF
   */
  async downloadPdf() {
    const doc = await this.generate();
    const fileName = `PO_${this.purchaseOrder.number || 'zamowienie'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }
}

/**
 * Funkcja pomocnicza do tworzenia generatora PDF dla zamówienia zakupowego
 * @param {Object} purchaseOrder - obiekt zamówienia zakupowego
 * @param {Object} options - opcje optymalizacji:
 *   - useTemplate: boolean (domyślnie true) - czy używać szablonu tła
 *   - imageQuality: number (0.1-1.0, domyślnie 0.8) - jakość kompresji obrazu
 *   - enableCompression: boolean (domyślnie true) - czy włączyć kompresję PDF
 *   - hidePricing: boolean (domyślnie false) - czy ukryć ceny i koszty
 *   - templatePath: string - ścieżka do szablonu
 *   - language: string - język dokumentu
 */
export const createPurchaseOrderPdfGenerator = (purchaseOrder, options = {}) => {
  return new PurchaseOrderPdfGenerator(purchaseOrder, options);
};

export default PurchaseOrderPdfGenerator;
