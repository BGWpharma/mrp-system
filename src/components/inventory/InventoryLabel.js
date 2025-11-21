import React, { useRef, useState, useEffect, forwardRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  Grid,
  Divider,
  RadioGroup,
  Radio,
  FormLabel,
  FormControl
} from '@mui/material';
import {
  Print as PrintIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import QRCode from 'react-qr-code';
import Barcode from 'react-barcode';
import { useReactToPrint } from 'react-to-print';
import html2canvas from 'html2canvas';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

// Mapowanie polskich kategorii na angielskie
const categoryTranslations = {
  'Opakowania jednostkowe': 'Unit packaging',
  'Surowce': 'Raw materials',
  'Produkty gotowe': 'Finished products',
  'Gotowe produkty': 'Finished products',
  'Materiały eksploatacyjne': 'Consumables',
  'Opakowania zbiorcze': 'Bulk packaging',
  'Komponenty': 'Components',
  'Półprodukty': 'Semi-finished products',
  'Pozostałe': 'Other'
};

// Mapowanie polskich jednostek na angielskie
const unitTranslations = {
  'szt.': 'pcs',
  'kg': 'kg',
  'g': 'g',
  'l': 'l',
  'ml': 'ml',
  'm': 'm',
  'cm': 'cm',
  'mm': 'mm'
};

// Funkcja do bezpiecznego formatowania daty
const formatDate = (dateValue) => {
  if (!dateValue) return '';
  
  try {
    // Obsługa różnych formatów daty
    let date;
    
    // Jeśli to obiekt Date
    if (dateValue instanceof Date) {
      date = dateValue;
    }
    // Jeśli to timestamp Firestore
    else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
      date = dateValue.toDate();
    }
    // Jeśli to timestamp z sekundami
    else if (dateValue.seconds) {
      date = new Date(dateValue.seconds * 1000);
    }
    // Jeśli to string
    else if (typeof dateValue === 'string') {
      // Usuń ewentualne spacje
      const trimmedDate = dateValue.trim();
      
      // Sprawdź różne formaty daty
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmedDate)) {
        // Format MM/DD/YYYY lub M/D/YYYY
        const [month, day, year] = trimmedDate.split('/');
        date = new Date(year, month - 1, day);
      } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmedDate)) {
        // Format ISO YYYY-MM-DD
        date = new Date(trimmedDate);
      } else {
        // Standardowe parsowanie daty
        date = new Date(trimmedDate);
      }
      
      // Sprawdź czy data jest poprawna
      if (isNaN(date.getTime())) {
        console.error('Invalid date format:', dateValue);
        return 'Invalid Date';
      }
    } else {
      return 'Invalid Date';
    }
    
    // Formatuj datę do wyświetlenia w formacie DD/MM/YYYY
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error, dateValue);
    return 'Invalid Date';
  }
};

const InventoryLabel = forwardRef(({ item, batch = null, onClose, address = null, boxQuantity = '', labelType = 'batch' }, ref) => {
  const labelRef = useRef(null);
  const labelPaperRef = useRef(null);
  
  // Przekazanie referencji do rodzica
  useEffect(() => {
    if (ref) {
      ref.current = {
        handlePrint,
        handleSaveAsPNG
      };
    }
  }, [ref]);

  const [isEditing, setIsEditing] = useState(false);
  const [labelData, setLabelData] = useState({
    title: item?.name || 'Product',
    additionalInfo: '',
    fontSize: 20,
    codeType: 'barcode', // domyślnie kod kreskowy
    showCode: true,
    boxQuantity: boxQuantity || item?.itemsPerBox || '', // ilość w kartonie
    palletQuantity: '', // ilość na palecie
    showAddress: !!address // pokazuj adres, jeśli został przekazany
  });

  const [groups, setGroups] = useState([]);
  const [itemGroups, setItemGroups] = useState([]);

  // Funkcja do tłumaczenia kategorii
  const translateCategory = (category) => {
    return categoryTranslations[category] || category;
  };

  // Funkcja do tłumaczenia jednostek
  const translateUnit = (unit) => {
    return unitTranslations[unit] || unit || 'pcs';
  };

  useEffect(() => {
    if (item) {
      setLabelData(prev => ({
        ...prev,
        title: item.name || 'Product',
        boxQuantity: boxQuantity || item?.itemsPerBox || '',
        showAddress: !!address
      }));
      
      // Pobierz grupy, do których należy produkt
      fetchProductGroups();
    }
  }, [item, address, boxQuantity]);

  // Funkcja do pobierania grup, do których należy produkt
  const fetchProductGroups = async () => {
    if (!item || !item.id) return;
    
    try {
      const groupsCollection = collection(db, 'itemGroups');
      const groupsSnapshot = await getDocs(groupsCollection);
      
      const allGroups = groupsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setGroups(allGroups);
      
      // Sprawdź, do których grup należy produkt
      const productGroups = allGroups.filter(group => 
        group.items && Array.isArray(group.items) && group.items.includes(item.id)
      );
      
      setItemGroups(productGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  // Funkcja do drukowania etykiety
  const handlePrint = async () => {
    try {
      if (!labelRef.current) {
        console.error('No element to print');
        alert('Print error: no label element');
        return;
      }
      
      // Tworzymy nowe okno do drukowania
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      // Pobieramy obraz kodu
      const codeImageUrl = await getCodeImage();
      
      // Debugowanie
      console.log("Generated code image:", codeImageUrl);
      
      // Przygotowujemy style i zawartość HTML - dostosowane do proporcji 2:3
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print label</title>
          <style>
            @page {
              size: 10cm 15cm; /* proporcja 2:3 */
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
            }
            .label-container {
              width: 10cm;
              height: 15cm;
              background-color: white;
              color: black;
              padding: 0.2cm;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              box-sizing: border-box;
              border: 1px solid #ddd;
            }
            .label-title {
              font-size: ${Math.max(14, labelData.fontSize)}px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.1cm;
            }
            .label-info {
              font-size: 12px;
              text-align: center;
              margin-bottom: 0.05cm;
            }
            .divider {
              border-top: 1px solid rgba(0, 0, 0, 0.2);
              margin: 0.1cm 0;
            }
            .label-lot {
              font-size: 14px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.05cm;
            }
            .code-container {
              background-color: white;
              margin: 0.1cm auto;
              padding: 0.1cm;
              border-radius: 4px;
              text-align: center;
              border: 1px solid #eee;
              width: ${labelData.codeType === 'qrcode' ? '4cm' : '7cm'};
            }
            .info-box {
              text-align: center;
            }
            .bold-info {
              font-weight: bold;
            }
            .address-container {
              text-align: left;
              border: 1px solid #ccc;
              padding: 0.1cm;
              margin-top: 0.1cm;
              white-space: pre-line;
              line-height: 1.1;
              font-size: 11px;
            }
            .compact-info {
              display: flex;
              justify-content: space-between;
              flex-wrap: wrap;
            }
            .compact-info-item {
              width: 48%;
              text-align: center;
              margin-bottom: 0.05cm;
              font-size: 12px;
            }
            .footer {
              font-size: 8px;
              text-align: center;
              margin-top: auto;
              padding-top: 0.1cm;
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            <div class="info-box">
              <div class="label-title">${labelData.title}</div>
              <div class="label-info">Category: ${translateCategory(item?.category) || 'No category'}</div>
              ${itemGroups.length > 0 ? 
                `<div class="label-info">Group: ${itemGroups.map(g => g.name).join(', ')}</div>` : 
                ''}
              
              <div class="divider"></div>
              
              ${labelType === 'batch' && batch ? `
                <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'No number'}</div>
                
                <div class="compact-info">
                  ${batch.moNumber ? `
                    <div class="compact-info-item bold-info">MO: ${batch.moNumber}</div>
                  ` : ''}
                  ${batch.orderNumber && (item?.category === 'Produkty gotowe' || item?.category === 'Gotowe produkty') ? `
                    <div class="compact-info-item bold-info">CO: ${batch.orderNumber}</div>
                  ` : ''}
                  ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.number ? `
                    <div class="compact-info-item bold-info">PO: ${batch.purchaseOrderDetails.number}</div>
                  ` : (batch.poNumber ? `
                    <div class="compact-info-item bold-info">PO: ${batch.poNumber}</div>
                  ` : '')}
                  ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.supplier && batch.purchaseOrderDetails.supplier.name ? `
                    <div class="compact-info-item">Supplier: ${batch.purchaseOrderDetails.supplier.name}</div>
                  ` : (batch.supplier ? `
                    <div class="compact-info-item">Supplier: ${batch.supplier}</div>
                  ` : '')}
                  ${batch.expiryDate ? `
                    <div class="compact-info-item">Exp: ${formatDate(batch.expiryDate)}</div>
                  ` : ''}
                  <div class="compact-info-item">Qty: ${batch.quantity} ${translateUnit(item?.unit)}</div>
                </div>
              ` : ''}
              
              ${labelType === 'box' ? `
                <div class="label-lot">Box quantity: ${labelData.boxQuantity} ${translateUnit(item?.unit)}</div>
                ${batch ? `
                  <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'No number'}</div>
                  
                  <div class="compact-info">
                    ${batch.moNumber ? `
                      <div class="compact-info-item bold-info">MO: ${batch.moNumber}</div>
                    ` : ''}
                    ${batch.orderNumber && (item?.category === 'Produkty gotowe' || item?.category === 'Gotowe produkty') ? `
                      <div class="compact-info-item bold-info">CO: ${batch.orderNumber}</div>
                    ` : ''}
                    ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.number ? `
                      <div class="compact-info-item bold-info">PO: ${batch.purchaseOrderDetails.number}</div>
                    ` : (batch.poNumber ? `
                      <div class="compact-info-item bold-info">PO: ${batch.poNumber}</div>
                    ` : '')}
                    ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.supplier && batch.purchaseOrderDetails.supplier.name ? `
                      <div class="compact-info-item">Supplier: ${batch.purchaseOrderDetails.supplier.name}</div>
                    ` : (batch.supplier ? `
                      <div class="compact-info-item">Supplier: ${batch.supplier}</div>
                    ` : '')}
                    ${batch.expiryDate ? `
                      <div class="compact-info-item">Exp: ${formatDate(batch.expiryDate)}</div>
                    ` : ''}
                  </div>
                ` : ''}
              ` : ''}
              
              ${labelData.palletQuantity ? `
                <div class="label-info bold-info">Pallet quantity: ${labelData.palletQuantity} ${translateUnit(item?.unit)}</div>
              ` : ''}
              
              ${labelData.additionalInfo ? `
                <div class="divider"></div>
                <div class="label-info">${labelData.additionalInfo}</div>
              ` : ''}
            </div>
            
            ${address && labelData.showAddress ? `
              <div class="address-container">
                ${address}
              </div>
            ` : ''}
            
            ${labelData.showCode ? `
              <div class="code-container">
                <img src="${codeImageUrl}" style="max-width: 100%; height: auto;" />
              </div>
            ` : ''}
            
            <div class="footer">
              Printed: ${new Date().toLocaleString('en-GB')}
            </div>
          </div>
        </body>
        </html>
      `;
      
      // Wpisujemy zawartość do nowego okna
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Obsługujemy drukowanie po załadowaniu obrazu
      printWindow.onload = function() {
        setTimeout(() => {
          printWindow.print();
          // Zamknij okno po wydrukowaniu
          setTimeout(() => { printWindow.close(); }, 500);
        }, 300);
      };
    } catch (error) {
      console.error('Błąd podczas drukowania:', error);
      alert('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    }
  };
  
  // Funkcja generująca obraz kodu QR lub kreskowego
  const getCodeImage = async () => {
    try {
      // Sprawdzamy, czy kod jest widoczny w etykiecie
      if (!labelData.showCode) {
        return null;
      }
      
      // Znajdujemy element kodu
      const codeContainer = labelRef.current?.querySelector('[data-testid="code-container"]');
      const codeEl = codeContainer?.querySelector('svg');
      
      if (!codeEl) {
        console.error('Nie znaleziono elementu kodu');
        throw new Error('Nie znaleziono elementu kodu do konwersji na obraz');
      }
      
      // Utwórz kanwę dla obrazu
      const canvas = document.createElement('canvas');
      
      // Ustal rozmiar kanwy dopasowany do kodu
      const rect = codeEl.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      
      // Klonujemy element SVG i dostosowujemy
      const svgClone = codeEl.cloneNode(true);
      svgClone.setAttribute('width', rect.width);
      svgClone.setAttribute('height', rect.height);
      
      // Konwertujemy kod SVG na string
      const svgData = new XMLSerializer().serializeToString(svgClone);
      
      // Tworzymy URL do obrazu SVG
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      
      // Ładujemy obraz
      const img = new Image();
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          // Czyścimy kanwę
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // Rysujemy kod
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Konwertujemy do URL
          const dataUrl = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        };
        
        img.onerror = (e) => {
          console.error('Błąd ładowania obrazu kodu:', e);
          URL.revokeObjectURL(url);
          reject(new Error('Błąd ładowania obrazu kodu'));
        };
        
        img.src = url;
      });
    } catch (error) {
      console.error('Błąd podczas generowania obrazu kodu:', error);
      // Zwracamy URL do pustego obrazu w przypadku błędu
      return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
  };

  // Funkcja zapisująca etykietę jako obraz PNG
  const handleSaveAsPNG = async () => {
    try {
      // Używamy dedykowanej referencji do elementu etykiety
      if (!labelPaperRef.current) {
        console.error('Label element not found');
        alert('Error: label element not found');
        return;
      }
      
      // Tworzymy tymczasowe okno z etykietą w odpowiednim rozmiarze
      const tempWindow = window.open('', '_blank', 'width=400,height=600');
      
      // Pobieramy obraz kodu
      const codeImageUrl = await getCodeImage();
      
      // Tworzymy HTML etykiety dokładnie taki sam jak przy drukowaniu
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Label</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              background-color: #f0f0f0;
              min-height: 100vh;
            }
            .label-container {
              width: 10cm;
              height: 15cm;
              background-color: white;
              color: black;
              padding: 0.3cm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
              font-family: Arial, sans-serif;
              border: 1px solid #ddd;
              box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            .label-title {
              font-size: ${Math.max(14, labelData.fontSize)}px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.1cm;
            }
            .label-info {
              font-size: 12px;
              text-align: center;
              margin-bottom: 0.05cm;
            }
            .divider {
              border-top: 1px solid rgba(0, 0, 0, 0.2);
              margin: 0.1cm 0;
            }
            .label-lot {
              font-size: 14px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.1cm;
            }
            .code-container {
              background-color: white;
              margin: 0.1cm auto;
              padding: 0.1cm;
              border-radius: 4px;
              text-align: center;
              border: 1px solid #eee;
              width: ${labelData.codeType === 'qrcode' ? '4cm' : '7cm'};
            }
            .info-box {
              text-align: center;
            }
            .bold-info {
              font-weight: bold;
            }
            .address-container {
              text-align: left;
              border: 1px solid #ccc;
              padding: 0.2cm;
              margin-top: 0.1cm;
              white-space: pre-line;
              line-height: 1.1;
              font-size: 10px;
            }
            .compact-info {
              display: flex;
              justify-content: space-between;
              flex-wrap: wrap;
            }
            .compact-info-item {
              width: 48%;
              text-align: center;
              margin-bottom: 0.05cm;
              font-size: 12px;
            }
            #capture-button {
              position: fixed;
              bottom: 20px;
              left: 50%;
              transform: translateX(-50%);
              padding: 10px 20px;
              background-color: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            #capture-button:hover {
              background-color: #45a049;
            }
            #download-link {
              display: none;
            }
            .footer {
              font-size: 8px;
              text-align: center;
              margin-top: auto;
              padding-top: 0.1cm;
            }
          </style>
        </head>
        <body>
          <div class="label-container" id="label-to-capture">
            <div class="info-box">
              <div class="label-title">${labelData.title}</div>
              <div class="label-info">Category: ${translateCategory(item?.category) || 'No category'}</div>
              ${itemGroups.length > 0 ? 
                `<div class="label-info">Group: ${itemGroups.map(g => g.name).join(', ')}</div>` : 
                ''}
              
              <div class="divider"></div>
              
              ${labelType === 'batch' && batch ? `
                <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'No number'}</div>
                
                <div class="compact-info">
                  ${batch.moNumber ? `
                    <div class="compact-info-item bold-info">MO: ${batch.moNumber}</div>
                  ` : ''}
                  ${batch.orderNumber && (item?.category === 'Produkty gotowe' || item?.category === 'Gotowe produkty') ? `
                    <div class="compact-info-item bold-info">CO: ${batch.orderNumber}</div>
                  ` : ''}
                  ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.number ? `
                    <div class="compact-info-item bold-info">PO: ${batch.purchaseOrderDetails.number}</div>
                  ` : (batch.poNumber ? `
                    <div class="compact-info-item bold-info">PO: ${batch.poNumber}</div>
                  ` : '')}
                  ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.supplier && batch.purchaseOrderDetails.supplier.name ? `
                    <div class="compact-info-item">Supplier: ${batch.purchaseOrderDetails.supplier.name}</div>
                  ` : (batch.supplier ? `
                    <div class="compact-info-item">Supplier: ${batch.supplier}</div>
                  ` : '')}
                  ${batch.expiryDate ? `
                    <div class="compact-info-item">Exp: ${formatDate(batch.expiryDate)}</div>
                  ` : ''}
                  <div class="compact-info-item">Qty: ${batch.quantity} ${translateUnit(item?.unit)}</div>
                </div>
              ` : ''}
              
              ${labelType === 'box' ? `
                <div class="label-lot">Box quantity: ${labelData.boxQuantity} ${translateUnit(item?.unit)}</div>
                ${batch ? `
                  <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'No number'}</div>
                  
                  <div class="compact-info">
                    ${batch.moNumber ? `
                      <div class="compact-info-item bold-info">MO: ${batch.moNumber}</div>
                    ` : ''}
                    ${batch.orderNumber && (item?.category === 'Produkty gotowe' || item?.category === 'Gotowe produkty') ? `
                      <div class="compact-info-item bold-info">CO: ${batch.orderNumber}</div>
                    ` : ''}
                    ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.number ? `
                      <div class="compact-info-item bold-info">PO: ${batch.purchaseOrderDetails.number}</div>
                    ` : (batch.poNumber ? `
                      <div class="compact-info-item bold-info">PO: ${batch.poNumber}</div>
                    ` : '')}
                    ${batch.purchaseOrderDetails && batch.purchaseOrderDetails.supplier && batch.purchaseOrderDetails.supplier.name ? `
                      <div class="compact-info-item">Supplier: ${batch.purchaseOrderDetails.supplier.name}</div>
                    ` : (batch.supplier ? `
                      <div class="compact-info-item">Supplier: ${batch.supplier}</div>
                    ` : '')}
                    ${batch.expiryDate ? `
                      <div class="compact-info-item">Exp: ${formatDate(batch.expiryDate)}</div>
                    ` : ''}
                  </div>
                ` : ''}
              ` : ''}
              
              ${labelData.palletQuantity ? `
                <div class="label-info bold-info">Pallet quantity: ${labelData.palletQuantity} ${translateUnit(item?.unit)}</div>
              ` : ''}
              
              ${labelData.additionalInfo ? `
                <div class="divider"></div>
                <div class="label-info">${labelData.additionalInfo}</div>
              ` : ''}
            </div>
            
            ${address && labelData.showAddress ? `
              <div class="address-container">
                ${address}
              </div>
            ` : ''}
            
            ${labelData.showCode ? `
              <div class="code-container">
                <img src="${codeImageUrl}" style="max-width: 100%; height: auto;" />
              </div>
            ` : ''}
            
            <div class="footer">
              Printed: ${new Date().toLocaleString('en-GB')}
            </div>
          </div>
          <button id="capture-button">Capture and Download</button>
          <a id="download-link" download="label_${item?.id || 'product'}_${batch ? batch.batchNumber || batch.lotNumber || '' : ''}.png"></a>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
          <script>
            // Czekamy na załadowanie html2canvas
            window.addEventListener('load', function() {
              const captureButton = document.getElementById('capture-button');
              
              captureButton.addEventListener('click', function() {
                const labelElement = document.getElementById('label-to-capture');
                const downloadLink = document.getElementById('download-link');
                const button = this;
                
                button.textContent = 'Processing...';
                button.disabled = true;
                
                // Sprawdzamy czy html2canvas jest dostępny
                if (typeof html2canvas === 'undefined') {
                  alert('html2canvas library not loaded. Please try again.');
                  button.textContent = 'Capture and Download';
                  button.disabled = false;
                  return;
                }
                
                // Używamy html2canvas z setTimeout dla lepszego renderowania
                setTimeout(function() {
                  html2canvas(labelElement, {
                    scale: 3,
                    backgroundColor: '#FFFFFF'
                  }).then(function(canvas) {
                    const pngData = canvas.toDataURL('image/png');
                    downloadLink.href = pngData;
                    downloadLink.click();
                    window.close();
                  }).catch(function(error) {
                    console.error('Error capturing image:', error);
                    alert('Error capturing image. Please try again.');
                    button.textContent = 'Capture and Download';
                    button.disabled = false;
                  });
                }, 300);
              });
            });
          </script>
        </body>
        </html>
      `;
      
      // Wpisujemy zawartość do nowego okna
      tempWindow.document.open();
      tempWindow.document.write(htmlContent);
      tempWindow.document.close();
      
    } catch (error) {
      console.error('Error saving label as image:', error);
      alert('An error occurred while saving the label. Please try again.');
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setLabelData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Przygotuj dane do kodów (usuń spacje)
  const codeData = (item?.id ? 
    (batch ? 
      `${item.id}_${batch.lotNumber || batch.batchNumber || 'LOT'}${
        (batch.purchaseOrderDetails && batch.purchaseOrderDetails.number) 
          ? '_PO' + batch.purchaseOrderDetails.number 
          : (batch.poNumber ? '_PO' + batch.poNumber : '')
      }` : 
      item.id) : 
    'no-id').replace(/\s+/g, '');
  
  // Dane dla kodu QR w formie czytelnej dla użytkownika - format wieloliniowy
  const qrData = 
    `NAME: ${item?.name || 'Product'}\n` +
    `ID: ${item?.id || ''}\n` +
    `CATEGORY: ${translateCategory(item?.category) || 'No category'}\n` +
    (batch ? `LOT: ${batch.lotNumber || batch.batchNumber || 'No number'}\n` : '') +
    (batch && batch.quantity ? `QTY: ${batch.quantity} ${translateUnit(item?.unit)}\n` : '') +
    (batch && batch.expiryDate ? `EXP: ${formatDate(batch.expiryDate)}\n` : '') +
    (batch && batch.moNumber ? `MO: ${batch.moNumber}\n` : '') +
    (batch && batch.orderNumber && (item?.category === 'Produkty gotowe' || item?.category === 'Gotowe produkty') ? `CO: ${batch.orderNumber}\n` : '') +
    // Pobieranie danych PO z zagnieżdżonej struktury purchaseOrderDetails
    (batch && batch.purchaseOrderDetails && batch.purchaseOrderDetails.number ? `PO: ${batch.purchaseOrderDetails.number}\n` : '') +
    (batch && batch.poNumber ? `PO: ${batch.poNumber}\n` : '') +
    (batch && batch.purchaseOrderDetails && batch.purchaseOrderDetails.id ? `PO ID: ${batch.purchaseOrderDetails.id}\n` : '') +
    (batch && batch.purchaseOrderId ? `PO ID: ${batch.purchaseOrderId}\n` : '') +
    // Dane dostawcy z zagnieżdżonej struktury
    (batch && batch.purchaseOrderDetails && batch.purchaseOrderDetails.supplier && batch.purchaseOrderDetails.supplier.name 
      ? `SUPPLIER: ${batch.purchaseOrderDetails.supplier.name}\n` : '') +
    (batch && batch.supplier ? `SUPPLIER: ${batch.supplier}\n` : '') +
    (labelType === 'box' && labelData.boxQuantity ? `BOX QTY: ${labelData.boxQuantity} ${translateUnit(item?.unit)}\n` : '') +
    (labelData.palletQuantity ? `PALLET QTY: ${labelData.palletQuantity} ${translateUnit(item?.unit)}\n` : '') +
    (itemGroups.length > 0 ? `GROUP: ${itemGroups.map(g => g.name).join(', ')}\n` : '') +
    `PRINT DATE: ${new Date().toLocaleDateString('en-GB')}`;

  return (
    <Box ref={labelRef} sx={{ width: '100%', maxWidth: 400, mx: 'auto', mb: 2 }}>
      {isEditing ? (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Edit Label
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Label Title"
                name="title"
                value={labelData.title}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Additional Information"
                name="additionalInfo"
                value={labelData.additionalInfo}
                onChange={handleChange}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Title Font Size"
                name="fontSize"
                type="number"
                value={labelData.fontSize}
                onChange={handleChange}
                inputProps={{ min: 12, max: 36 }}
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Code Type</FormLabel>
                <RadioGroup
                  name="codeType"
                  value={labelData.codeType}
                  onChange={handleChange}
                >
                  <FormControlLabel value="barcode" control={<Radio />} label="Barcode" />
                  <FormControlLabel value="qrcode" control={<Radio />} label="QR Code" />
                </RadioGroup>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={labelData.showCode}
                    onChange={(e) => setLabelData({ ...labelData, showCode: e.target.checked })}
                    name="showCode"
                  />
                }
                label="Show code on label"
              />
            </Grid>
            {labelType === 'box' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Box Quantity"
                  name="boxQuantity"
                  type="number"
                  value={labelData.boxQuantity}
                  onChange={handleChange}
                  InputProps={{ endAdornment: translateUnit(item?.unit) }}
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Pallet Quantity"
                name="palletQuantity"
                type="number"
                value={labelData.palletQuantity}
                onChange={handleChange}
                InputProps={{ endAdornment: translateUnit(item?.unit) }}
              />
            </Grid>
            {address && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={labelData.showAddress}
                      onChange={(e) => setLabelData({ ...labelData, showAddress: e.target.checked })}
                      name="showAddress"
                    />
                  }
                  label="Show address on label"
                />
              </Grid>
            )}
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              startIcon={<CloseIcon />}
              onClick={() => setIsEditing(false)}
              sx={{ mr: 1 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
            >
              Save Changes
            </Button>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={handleEdit}
          >
            Edit Label
          </Button>
        </Box>
      )}

      <Paper ref={labelPaperRef} sx={{ p: 3, border: '1px solid #ccc', position: 'relative' }}>
        <Typography 
          variant="h5" 
          component="div" 
          sx={{ 
            fontSize: `${labelData.fontSize}px`, 
            textAlign: 'center',
            fontWeight: 'bold',
            mb: 1
          }}
        >
          {labelData.title}
        </Typography>
        
        <Typography variant="subtitle1" sx={{ textAlign: 'center', mb: 1 }}>
          Category: {translateCategory(item?.category) || 'No category'}
        </Typography>
        
        {itemGroups.length > 0 && (
          <Typography variant="subtitle1" sx={{ textAlign: 'center', mb: 1 }}>
            Group: {itemGroups.map(g => g.name).join(', ')}
          </Typography>
        )}
        
        <Divider sx={{ my: 1.5 }} />
        
        {labelType === 'batch' && batch && (
          <>
            <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
              LOT: {batch.lotNumber || batch.batchNumber || 'No number'}
            </Typography>
            
            {batch.moNumber && (
              <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                MO: {batch.moNumber}
              </Typography>
            )}
            
            {batch.orderNumber && (item?.category === 'Produkty gotowe' || item?.category === 'Gotowe produkty') && (
              <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                CO: {batch.orderNumber}
              </Typography>
            )}
            
            {(batch.purchaseOrderDetails && batch.purchaseOrderDetails.number) ? (
              <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                PO: {batch.purchaseOrderDetails.number}
              </Typography>
            ) : (
              batch.poNumber && (
                <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                  PO: {batch.poNumber}
                </Typography>
              )
            )}
            
            {(batch.purchaseOrderDetails && batch.purchaseOrderDetails.supplier && batch.purchaseOrderDetails.supplier.name) ? (
              <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                Supplier: {batch.purchaseOrderDetails.supplier.name}
              </Typography>
            ) : (
              batch.supplier && (
                <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                  Supplier: {batch.supplier}
                </Typography>
              )
            )}
            
            {batch.expiryDate && (
              <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                Expiry date: {formatDate(batch.expiryDate)}
              </Typography>
            )}
            
            <Typography variant="body1" sx={{ textAlign: 'center', mb: 1 }}>
              Quantity: {batch.quantity} {translateUnit(item?.unit)}
            </Typography>
          </>
        )}
        
        {labelType === 'box' && (
          <>
            <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 1 }}>
              Box quantity: {labelData.boxQuantity} {translateUnit(item?.unit)}
            </Typography>
            
            {batch && (
              <>
                <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                  LOT: {batch.lotNumber || batch.batchNumber || 'No number'}
                </Typography>
                
                {batch.moNumber && (
                  <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                    MO: {batch.moNumber}
                  </Typography>
                )}
                
                {batch.orderNumber && (item?.category === 'Produkty gotowe' || item?.category === 'Gotowe produkty') && (
                  <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                    CO: {batch.orderNumber}
                  </Typography>
                )}
                
                {(batch.purchaseOrderDetails && batch.purchaseOrderDetails.number) ? (
                  <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                    PO: {batch.purchaseOrderDetails.number}
                  </Typography>
                ) : (
                  batch.poNumber && (
                    <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                      PO: {batch.poNumber}
                    </Typography>
                  )
                )}
                
                {(batch.purchaseOrderDetails && batch.purchaseOrderDetails.supplier && batch.purchaseOrderDetails.supplier.name) ? (
                  <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                    Supplier: {batch.purchaseOrderDetails.supplier.name}
                  </Typography>
                ) : (
                  batch.supplier && (
                    <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                      Supplier: {batch.supplier}
                    </Typography>
                  )
                )}
                
                {batch.expiryDate && (
                  <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                    Expiry date: {formatDate(batch.expiryDate)}
                  </Typography>
                )}
              </>
            )}
          </>
        )}
        
        {labelData.palletQuantity && (
          <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
            Pallet quantity: {labelData.palletQuantity} {translateUnit(item?.unit)}
          </Typography>
        )}
        
        {labelData.additionalInfo && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body1" sx={{ textAlign: 'center', mb: 1 }}>
              {labelData.additionalInfo}
            </Typography>
          </>
        )}
        
        {address && labelData.showAddress && (
          <Box sx={{ my: 2, p: 1.5, border: '1px solid #ccc', borderRadius: '4px' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
              {address}
            </Typography>
          </Box>
        )}
        
        {labelData.showCode && (
          <Box 
            sx={{ 
              mt: 2, 
              p: 1.5, 
              backgroundColor: '#fff', 
              border: '1px solid #eee',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'center'
            }}
            data-testid="code-container"
          >
            {labelData.codeType === 'qrcode' ? (
              <QRCode 
                value={qrData}
                size={128}
              />
            ) : (
              <Barcode 
                value={codeData}
                width={1.5}
                height={60}
                fontSize={12}
                margin={5}
                text={batch?.batchNumber || batch?.lotNumber || item?.id || ''}
              />
            )}
          </Box>
        )}
      </Paper>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<DownloadIcon />}
          onClick={handleSaveAsPNG}
        >
          Save as Image
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
        >
          Print
        </Button>
      </Box>
    </Box>
  );
});

export default InventoryLabel; 