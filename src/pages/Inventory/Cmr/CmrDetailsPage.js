import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Grid, 
  Divider, 
  Button, 
  Card, 
  CardHeader, 
  CardContent,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  styled,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getCmrDocumentById, 
  updateCmrStatus, 
  CMR_STATUSES,
  CMR_PAYMENT_STATUSES,
  translatePaymentStatus,
  updateCmrPaymentStatus,
  migrateCmrToNewFormat
} from '../../../services/cmrService';
import { getOrderById } from '../../../services/orderService';

// Ikony
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import EventIcon from '@mui/icons-material/Event';
import BusinessIcon from '@mui/icons-material/Business';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PersonIcon from '@mui/icons-material/Person';
import InventoryIcon from '@mui/icons-material/Inventory';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import RefreshIcon from '@mui/icons-material/Refresh';

// Globalne style CSS dla drukowania
const GlobalStyles = styled('style')({});

// Treść globalnych stylów CSS do drukowania
const globalPrintCss = `
  @media print {
    body * {
      visibility: hidden;
    }
    .print-container, .print-container * {
      visibility: visible;
    }
    .print-container {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      display: block !important;
    }
    .no-print {
      display: none !important;
    }
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    .print-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #000;
    }
    .print-section {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .print-section-title {
      font-weight: bold;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    .print-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .print-grid-item {
      margin-bottom: 10px;
    }
    .print-label {
      font-weight: bold;
      font-size: 0.9rem;
    }
    .print-value {
      margin-bottom: 5px;
    }
    .print-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    .print-table th, .print-table td {
      border: 1px solid #000;
      padding: 6px;
      text-align: left;
      font-size: 0.9rem;
    }
    .print-table th {
      background-color: #f3f3f3;
    }
    .print-footer {
      margin-top: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }
    .print-signature {
      text-align: center;
      margin-top: 40px;
      border-top: 1px solid #000;
      padding-top: 5px;
    }
  }
`;

const CmrDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [cmrData, setCmrData] = useState(null);
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  
  useEffect(() => {
    fetchCmrDocument();
  }, [id]);
  
  const fetchCmrDocument = async () => {
    try {
      setLoading(true);
      const data = await getCmrDocumentById(id);
      setCmrData(data);
      
      // Debug: Wyświetl strukturę danych CMR (można usunąć po testach)
      console.log('CMR data:', data);
      console.log('linkedOrderId:', data.linkedOrderId);
      console.log('linkedOrderIds:', data.linkedOrderIds);
      console.log('linkedOrderNumbers:', data.linkedOrderNumbers);
      
      // Pobierz dane powiązanych zamówień klienta
      const ordersToFetch = [];
      
      // Sprawdź nowy format (wiele zamówień)
      if (data.linkedOrderIds && Array.isArray(data.linkedOrderIds) && data.linkedOrderIds.length > 0) {
        ordersToFetch.push(...data.linkedOrderIds);
      }
      
      // Sprawdź stary format (pojedyncze zamówienie) - dla kompatybilności wstecznej
      if (data.linkedOrderId && !ordersToFetch.includes(data.linkedOrderId)) {
        ordersToFetch.push(data.linkedOrderId);
      }
      
      // Pobierz dane wszystkich powiązanych zamówień
      if (ordersToFetch.length > 0) {
        try {
          const orderPromises = ordersToFetch.map(orderId => getOrderById(orderId));
          const orderResults = await Promise.allSettled(orderPromises);
          
          const validOrders = orderResults
            .filter(result => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value);
          
          setLinkedOrders(validOrders);
          
          // Loguj błędy dla zamówień, których nie udało się pobrać
          orderResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              console.error(`Błąd podczas pobierania zamówienia ${ordersToFetch[index]}:`, result.reason);
            }
          });
        } catch (orderError) {
          console.error('Błąd podczas pobierania powiązanych zamówień:', orderError);
          // Nie przerywamy procesu - CMR może istnieć bez powiązanych zamówień
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentu CMR:', error);
      showError('Nie udało się pobrać dokumentu CMR');
      navigate('/inventory/cmr');
    } finally {
      setLoading(false);
    }
  };
  
  const handleEdit = () => {
    navigate(`/inventory/cmr/${id}/edit`);
  };
  
  const handleBack = () => {
    navigate('/inventory/cmr');
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleGenerateOfficialCmr = async () => {
    try {
      // Lista tła dla każdej kopii
      const backgroundTemplates = [
        'cmr-template-1.svg',
        'cmr-template-2.svg', 
        'cmr-template-3.svg',
        'cmr-template-4.svg'
      ];

      const generatedDocuments = [];

      // Pobierz główny szablon z polami formularza
      const mainTemplateResponse = await fetch('/templates/cmr-template.svg');
      if (!mainTemplateResponse.ok) {
        throw new Error('Nie udało się pobrać głównego szablonu CMR');
      }
      const mainTemplateText = await mainTemplateResponse.text();

      // Generuj każdy z 4 szablonów
      for (let i = 0; i < backgroundTemplates.length; i++) {
        const backgroundTemplateName = backgroundTemplates[i];
        const copyNumber = i + 1;

        try {
          // Pobierz szablon tła
          const bgResponse = await fetch(`/templates/cmr/${backgroundTemplateName}`);
          if (!bgResponse.ok) {
            throw new Error(`Nie udało się pobrać tła ${backgroundTemplateName}`);
          }
          const bgImageBlob = await bgResponse.blob();
          
          // Konwertuj tło na base64
          const reader = new FileReader();
          const base64BgData = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(bgImageBlob);
          });

          // Skopiuj główny szablon i zastąp tło
          let svgText = mainTemplateText;
          
          // Zastąp tło w szablonie
          svgText = svgText.replace(
            '<rect id="template-background" width="793.33331" height="1122.6667" fill="white" />',
            `<image id="template-background" href="${base64BgData}" width="793.33331" height="1122.6667" />`
          );

          // Utworz parser DOM dla SVG
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
          
          // Sprawdź, czy szablon został poprawnie sparsowany
          const parseError = svgDoc.querySelector('parsererror');
          if (parseError) {
            console.error(`Błąd parsowania SVG dla szablonu ${copyNumber}:`, parseError);
            throw new Error(`Nie udało się przetworzyć szablonu CMR ${copyNumber}`);
          }
          
          // Funkcja do dodawania tekstu do pola formularza
          const addTextToField = (svgDoc, fieldId, text, fontSize = '7px', fontWeight = 'normal') => {
            if (!text) return;
            
            // Znajdź pole formularza po ID
            const field = svgDoc.getElementById(fieldId);
            if (!field) {
              console.warn(`Nie znaleziono pola o ID: ${fieldId}`);
              return;
            }
            
            // Pobierz współrzędne i wymiary pola
            const x = parseFloat(field.getAttribute('x')) + 5;
            const y = parseFloat(field.getAttribute('y')) + 15;
            const width = parseFloat(field.getAttribute('width'));
            const height = parseFloat(field.getAttribute('height'));
            
            // Utwórz element tekstowy
            const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textElement.setAttribute('x', x);
            textElement.setAttribute('y', y);
            textElement.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
            textElement.setAttribute('font-size', fontSize);
            textElement.setAttribute('font-weight', fontWeight);
            textElement.setAttribute('fill', 'black');
            
            // Podziel tekst na linie
            const lines = text.toString().split('\n');
            
            // Dostosowanie wysokości linii w zależności od pola
            let lineHeight;
            if (fieldId === 'field-goods' || fieldId === 'field-packages' || 
                fieldId === 'field-weight' || fieldId === 'field-volume') {
              lineHeight = parseInt(fontSize) * 1.8; // Zwiększona wysokość dla wybranych pól
            } else {
              lineHeight = parseInt(fontSize) * 1.2; // Standardowa wysokość dla pozostałych pól
            }
            
            lines.forEach((line, index) => {
              // Jeśli tekst jest zbyt długi dla pola, podziel go na kilka linii
              const maxCharsPerLine = Math.floor(width / (parseInt(fontSize) * 0.6));
              let currentLine = line;
              let lineCount = 0;
              
              while (currentLine.length > 0) {
                const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                tspan.setAttribute('x', x);
                
                if (currentLine.length <= maxCharsPerLine) {
                  tspan.textContent = currentLine;
                  tspan.setAttribute('y', y + (index * lineHeight) + (lineCount * lineHeight));
                  textElement.appendChild(tspan);
                  break;
                } else {
                  // Znajdź ostatnią spację przed maxCharsPerLine
                  let cutIndex = maxCharsPerLine;
                  while (cutIndex > 0 && currentLine.charAt(cutIndex) !== ' ') {
                    cutIndex--;
                  }
                  
                  // Jeśli nie znaleziono spacji, przetnij po prostu po maxCharsPerLine znaków
                  if (cutIndex === 0) {
                    cutIndex = maxCharsPerLine;
                  }
                  
                  const linePart = currentLine.substring(0, cutIndex);
                  tspan.textContent = linePart;
                  tspan.setAttribute('y', y + (index * lineHeight) + (lineCount * lineHeight));
                  textElement.appendChild(tspan);
                  
                  currentLine = currentLine.substring(cutIndex).trim();
                  lineCount++;
                  
                  // Sprawdź, czy nie wychodzimy poza wysokość pola
                  if (y + (index * lineHeight) + (lineCount * lineHeight) > y + height) {
                    break;
                  }
                }
              }
            });
            
            // Dodaj element tekstowy do dokumentu
            const formFields = svgDoc.getElementById('form-fields');
            if (formFields) {
              formFields.appendChild(textElement);
            } else {
              console.warn('Nie znaleziono grupy form-fields w dokumencie SVG');
              svgDoc.documentElement.appendChild(textElement);
            }
          };
          
          // Funkcja do mapowania danych na pola w dokumencie
          const fillDocumentFields = (svgDoc) => {
            // Formatowanie daty w formie DD.MM.YYYY
            const formatDateSimple = (date) => {
              if (!date) return '';
              
              // Obsługa timestampu Firestore
              if (date && typeof date === 'object' && typeof date.toDate === 'function') {
                date = date.toDate();
              }
              
              let dateObj;
              if (typeof date === 'string') {
                dateObj = new Date(date);
              } else {
                dateObj = date;
              }
              
              if (isNaN(dateObj.getTime())) {
                return '';
              }
              
              const day = dateObj.getDate().toString().padStart(2, '0');
              const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
              const year = dateObj.getFullYear();
              
              return `${day}.${month}.${year}`;
            };
            
            // Mapowanie danych CMR na pola w szablonie
            
            // Dane nadawcy
            const senderText = [
              cmrData.sender,
              cmrData.senderAddress,
              `${cmrData.senderPostalCode || ''} ${cmrData.senderCity || ''}`,
              cmrData.senderCountry
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-sender', senderText, '7px');
            
            // Dane odbiorcy
            const recipientText = [
              cmrData.recipient,
              cmrData.recipientAddress
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-recipient', recipientText, '7px');
            
            // Miejsce przeznaczenia
            addTextToField(svgDoc, 'field-destination', cmrData.deliveryPlace, '7px');
            
            // Miejsce i data załadowania
            const loadingText = `${cmrData.loadingPlace || ''}\n${formatDateSimple(cmrData.loadingDate) || ''}`;
            addTextToField(svgDoc, 'field-loading-place-date', loadingText, '7px');
            
            // Miejsce wystawienia (adres z miejsca załadowania)
            addTextToField(svgDoc, 'field-issue-place-address', cmrData.loadingPlace || '', '7px');
            
            // Załączone dokumenty
            addTextToField(svgDoc, 'field-documents', cmrData.attachedDocuments, '7px');
            
            // Numery rejestracyjne (dodane w dwóch miejscach)
            const vehicleRegText = `${cmrData.vehicleInfo?.vehicleRegistration || ''} / ${cmrData.vehicleInfo?.trailerRegistration || ''}`;
            addTextToField(svgDoc, 'field-vehicle-registration', vehicleRegText, '7px');
            addTextToField(svgDoc, 'field-vehicle-registration-2', vehicleRegText, '7px');
            
            // Dane o towarach
            if (cmrData.items && cmrData.items.length > 0) {
              const items = cmrData.items;
              
              // Cechy i numery (pole 6)
              let marksText = items.map((item, index) => 
                index === 0 ? item.id || '' : '\n\n\n' + (item.id || '')
              ).join('');
              addTextToField(svgDoc, 'field-marks', marksText, '7px');
              
              // Ilość sztuk (pole 7)
              let packagesText = items.map((item, index) => 
                index === 0 ? item.quantity?.toString() || '' : '\n\n\n' + (item.quantity?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-packages', packagesText, '7px');
              
              // Sposób opakowania (pole 8)
              let packingText = items.map((item, index) => 
                index === 0 ? item.unit || '' : '\n\n\n' + (item.unit || '')
              ).join('');
              addTextToField(svgDoc, 'field-packing', packingText, '7px');
              
              // Rodzaj towaru (pole 9)
              let goodsText = items.map((item, index) => 
                index === 0 ? item.description || '' : '\n\n\n' + (item.description || '')
              ).join('');
              addTextToField(svgDoc, 'field-goods', goodsText, '7px');
              
              // Waga brutto (pole 11)
              let weightsText = items.map((item, index) => 
                index === 0 ? item.weight?.toString() || '' : '\n\n\n' + (item.weight?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-weight', weightsText, '7px');
              
              // Objętość (pole 12)
              let volumesText = items.map((item, index) => 
                index === 0 ? item.volume?.toString() || '' : '\n\n\n' + (item.volume?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-volume', volumesText, '7px');
            }
            
            // Dane przewoźnika
            const carrierText = [
              cmrData.carrier,
              cmrData.carrierAddress,
              `${cmrData.carrierPostalCode || ''} ${cmrData.carrierCity || ''}`,
              cmrData.carrierCountry
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-carrier', carrierText, '7px');
            
            // Zastrzeżenia i uwagi
            addTextToField(svgDoc, 'field-reservations', cmrData.reservations, '7px');
            
            // Instrukcje nadawcy
            addTextToField(svgDoc, 'field-instructions', cmrData.instructionsFromSender, '7px');
            
            // Postanowienia specjalne
            addTextToField(svgDoc, 'field-special-agreements', cmrData.specialAgreements, '7px');
            
            // Numer CMR w środkowej części dokumentu
            addTextToField(svgDoc, 'field-cmr-number-middle', `${cmrData.cmrNumber || ''}`, '7px', 'bold');
            
            // Informacje do zapłaty (pole payment)
            const paymentText = cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' : 
                               cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : '';
            addTextToField(svgDoc, 'field-payment', paymentText, '7px');
            addTextToField(svgDoc, 'field-payer-bottom', paymentText, '7px');
            
            // Pełny numer CMR w dolnej części
            addTextToField(svgDoc, 'field-full-cmr-number', `${cmrData.cmrNumber}`, '7px', 'bold');
            
            // Miejsce i data wystawienia
            const formatDateSimple2 = (date) => {
              if (!date) return '';
              
              // Obsługa timestampu Firestore
              if (date && typeof date === 'object' && typeof date.toDate === 'function') {
                date = date.toDate();
              }
              
              let dateObj;
              if (typeof date === 'string') {
                dateObj = new Date(date);
              } else {
                dateObj = date;
              }
              
              if (isNaN(dateObj.getTime())) {
                return '';
              }
              
              const day = dateObj.getDate().toString().padStart(2, '0');
              const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
              const year = dateObj.getFullYear();
              
              return `${day}.${month}.${year}`;
            };
            
            const issuePlaceDate = `${cmrData.issuePlace || ''} ${formatDateSimple2(cmrData.issueDate) || ''}`;
            addTextToField(svgDoc, 'field-issue-place-date', issuePlaceDate, '7px');
          };
          
          // Wypełnij pola w obecnym szablonie
          fillDocumentFields(svgDoc);
          
          // Przekształć dokument z powrotem do tekstu
          const serializer = new XMLSerializer();
          const updatedSvgString = serializer.serializeToString(svgDoc);
          
          // Dodaj do listy wygenerowanych dokumentów
          generatedDocuments.push({
            svgString: updatedSvgString,
            copyNumber: copyNumber,
            backgroundTemplate: backgroundTemplateName
          });
          
        } catch (templateError) {
          console.error(`Błąd podczas generowania szablonu ${copyNumber}:`, templateError);
          showError(`Nie udało się wygenerować kopii ${copyNumber}: ${templateError.message}`);
        }
      }
      
      // Funkcja do konwersji SVG na obraz
      const convertSvgToImage = async (svgString) => {
        return new Promise((resolve, reject) => {
          try {
            // Utwórz element Canvas
            const canvas = document.createElement('canvas');
            canvas.width = 2480;  // A4 w 300dpi
            canvas.height = 3508; // A4 w 300dpi
            const context = canvas.getContext('2d');
            
            // Utwórz tymczasowy obraz
            const img = new Image();
            
            // Obsługa zakończenia ładowania obrazu
            img.onload = function() {
              // Wyczyść kanwę i narysuj obraz
              context.fillStyle = 'white';
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(img, 0, 0, canvas.width, canvas.height);
              
              // Konwertuj Canvas do obrazu PNG
              const imgData = canvas.toDataURL('image/png');
              resolve(imgData);
            };
            
            // Obsługa błędu ładowania obrazu
            img.onerror = function(error) {
              console.error('Błąd ładowania SVG:', error);
              reject(new Error('Nie udało się załadować obrazu SVG'));
            };
            
            // Ustaw źródło obrazu na kod SVG (zakodowany Base64)
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
          } catch (error) {
            console.error('Błąd konwersji SVG:', error);
            reject(new Error('Błąd podczas konwersji SVG'));
          }
        });
      };
      
      // Przygotuj dokumenty do drukowania
      try {
        const printImages = [];
        
        // Konwertuj wszystkie dokumenty na obrazy
        for (const docData of generatedDocuments) {
          try {
            const imgData = await convertSvgToImage(docData.svgString);
            printImages.push(imgData);
          } catch (imageError) {
            console.error(`Błąd konwersji kopii ${docData.copyNumber} do obrazu:`, imageError);
          }
        }
        
        if (printImages.length === 0) {
          throw new Error('Nie udało się przygotować żadnych obrazów do drukowania');
        }
        
        // Utwórz nowe okno do drukowania
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          throw new Error('Nie udało się otworzyć okna drukowania. Sprawdź ustawienia blokowania popup.');
        }
        
        // Przygotuj HTML do drukowania
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>CMR ${cmrData.cmrNumber || 'dokument'} - Drukowanie</title>
            <style>
              @page {
                size: A4;
                margin: 0;
              }
              
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              
              body {
                font-family: Arial, sans-serif;
                background: white;
              }
              
              .page {
                width: 210mm;
                height: 297mm;
                page-break-after: always;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              
              .page:last-child {
                page-break-after: avoid;
              }
              
              .page img {
                width: 100%;
                height: 100%;
                object-fit: contain;
              }
              
              @media print {
                body {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                
                .page {
                  page-break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
            ${printImages.map((imgData, index) => `
              <div class="page">
                <img src="${imgData}" alt="CMR Kopia ${index + 1}" />
              </div>
            `).join('')}
          </body>
          </html>
        `;
        
        // Wpisz HTML do okna drukowania
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        // Poczekaj na załadowanie obrazów i uruchom drukowanie
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            
            // Opcjonalnie zamknij okno po drukowaniu (niektóre przeglądarki to robią automatycznie)
            printWindow.onafterprint = () => {
              printWindow.close();
            };
          }, 1000); // Krótkie opóźnienie aby obrazy się załadowały
        };
        
        showSuccess(`Przygotowano ${printImages.length} kopii dokumentu CMR do drukowania`);
        
      } catch (printError) {
        console.error('Błąd podczas przygotowywania do drukowania:', printError);
        showError('Nie udało się przygotować dokumentów do drukowania: ' + printError.message);
        
        // Fallback - spróbuj wygenerować PDF do pobrania
        try {
          const { jsPDF } = await import('jspdf');
          
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
          });
          
          let isFirstPage = true;
          
          for (const docData of generatedDocuments) {
            try {
              const imgData = await convertSvgToImage(docData.svgString);
              
              if (!isFirstPage) {
                pdf.addPage();
              }
              
              pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
              isFirstPage = false;
              
            } catch (imageError) {
              console.error(`Błąd konwersji kopii ${docData.copyNumber}:`, imageError);
            }
          }
          
          if (!isFirstPage) {
            pdf.save(`CMR-${cmrData.cmrNumber || 'dokument'}-wszystkie-kopie.pdf`);
            showSuccess('Wygenerowano plik PDF jako alternatywę');
          }
          
        } catch (fallbackError) {
          console.error('Błąd fallback PDF:', fallbackError);
          showError('Nie udało się przygotować dokumentów w żaden sposób');
        }
      }

    } catch (error) {
      console.error('Błąd podczas generowania dokumentu CMR:', error);
      showError('Nie udało się wygenerować dokumentu CMR: ' + error.message);
    }
  };
  
  const handleStatusChange = async (newStatus) => {
    try {
      const result = await updateCmrStatus(id, newStatus, currentUser.uid);
      
      // Sprawdź czy zmiana statusu zawiera informacje o rezerwacjach
      if (newStatus === CMR_STATUSES.IN_TRANSIT && result.reservationResult) {
        const { reservationResult } = result;
        
        let message = `Status dokumentu CMR zmieniony na: ${newStatus}.`;
        
        if (reservationResult.success) {
          message += ` Pomyślnie zarezerwowano wszystkie partie.`;
          
          if (reservationResult.reservationResults && reservationResult.reservationResults.length > 0) {
            const details = reservationResult.reservationResults.map(res => 
              `• ${res.itemName}: ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nSzczegóły rezerwacji:\n${details}`;
          }
          
          showSuccess(message);
        } else {
          message += ` Wystąpiły problemy z rezerwacją partii.`;
          
          if (reservationResult.errors && reservationResult.errors.length > 0) {
            const errorDetails = reservationResult.errors.map(err => 
              `• ${err.itemName} (partia ${err.batchNumber}): ${err.error}`
            ).join('\n');
            
            message += `\n\nBłędy:\n${errorDetails}`;
          }
          
          if (reservationResult.reservationResults && reservationResult.reservationResults.length > 0) {
            const successDetails = reservationResult.reservationResults.map(res => 
              `• ${res.itemName}: ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nPomyślne rezerwacje:\n${successDetails}`;
          }
          
          showError(message);
        }
        
        // Dodatkowe informacje o statystykach
        if (reservationResult.statistics) {
          const stats = reservationResult.statistics;
          console.log(`Statystyki rezerwacji: ${stats.successCount} sukces(ów), ${stats.errorCount} błąd(ów) z ${stats.totalAttempted} prób`);
        }
      } 
      // Sprawdź czy zmiana statusu zawiera informacje o dostarczeniu
      else if (newStatus === CMR_STATUSES.DELIVERED && result.deliveryResult) {
        const { deliveryResult } = result;
        
        let message = `Status dokumentu CMR zmieniony na: ${newStatus}.`;
        
        if (deliveryResult.success) {
          message += ` Pomyślnie przetworzono dostarczenie - anulowano rezerwacje i wydano produkty.`;
          
          if (deliveryResult.deliveryResults && deliveryResult.deliveryResults.length > 0) {
            const details = deliveryResult.deliveryResults.map(res => 
              `• ${res.itemName}: wydano ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nSzczegóły wydania:\n${details}`;
          }
          
          showSuccess(message);
        } else {
          message += ` Wystąpiły problemy podczas przetwarzania dostarczenia.`;
          
          if (deliveryResult.errors && deliveryResult.errors.length > 0) {
            const errorDetails = deliveryResult.errors.map(err => 
              `• ${err.itemName} ${err.batchNumber ? `(partia ${err.batchNumber})` : ''}: ${err.error}`
            ).join('\n');
            
            message += `\n\nBłędy:\n${errorDetails}`;
          }
          
          if (deliveryResult.deliveryResults && deliveryResult.deliveryResults.length > 0) {
            const successDetails = deliveryResult.deliveryResults.map(res => 
              `• ${res.itemName}: wydano ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nPomyślne operacje:\n${successDetails}`;
          }
          
          showError(message);
        }
        
        // Dodatkowe informacje o statystykach
        if (deliveryResult.statistics) {
          const stats = deliveryResult.statistics;
          console.log(`Statystyki dostarczenia: ${stats.successCount} sukces(ów), ${stats.errorCount} błąd(ów) z ${stats.totalAttempted} prób`);
        }
      } else {
        showSuccess(`Status dokumentu CMR zmieniony na: ${newStatus}`);
      }
      
      fetchCmrDocument();
    } catch (error) {
      console.error('Błąd podczas zmiany statusu dokumentu CMR:', error);
      showError('Nie udało się zmienić statusu dokumentu CMR: ' + error.message);
    }
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    
    try {
      let dateObj = date;
      
      // Obsługa timestampu Firestore
      if (date && typeof date === 'object' && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      }
      // Obsługa stringów
      else if (typeof date === 'string') {
        dateObj = new Date(date);
      }
      // Obsługa obiektów z sekundami (Firestore Timestamp format)
      else if (date && typeof date === 'object' && date.seconds) {
        dateObj = new Date(date.seconds * 1000);
      }
      
      // Sprawdź czy data jest poprawna
      if (isNaN(dateObj.getTime())) {
        return String(date);
      }
      
      return format(dateObj, 'dd MMMM yyyy', { locale: pl });
    } catch (e) {
      console.warn('Błąd formatowania daty:', e, date);
      return String(date);
    }
  };
  
  const renderStatusChip = (status) => {
    let color;
    switch (status) {
      case CMR_STATUSES.DRAFT:
        color = '#757575'; // szary
        break;
      case CMR_STATUSES.ISSUED:
        color = '#2196f3'; // niebieski
        break;
      case CMR_STATUSES.IN_TRANSIT:
        color = '#ff9800'; // pomarańczowy
        break;
      case CMR_STATUSES.DELIVERED:
        color = '#4caf50'; // zielony
        break;
      case CMR_STATUSES.COMPLETED:
        color = '#9c27b0'; // fioletowy
        break;
      case CMR_STATUSES.CANCELED:
        color = '#f44336'; // czerwony
        break;
      default:
        color = '#757575'; // szary
    }
    
    return (
      <Chip 
        label={status} 
        sx={{
          backgroundColor: color,
          color: 'white',
          fontWeight: 'medium'
        }}
      />
    );
  };

  const getPaymentStatusChip = (paymentStatus) => {
    const status = paymentStatus || CMR_PAYMENT_STATUSES.UNPAID;
    const label = translatePaymentStatus(status);
    let color = '#f44336'; // czerwony domyślny dla nie opłacone
    
    switch (status) {
      case CMR_PAYMENT_STATUSES.PAID:
        color = '#4caf50'; // zielony - opłacone
        break;
      case CMR_PAYMENT_STATUSES.UNPAID:
      default:
        color = '#f44336'; // czerwony - nie opłacone
        break;
    }
    
    return (
      <Chip 
        label={label} 
        size="small"
        clickable
        onClick={handlePaymentStatusClick}
        sx={{
          backgroundColor: color,
          color: 'white',
          cursor: 'pointer',
          '&:hover': {
            opacity: 0.8
          }
        }}
      />
    );
  };

  const handlePaymentStatusClick = () => {
    setNewPaymentStatus(cmrData?.paymentStatus || CMR_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updateCmrPaymentStatus(id, newPaymentStatus, currentUser.uid);
      setPaymentStatusDialogOpen(false);
      
      // Odśwież dane dokumentu CMR
      await fetchCmrDocument();
      
      showSuccess('Status płatności został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu płatności:', error);
      showError('Nie udało się zaktualizować statusu płatności');
    } finally {
      setNewPaymentStatus('');
      setPaymentStatusDialogOpen(false);
    }
  };

  const handleMigrateCmr = async () => {
    try {
      const result = await migrateCmrToNewFormat(id);
      if (result.success) {
        showSuccess(result.message);
        // Odśwież dane CMR po migracji
        fetchCmrDocument();
      }
    } catch (error) {
      console.error('Błąd podczas migracji CMR:', error);
      showError('Nie udało się zmigrować CMR do nowego formatu');
    }
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!cmrData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          Nie znaleziono dokumentu CMR o podanym identyfikatorze.
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{ mt: 2 }}
        >
          Powrót do listy
        </Button>
      </Container>
    );
  }
  
  const isEditable = cmrData.status === CMR_STATUSES.DRAFT || cmrData.status === CMR_STATUSES.ISSUED;
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <GlobalStyles>{globalPrintCss}</GlobalStyles>
      
      {/* Wersja do wyświetlania na ekranie */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }} className="no-print">
        <Box>
          <Typography variant="h5">
            Dokument CMR: {cmrData.cmrNumber}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
            Status: {renderStatusChip(cmrData.status)}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Status płatności: {getPaymentStatusChip(cmrData.paymentStatus)}
          </Typography>
        </Box>
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          flexWrap: 'wrap', 
          mt: { xs: 2, sm: 0 },
          width: { xs: '100%', sm: 'auto' } 
        }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            size="small"
            sx={{ mb: { xs: 1, sm: 0 } }}
          >
            Powrót
          </Button>
          
          {isEditable && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={handleEdit}
              size="small"
              sx={{ mb: { xs: 1, sm: 0 } }}
            >
              Edytuj
            </Button>
          )}
          
          <Button
            variant="outlined"
            startIcon={<FileCopyIcon />}
            onClick={handleGenerateOfficialCmr}
            color="primary"
            size="small"
            sx={{ mb: { xs: 1, sm: 0 } }}
          >
            Generuj oficjalny CMR
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleMigrateCmr}
            color="secondary"
            size="small"
            sx={{ mb: { xs: 1, sm: 0 } }}
          >
            Migruj CMR
          </Button>
        </Box>
      </Box>
      
      {/* Panel zmiany statusu */}
      {(isEditable || cmrData.status === CMR_STATUSES.IN_TRANSIT || cmrData.status === CMR_STATUSES.DELIVERED) && (
        <Card sx={{ mb: 3 }} className="no-print">
          <CardHeader 
            title="Zmiana statusu" 
            titleTypographyProps={{ variant: 'h6' }}
          />
          <Divider />
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {cmrData.status === CMR_STATUSES.DRAFT && (
                <Button 
                  variant="contained" 
                  color="primary"
                  onClick={() => handleStatusChange(CMR_STATUSES.ISSUED)}
                >
                  Wystaw dokument
                </Button>
              )}
              
              {cmrData.status === CMR_STATUSES.ISSUED && (
                <Button 
                  variant="contained" 
                  color="warning"
                  onClick={() => handleStatusChange(CMR_STATUSES.IN_TRANSIT)}
                >
                  Rozpocznij transport
                </Button>
              )}
              
              {cmrData.status === CMR_STATUSES.IN_TRANSIT && (
                <Button 
                  variant="contained" 
                  color="success"
                  onClick={() => handleStatusChange(CMR_STATUSES.DELIVERED)}
                >
                  Oznacz jako dostarczone
                </Button>
              )}
              
              {cmrData.status === CMR_STATUSES.DELIVERED && (
                <Button 
                  variant="contained" 
                  color="info"
                  onClick={() => handleStatusChange(CMR_STATUSES.COMPLETED)}
                >
                  Zakończ
                </Button>
              )}
              
              {(cmrData.status === CMR_STATUSES.DRAFT || 
                cmrData.status === CMR_STATUSES.ISSUED) && (
                <Button 
                  variant="contained" 
                  color="error"
                  onClick={() => handleStatusChange(CMR_STATUSES.CANCELED)}
                >
                  Anuluj
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
      
      {/* Główne informacje - wersja ekranowa */}
      <Grid container spacing={3} className="no-print">
        {/* Informacje podstawowe */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Informacje podstawowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer CMR
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.cmrNumber}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Data wystawienia
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.issueDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Data dostawy
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.deliveryDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Typ transportu
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.transportType}
                  </Typography>
                </Grid>
                
                {/* Informacje o powiązanych zamówieniach klienta */}
                {linkedOrders.length > 0 && (
                  <>
                    <Grid item xs={12}>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                        Powiązane zamówienia klienta ({linkedOrders.length})
                      </Typography>
                    </Grid>
                    {linkedOrders.map((order, index) => (
                      <Grid item xs={12} key={order.id} sx={{ mb: 1 }}>
                        <Box sx={{ 
                          border: 1, 
                          borderColor: 'divider',
                          borderRadius: 1, 
                          p: 2, 
                          backgroundColor: 'background.paper',
                          '&:hover': {
                            backgroundColor: 'action.hover'
                          }
                        }}>
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6}>
                              <Typography variant="body2" color="text.secondary">
                                Numer zamówienia
                              </Typography>
                              <Typography 
                                variant="body1" 
                                sx={{ 
                                  color: 'primary.main', 
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                  fontWeight: 'medium'
                                }}
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                {order.orderNumber}
                              </Typography>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <Typography variant="body2" color="text.secondary">
                                Klient
                              </Typography>
                              <Typography variant="body1">
                                {order.customer?.name || '-'}
                              </Typography>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <Typography variant="body2" color="text.secondary">
                                Data zamówienia
                              </Typography>
                              <Typography variant="body1">
                                {formatDate(order.orderDate)}
                              </Typography>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <Typography variant="body2" color="text.secondary">
                                Status zamówienia
                              </Typography>
                              <Chip 
                                label={order.status} 
                                size="small"
                                color={
                                  order.status === 'Dostarczone' ? 'success' :
                                  order.status === 'W realizacji' ? 'warning' :
                                  order.status === 'Anulowane' ? 'error' : 'default'
                                }
                              />
                            </Grid>
                          </Grid>
                        </Box>
                      </Grid>
                    ))}
                  </>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Strony */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Strony" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Nadawca
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.sender}
                  </Typography>
                  <Typography variant="body2">
                    {cmrData.senderAddress}
                    {cmrData.senderPostalCode && cmrData.senderCity && (
                      <>, {cmrData.senderPostalCode} {cmrData.senderCity}</>
                    )}
                    {cmrData.senderCountry && (
                      <>, {cmrData.senderCountry}</>
                    )}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Odbiorca
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.recipient}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {cmrData.recipientAddress}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Przewoźnik
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.carrier}
                  </Typography>
                  <Typography variant="body2">
                    {cmrData.carrierAddress}
                    {cmrData.carrierPostalCode && cmrData.carrierCity && (
                      <>, {cmrData.carrierPostalCode} {cmrData.carrierCity}</>
                    )}
                    {cmrData.carrierCountry && (
                      <>, {cmrData.carrierCountry}</>
                    )}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Miejsce załadunku i rozładunku */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Miejsce załadunku i rozładunku" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Miejsce załadunku
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.loadingPlace || '-'}
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Data załadunku
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.loadingDate)}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Miejsce dostawy
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.deliveryPlace || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Dokumenty i instrukcje */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Dokumenty i instrukcje" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Załączone dokumenty
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.attachedDocuments || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Instrukcje nadawcy
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.instructionsFromSender || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Informacje o pojeździe */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Informacje o pojeździe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer rejestracyjny pojazdu
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.vehicleInfo?.vehicleRegistration || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer rejestracyjny naczepy
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.vehicleInfo?.trailerRegistration || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Opłaty i płatności */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Opłaty i ustalenia szczególne" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Przewoźne
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.freight || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Koszty dodatkowe
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.carriage || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Bonifikaty
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.discounts || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Saldo
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.balance || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Płatność
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' : 
                     cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : 
                     'Inny sposób płatności'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Ustalenia szczególne
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.specialAgreements || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Zastrzeżenia i uwagi przewoźnika
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.reservations || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Elementy dokumentu CMR */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Elementy dokumentu CMR" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              {cmrData.items && cmrData.items.length > 0 ? (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Lp.</TableCell>
                        <TableCell>Opis</TableCell>
                        <TableCell>Ilość</TableCell>
                        <TableCell>Jednostka</TableCell>
                        <TableCell>Waga (kg)</TableCell>
                        <TableCell>Objętość (m³)</TableCell>
                        <TableCell>Uwagi</TableCell>
                        <TableCell>Powiązane partie</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cmrData.items.map((item, index) => (
                        <TableRow key={item.id || index}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{item.weight}</TableCell>
                          <TableCell>{item.volume}</TableCell>
                          <TableCell>{item.notes}</TableCell>
                          <TableCell>
                            {item.linkedBatches && item.linkedBatches.length > 0 ? (
                              <Box>
                                {item.linkedBatches.map((batch, batchIndex) => (
                                  <Typography key={batch.id} variant="body2" sx={{ fontSize: '0.9rem' }}>
                                    {batch.batchNumber || batch.lotNumber || 'Bez numeru'} 
                                    ({batch.quantity} {batch.unit || 'szt.'})
                                    {batchIndex < item.linkedBatches.length - 1 ? '; ' : ''}
                                  </Typography>
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" sx={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                                Brak powiązanych partii
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body1" sx={{ textAlign: 'center', py: 2 }}>
                  Brak elementów w dokumencie CMR
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        {/* Uwagi i informacje dodatkowe */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Uwagi i informacje dodatkowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Typography variant="body1">
                {cmrData.notes || 'Brak uwag'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    
      {/* Wersja do druku */}
      <Box sx={{ display: 'none' }} className="print-container">
        <Box className="print-header">
          <Typography variant="h4" gutterBottom>
            DOKUMENT CMR
          </Typography>
          <Typography variant="h5">
            {cmrData.cmrNumber}
          </Typography>
          <Typography variant="subtitle1">
            Status: {cmrData.status}
          </Typography>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Informacje podstawowe
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Numer CMR</Typography>
              <Typography className="print-value">{cmrData.cmrNumber}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Data wystawienia</Typography>
              <Typography className="print-value">{formatDate(cmrData.issueDate)}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Data dostawy</Typography>
              <Typography className="print-value">{formatDate(cmrData.deliveryDate)}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Typ transportu</Typography>
              <Typography className="print-value">{cmrData.transportType || '-'}</Typography>
            </Box>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Strony
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Nadawca</Typography>
              <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.sender}</Typography>
              <Typography className="print-value">{cmrData.senderAddress}</Typography>
              <Typography className="print-value">
                {cmrData.senderPostalCode} {cmrData.senderCity}, {cmrData.senderCountry}
              </Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Odbiorca</Typography>
              <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.recipient}</Typography>
              <Typography className="print-value" sx={{ whiteSpace: 'pre-line' }}>
                {cmrData.recipientAddress}
              </Typography>
            </Box>
          </Box>
          
          <Box sx={{ mt: 3 }}>
            <Typography className="print-label">Przewoźnik</Typography>
            <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.carrier}</Typography>
            <Typography className="print-value">{cmrData.carrierAddress}</Typography>
            <Typography className="print-value">
              {cmrData.carrierPostalCode} {cmrData.carrierCity}, {cmrData.carrierCountry}
            </Typography>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Miejsce załadunku i rozładunku
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Miejsce załadunku</Typography>
              <Typography className="print-value">{cmrData.loadingPlace || '-'}</Typography>
              <Typography className="print-label" sx={{ mt: 1 }}>Data załadunku</Typography>
              <Typography className="print-value">{formatDate(cmrData.loadingDate)}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Miejsce dostawy</Typography>
              <Typography className="print-value">{cmrData.deliveryPlace || '-'}</Typography>
            </Box>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Informacje o pojeździe
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Numer rejestracyjny pojazdu</Typography>
              <Typography className="print-value">{cmrData.vehicleInfo?.vehicleRegistration || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Numer rejestracyjny naczepy</Typography>
              <Typography className="print-value">{cmrData.vehicleInfo?.trailerRegistration || '-'}</Typography>
            </Box>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Elementy dokumentu CMR
          </Typography>
          
          {cmrData.items && cmrData.items.length > 0 ? (
            <Table className="print-table">
              <TableHead>
                <TableRow>
                  <TableCell>Lp.</TableCell>
                  <TableCell>Opis</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell>Waga (kg)</TableCell>
                  <TableCell>Objętość (m³)</TableCell>
                  <TableCell>Uwagi</TableCell>
                  <TableCell>Powiązane partie</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cmrData.items.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{item.weight}</TableCell>
                    <TableCell>{item.volume}</TableCell>
                    <TableCell>{item.notes}</TableCell>
                    <TableCell>
                      {item.linkedBatches && item.linkedBatches.length > 0 ? (
                        <Box>
                          {item.linkedBatches.map((batch, batchIndex) => (
                            <Typography key={batch.id} variant="body2" sx={{ fontSize: '0.9rem' }}>
                              {batch.batchNumber || batch.lotNumber || 'Bez numeru'} 
                              ({batch.quantity} {batch.unit || 'szt.'})
                              {batchIndex < item.linkedBatches.length - 1 ? '; ' : ''}
                            </Typography>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                          Brak powiązanych partii
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body1" sx={{ textAlign: 'center', py: 2 }}>
              Brak elementów w dokumencie CMR
            </Typography>
          )}
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Opłaty i ustalenia szczególne
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Przewoźne</Typography>
              <Typography className="print-value">{cmrData.freight || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Koszty dodatkowe</Typography>
              <Typography className="print-value">{cmrData.carriage || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Bonifikaty</Typography>
              <Typography className="print-value">{cmrData.discounts || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Saldo</Typography>
              <Typography className="print-value">{cmrData.balance || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Płatność</Typography>
              <Typography className="print-value">
                {cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' : 
                 cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : 
                 'Inny sposób płatności'}
              </Typography>
            </Box>
          </Box>
          
          <Box sx={{ mt: 3 }}>
            <Typography className="print-label">Ustalenia szczególne</Typography>
            <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
              {cmrData.specialAgreements || '-'}
            </Typography>
          </Box>
          
          <Box sx={{ mt: 3 }}>
            <Typography className="print-label">Zastrzeżenia i uwagi przewoźnika</Typography>
            <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
              {cmrData.reservations || '-'}
            </Typography>
          </Box>
        </Box>
        
        {cmrData.notes && (
          <Box className="print-section">
            <Typography variant="h6" className="print-section-title">
              Uwagi i informacje dodatkowe
            </Typography>
            <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
              {cmrData.notes}
            </Typography>
          </Box>
        )}
        
        <Box className="print-footer">
          <Box className="print-signature">
            <Typography variant="body2">Podpis nadawcy</Typography>
          </Box>
          <Box className="print-signature">
            <Typography variant="body2">Podpis przewoźnika</Typography>
          </Box>
          <Box className="print-signature">
            <Typography variant="body2">Podpis odbiorcy</Typography>
          </Box>
        </Box>
      </Box>

      {/* Dialog zmiany statusu płatności */}
      <Dialog
        open={paymentStatusDialogOpen}
        onClose={() => setPaymentStatusDialogOpen(false)}
      >
        <DialogTitle>Zmień status płatności</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status płatności dokumentu CMR:
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Status płatności</InputLabel>
            <Select
              value={newPaymentStatus}
              onChange={(e) => setNewPaymentStatus(e.target.value)}
              label="Status płatności"
            >
              <MenuItem value={CMR_PAYMENT_STATUSES.UNPAID}>
                {translatePaymentStatus(CMR_PAYMENT_STATUSES.UNPAID)}
              </MenuItem>
              <MenuItem value={CMR_PAYMENT_STATUSES.PAID}>
                {translatePaymentStatus(CMR_PAYMENT_STATUSES.PAID)}
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handlePaymentStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CmrDetailsPage; 