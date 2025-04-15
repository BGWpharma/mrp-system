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
  styled
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getCmrDocumentById, 
  updateCmrStatus, 
  CMR_STATUSES 
} from '../../../services/cmrService';

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
  
  useEffect(() => {
    fetchCmrDocument();
  }, [id]);
  
  const fetchCmrDocument = async () => {
    try {
      setLoading(true);
      const data = await getCmrDocumentById(id);
      setCmrData(data);
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
      // Pobierz szablon SVG z polami formularza
      const response = await fetch('/templates/cmr-template.svg');
      if (!response.ok) {
        throw new Error('Nie udało się pobrać szablonu CMR');
      }
      let svgText = await response.text();
      
      // Pobierz obrazek tła jako dane binarne
      try {
        const bgImageResponse = await fetch('/templates/cmr-wzor-original.svg');
        if (bgImageResponse.ok) {
          const bgImageBlob = await bgImageResponse.blob();
          
          // Konwertuj plik SVG tła na dane base64
          const reader = new FileReader();
          const base64Data = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(bgImageBlob);
          });
          
          // Zastąp tło w szablonie obrazem base64
          svgText = svgText.replace(
            /<rect id="template-background"[^>]*\/>/,
            `<image href="${base64Data}" width="793.33331" height="1122.6667" />`
          );
        }
      } catch (bgError) {
        console.error('Błąd podczas pobierania obrazu tła:', bgError);
        // Kontynuuj nawet bez tła, sama treść dokumentu jest ważniejsza
      }
      
      // Utworzenie parsera DOM
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      
      // Sprawdź, czy szablon został poprawnie sparsowany
      const parseError = svgDoc.querySelector('parsererror');
      if (parseError) {
        console.error('Błąd parsowania SVG:', parseError);
        throw new Error('Nie udało się przetworzyć szablonu CMR');
      }
      
      // Funkcja do dodawania tekstu do pola formularza
      const addTextToField = (fieldId, text, fontSize = '12px', fontWeight = 'normal') => {
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
        const lineHeight = parseInt(fontSize) * 1.2;
        
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
      addTextToField('field-sender', senderText, '10px');
      
      // Dane odbiorcy
      const recipientText = [
        cmrData.recipient,
        cmrData.recipientAddress,
        `${cmrData.recipientPostalCode || ''} ${cmrData.recipientCity || ''}`,
        cmrData.recipientCountry
      ].filter(Boolean).join('\n');
      addTextToField('field-recipient', recipientText, '10px');
      
      // Miejsce przeznaczenia
      addTextToField('field-destination', cmrData.deliveryPlace, '10px');
      
      // Miejsce i data załadowania
      const loadingText = `${cmrData.loadingPlace || ''}\n${formatDateSimple(cmrData.loadingDate) || ''}`;
      addTextToField('field-loading-place-date', loadingText, '10px');
      
      // Załączone dokumenty
      addTextToField('field-documents', cmrData.attachedDocuments, '10px');
      
      // Numery rejestracyjne (dodane w dwóch miejscach)
      const vehicleRegText = `${cmrData.vehicleInfo?.vehicleRegistration || ''} / ${cmrData.vehicleInfo?.trailerRegistration || ''}`;
      addTextToField('field-vehicle-registration', vehicleRegText, '10px');
      addTextToField('field-vehicle-registration-2', vehicleRegText, '10px');
      
      // Dane o towarach
      if (cmrData.items && cmrData.items.length > 0) {
        const items = cmrData.items;
        
        // Cechy i numery
        let marksText = items.map(item => item.id || '').join(", ");
        addTextToField('field-marks', marksText, '10px');
        
        // Ilość sztuk
        let packagesText = items.map(item => item.quantity?.toString() || '').join(", ");
        addTextToField('field-packages', packagesText, '10px');
        
        // Sposób opakowania
        let packingText = items.map(item => item.unit || '').join(", ");
        addTextToField('field-packing', packingText, '10px');
        
        // Rodzaj towaru
        let goodsText = items.map(item => item.description || '').join(", ");
        addTextToField('field-goods', goodsText, '10px');
        
        // Waga brutto
        let totalWeight = items.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
        addTextToField('field-weight', totalWeight.toString(), '10px');
        
        // Objętość
        let totalVolume = items.reduce((sum, item) => sum + (parseFloat(item.volume) || 0), 0);
        addTextToField('field-volume', totalVolume.toString(), '10px');
      }
      
      // Dane przewoźnika
      const carrierText = [
        cmrData.carrier,
        cmrData.carrierAddress,
        `${cmrData.carrierPostalCode || ''} ${cmrData.carrierCity || ''}`,
        cmrData.carrierCountry
      ].filter(Boolean).join('\n');
      addTextToField('field-carrier', carrierText, '10px');
      
      // Zastrzeżenia i uwagi
      addTextToField('field-reservations', cmrData.reservations, '10px');
      
      // Instrukcje nadawcy
      addTextToField('field-instructions', cmrData.instructionsFromSender, '10px');
      
      // Postanowienia specjalne
      addTextToField('field-special-agreements', cmrData.specialAgreements, '10px');
      
      // Numer CMR w środkowej części dokumentu
      addTextToField('field-cmr-number-middle', `${cmrData.cmrNumber || ''}`, '10px', 'bold');
      
      // Informacje do zapłaty (pole payment)
      const paymentText = cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' : 
                         cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : '';
      addTextToField('field-payment', paymentText, '10px');
      addTextToField('field-payer-bottom', paymentText, '10px');
      
      // Pełny numer CMR w dolnej części
      addTextToField('field-full-cmr-number', `CMR-${cmrData.cmrNumber}`, '10px', 'bold');
      
      // Miejsce i data wystawienia
      const issuePlaceDate = `${cmrData.issuePlace || ''} ${formatDateSimple(cmrData.issueDate) || ''}`;
      addTextToField('field-issue-place-date', issuePlaceDate, '10px');
      
      // Przekształć dokument z powrotem do tekstu
      const serializer = new XMLSerializer();
      const updatedSvgString = serializer.serializeToString(svgDoc);
      
      // Konwertuj SVG na obraz za pomocą biblioteki Canvas
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
      
      try {
        // Konwertuj SVG na PNG a następnie pobierz plik
        const imgData = await convertSvgToImage(updatedSvgString);
        
        // Utwórz link do pobrania
        const downloadLink = document.createElement('a');
        downloadLink.href = imgData;
        downloadLink.download = `CMR-${cmrData.cmrNumber || 'dokument'}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        showSuccess('Wygenerowano oficjalny dokument CMR');
      } catch (error) {
        console.error('Błąd konwersji dokumentu:', error);
        
        // Jeśli konwersja na PNG nie powiodła się, spróbuj zapisać jako SVG
        const blob = new Blob([updatedSvgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `CMR-${cmrData.cmrNumber || 'dokument'}.svg`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        URL.revokeObjectURL(url);
        
        showSuccess('Wygenerowano dokument CMR w formacie SVG');
      }
    } catch (error) {
      console.error('Błąd podczas generowania dokumentu CMR:', error);
      showError('Nie udało się wygenerować dokumentu CMR: ' + error.message);
    }
  };
  
  const handleStatusChange = async (newStatus) => {
    try {
      await updateCmrStatus(id, newStatus, currentUser.uid);
      showSuccess(`Status dokumentu CMR zmieniony na: ${newStatus}`);
      fetchCmrDocument();
    } catch (error) {
      console.error('Błąd podczas zmiany statusu dokumentu CMR:', error);
      showError('Nie udało się zmienić statusu dokumentu CMR');
    }
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(date, 'dd MMMM yyyy', { locale: pl });
    } catch (e) {
      return String(date);
    }
  };
  
  const renderStatusChip = (status) => {
    let color;
    switch (status) {
      case CMR_STATUSES.DRAFT:
        color = 'default';
        break;
      case CMR_STATUSES.ISSUED:
        color = 'primary';
        break;
      case CMR_STATUSES.IN_TRANSIT:
        color = 'warning';
        break;
      case CMR_STATUSES.DELIVERED:
        color = 'success';
        break;
      case CMR_STATUSES.COMPLETED:
        color = 'info';
        break;
      case CMR_STATUSES.CANCELED:
        color = 'error';
        break;
      default:
        color = 'default';
    }
    
    return <Chip label={status} color={color} />;
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
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }} className="no-print">
        <Box>
          <Typography variant="h5">
            Dokument CMR: {cmrData.cmrNumber}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Status: {renderStatusChip(cmrData.status)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
          >
            Powrót
          </Button>
          
          {isEditable && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={handleEdit}
            >
              Edytuj
            </Button>
          )}
          
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
          >
            Drukuj
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<FileCopyIcon />}
            onClick={handleGenerateOfficialCmr}
            color="primary"
          >
            Generuj oficjalny CMR
          </Button>
        </Box>
      </Box>
      
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
                  <Typography variant="body2">
                    {cmrData.recipientAddress}
                    {cmrData.recipientPostalCode && cmrData.recipientCity && (
                      <>, {cmrData.recipientPostalCode} {cmrData.recipientCity}</>
                    )}
                    {cmrData.recipientCountry && (
                      <>, {cmrData.recipientCountry}</>
                    )}
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
              <Typography className="print-value">{cmrData.recipientAddress}</Typography>
              <Typography className="print-value">
                {cmrData.recipientPostalCode} {cmrData.recipientCity}, {cmrData.recipientCountry}
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
      
      {/* Akcje zmiany statusu - tylko na ekranie */}
        {isEditable && (
        <Grid item xs={12} className="no-print">
            <Card>
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
                      Oznacz jako dostarczony
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
          </Grid>
        )}
    </Container>
  );
};

export default CmrDetailsPage; 