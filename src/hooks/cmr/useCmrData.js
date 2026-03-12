import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import {
  getCmrDocumentById,
  CMR_STATUSES,
  migrateCmrToNewFormat,
  updateCmrDocument
} from '../../services/logistics';
import { getOrderById } from '../../services/orders';
import {
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { logger } from '../../utils/logger';

export function useCmrData(id, calculateItemsWeightDetails) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('cmr');

  const [loading, setLoading] = useState(true);
  const [cmrData, setCmrData] = useState(null);
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [loadingFormResponses, setLoadingFormResponses] = useState([]);
  const [loadingFormResponsesLoading, setLoadingFormResponsesLoading] = useState(false);

  useEffect(() => {
    fetchCmrDocument();
  }, [id]);

  const fetchLoadingFormResponses = async (cmrNumber) => {
    if (!cmrNumber) return;

    setLoadingFormResponsesLoading(true);
    try {
      logger.log('🔍 Searching for loading forms with CMR number:', cmrNumber);

      const cmrVariants = [
        cmrNumber,
        cmrNumber.replace('CMR ', ''),
        cmrNumber.replace(' COR', ''),
        cmrNumber.replace('CMR ', '').replace(' COR', ''),
        `CMR ${cmrNumber}`,
      ].filter((variant, index, array) => array.indexOf(variant) === index);

      logger.log('🔍 Checking CMR variants:', cmrVariants);

      const loadingQuery = query(
        collection(db, 'Forms/ZaladunekTowaru/Odpowiedzi'),
        where('cmrNumber', 'in', cmrVariants)
      );
      const loadingSnapshot = await getDocs(loadingQuery);

      logger.log(`📄 Found ${loadingSnapshot.docs.length} loading form responses for variants:`, cmrVariants);

      let loadingData = loadingSnapshot.docs.map(doc => {
        const data = doc.data();
        logger.log('📝 Processing document:', doc.id, 'with CMR:', data.cmrNumber);
        return {
          id: doc.id,
          ...data,
          fillDate: data.fillDate?.toDate(),
          loadingDate: data.loadingDate?.toDate(),
          formType: 'loading'
        };
      });

      if (loadingData.length === 0) {
        logger.log('🔍 No results found for any variant. Let me check all CMR numbers in the collection...');
        const allDocsQuery = query(collection(db, 'Forms/ZaladunekTowaru/Odpowiedzi'));
        const allDocsSnapshot = await getDocs(allDocsQuery);
        logger.log('📋 All CMR numbers in collection:');
        allDocsSnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          logger.log(`${index + 1}. CMR: "${data.cmrNumber}" (type: ${typeof data.cmrNumber})`);
        });
      }

      const sortByFillDate = (a, b) => {
        const dateA = a.fillDate || new Date(0);
        const dateB = b.fillDate || new Date(0);
        return new Date(dateB) - new Date(dateA);
      };

      setLoadingFormResponses(loadingData.sort(sortByFillDate));
      logger.log('✅ Set', loadingData.length, 'loading form responses');
    } catch (error) {
      console.error('Błąd podczas pobierania odpowiedzi formularzy załadunku:', error);
      setLoadingFormResponses([]);
    } finally {
      setLoadingFormResponsesLoading(false);
    }
  };

  const fetchCmrDocument = async () => {
    try {
      setLoading(true);
      const data = await getCmrDocumentById(id);
      setCmrData(data);

      if (data && data.items && data.items.length > 0) {
        await calculateItemsWeightDetails(data.items);
      }

      if (data && data.cmrNumber) {
        logger.log('🚛 CMR Document loaded with number:', data.cmrNumber, '(type:', typeof data.cmrNumber, ')');
        fetchLoadingFormResponses(data.cmrNumber);
      } else {
        logger.log('❌ No CMR number found in document data:', data);
      }

      logger.log('CMR data:', data);
      logger.log('linkedOrderId:', data.linkedOrderId);
      logger.log('linkedOrderIds:', data.linkedOrderIds);
      logger.log('linkedOrderNumbers:', data.linkedOrderNumbers);

      const ordersToFetch = [];

      if (data.linkedOrderIds && Array.isArray(data.linkedOrderIds) && data.linkedOrderIds.length > 0) {
        ordersToFetch.push(...data.linkedOrderIds);
      }

      if (data.linkedOrderId && !ordersToFetch.includes(data.linkedOrderId)) {
        ordersToFetch.push(data.linkedOrderId);
      }

      if (ordersToFetch.length > 0) {
        try {
          const orderPromises = ordersToFetch.map(orderId => getOrderById(orderId));
          const orderResults = await Promise.allSettled(orderPromises);

          const validOrders = orderResults
            .filter(result => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value);

          setLinkedOrders(validOrders);

          orderResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              console.error(`Błąd podczas pobierania zamówienia ${ordersToFetch[index]}:`, result.reason);
            }
          });
        } catch (orderError) {
          console.error('Błąd podczas pobierania powiązanych zamówień:', orderError);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentu CMR:', error);
      showError(t('details.errors.loadingDocument'));
      navigate('/inventory/cmr');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';

    try {
      let dateObj = date;

      if (date && typeof date === 'object' && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (typeof date === 'string') {
        dateObj = new Date(date);
      } else if (date && typeof date === 'object' && date.seconds) {
        dateObj = new Date(date.seconds * 1000);
      }

      if (isNaN(dateObj.getTime())) {
        return String(date);
      }

      return format(dateObj, 'dd MMMM yyyy', { locale: pl });
    } catch (e) {
      logger.warn('Błąd formatowania daty:', e, date);
      return String(date);
    }
  };

  const handleMigrateCmr = async () => {
    try {
      const result = await migrateCmrToNewFormat(id);
      if (result.success) {
        showSuccess(result.message);
        fetchCmrDocument();
      }
    } catch (error) {
      console.error('Błąd podczas migracji CMR:', error);
      showError('Nie udało się zmigrować CMR do nowego formatu');
    }
  };

  const handleGenerateOfficialCmr = async () => {
    try {
      const backgroundTemplates = [
        'cmr-template-1.svg',
        'cmr-template-2.svg',
        'cmr-template-3.svg',
        'cmr-template-4.svg'
      ];

      const generatedDocuments = [];

      const mainTemplateResponse = await fetch('/templates/cmr-template.svg');
      if (!mainTemplateResponse.ok) {
        throw new Error('Nie udało się pobrać głównego szablonu CMR');
      }
      const mainTemplateText = await mainTemplateResponse.text();

      for (let i = 0; i < backgroundTemplates.length; i++) {
        const backgroundTemplateName = backgroundTemplates[i];
        const copyNumber = i + 1;

        try {
          const bgResponse = await fetch(`/templates/cmr/${backgroundTemplateName}`);
          if (!bgResponse.ok) {
            throw new Error(`Nie udało się pobrać tła ${backgroundTemplateName}`);
          }
          const bgImageBlob = await bgResponse.blob();

          const reader = new FileReader();
          const base64BgData = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(bgImageBlob);
          });

          let svgText = mainTemplateText;

          svgText = svgText.replace(
            '<rect id="template-background" width="793.33331" height="1122.6667" fill="white" />',
            `<image id="template-background" href="${base64BgData}" width="793.33331" height="1122.6667" />`
          );

          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

          const parseError = svgDoc.querySelector('parsererror');
          if (parseError) {
            console.error(`Błąd parsowania SVG dla szablonu ${copyNumber}:`, parseError);
            throw new Error(`Nie udało się przetworzyć szablonu CMR ${copyNumber}`);
          }

          const addTextToField = (svgDoc, fieldId, text, fontSize = '7px', fontWeight = 'normal') => {
            if (!text) return;

            const field = svgDoc.getElementById(fieldId);
            if (!field) {
              logger.warn(`Nie znaleziono pola o ID: ${fieldId}`);
              return;
            }

            const x = parseFloat(field.getAttribute('x')) + 5;
            const y = parseFloat(field.getAttribute('y')) + 15;
            const width = parseFloat(field.getAttribute('width'));
            const height = parseFloat(field.getAttribute('height'));

            const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textElement.setAttribute('x', x);
            textElement.setAttribute('y', y);
            textElement.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
            textElement.setAttribute('font-size', fontSize);
            textElement.setAttribute('font-weight', fontWeight);
            textElement.setAttribute('fill', 'black');

            const lines = text.toString().split('\n');

            let lineHeight;
            if (fieldId === 'field-goods' || fieldId === 'field-packages' ||
                fieldId === 'field-weight' || fieldId === 'field-volume' ||
                fieldId === 'field-statistical-number' || fieldId === 'field-marks' ||
                fieldId === 'field-packing') {
              lineHeight = parseInt(fontSize) * 1.6;
            } else {
              lineHeight = parseInt(fontSize) * 1.2;
            }

            lines.forEach((line, index) => {
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
                  let cutIndex = maxCharsPerLine;
                  while (cutIndex > 0 && currentLine.charAt(cutIndex) !== ' ') {
                    cutIndex--;
                  }

                  if (cutIndex === 0) {
                    cutIndex = maxCharsPerLine;
                  }

                  const linePart = currentLine.substring(0, cutIndex);
                  tspan.textContent = linePart;
                  tspan.setAttribute('y', y + (index * lineHeight) + (lineCount * lineHeight));
                  textElement.appendChild(tspan);

                  currentLine = currentLine.substring(cutIndex).trim();
                  lineCount++;

                  if (y + (index * lineHeight) + (lineCount * lineHeight) > y + height) {
                    break;
                  }
                }
              }
            });

            const formFields = svgDoc.getElementById('form-fields');
            if (formFields) {
              formFields.appendChild(textElement);
            } else {
              logger.warn('Nie znaleziono grupy form-fields w dokumencie SVG');
              svgDoc.documentElement.appendChild(textElement);
            }
          };

          const fillDocumentFields = (svgDoc) => {
            const formatDateSimple = (date) => {
              if (!date) return '';
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

            const senderText = [
              cmrData.sender,
              cmrData.senderAddress,
              `${cmrData.senderPostalCode || ''} ${cmrData.senderCity || ''}`,
              cmrData.senderCountry
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-sender', senderText, '7px');

            const recipientText = [
              cmrData.recipient,
              cmrData.recipientAddress
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-recipient', recipientText, '7px');

            addTextToField(svgDoc, 'field-destination', cmrData.deliveryPlace, '7px');

            const loadingText = `${cmrData.loadingPlace || ''}\n${formatDateSimple(cmrData.loadingDate) || ''}`;
            addTextToField(svgDoc, 'field-loading-place-date', loadingText, '7px');

            addTextToField(svgDoc, 'field-issue-place-address', cmrData.loadingPlace || '', '7px');

            addTextToField(svgDoc, 'field-documents', cmrData.attachedDocuments, '7px');

            const vehicleRegText = `${cmrData.vehicleInfo?.vehicleRegistration || ''} / ${cmrData.vehicleInfo?.trailerRegistration || ''}`;
            addTextToField(svgDoc, 'field-vehicle-registration', vehicleRegText, '7px');
            addTextToField(svgDoc, 'field-vehicle-registration-2', vehicleRegText, '7px');

            if (cmrData.items && cmrData.items.length > 0) {
              const items = cmrData.items;

              let marksText = items.map((item, index) =>
                index === 0 ? item.id || '' : '\n\n' + (item.id || '')
              ).join('');
              addTextToField(svgDoc, 'field-marks', marksText, '6px');

              let packagesText = items.map((item, index) =>
                index === 0 ? item.quantity?.toString() || '' : '\n\n' + (item.quantity?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-packages', packagesText, '6px');

              const packagesField = svgDoc.getElementById('field-packages');
              if (packagesField) {
                const baseX = parseFloat(packagesField.getAttribute('x')) + 5;
                const baseY = parseFloat(packagesField.getAttribute('y')) + 15;
                const itemLineHeight = parseInt('6') * 1.6;

                items.forEach((item, index) => {
                  if (!item.orderItemTotalQuantity) return;
                  const contextText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                  contextText.setAttribute('x', baseX);
                  contextText.setAttribute('y', baseY + (index * 2 * itemLineHeight) + itemLineHeight);
                  contextText.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
                  contextText.setAttribute('font-size', '4.5px');
                  contextText.setAttribute('font-style', 'italic');
                  contextText.setAttribute('fill', '#555');
                  contextText.textContent = `(z ${item.orderItemTotalQuantity} zam.)`;
                  const formFields = svgDoc.getElementById('form-fields');
                  if (formFields) formFields.appendChild(contextText);
                });
              }

              let packingText = items.map((item, index) =>
                index === 0 ? item.unit || '' : '\n\n' + (item.unit || '')
              ).join('');
              addTextToField(svgDoc, 'field-packing', packingText, '6px');

              let goodsText = items.map((item, index) =>
                index === 0 ? item.description || '' : '\n\n' + (item.description || '')
              ).join('');
              addTextToField(svgDoc, 'field-goods', goodsText, '6px');

              let statisticalNumberText = items.map((item, index) => {
                let coNumber = '';
                if (item.originalOrderItem && item.originalOrderItem.orderNumber) {
                  coNumber = item.originalOrderItem.orderNumber;
                } else if (item.orderNumber) {
                  coNumber = item.orderNumber;
                } else {
                  if (cmrData.linkedOrderNumbers && cmrData.linkedOrderNumbers.length > 0) {
                    coNumber = cmrData.linkedOrderNumbers[0];
                  } else if (cmrData.linkedOrders && cmrData.linkedOrders.length > 0) {
                    coNumber = cmrData.linkedOrders[0].orderNumber || '';
                  }
                }
                logger.log(`CMR pozycja ${index + 1}: towar="${item.description}", CO="${coNumber}"`);
                return index === 0 ? coNumber : '\n\n' + coNumber;
              }).join('');
              addTextToField(svgDoc, 'field-statistical-number', statisticalNumberText, '6.5px');

              let weightsText = items.map((item, index) =>
                index === 0 ? item.weight?.toString() || '' : '\n\n' + (item.weight?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-weight', weightsText, '6.5px');

              let volumesText = items.map((item, index) =>
                index === 0 ? item.volume?.toString() || '' : '\n\n' + (item.volume?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-volume', volumesText, '6.5px');
            }

            const carrierText = [
              cmrData.carrier,
              cmrData.carrierAddress,
              `${cmrData.carrierPostalCode || ''} ${cmrData.carrierCity || ''}`,
              cmrData.carrierCountry
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-carrier', carrierText, '7px');

            addTextToField(svgDoc, 'field-reservations', cmrData.reservations, '7px');
            addTextToField(svgDoc, 'field-instructions', cmrData.instructionsFromSender, '7px');
            addTextToField(svgDoc, 'field-special-agreements', cmrData.specialAgreements, '7px');
            addTextToField(svgDoc, 'field-cmr-number-middle', `${cmrData.cmrNumber || ''}`, '7px', 'bold');

            const paymentText = cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' :
                               cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : '';
            addTextToField(svgDoc, 'field-payment', paymentText, '7px');
            addTextToField(svgDoc, 'field-payer-bottom', paymentText, '7px');

            addTextToField(svgDoc, 'field-full-cmr-number', `${cmrData.cmrNumber}`, '7px', 'bold');

            const formatDateSimple2 = (date) => {
              if (!date) return '';
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

          fillDocumentFields(svgDoc);

          const serializer = new XMLSerializer();
          const updatedSvgString = serializer.serializeToString(svgDoc);

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

      const convertSvgToImage = async (svgString, options = {}) => {
        return new Promise((resolve, reject) => {
          try {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isTablet = /iPad|Android(?=.*Mobile)/i.test(navigator.userAgent);

            let dpi;
            if (isMobile && !isTablet) {
              dpi = 150;
            } else if (isTablet) {
              dpi = 180;
            } else {
              dpi = 200;
            }

            if (options.dpi) {
              dpi = options.dpi;
            }

            const pxPerMm = dpi / 25.4;
            const canvasWidth = Math.round(210 * pxPerMm);
            const canvasHeight = Math.round(297 * pxPerMm);

            logger.log(`CMR PDF Optymalizacja: Urządzenie: ${isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'}, DPI: ${dpi}, Rozmiar: ${canvasWidth}x${canvasHeight}`);

            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const context = canvas.getContext('2d');

            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';

            const img = new Image();

            img.onload = function() {
              context.fillStyle = 'white';
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(img, 0, 0, canvas.width, canvas.height);

              let quality;
              if (isMobile && !isTablet) {
                quality = 0.75;
              } else if (isTablet) {
                quality = 0.85;
              } else {
                quality = 0.90;
              }

              if (options.quality) {
                quality = options.quality;
              }

              const imgData = canvas.toDataURL('image/jpeg', quality);

              const originalSize = Math.round(canvasWidth * canvasHeight * 4 / 1024 / 1024);
              logger.log(`CMR PDF: Optymalizacja zakończona. Szacowany rozmiar przed kompresją: ~${originalSize}MB, Jakość JPEG: ${Math.round(quality * 100)}%`);

              resolve(imgData);
            };

            img.onerror = function(error) {
              console.error('Błąd ładowania SVG:', error);
              reject(new Error('Nie udało się załadować obrazu SVG'));
            };

            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
          } catch (error) {
            console.error('Błąd konwersji SVG:', error);
            reject(new Error('Błąd podczas konwersji SVG'));
          }
        });
      };

      const pdfOptimizationOptions = {};

      try {
        const printImages = [];

        logger.log(`🔄 CMR PDF: Rozpoczynam konwersję ${generatedDocuments.length} dokumentów z optymalizacją dla urządzeń mobilnych`);

        for (let i = 0; i < generatedDocuments.length; i++) {
          const docData = generatedDocuments[i];
          try {
            logger.log(`📄 CMR PDF: Konwersja kopii ${docData.copyNumber} (${i + 1}/${generatedDocuments.length})`);
            const imgData = await convertSvgToImage(docData.svgString, pdfOptimizationOptions);
            printImages.push(imgData);
          } catch (imageError) {
            console.error(`❌ Błąd konwersji kopii ${docData.copyNumber} do obrazu:`, imageError);
          }
        }

        logger.log(`✅ CMR PDF: Konwersja zakończona. Przygotowano ${printImages.length} obrazów`);

        if (printImages.length > 0) {
          const estimatedSizePerImage = printImages[0].length / 1024 / 1024;
          const totalEstimatedSize = estimatedSizePerImage * printImages.length;
          logger.log(`📊 CMR PDF: Szacowany rozmiar po optymalizacji: ~${totalEstimatedSize.toFixed(1)}MB (${estimatedSizePerImage.toFixed(1)}MB na stronę)`);
        }

        if (printImages.length === 0) {
          throw new Error('Nie udało się przygotować żadnych obrazów do drukowania');
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          throw new Error('Nie udało się otworzyć okna drukowania. Sprawdź ustawienia blokowania popup.');
        }

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

        printWindow.document.write(htmlContent);
        printWindow.document.close();

        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            printWindow.onafterprint = () => {
              printWindow.close();
            };
          }, 1000);
        };

        showSuccess(`✅ Przygotowano ${printImages.length} kopii dokumentu CMR do drukowania (zoptymalizowano dla urządzeń mobilnych)`);

      } catch (printError) {
        console.error('Błąd podczas przygotowywania do drukowania:', printError);
        showError('Nie udało się przygotować dokumentów do drukowania: ' + printError.message);

        try {
          const { jsPDF } = await import('jspdf');

          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true,
            precision: 2
          });

          let isFirstPage = true;

          logger.log(`🔄 CMR PDF Fallback: Generowanie PDF z ${generatedDocuments.length} stronami z optymalizacją`);

          for (let i = 0; i < generatedDocuments.length; i++) {
            const docData = generatedDocuments[i];
            try {
              logger.log(`📄 CMR PDF Fallback: Przetwarzanie kopii ${docData.copyNumber} (${i + 1}/${generatedDocuments.length})`);
              const imgData = await convertSvgToImage(docData.svgString, pdfOptimizationOptions);

              if (!isFirstPage) {
                pdf.addPage();
              }

              pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
              isFirstPage = false;

            } catch (imageError) {
              console.error(`❌ Błąd konwersji kopii ${docData.copyNumber}:`, imageError);
            }
          }

          if (!isFirstPage) {
            pdf.save(`CMR-${cmrData.cmrNumber || 'dokument'}-wszystkie-kopie.pdf`);
            showSuccess('✅ Wygenerowano zoptymalizowany plik PDF (rozmiar zmniejszony z ~160MB do ~3-12MB)');
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

  const isEditable = cmrData?.status === CMR_STATUSES.DRAFT || cmrData?.status === CMR_STATUSES.ISSUED || cmrData?.status === CMR_STATUSES.COMPLETED;

  return {
    cmrData,
    setCmrData,
    loading,
    linkedOrders,
    loadingFormResponses,
    loadingFormResponsesLoading,
    fetchCmrDocument,
    formatDate,
    handleGenerateOfficialCmr,
    handleMigrateCmr,
    isEditable,
    navigate,
    currentUser,
    showSuccess,
    showError,
    t
  };
}
