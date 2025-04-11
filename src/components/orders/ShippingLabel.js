import React, { useRef, useState, useEffect, forwardRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Divider,
  FormControlLabel,
  Checkbox
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
import { formatCurrency } from '../../utils/formatUtils';

const ShippingLabel = forwardRef(({ order, item, onClose }, ref) => {
  const labelRef = useRef(null);
  
  // Przekazanie referencji do rodzica
  useEffect(() => {
    if (ref) {
      ref.current = labelRef.current;
    }
  }, [ref]);

  const [isEditing, setIsEditing] = useState(false);
  const [labelData, setLabelData] = useState({
    title: 'ETYKIETA WYSYŁKOWA',
    font: 'Arial',
    fontSize: 22,
    codeType: 'barcode',
    showCode: true,
    additionalInfo: ''
  });

  // Funkcja do drukowania etykiety
  const handlePrint = async () => {
    try {
      if (!labelRef.current) {
        console.error('Brak elementu do wydruku');
        alert('Błąd drukowania: brak elementu etykiety');
        return;
      }
      
      // Tworzymy nowe okno do drukowania
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      // Pobieramy obraz kodu
      const codeImageUrl = await getCodeImage();
      
      // Przygotowujemy style i zawartość HTML - dostosowane do proporcji 3:2
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Etykieta wysyłkowa</title>
          <style>
            @page {
              size: 15cm 10cm; /* proporcja 3:2 */
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: ${labelData.font}, sans-serif;
            }
            .label-container {
              width: 15cm;
              height: 10cm;
              background-color: white;
              color: black;
              padding: 0.3cm;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              box-sizing: border-box;
              border: 1px solid #ddd;
              overflow: hidden;
            }
            .label-header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 0.2cm;
              margin-bottom: 0.2cm;
            }
            .label-title {
              font-size: ${Math.max(16, labelData.fontSize - 2)}px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .order-number {
              font-size: ${Math.max(14, labelData.fontSize - 6)}px;
              font-weight: bold;
            }
            .label-content {
              display: flex;
              flex-direction: row;
              flex: 1;
              min-height: 0;
            }
            .address-section {
              width: 65%;
              padding-right: 0.3cm;
              border-right: 1px dashed #999;
              display: flex;
              flex-direction: column;
            }
            .info-section {
              width: 35%;
              padding-left: 0.3cm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            .address-box {
              padding: 0.2cm;
              margin-bottom: 0.2cm;
              border: 1px solid #000;
            }
            .address-title {
              font-weight: bold;
              font-size: 12px;
              text-transform: uppercase;
              margin-bottom: 0.1cm;
            }
            .address-content {
              font-size: 14px;
              white-space: pre-line;
              line-height: 1.2;
            }
            .product-info {
              font-size: 12px;
              margin-bottom: 0.2cm;
            }
            .product-name {
              font-weight: bold;
              font-size: 14px;
              margin-bottom: 0.1cm;
            }
            .code-container {
              background-color: white;
              margin: 0.2cm auto;
              padding: 0.1cm;
              text-align: center;
              border: 1px solid #eee;
              width: ${labelData.codeType === 'qrcode' ? '2.5cm' : '5.5cm'};
            }
            .footer-info {
              font-size: 10px;
              text-align: center;
              margin-top: 0.2cm;
              white-space: pre-line;
            }
          </style>
        </head>
        <body onload="window.print(); window.setTimeout(function() { window.close(); }, 500);">
          <div class="label-container">
            <div class="label-header">
              <div class="label-title">${labelData.title}</div>
              <div class="order-number">Zamówienie nr: ${order.orderNumber || order.id?.substring(0, 8).toUpperCase() || 'BRAK'}</div>
            </div>
            
            <div class="label-content">
              <div class="address-section">
                <div class="address-box">
                  <div class="address-title">Adres dostawy:</div>
                  <div class="address-content">${order.customer?.name || 'Brak danych klienta'}
${order.customer?.shippingAddress || 'Brak adresu dostawy'}</div>
                </div>
                
                ${item ? `
                  <div class="product-info">
                    <div class="product-name">${item.name}</div>
                    <div>Ilość: ${item.quantity} ${item.unit || 'szt.'}</div>
                    <div>Wartość: ${formatCurrency(item.price * item.quantity)}</div>
                  </div>
                ` : ''}
                
                <div class="product-info">
                  <div>Data zamówienia: ${new Date(order.orderDate).toLocaleDateString('pl')}</div>
                  ${order.expectedDeliveryDate ? `<div>Przewidywana dostawa: ${new Date(order.expectedDeliveryDate).toLocaleDateString('pl')}</div>` : ''}
                  <div>Metoda dostawy: ${order.shippingMethod || 'Nie określono'}</div>
                </div>
              </div>
              
              <div class="info-section">
                ${labelData.showCode ? `
                  <div class="code-container">
                    <img src="${codeImageUrl}" style="max-width: 100%; height: auto;" />
                  </div>
                ` : ''}
                
                <div class="footer-info">
                  ${labelData.additionalInfo || ''}
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      // Wpisujemy zawartość do nowego okna
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
    } catch (error) {
      console.error('Błąd podczas drukowania:', error);
      alert('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    }
  };

  // Funkcja do pobierania obrazu kodu QR lub kreskowego
  const getCodeImage = async () => {
    try {
      // Generujemy zawartość kodu
      const codeContent = labelData.codeType === 'qrcode' 
        ? order.id || order.orderNumber 
        : order.orderNumber || order.id?.substring(0, 10);
      
      // Znajdujemy odpowiedni element kodu
      const codeElement = document.getElementById(`${labelData.codeType}-element`);
      
      if (!codeElement) {
        console.error(`Nie znaleziono elementu kodu typu ${labelData.codeType}`);
        return '';
      }
      
      // Konwertujemy kod do obrazu
      const canvas = await html2canvas(codeElement, {
        backgroundColor: '#FFFFFF',
        scale: 3 // Wyższa jakość
      });
      
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Błąd podczas generowania obrazu kodu:', error);
      return '';
    }
  };

  // Funkcja zapisująca etykietę jako PNG
  const handleSaveAsPNG = async () => {
    try {
      if (!labelRef.current) {
        console.error('Brak elementu do eksportu');
        alert('Błąd eksportu: brak elementu etykiety');
        return;
      }
      
      const canvas = await html2canvas(labelRef.current, {
        scale: 3, // Wyższa jakość
        backgroundColor: '#FFFFFF'
      });
      
      const pngUrl = canvas.toDataURL('image/png');
      
      // Tworzymy link do pobrania
      const link = document.createElement('a');
      link.download = `etykieta_${order.orderNumber || order.id}_${Date.now()}.png`;
      link.href = pngUrl;
      link.click();
      
    } catch (error) {
      console.error('Błąd podczas zapisywania jako PNG:', error);
      alert('Wystąpił błąd podczas generowania pliku PNG. Spróbuj ponownie.');
    }
  };

  // Obsługa trybu edycji
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

  return (
    <Box sx={{ width: '100%', maxWidth: '800px', mx: 'auto', p: 2 }}>
      {isEditing ? (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Edytuj etykietę</Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Tytuł etykiety"
                name="title"
                value={labelData.title}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Czcionka"
                name="font"
                value={labelData.font}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Rozmiar czcionki (px)"
                name="fontSize"
                type="number"
                value={labelData.fontSize}
                onChange={handleChange}
                InputProps={{ inputProps: { min: 12, max: 36 } }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                select
                label="Typ kodu"
                name="codeType"
                value={labelData.codeType}
                onChange={handleChange}
                SelectProps={{
                  native: true
                }}
              >
                <option value="barcode">Kod kreskowy</option>
                <option value="qrcode">Kod QR</option>
              </TextField>
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={labelData.showCode}
                    onChange={handleChange}
                    name="showCode"
                  />
                }
                label="Pokaż kod na etykiecie"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Dodatkowe informacje"
                name="additionalInfo"
                value={labelData.additionalInfo}
                onChange={handleChange}
                placeholder="Wpisz dodatkowe informacje, które mają pojawić się na etykiecie"
              />
            </Grid>
            
            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button 
                variant="outlined" 
                color="inherit" 
                onClick={() => setIsEditing(false)}
              >
                Anuluj
              </Button>
              <Button 
                variant="contained" 
                color="primary" 
                onClick={handleSave}
              >
                Zapisz
              </Button>
            </Grid>
          </Grid>
        </Paper>
      ) : null}

      <div className="print-container" style={{ width: '15cm', margin: '0 auto' }}>
        <Paper
          ref={labelRef}
          elevation={2}
          sx={{
            width: '15cm',
            height: '10cm', // proporcja 3:2
            p: 1, // zmniejszam padding dla lepszego wykorzystania miejsca
            backgroundColor: 'white',
            color: 'black',
            border: '1px solid #ddd',
            m: 'auto',
            mb: 3,
            pageBreakInside: 'avoid',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: labelData.font,
            fontSize: '12px', // domyślny rozmiar czcionki
            overflow: 'hidden', // ukrywamy zawartość, która nie mieści się w etykiecie
            '@media print': {
              backgroundColor: 'white',
              color: 'black',
              width: '15cm',
              height: '10cm',
              margin: 0,
              padding: '0.3cm',
              boxShadow: 'none',
              pageBreakAfter: 'always'
            }
          }}
        >
          {/* Nagłówek etykiety */}
          <Box sx={{ 
            textAlign: 'center', 
            borderBottom: '2px solid #000', 
            pb: 0.5, 
            mb: 0.5
          }}>
            <Typography variant="h5" sx={{ 
              fontWeight: 'bold', 
              fontSize: `${Math.max(16, labelData.fontSize - 2)}px`, 
              textTransform: 'uppercase',
              lineHeight: 1.2
            }}>
              {labelData.title}
            </Typography>
            <Typography variant="h6" sx={{ 
              fontWeight: 'bold', 
              fontSize: `${Math.max(14, labelData.fontSize - 6)}px`,
              lineHeight: 1.2
            }}>
              Zamówienie nr: {order.orderNumber || order.id?.substring(0, 8).toUpperCase() || 'BRAK'}
            </Typography>
          </Box>
          
          {/* Zawartość etykiety - układ dwukolumnowy */}
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'row',
            flexGrow: 1,
            overflow: 'hidden'
          }}>
            {/* Lewa kolumna - adres i informacje o produkcie */}
            <Box sx={{ 
              width: '65%', 
              pr: 1, 
              borderRight: '1px dashed #999',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Adres dostawy */}
              <Box sx={{ 
                p: 0.5, 
                mb: 0.5, 
                border: '1px solid #000' 
              }}>
                <Typography variant="subtitle2" sx={{ 
                  fontWeight: 'bold', 
                  textTransform: 'uppercase',
                  mb: 0.2,
                  fontSize: '12px'
                }}>
                  Adres dostawy:
                </Typography>
                <Typography sx={{ 
                  whiteSpace: 'pre-line', 
                  lineHeight: 1.2,
                  fontSize: '14px'
                }}>
                  {order.customer?.name || 'Brak danych klienta'}
                  {'\n'}
                  {order.customer?.shippingAddress || 'Brak adresu dostawy'}
                </Typography>
              </Box>
              
              {/* Informacje o produkcie - jeśli podano konkretny produkt */}
              {item && (
                <Box sx={{ mb: 0.5 }}>
                  <Typography sx={{ 
                    fontWeight: 'bold',
                    fontSize: '14px',
                    lineHeight: 1.2
                  }}>
                    {item.name}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '12px', lineHeight: 1.2 }}>
                    Ilość: {item.quantity} {item.unit || 'szt.'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '12px', lineHeight: 1.2 }}>
                    Wartość: {formatCurrency(item.price * item.quantity)}
                  </Typography>
                </Box>
              )}
              
              {/* Informacje o zamówieniu */}
              <Box>
                <Typography variant="body2" sx={{ fontSize: '12px', lineHeight: 1.2 }}>
                  Data zamówienia: {new Date(order.orderDate).toLocaleDateString('pl')}
                </Typography>
                {order.expectedDeliveryDate && (
                  <Typography variant="body2" sx={{ fontSize: '12px', lineHeight: 1.2 }}>
                    Przewidywana dostawa: {new Date(order.expectedDeliveryDate).toLocaleDateString('pl')}
                  </Typography>
                )}
                <Typography variant="body2" sx={{ fontSize: '12px', lineHeight: 1.2 }}>
                  Metoda dostawy: {order.shippingMethod || 'Nie określono'}
                </Typography>
              </Box>
            </Box>
            
            {/* Prawa kolumna - kod i dodatkowe informacje */}
            <Box sx={{ 
              width: '35%', 
              pl: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              {/* Kod kreskowy lub QR - ukryty renderowanie dla eksportu HTML */}
              {labelData.showCode && (
                <Box sx={{ 
                  my: 1, 
                  p: 0.5, 
                  textAlign: 'center', 
                  border: '1px solid #eee'
                }}>
                  {labelData.codeType === 'qrcode' ? (
                    <QRCode
                      id="qrcode-element"
                      value={order.id || order.orderNumber || 'ERROR'}
                      size={80}
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                  ) : (
                    <Barcode
                      id="barcode-element"
                      value={order.orderNumber || order.id?.substring(0, 10) || 'ERROR'}
                      width={1}
                      height={30}
                      fontSize={10}
                      margin={2}
                      displayValue={true}
                    />
                  )}
                </Box>
              )}
              
              {/* Dodatkowe informacje */}
              <Box sx={{ 
                mt: 'auto', 
                textAlign: 'center',
                fontSize: '10px',
                whiteSpace: 'pre-line'
              }}>
                {labelData.additionalInfo}
              </Box>
            </Box>
          </Box>
        </Paper>
      </div>

      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
        <Button 
          variant="contained" 
          color="primary"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
        >
          Drukuj
        </Button>
        <Button 
          variant="contained" 
          color="success"
          startIcon={<DownloadIcon />}
          onClick={handleSaveAsPNG}
        >
          Pobierz PNG
        </Button>
        <Button 
          variant="contained" 
          color="secondary"
          startIcon={<EditIcon />}
          onClick={handleEdit}
        >
          Edytuj
        </Button>
        <Button 
          variant="outlined" 
          color="inherit"
          startIcon={<CloseIcon />}
          onClick={onClose}
        >
          Zamknij
        </Button>
      </Box>
    </Box>
  );
});

export default ShippingLabel; 