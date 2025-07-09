import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

/**
 * Generator etykiet PDF używający PDF-lib zamiast html2canvas
 * Znacznie szybszy i bardziej wydajny
 */
class LabelPdfGenerator {
  constructor() {
    this.doc = null;
    this.fonts = {};
    this.logoImage = null;
  }

  /**
   * Inicjalizacja generatora PDF
   */
  async initialize() {
    this.doc = await PDFDocument.create();
    
    // Załaduj standardowe czcionki
    this.fonts = {
      regular: await this.doc.embedFont(StandardFonts.Helvetica),
      bold: await this.doc.embedFont(StandardFonts.HelveticaBold),
      mono: await this.doc.embedFont(StandardFonts.Courier)
    };

    // Spróbuj załadować logo firmy
    try {
      await this.loadCompanyLogo();
    } catch (error) {
      console.warn('Nie udało się załadować logo firmy:', error);
    }
  }

  /**
   * Ładuje logo firmy z publicznego folderu
   */
  async loadCompanyLogo() {
    try {
      const response = await fetch('/templates/cmr/BGWPHARMA_logo50.png');
      if (response.ok) {
        const logoBytes = await response.arrayBuffer();
        this.logoImage = await this.doc.embedPng(logoBytes);
      }
    } catch (error) {
      console.warn('Błąd podczas ładowania logo:', error);
    }
  }

  /**
   * Generuje kod QR jako obraz PNG
   */
  async generateQRCode(data, size = 80) {
    try {
      const qrDataUrl = await QRCode.toDataURL(data, {
        width: size,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      // Konwertuj data URL na ArrayBuffer
      const base64 = qrDataUrl.split(',')[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return await this.doc.embedPng(bytes);
    } catch (error) {
      console.warn('Błąd podczas generowania QR code:', error);
      return null;
    }
  }

  /**
   * Generuje kod kreskowy jako obraz PNG
   */
  async generateBarcode(value, options = {}) {
    try {
      // Stwórz canvas do generowania kodu kreskowego
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: options.width || 2,
        height: options.height || 50,
        fontSize: 14,
        textAlign: 'center',
        textPosition: 'bottom',
        background: '#FFFFFF',
        lineColor: '#000000',
        displayValue: options.displayValue !== false
      });
      
      // Konwertuj canvas na PNG
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return await this.doc.embedPng(bytes);
    } catch (error) {
      console.warn('Błąd podczas generowania kodu kreskowego:', error);
      return null;
    }
  }

  /**
   * Dodaje tekst do PDF w określonej pozycji
   */
  drawText(page, text, x, y, options = {}) {
    const {
      font = this.fonts.regular,
      size = 12,
      color = rgb(0, 0, 0),
      maxWidth = null,
      lineHeight = 1.2
    } = options;

    if (!text) return y;

    // Jeśli tekst jest za długi, podziel na linie
    if (maxWidth) {
      const words = text.toString().split(' ');
      let lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, size);
        
        if (textWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            lines.push(word);
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }

      // Rysuj każdą linię
      for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i], {
          x,
          y: y - (i * size * lineHeight),
          size,
          font,
          color
        });
      }
      
      return y - (lines.length * size * lineHeight);
    } else {
      page.drawText(text.toString(), { x, y, size, font, color });
      return y - (size * lineHeight);
    }
  }

  /**
   * Formatuje adres na wiele linii
   */
  formatAddress(address) {
    if (!address || address === 'N/A') return ['N/A'];
    
    const addressStr = address.toString();
    const lines = addressStr.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length === 0) return ['N/A'];
    if (lines.length === 1) {
      // Spróbuj podzielić długą linię
      if (lines[0].length > 40) {
        const parts = lines[0].split(',').map(part => part.trim());
        return parts.length > 1 ? parts : [lines[0]];
      }
    }
    
    return lines;
  }

  /**
   * Formatuje datę
   */
  formatDate(date) {
    if (!date) return '';
    
    let dateObj = date;
    if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    }
    
    if (!(dateObj instanceof Date)) {
      dateObj = new Date(date);
    }
    
    return dateObj.toLocaleDateString('pl-PL');
  }

  /**
   * Generuje dane dla kodu QR
   */
  generateQRData(linkedBatch, cmrData = null) {
    if (!linkedBatch) return 'No batch data';
    
    // Pobierz numery zamówień klientów (CO) z linkedOrders
    const customerOrders = cmrData && cmrData.linkedOrders 
      ? cmrData.linkedOrders.map(order => order.orderNumber).filter(Boolean).join(', ')
      : '';
    
    return [
      `LOT: ${linkedBatch.batchNumber || linkedBatch.lotNumber || 'No number'}`,
      `EXP: ${this.formatDate(linkedBatch.expiryDate)}`,
      `ITEM: ${linkedBatch.itemName || ''}`,
      `ID: ${linkedBatch.itemId || ''}`,
      `MO: ${linkedBatch.moNumber || ''}`,
      `PO: ${linkedBatch.purchaseOrderDetails?.number || linkedBatch.poNumber || ''}`,
      `SUPPLIER: ${linkedBatch.purchaseOrderDetails?.supplier?.name || linkedBatch.supplier || ''}`,
      customerOrders ? `CO: ${customerOrders}` : '',
      `PRINT DATE: ${new Date().toLocaleDateString('en-GB')}`
    ].filter(line => line.split(': ')[1]).join('\n');
  }

  /**
   * Generuje etykietę kartonu
   */
  async generateBoxLabel(cmrData, itemData, boxDetails, boxNumber, totalBoxes) {
    // Rozmiar etykiety: standardowa etykieta wysyłkowa 4"x2.5" (101.6x63.5mm)
    const width = 288; // 4 cale = 288 punktów
    const height = 180; // 2.5 cala = 180 punktów
    
    const page = this.doc.addPage([width, height]);
    
    // Marginesy
    const margin = 6;
    let currentY = height - margin - 8;

    // Nagłówek z logo i numerami
    if (this.logoImage) {
      page.drawImage(this.logoImage, {
        x: margin,
        y: currentY - 10,
        width: 10,
        height: 10
      });
    }

    // Numery CMR i BOX
    const headerText = `CMR: ${cmrData.cmrNumber || ''} | BOX: ${boxNumber} / ${totalBoxes}`;
    page.drawText(headerText, {
      x: margin + 14,
      y: currentY - 4,
      size: 8,
      font: this.fonts.bold,
      color: rgb(0.1, 0.46, 0.82) // Niebieski kolor
    });

    currentY -= 16;

    // Linia oddzielająca
    page.drawLine({
      start: { x: margin, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 1,
      color: rgb(0, 0, 0)
    });

    currentY -= 8;

    // Dwie kolumny
    const leftColumnX = margin;
    const rightColumnX = width / 2 + 3;
    const columnWidth = (width / 2) - margin - 3;

    // Lewa kolumna
    let leftY = currentY;

    // Nazwa produktu
    page.drawText('PRODUCT:', {
      x: leftColumnX,
      y: leftY,
      size: 6,
      font: this.fonts.bold
    });
    leftY -= 9;

    leftY = this.drawText(page, itemData.description || '', leftColumnX, leftY, {
      size: 7,
      font: this.fonts.bold,
      maxWidth: columnWidth,
      lineHeight: 1.1
    });

    // LOT number jeśli dostępny
    if (itemData.linkedBatches && itemData.linkedBatches[0] && 
        (itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber)) {
      leftY -= 3;
      page.drawText('LOT:', {
        x: leftColumnX,
        y: leftY,
        size: 6,
        font: this.fonts.bold
      });
      leftY -= 9;
      
      leftY = this.drawText(page, itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber, 
        leftColumnX, leftY, { size: 7, maxWidth: columnWidth });
    }

    leftY -= 5;

    // Ilość w kartonie
    page.drawText('QTY IN BOX:', {
      x: leftColumnX,
      y: leftY,
      size: 6,
      font: this.fonts.bold
    });
    leftY -= 9;

    const qtyText = `${boxDetails.itemsCount || 0} / ${itemData.inventoryData?.itemsPerBox || 'N/A'} pcs`;
    leftY = this.drawText(page, qtyText, leftColumnX, leftY, { size: 7, font: this.fonts.bold });

    leftY -= 5;

    // Waga kartonu
    page.drawText('BOX WEIGHT:', {
      x: leftColumnX,
      y: leftY,
      size: 6,
      font: this.fonts.bold
    });
    leftY -= 9;

    leftY = this.drawText(page, `${boxDetails.totalWeight || 0} kg`, leftColumnX, leftY, 
      { size: 7, font: this.fonts.bold });

    // Prawa kolumna
    let rightY = currentY;

    // Nadawca
    page.drawText('SENDER:', {
      x: rightColumnX,
      y: rightY,
      size: 6,
      font: this.fonts.bold
    });
    rightY -= 9;

    rightY = this.drawText(page, cmrData.sender || '', rightColumnX, rightY, {
      size: 7,
      maxWidth: columnWidth,
      lineHeight: 1.1
    });

    rightY -= 3;

    // Odbiorca
    page.drawText('RECIPIENT:', {
      x: rightColumnX,
      y: rightY,
      size: 6,
      font: this.fonts.bold
    });
    rightY -= 9;

    rightY = this.drawText(page, cmrData.recipient || '', rightColumnX, rightY, {
      size: 7,
      maxWidth: columnWidth,
      lineHeight: 1.1
    });

    rightY -= 3;

    // Adres dostawy
    page.drawText('DELIVERY ADDRESS:', {
      x: rightColumnX,
      y: rightY,
      size: 6,
      font: this.fonts.bold
    });
    rightY -= 9;

    const deliveryAddress = cmrData.recipientAddress || cmrData.deliveryPlace || cmrData.unloadingPlace || 'N/A';
    const addressLines = this.formatAddress(deliveryAddress);
    
    for (const line of addressLines) {
      rightY = this.drawText(page, line, rightColumnX, rightY, {
        size: 6,
        maxWidth: columnWidth,
        lineHeight: 1.1
      });
      rightY -= 1;
    }

    // QR kod i kod kreskowy na dole
    if (itemData.linkedBatches && itemData.linkedBatches[0]) {
      const linkedBatch = itemData.linkedBatches[0];
      
      // QR Code po lewej - powiększony
      const qrData = this.generateQRData(linkedBatch, cmrData);
      const qrImage = await this.generateQRCode(qrData, 150);
      
      if (qrImage) {
        page.drawImage(qrImage, {
          x: margin,
          y: 6,
          width: 38,
          height: 38
        });
      }

      // Kod kreskowy po prawej - powiększony
      const barcodeValue = linkedBatch.batchNumber || linkedBatch.lotNumber || 'UNKNOWN';
      const barcodeImage = await this.generateBarcode(barcodeValue, {
        width: 2.5,
        height: 50,
        displayValue: false
      });
      
      if (barcodeImage) {
        page.drawImage(barcodeImage, {
          x: rightColumnX,
          y: 6,
          width: columnWidth - 5,
          height: 38
        });
      }
    }

    return page;
  }

  /**
   * Generuje etykietę palety
   */
  async generatePalletLabel(cmrData, itemData, palletDetails, palletNumber, totalPallets) {
    // Rozmiar etykiety: standardowa etykieta wysyłkowa 4"x2.5" (101.6x63.5mm)
    const width = 288; // 4 cale = 288 punktów
    const height = 180; // 2.5 cala = 180 punktów
    
    const page = this.doc.addPage([width, height]);
    
    // Marginesy
    const margin = 6;
    let currentY = height - margin - 8;

    // Nagłówek z logo i numerami
    if (this.logoImage) {
      page.drawImage(this.logoImage, {
        x: margin,
        y: currentY - 10,
        width: 10,
        height: 10
      });
    }

    // Numery CMR i PALLET (zielony kolor dla palet)
    const headerText = `CMR: ${cmrData.cmrNumber || ''} | PALLET: ${palletNumber} / ${totalPallets}`;
    page.drawText(headerText, {
      x: margin + 14,
      y: currentY - 4,
      size: 8,
      font: this.fonts.bold,
      color: rgb(0.18, 0.49, 0.2) // Zielony kolor
    });

    currentY -= 16;

    // Linia oddzielająca
    page.drawLine({
      start: { x: margin, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 1,
      color: rgb(0, 0, 0)
    });

    currentY -= 8;

    // Dwie kolumny
    const leftColumnX = margin;
    const rightColumnX = width / 2 + 3;
    const columnWidth = (width / 2) - margin - 3;

    // Lewa kolumna
    let leftY = currentY;

    // Nazwa produktu
    page.drawText('PRODUCT:', {
      x: leftColumnX,
      y: leftY,
      size: 6,
      font: this.fonts.bold
    });
    leftY -= 9;

    leftY = this.drawText(page, itemData.description || '', leftColumnX, leftY, {
      size: 7,
      font: this.fonts.bold,
      maxWidth: columnWidth,
      lineHeight: 1.1
    });

    // LOT number jeśli dostępny
    if (itemData.linkedBatches && itemData.linkedBatches[0] && 
        (itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber)) {
      leftY -= 3;
      page.drawText('LOT:', {
        x: leftColumnX,
        y: leftY,
        size: 6,
        font: this.fonts.bold
      });
      leftY -= 9;
      
      leftY = this.drawText(page, itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber, 
        leftColumnX, leftY, { size: 7, maxWidth: columnWidth });
    }

    leftY -= 5;

    // Ilość na palecie
    page.drawText('QTY ON PALLET:', {
      x: leftColumnX,
      y: leftY,
      size: 6,
      font: this.fonts.bold
    });
    leftY -= 9;

    const qtyText = `${palletDetails.itemsCount || 0} / ${(itemData.inventoryData?.boxesPerPallet * itemData.inventoryData?.itemsPerBox) || 'N/A'} pcs`;
    leftY = this.drawText(page, qtyText, leftColumnX, leftY, { size: 7, font: this.fonts.bold });

    leftY -= 5;

    // Liczba kartonów
    page.drawText('BOXES COUNT:', {
      x: leftColumnX,
      y: leftY,
      size: 6,
      font: this.fonts.bold
    });
    leftY -= 9;

    const boxesText = `${palletDetails.boxesCount || 0} / ${itemData.inventoryData?.boxesPerPallet || 'N/A'} pcs`;
    leftY = this.drawText(page, boxesText, leftColumnX, leftY, { size: 7, font: this.fonts.bold });

    leftY -= 5;

    // Waga palety
    page.drawText('PALLET WEIGHT:', {
      x: leftColumnX,
      y: leftY,
      size: 6,
      font: this.fonts.bold
    });
    leftY -= 9;

    leftY = this.drawText(page, `${palletDetails.totalWeight || 0} kg`, leftColumnX, leftY, 
      { size: 7, font: this.fonts.bold });

    // Prawa kolumna - identyczna jak w BoxLabel
    let rightY = currentY;

    // Nadawca
    page.drawText('SENDER:', {
      x: rightColumnX,
      y: rightY,
      size: 6,
      font: this.fonts.bold
    });
    rightY -= 9;

    rightY = this.drawText(page, cmrData.sender || '', rightColumnX, rightY, {
      size: 7,
      maxWidth: columnWidth,
      lineHeight: 1.1
    });

    rightY -= 3;

    // Odbiorca
    page.drawText('RECIPIENT:', {
      x: rightColumnX,
      y: rightY,
      size: 6,
      font: this.fonts.bold
    });
    rightY -= 9;

    rightY = this.drawText(page, cmrData.recipient || '', rightColumnX, rightY, {
      size: 7,
      maxWidth: columnWidth,
      lineHeight: 1.1
    });

    rightY -= 3;

    // Adres dostawy
    page.drawText('DELIVERY ADDRESS:', {
      x: rightColumnX,
      y: rightY,
      size: 6,
      font: this.fonts.bold
    });
    rightY -= 9;

    const deliveryAddress = cmrData.recipientAddress || cmrData.deliveryPlace || cmrData.unloadingPlace || 'N/A';
    const addressLines = this.formatAddress(deliveryAddress);
    
    for (const line of addressLines) {
      rightY = this.drawText(page, line, rightColumnX, rightY, {
        size: 6,
        maxWidth: columnWidth,
        lineHeight: 1.1
      });
      rightY -= 1;
    }

    // QR kod i kod kreskowy na dole
    if (itemData.linkedBatches && itemData.linkedBatches[0]) {
      const linkedBatch = itemData.linkedBatches[0];
      
      // QR Code po lewej - powiększony
      const qrData = this.generateQRData(linkedBatch, cmrData);
      const qrImage = await this.generateQRCode(qrData, 150);
      
      if (qrImage) {
        page.drawImage(qrImage, {
          x: margin,
          y: 6,
          width: 38,
          height: 38
        });
      }

      // Kod kreskowy po prawej - powiększony
      const barcodeValue = linkedBatch.batchNumber || linkedBatch.lotNumber || 'UNKNOWN';
      const barcodeImage = await this.generateBarcode(barcodeValue, {
        width: 2.5,
        height: 50,
        displayValue: false
      });
      
      if (barcodeImage) {
        page.drawImage(barcodeImage, {
          x: rightColumnX,
          y: 6,
          width: columnWidth - 5,
          height: 38
        });
      }
    }

    return page;
  }

  /**
   * Generuje PDF z etykietami kartonów
   */
  async generateBoxLabels(cmrData, itemsWeightDetails) {
    await this.initialize();
    
    const promises = [];
    
    itemsWeightDetails.forEach(itemDetail => {
      if (itemDetail.hasDetailedData && itemDetail.boxes) {
        let boxCounter = 1;
        
        // Etykiety dla pełnych kartonów
        if (itemDetail.boxes.fullBox && itemDetail.boxes.fullBoxesCount > 0) {
          for (let i = 0; i < itemDetail.boxes.fullBoxesCount; i++) {
            promises.push(
              this.generateBoxLabel(
                cmrData,
                itemDetail,
                itemDetail.boxes.fullBox,
                boxCounter,
                itemDetail.boxesCount
              )
            );
            boxCounter++;
          }
        }
        
        // Etykieta dla niepełnego kartonu
        if (itemDetail.boxes.partialBox) {
          promises.push(
            this.generateBoxLabel(
              cmrData,
              itemDetail,
              itemDetail.boxes.partialBox,
              boxCounter,
              itemDetail.boxesCount
            )
          );
        }
      }
    });

    // Generuj wszystkie etykiety równolegle
    await Promise.all(promises);
    
    return this.doc;
  }

  /**
   * Generuje PDF z etykietami palet
   */
  async generatePalletLabels(cmrData, itemsWeightDetails) {
    await this.initialize();
    
    const promises = [];
    
    itemsWeightDetails.forEach(itemDetail => {
      if (itemDetail.hasDetailedData && itemDetail.pallets && itemDetail.pallets.length > 0) {
        itemDetail.pallets.forEach((pallet, index) => {
          promises.push(
            this.generatePalletLabel(
              cmrData,
              itemDetail,
              pallet,
              pallet.palletNumber,
              itemDetail.palletsCount
            )
          );
        });
      }
    });

    // Generuj wszystkie etykiety równolegle
    await Promise.all(promises);
    
    return this.doc;
  }

  /**
   * Zapisuje PDF do pliku
   */
  async savePDF(filename) {
    const pdfBytes = await this.doc.save();
    
    // Utwórz blob i pobierz plik
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
    
    return pdfBytes;
  }
}

export default LabelPdfGenerator; 