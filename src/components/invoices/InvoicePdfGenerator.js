import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

/**
 * Komponent odpowiedzialny za generowanie PDF faktury
 */
class InvoicePdfGenerator {
  constructor(invoice, companyInfo, translations, options = {}) {
    this.invoice = invoice;
    this.companyInfo = companyInfo;
    this.translations = translations;
    this.options = {
      useTemplate: true,           // Czy używać szablonu tła
      imageQuality: 0.95,          // Jakość kompresji obrazu (0.1-1.0) - zwiększono dla lepszej jakości
      enableCompression: true,     // Czy włączyć kompresję PDF
      ...options
    };
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
   * Funkcja do tłumaczenia metod płatności na język angielski
   */
  translatePaymentMethod(paymentMethod) {
    if (!paymentMethod) return '';
    
    const paymentTranslations = {
      'Przelew': 'Bank Transfer',
      'Przelew bankowy': 'Bank Transfer',
      'Gotówka': 'Cash',
      'Karta': 'Card',
      'Karta kredytowa': 'Credit Card',
      'Karta debetowa': 'Debit Card',
      'PayPal': 'PayPal',
      'Czek': 'Cheque',
      'Online': 'Online Payment',
      'Zaliczka': 'Advance Payment',
      'Przedpłata': 'Prepayment',
      'Za pobraniem': 'Cash on Delivery',
      'Inne': 'Other'
    };
    
    return paymentTranslations[paymentMethod] || paymentMethod;
  }

  /**
   * Formatowanie daty
   */
  formatDate(date) {
    if (!date) return '';
    return format(new Date(date), 'dd.MM.yyyy');
  }

  /**
   * Obliczanie całkowitej wartości netto
   */
  calculateTotalNetto(items) {
    if (!items || !Array.isArray(items)) return 0;
    
    return items.reduce((sum, item) => {
      const netValue = Number(item.netValue) || 0;
      const calculatedValue = Number(item.quantity) * Number(item.price) || 0;
      return sum + (netValue || calculatedValue);
    }, 0);
  }

  /**
   * Obliczanie całkowitej wartości VAT
   */
  calculateTotalVat(items, fixedVatRate = null) {
    if (!items || !Array.isArray(items)) return 0;
    
    return items.reduce((sum, item) => {
      const netValue = Number(item.netValue) || 0;
      const calculatedValue = Number(item.quantity) * Number(item.price) || 0;
      const baseValue = netValue || calculatedValue;
      
      let vatRate = 0;
      if (fixedVatRate !== null) {
        vatRate = fixedVatRate;
      } else {
        if (typeof item.vat === 'number') {
          vatRate = item.vat;
        } else if (item.vat !== "ZW" && item.vat !== "NP") {
          vatRate = parseFloat(item.vat) || 0;
        }
      }
      
      return sum + (baseValue * (vatRate / 100));
    }, 0);
  }

  /**
   * Dodawanie informacji o sprzedawcy do dokumentu PDF
   */
  addSellerInfo(doc, isPurchaseInvoice, currentY) {
    const t = this.translations;
    const sellerInfo = isPurchaseInvoice ? this.invoice.customer : this.companyInfo;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(t.seller, 14, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    currentY += 8;
    
    // Nazwa firmy sprzedawcy
    doc.text(this.convertPolishChars(sellerInfo.name || this.companyInfo.name), 14, currentY);
    currentY += 5;
    
    // Adres sprzedawcy
    if (sellerInfo.address) {
      doc.text(this.convertPolishChars(sellerInfo.address), 14, currentY);
      currentY += 5;
    }
    
    // Kod pocztowy i miasto
    const cityLine = `${sellerInfo.zipCode || sellerInfo.postalCode || ''} ${sellerInfo.city || ''}`.trim();
    if (cityLine) {
      doc.text(this.convertPolishChars(cityLine), 14, currentY);
      currentY += 5;
    }
    
    // Kraj
    if (sellerInfo.country) {
      doc.text(this.convertPolishChars(sellerInfo.country), 14, currentY);
      currentY += 5;
    }
    
    // NIP/VAT ID
    if (sellerInfo.nip || sellerInfo.taxId) {
      doc.text(`NIP: ${sellerInfo.nip || sellerInfo.taxId}`, 14, currentY);
      currentY += 5;
    }
    
    // Email i telefon sprzedawcy
    if (sellerInfo.email) {
      doc.text(`${t.email} ${sellerInfo.email}`, 14, currentY);
      currentY += 5;
    }
    
    if (sellerInfo.phone) {
      doc.text(`${t.phone} ${sellerInfo.phone}`, 14, currentY);
      currentY += 5;
    }
    
    // Usunięto wywołanie addBankingInfo - dane bankowe będą wyświetlane tylko na dole faktury
    
    return currentY;
  }

  /**
   * Dodawanie informacji bankowych
   */
  addBankingInfo(doc, currentY, t) {
    if (this.invoice.selectedBankAccount && this.companyInfo?.bankAccounts) {
      const selectedAccount = this.companyInfo.bankAccounts.find(acc => acc.id === this.invoice.selectedBankAccount);
      if (selectedAccount) {
        if (selectedAccount.bankName) {
          doc.text(`${t.bank} ${selectedAccount.bankName}`, 14, currentY);
          currentY += 5;
        }
        if (selectedAccount.accountNumber) {
          doc.text(`${t.accountNumber} ${selectedAccount.accountNumber}`, 14, currentY);
          currentY += 5;
        }
        if (selectedAccount.swift) {
          doc.text(`${t.swift} ${selectedAccount.swift}`, 14, currentY);
          currentY += 5;
        }
      }
    } else {
      if (this.companyInfo?.bankName || this.companyInfo?.bankAccount || this.companyInfo?.swift) {
        if (this.companyInfo.bankName) {
          doc.text(`${t.bank} ${this.companyInfo.bankName}`, 14, currentY);
          currentY += 5;
        }
        if (this.companyInfo.bankAccount) {
          doc.text(`${t.accountNumber} ${this.companyInfo.bankAccount}`, 14, currentY);
          currentY += 5;
        }
        if (this.companyInfo.swift) {
          doc.text(`${t.swift} ${this.companyInfo.swift}`, 14, currentY);
          currentY += 5;
        }
      }
    }
    
    return currentY;
  }

  /**
   * Dodawanie informacji o nabywcy
   */
  addBuyerInfo(doc, isPurchaseInvoice, rightColX, buyerY) {
    const t = this.translations;
    const buyerInfo = isPurchaseInvoice ? this.companyInfo : this.invoice.customer;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(t.buyer, rightColX, buyerY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    buyerY += 8;
    
    // Nazwa firmy odbiorcy
    doc.text(this.convertPolishChars(buyerInfo.name || 'Brak nazwy klienta'), rightColX, buyerY);
    buyerY += 5;
    
    // Adres odbiorcy - priorytet dla billingAddress z faktury, potem z klienta
    let buyerAddress = '';
    if (this.invoice.billingAddress) {
      buyerAddress = this.invoice.billingAddress;
    } else if (buyerInfo.billingAddress) {
      buyerAddress = buyerInfo.billingAddress;
    } else if (buyerInfo.address || buyerInfo.street) {
      buyerAddress = buyerInfo.address || buyerInfo.street;
    }
    
    if (buyerAddress) {
      // Dzielimy adres na linie jeśli jest długi
      const addressLines = doc.splitTextToSize(this.convertPolishChars(buyerAddress), 70);
      addressLines.forEach(line => {
        doc.text(line, rightColX, buyerY);
        buyerY += 5;
      });
    }
    
    // Kod pocztowy i miasto odbiorcy - priorytet dla danych z faktury
    let buyerPostalCode = '';
    let buyerCity = '';
    
    if (this.invoice.billingPostalCode) {
      buyerPostalCode = this.invoice.billingPostalCode;
    } else if (buyerInfo.zipCode || buyerInfo.postalCode) {
      buyerPostalCode = buyerInfo.zipCode || buyerInfo.postalCode;
    }
    
    if (this.invoice.billingCity) {
      buyerCity = this.invoice.billingCity;
    } else if (buyerInfo.city) {
      buyerCity = buyerInfo.city;
    }
    
    const buyerCityLine = `${buyerPostalCode} ${buyerCity}`.trim();
    if (buyerCityLine) {
      doc.text(this.convertPolishChars(buyerCityLine), rightColX, buyerY);
      buyerY += 5;
    }
    
    // Kraj odbiorcy
    const buyerCountry = this.invoice.billingCountry || buyerInfo.country || '';
    if (buyerCountry) {
      doc.text(this.convertPolishChars(buyerCountry), rightColX, buyerY);
      buyerY += 5;
    }
    
    // NIP/VAT ID odbiorcy
    if (buyerInfo.nip || buyerInfo.taxId || buyerInfo.vatId || buyerInfo.vatEu) {
      const vatNumber = buyerInfo.nip || buyerInfo.taxId || buyerInfo.vatId || buyerInfo.vatEu;
      doc.text(`NIP/VAT: ${vatNumber}`, rightColX, buyerY);
      buyerY += 5;
    }
    
    // Email i telefon odbiorcy
    if (buyerInfo.email) {
      doc.text(`${t.email} ${buyerInfo.email}`, rightColX, buyerY);
      buyerY += 5;
    }
    
    if (buyerInfo.phone) {
      doc.text(`${t.phone} ${buyerInfo.phone}`, rightColX, buyerY);
      buyerY += 5;
    }
    
    // Dodatkowe informacje jeśli są dostępne
    if (buyerInfo.supplierVatEu && buyerInfo.supplierVatEu !== buyerInfo.vatEu) {
      doc.text(`VAT-EU dostawcy: ${buyerInfo.supplierVatEu}`, rightColX, buyerY);
      buyerY += 5;
    }
    
    return buyerY;
  }

  /**
   * Dodawanie tabeli pozycji faktury
   */
  addItemsTable(doc, tableStartY) {
    const t = this.translations;
    
    const tableColumns = [
      { header: t.lp, dataKey: 'description', width: 85 },
      { header: t.quantity, dataKey: 'quantity', width: 25 },
      { header: t.unitPrice, dataKey: 'unitPrice', width: 35 },
      { header: t.amount, dataKey: 'amount', width: 35 }
    ];
    
    // Przygotuj dane do tabeli
    const tableRows = [];
    let totalNetto = 0;
    
    this.invoice.items.forEach((item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const netValue = Number(item.netValue) || 0;
      const amount = netValue || (quantity * price);
      totalNetto += amount;
      
      tableRows.push({
        description: item.name,
        quantity: quantity.toString(),
        unitPrice: `${price.toFixed(2)} ${this.invoice.currency}`,
        amount: `${amount.toFixed(2)} ${this.invoice.currency}`
      });
    });
    
    // Dodaj tabelę pozycji
    autoTable(doc, {
      startY: tableStartY,
      head: [tableColumns.map(col => col.header)],
      body: tableRows.map(row => [
        row.description,
        row.quantity,
        row.unitPrice,
        row.amount
      ]),
      theme: 'grid',
      styles: { 
        fontSize: 10,
        cellPadding: 4,
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 85 },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 35, halign: 'right' }
      },
      headStyles: { 
        fillColor: [139, 69, 255],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      }
    });
    
    return { totalNetto, finalY: doc.lastAutoTable.finalY };
  }

  /**
   * Dodawanie tabeli powiązanych zamówień zakupowych
   */
  addPurchaseOrdersTable(doc, summaryY) {
    const t = this.translations;
    let advancePaymentsValue = 0;
    
    if (this.invoice.linkedPurchaseOrders && this.invoice.linkedPurchaseOrders.length > 0) {
      advancePaymentsValue = this.invoice.linkedPurchaseOrders.reduce((sum, po) => {
        let poValue = 0;
        if (po.finalGrossValue !== undefined) {
          poValue = parseFloat(po.finalGrossValue);
        } else if (po.totalGross !== undefined) {
          poValue = parseFloat(po.totalGross);
        } else {
          const productsValue = po.calculatedProductsValue || po.totalValue || 
            (Array.isArray(po.items) ? po.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0) : 0);
          
          let additionalCostsValue = 0;
          if (po.calculatedAdditionalCosts !== undefined) {
            additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
          } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
            additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
          } else if (po.additionalCosts) {
            additionalCostsValue = parseFloat(po.additionalCosts) || 0;
          }
          
          const vatRate = parseFloat(po.vatRate) || 0;
          const vatValue = (productsValue * vatRate) / 100;
          
          poValue = productsValue + vatValue + additionalCostsValue;
        }
        
        return sum + poValue;
      }, 0);

      // Dodaj tabelę z powiązanymi zamówieniami zakupowymi
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(t.relatedPurchaseOrders, 14, summaryY);
      
      const headColumns = [
        { header: t.poNumber, dataKey: 'number' },
        { header: t.supplier, dataKey: 'supplier' },
        { header: t.netValue, dataKey: 'net' },
        { header: t.additionalCosts, dataKey: 'additional' },
        { header: 'VAT', dataKey: 'vat' },
        { header: t.grossValue, dataKey: 'gross' }
      ];
      
      const poRows = this.invoice.linkedPurchaseOrders.map(po => {
        const productsValue = po.calculatedProductsValue || po.totalValue || 
          (Array.isArray(po.items) ? po.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0) : 0);
        
        let additionalCostsValue = 0;
        if (po.calculatedAdditionalCosts !== undefined) {
          additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
        } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
          additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
        } else if (po.additionalCosts) {
          additionalCostsValue = parseFloat(po.additionalCosts) || 0;
        }
        
        const vatRate = parseFloat(po.vatRate) || 0;
        const vatValue = (productsValue * vatRate) / 100;
        
        let totalGross = 0;
        if (po.finalGrossValue !== undefined) {
          totalGross = parseFloat(po.finalGrossValue);
        } else if (po.totalGross !== undefined) {
          totalGross = parseFloat(po.totalGross);
        } else {
          totalGross = productsValue + vatValue + additionalCostsValue;
        }
        
        let vatDisplay;
        if (typeof po.vatRate === 'string') {
          vatDisplay = po.vatRate;
        } else if (po.vatRate === 'ZW' || po.vatRate === 'NP') {
          vatDisplay = po.vatRate;
        } else {
          vatDisplay = `${vatRate}%`;
        }
        
        return {
          number: po.number || po.id,
          supplier: po.supplier?.name || t.unknownSupplier,
          net: `${productsValue.toFixed(2)} ${this.invoice.currency}`,
          additional: `${additionalCostsValue.toFixed(2)} ${this.invoice.currency}`,
          vat: vatDisplay,
          gross: `${totalGross.toFixed(2)} ${this.invoice.currency}`
        };
      });
      
      autoTable(doc, {
        head: [headColumns.map(col => col.header)],
        body: poRows.map(row => [
          row.number,
          row.supplier,
          row.net,
          row.additional,
          row.vat,
          row.gross
        ]),
        startY: summaryY + 5,
        theme: 'grid',
        styles: { 
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 15, halign: 'center' },
          5: { cellWidth: 25, halign: 'right' }
        },
        headStyles: { 
          fillColor: [139, 69, 255],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        }
      });
      
      summaryY = doc.lastAutoTable.finalY + 10;
    }
    
    return { advancePaymentsValue, summaryY };
  }

  /**
   * Dodawanie podsumowania finansowego
   */
  addFinancialSummary(doc, summaryY, totalNetto, isPurchaseInvoice, advancePaymentsValue) {
    const t = this.translations;
    
    // Jeśli istnieją zaliczki, upewnij się, że są one uwzględnione w rozliczeniu
    let settledAdvancePaymentsCalculated = 0;
    if (this.invoice.settledAdvancePayments && parseFloat(this.invoice.settledAdvancePayments) > 0) {
      settledAdvancePaymentsCalculated = parseFloat(this.invoice.settledAdvancePayments);
    } else if (advancePaymentsValue > 0) {
      settledAdvancePaymentsCalculated = advancePaymentsValue;
    }

    // Oblicz sumy
    const totalVat = this.calculateTotalVat(this.invoice.items, isPurchaseInvoice ? null : this.invoice.vatRate);
    
    // Dla faktur z zamówień zakupowych, dodaj dodatkowe koszty
    let additionalCostsValue = 0;
    if (isPurchaseInvoice && this.invoice.additionalCostsItems && Array.isArray(this.invoice.additionalCostsItems)) {
      additionalCostsValue = this.invoice.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
    } else if (isPurchaseInvoice) {
      additionalCostsValue = parseFloat(this.invoice.additionalCosts) || 0;
    }
    
    const totalBrutto = totalNetto + totalVat + additionalCostsValue;

    // Tabela podsumowania (po prawej stronie)
    const summaryX = 110;
    const summaryWidth = 70;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    // Suma częściowa
    doc.text(`${t.totalPartial}`, summaryX, summaryY);
    doc.text(`${totalNetto.toFixed(2)} ${this.invoice.currency}`, summaryX + summaryWidth, summaryY, { align: 'right' });
    summaryY += 6;
    
    // VAT
    if (totalVat > 0) {
      doc.text('VAT', summaryX, summaryY);
      doc.text(`${totalVat.toFixed(2)} ${this.invoice.currency}`, summaryX + summaryWidth, summaryY, { align: 'right' });
      summaryY += 6;
    }
    
    // Dodatkowe koszty
    if (additionalCostsValue > 0) {
      doc.text(t.additionalCosts, summaryX, summaryY);
      doc.text(`${additionalCostsValue.toFixed(2)} ${this.invoice.currency}`, summaryX + summaryWidth, summaryY, { align: 'right' });
      summaryY += 6;
    }
    
    // Koszty wysyłki
    if (this.invoice.shippingInfo && this.invoice.shippingInfo.cost > 0) {
      doc.text(`${t.shippingCost}`, summaryX, summaryY);
      doc.text(`${parseFloat(this.invoice.shippingInfo.cost).toFixed(2)} ${this.invoice.currency}`, summaryX + summaryWidth, summaryY, { align: 'right' });
      summaryY += 6;
    }
    
    // Koszty z powiązanych PO
    if (advancePaymentsValue > 0) {
      doc.text(`${t.purchaseCosts}`, summaryX, summaryY);
      doc.text(`${advancePaymentsValue.toFixed(2)} ${this.invoice.currency}`, summaryX + summaryWidth, summaryY, { align: 'right' });
      summaryY += 6;
    }
    
    // Rozliczone zaliczki
    if (settledAdvancePaymentsCalculated > 0) {
      doc.text(`${t.settledAdvancePayments}`, summaryX, summaryY);
      doc.text(`-${settledAdvancePaymentsCalculated.toFixed(2)} ${this.invoice.currency}`, summaryX + summaryWidth, summaryY, { align: 'right' });
      summaryY += 6;
    }
    
    // Linia
    doc.setLineWidth(0.5);
    doc.line(summaryX, summaryY + 2, summaryX + summaryWidth, summaryY + 2);
    summaryY += 8;
    
    // Kwota należna (pogrubiona)
    const invoiceTotal = parseFloat(this.invoice.total) || totalBrutto;
    const finalAmountCalculated = invoiceTotal - settledAdvancePaymentsCalculated;
    
    doc.setFont('helvetica', 'bold');
    doc.text(`${t.total}`, summaryX, summaryY);
    doc.text(`${finalAmountCalculated.toFixed(2)} ${this.invoice.currency}`, summaryX + summaryWidth, summaryY, { align: 'right' });
    
    return summaryY;
  }

  /**
   * Dodawanie informacji o płatności
   */
  addPaymentInfo(doc, summaryY) {
    const t = this.translations;
    
    if (this.invoice.paymentMethod) {
      summaryY += 20;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${t.paymentMethod} ${this.translatePaymentMethod(this.invoice.paymentMethod)}`, 14, summaryY);
      
      // Użyj danych z wybranego konta bankowego lub domyślnych
      const bankData = this.invoice.selectedBankAccount && this.companyInfo?.bankAccounts ? 
        this.companyInfo.bankAccounts.find(acc => acc.id === this.invoice.selectedBankAccount) : 
        this.companyInfo;
      
      if (bankData?.bankName || this.companyInfo?.bankName) {
        summaryY += 5;
        doc.text(`${t.bank} ${bankData?.bankName || this.companyInfo?.bankName}`, 14, summaryY);
      }
      
      if (bankData?.accountNumber || this.companyInfo?.bankAccount) {
        summaryY += 5;
        doc.text(`${t.accountNumber} ${bankData?.accountNumber || this.companyInfo?.bankAccount}`, 14, summaryY);
      }
      
      if (bankData?.swift || this.companyInfo?.swift) {
        summaryY += 5;
        doc.text(`${t.swift} ${bankData?.swift || this.companyInfo?.swift}`, 14, summaryY);
      }
    }
    
    return summaryY;
  }

  /**
   * Dodawanie uwag
   */
  addNotes(doc, summaryY) {
    const t = this.translations;
    
    if (this.invoice.notes) {
      summaryY += 15;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${t.notes}`, 14, summaryY);
      doc.setFont('helvetica', 'normal');
      doc.text(this.invoice.notes, 14, summaryY + 6);
    }
    
    return summaryY;
  }

  /**
   * Dodawanie stopki
   */
  addFooter(doc) {
    const t = this.translations;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.height;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (t.footerLine1) {
      doc.text(t.footerLine1, pageWidth / 2, pageHeight - 20, { align: 'center' });
    }
    if (t.footerLine2) {
      doc.text(t.footerLine2, pageWidth / 2, pageHeight - 15, { align: 'center' });
    }
  }

  /**
   * Generuje zawartość PDF (bez szablonu tła)
   */
  generatePdfContent(doc, resolve) {
    const t = this.translations;
    
    // Szablon ma już tytuł "INVOICE", więc dodajemy tylko numer faktury w odpowiednim miejscu
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Dodaj nagłówek jeśli nie ma szablonu
    if (!this.options.useTemplate) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(0, 0, 0);
      doc.text('INVOICE', 20, 30);
    }
    
    // Typ faktury (proforma) jeśli dotyczy - na lewej stronie
    if (this.invoice.isProforma) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('PROFORMA', 14, this.options.useTemplate ? 45 : 25);
    }
    
    // Numer faktury - na lewej stronie
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`${t.invoiceNumber}: ${this.invoice.number}`, 14, this.options.useTemplate ? 55 : 35);
    
    // Dane faktury - na lewej stronie
    let leftColumnY = this.options.useTemplate ? 65 : 45;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${t.issueDate}`, 14, leftColumnY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${this.formatDate(this.invoice.issueDate)}`, 64, leftColumnY);
    
    leftColumnY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`${t.dueDate}`, 14, leftColumnY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${this.formatDate(this.invoice.dueDate)}`, 64, leftColumnY);
    
    // Sprawdź czy jest to faktura do zamówienia zakupowego
    const isPurchaseInvoice = this.invoice.invoiceType === 'purchase' || this.invoice.originalOrderType === 'purchase';
    
    // Ustaw pozycję startową Y dla Seller i Buyer - musi być poniżej informacji o fakturze
    const sellerBuyerStartY = this.options.useTemplate ? 90 : 70;
    
    // Dodaj informacje o sprzedawcy
    const sellerFinalY = this.addSellerInfo(doc, isPurchaseInvoice, sellerBuyerStartY);
    
    // Dodaj informacje o nabywcy - zaczynają w tej samej linii co Seller
    const rightColX = 120; // Pozycja prawej kolumny dla Buyer
    const buyerFinalY = this.addBuyerInfo(doc, isPurchaseInvoice, rightColX, sellerBuyerStartY);
    
    // Tabela pozycji - pozycja zależy od tego, która sekcja (Seller/Buyer) jest dłuższa
    const tableStartY = Math.max(sellerFinalY, buyerFinalY) + 20;
    const { totalNetto, finalY } = this.addItemsTable(doc, tableStartY);
    
    // Podsumowanie po tabeli
    let summaryY = finalY + 10;
    
    // Obsługa powiązanych zamówień zakupowych
    const { advancePaymentsValue, summaryY: newSummaryY } = this.addPurchaseOrdersTable(doc, summaryY);
    summaryY = newSummaryY;
    
    // Podsumowanie finansowe
    summaryY = this.addFinancialSummary(doc, summaryY, totalNetto, isPurchaseInvoice, advancePaymentsValue);
    
    // Informacje o płatności
    summaryY = this.addPaymentInfo(doc, summaryY);
    
    // Uwagi
    summaryY = this.addNotes(doc, summaryY);
    
    // Stopka
    this.addFooter(doc);
    
    // Zwróć dokument PDF
    resolve(doc);
  }

  /**
   * Główna funkcja generująca PDF
   */
  generate(language = 'en') {
    return new Promise((resolve, reject) => {
      try {
        // Tworzenie dokumentu PDF z optymalizacjami
        const doc = new jsPDF({
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: this.options.enableCompression, // Włącz kompresję PDF
          precision: 2    // Ogranicz precyzję do 2 miejsc po przecinku
        });
        
        // Ustaw kompresję obrazów
        doc.setProperties({
          title: `Faktura ${this.invoice.number}`,
          subject: 'Faktura',
          author: this.companyInfo?.name || 'BGW Pharma',
          creator: 'MRP System'
        });
        
        const t = this.translations;
        
        // Sprawdź czy używać szablonu
        if (!this.options.useTemplate) {
          // Generuj PDF bez szablonu dla oszczędności miejsca
          this.generatePdfContent(doc, resolve);
          return;
        }

        // Dodaj szablon faktury jako tło z optymalizacją
        const templateImg = new Image();
        
        const generatePdfContent = () => {
          this.generatePdfContent(doc, resolve);
        };

        /**
         * Optymalizuje obraz przed dodaniem do PDF
         */
        const optimizeAndAddImage = (img) => {
          try {
            // Stwórz canvas do kompresji obrazu
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Ustaw rozmiar canvas na rozmiar PDF (A4: 210x297mm przy wyższej rozdzielczości)
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            // Konwertuj jednostki PDF na piksele (150 DPI dla lepszej jakości)
            const canvasWidth = Math.round(pageWidth * 5.91); // 150 DPI to ~5.91 px/mm
            const canvasHeight = Math.round(pageHeight * 5.91);
            
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            
            // Ustaw wysoką jakość renderowania
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Narysuj obraz na canvas z odpowiednim skalowaniem
            ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
            
                         // Konwertuj do JPEG z kompresją (jakość z opcji)
             const compressedDataUrl = canvas.toDataURL('image/jpeg', this.options.imageQuality);
            
            // Dodaj skompresowany obraz do PDF
            doc.addImage(compressedDataUrl, 'JPEG', 0, 0, pageWidth, pageHeight);
            
            console.log('Szablon faktury dodany z optymalizacją rozmiaru');
            generatePdfContent();
            
          } catch (error) {
            console.warn('Błąd podczas optymalizacji obrazu, używam oryginalnego:', error);
            // Fallback - użyj oryginalnego obrazu
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.addImage(templateImg, 'PNG', 0, 0, pageWidth, pageHeight);
            generatePdfContent();
          }
        };
        
        templateImg.onload = function() {
          optimizeAndAddImage(templateImg);
        };
        
        templateImg.onerror = function() {
          // Jeśli nie można załadować szablonu, wygeneruj PDF bez tła
          console.warn('Nie można załadować szablonu faktury, generowanie bez tła');
          generatePdfContent();
        };
        
        // Spróbuj załadować szablon faktury
        templateImg.src = '/templates/invoice_template.png';
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Pobieranie pliku PDF
   */
  async downloadPdf(language = 'en') {
    try {
      const doc = await this.generate(language);
      
      const filename = this.invoice.isProforma 
        ? `Faktura_Proforma_${this.invoice.number}_${language.toUpperCase()}.pdf`
        : `Faktura_${this.invoice.number}_${language.toUpperCase()}.pdf`;
      
      doc.save(filename);
      
      return {
        success: true,
        filename,
        message: `Faktura została pobrana w formacie PDF (${language.toUpperCase()})`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Nie udało się wygenerować pliku PDF: ' + error.message
      };
    }
  }
}

/**
 * Funkcja pomocnicza do tworzenia instancji generatora PDF
 * @param {Object} invoice - obiekt faktury
 * @param {Object} companyInfo - informacje o firmie  
 * @param {string} language - język ('pl' lub 'en')
 * @param {Object} options - opcje optymalizacji:
 *   - useTemplate: boolean (domyślnie true) - czy używać szablonu tła
 *   - imageQuality: number (0.1-1.0, domyślnie 0.95) - jakość kompresji obrazu
 *   - enableCompression: boolean (domyślnie true) - czy włączyć kompresję PDF
 */
export const createInvoicePdfGenerator = (invoice, companyInfo, language = 'pl', options = {}) => {
  // Słownik tłumaczeń dla dokumentu
  const translations = {
    pl: {
      invoice: 'Faktura',
      proformaInvoice: 'Faktura proforma',
      invoiceNumber: 'Numer faktury',
      issueDate: 'Data wystawienia',
      dueDate: 'Termin płatności',
      seller: 'Sprzedawca',
      buyer: 'Nabywca',
      vatEu: 'VAT-EU:',
      email: 'Email:',
      phone: 'Tel:',
      paymentMethod: 'Metoda płatności:',
      bank: 'Bank:',
      accountNumber: 'Nr konta:',
      swift: 'SWIFT:',
      lp: 'Opis',
      quantity: 'Ilość',
      unitPrice: 'Cena jednostkowa',
      amount: 'Kwota',
      totalPartial: 'Suma częściowa',
      total: 'Suma',
      currency: 'USD',
      footerLine1: '',
      footerLine2: '',
      payOnline: 'Zapłać online',
      relatedPurchaseOrders: 'Zaliczki/Przedpłaty:',
      poNumber: 'Nr zaliczki',
      supplier: 'Wpłacający',
      netValue: 'Wartość netto',
      additionalCosts: 'Dodatkowe opłaty',
      grossValue: 'Wartość brutto',
      unknownSupplier: 'Nieznany dostawca',
      shippingCost: 'Koszt wysyłki',
      purchaseCosts: 'Koszty zakupu',
      settledAdvancePayments: 'Rozliczone zaliczki',
      notes: 'Uwagi'
    },
    en: {
      invoice: 'Invoice',
      proformaInvoice: 'Proforma Invoice',
      invoiceNumber: 'Invoice Number',
      issueDate: 'Issue Date',
      dueDate: 'Due Date',
      seller: 'Seller',
      buyer: 'Buyer',
      vatEu: 'VAT-EU:',
      email: 'Email:',
      phone: 'Phone:',
      paymentMethod: 'Payment Method:',
      bank: 'Bank:',
      accountNumber: 'Account Number:',
      swift: 'SWIFT:',
      lp: 'Description',
      quantity: 'Quantity',
      unitPrice: 'Unit Price',
      amount: 'Amount',
      totalPartial: 'Subtotal',
      total: 'Total',
      currency: 'USD',
      footerLine1: '',
      footerLine2: '',
      payOnline: 'Pay Online',
      relatedPurchaseOrders: 'Advance Payments:',
      poNumber: 'Payment No.',
      supplier: 'Payer',
      netValue: 'Net Value',
      additionalCosts: 'Additional Costs',
      grossValue: 'Gross Value',
      unknownSupplier: 'Unknown Supplier',
      shippingCost: 'Shipping Cost',
      purchaseCosts: 'Purchase Costs',
      settledAdvancePayments: 'Settled Advance Payments',
      notes: 'Notes'
    }
  };
  
  const selectedTranslations = translations[language] || translations.pl;
  
  return new InvoicePdfGenerator(invoice, companyInfo, selectedTranslations, options);
};

export default InvoicePdfGenerator;