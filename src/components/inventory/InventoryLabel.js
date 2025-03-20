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

const InventoryLabel = forwardRef(({ item, batch = null, onClose }, ref) => {
  const labelRef = useRef(null);
  
  // Przekazanie referencji do rodzica
  useEffect(() => {
    if (ref) {
      ref.current = labelRef.current;
    }
  }, [ref]);

  const [isEditing, setIsEditing] = useState(false);
  const [labelData, setLabelData] = useState({
    title: item?.name || 'Produkt',
    additionalInfo: '',
    fontSize: 20,
    codeType: 'barcode', // domyślnie kod kreskowy
    showCode: true
  });

  useEffect(() => {
    if (item) {
      setLabelData(prev => ({
        ...prev,
        title: item.name || 'Produkt'
      }));
    }
  }, [item]);

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
      
      // Przygotowujemy style i zawartość HTML
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Drukowanie etykiety</title>
          <style>
            @page {
              size: 15cm 9cm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
            }
            .label-container {
              width: 15cm;
              height: 9cm;
              background-color: #1a2138;
              color: white;
              padding: 0.8cm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
              font-family: Arial, sans-serif;
            }
            .label-title {
              font-size: ${labelData.fontSize + 12}px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.5cm;
            }
            .label-info {
              font-size: 18px;
              text-align: center;
              margin-bottom: 0.2cm;
            }
            .divider {
              border-top: 1px solid rgba(255, 255, 255, 0.2);
              margin: 0.3cm 0;
            }
            .label-lot {
              font-size: 22px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.2cm;
            }
            .code-container {
              background-color: white;
              margin: 0.3cm auto;
              padding: 0.5cm;
              border-radius: 4px;
              text-align: center;
              width: ${labelData.codeType === 'qrcode' ? '5cm' : '11cm'};
            }
            .info-box {
              text-align: center;
            }
          </style>
        </head>
        <body onload="window.print(); window.setTimeout(function() { window.close(); }, 500);">
          <div class="label-container">
            <div class="info-box">
              <div class="label-title">${labelData.title}</div>
              <div class="label-info">ID: ${item?.id || ''}</div>
              <div class="label-info">Kategoria: ${item?.category || 'Brak kategorii'}</div>
              
              <div class="divider"></div>
              
              ${batch ? `
                <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'}</div>
                ${batch.expiryDate ? `
                  <div class="label-info">Data ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}</div>
                ` : ''}
                <div class="label-info">Ilość: ${batch.quantity} ${item?.unit || 'szt.'}</div>
              ` : ''}
              
              ${labelData.additionalInfo ? `
                <div class="label-info" style="font-style: italic;">${labelData.additionalInfo}</div>
              ` : ''}
            </div>
            
            ${labelData.showCode ? `
              <div class="code-container">
                <img src="${codeImageUrl}" style="max-width: 100%; height: auto;">
              </div>
            ` : ''}
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
  
  // Funkcja generująca obraz kodu QR lub kreskowego
  const getCodeImage = async () => {
    try {
      // Znajdujemy element kodu w naszym komponencie
      const codeElement = labelRef.current.querySelector('.MuiBox-root > .MuiBox-root');
      
      if (!codeElement) {
        return '';
      }
      
      // Generujemy obraz z elementu
      const canvas = await html2canvas(codeElement, {
        scale: 3,
        backgroundColor: 'white',
        logging: false
      });
      
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Błąd generowania obrazu kodu:', error);
      return '';
    }
  };

  // Funkcja do zapisu etykiety jako PNG
  const handleSaveAsPNG = async () => {
    try {
      if (!labelRef.current) {
        console.error("Brak referencji do etykiety");
        return;
      }

      const element = labelRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 3,
        logging: true,
        useCORS: true,
        backgroundColor: '#1a2138' // dodajemy kolor tła
      });

      const image = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = image;
      link.download = `etykieta_${item?.id || 'produkt'}_${batch?.batchNumber || ''}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Błąd podczas generowania PNG:", error);
      alert("Wystąpił błąd podczas generowania PNG. Spróbuj ponownie.");
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

  // Przygotuj dane do kodów
  const codeData = item?.id ? 
    (batch ? `${batch.lotNumber || batch.batchNumber || 'LOT'}` : item.id) : 
    'brak-id';
  
  // Uproszczone dane dla kodu QR - tylko najważniejsze informacje
  const qrData = JSON.stringify({
    id: item?.id || '',
    name: item?.name || '',
    lot: batch?.lotNumber || batch?.batchNumber || '',
    qty: batch?.quantity || '',
    exp: batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('pl-PL') : ''
  });

  return (
    <Box sx={{ p: 2 }}>
      {isEditing && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Edycja etykiety</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tytuł"
                name="title"
                value={labelData.title}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Dodatkowe informacje"
                name="additionalInfo"
                value={labelData.additionalInfo}
                onChange={handleChange}
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Rozmiar czcionki"
                name="fontSize"
                type="number"
                value={labelData.fontSize}
                onChange={handleChange}
                inputProps={{ min: 16, max: 32 }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Typ kodu</FormLabel>
                <RadioGroup 
                  row 
                  name="codeType"
                  value={labelData.codeType}
                  onChange={handleChange}
                >
                  <FormControlLabel 
                    value="barcode" 
                    control={<Radio />} 
                    label="Kod kreskowy" 
                  />
                  <FormControlLabel 
                    value="qrcode" 
                    control={<Radio />} 
                    label="Kod QR" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={labelData.showCode}
                    onChange={(e) => handleChange({
                      target: { name: 'showCode', value: e.target.checked, checked: e.target.checked, type: 'checkbox' }
                    })}
                    name="showCode"
                  />
                }
                label="Pokaż kod"
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
      )}

      <div className="print-container" style={{ width: '15cm', margin: '0 auto' }}>
        <Paper
          ref={labelRef}
          elevation={1}
          sx={{
            width: '15cm',
            height: '9cm',
            p: 1,
            backgroundColor: '#1a2138',
            color: 'white',
            m: 'auto',
            mb: 3,
            pageBreakInside: 'avoid',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            '@media print': {
              backgroundColor: '#1a2138',
              color: 'white',
              width: '15cm',
              height: '9cm',
              margin: 0,
              padding: '0.8cm',
              boxShadow: 'none',
              pageBreakAfter: 'always'
            }
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            {/* Nazwa pozycji */}
            <Typography
              variant="h4"
              component="h3"
              sx={{ 
                fontWeight: 'bold', 
                fontSize: `${labelData.fontSize + 12}px`,
                mb: 1,
                mt: 0.5
              }}
            >
              {labelData.title}
            </Typography>
            
            {/* ID */}
            <Typography variant="body1" sx={{ mb: 0.5, fontSize: '18px' }}>
              ID: {item?.id || ''}
            </Typography>
            
            {/* Kategoria */}
            <Typography variant="body1" sx={{ mb: 1, fontSize: '18px' }}>
              Kategoria: {item?.category || 'Brak kategorii'}
            </Typography>

            <Divider sx={{ my: 1, bgcolor: 'rgba(255, 255, 255, 0.2)' }} />
            
            {/* LOT */}
            {batch && (
              <Typography variant="h5" sx={{ mb: 0.5, fontSize: '22px', fontWeight: 'bold' }}>
                LOT: {batch.lotNumber || batch.batchNumber || 'Brak numeru'}
              </Typography>
            )}
            
            {/* Data ważności */}
            {batch && batch.expiryDate && (
              <Typography variant="body1" sx={{ mb: 0.5, fontSize: '18px' }}>
                Data ważności: {
                  batch.expiryDate instanceof Date 
                    ? batch.expiryDate.toLocaleDateString('pl-PL') 
                    : new Date(batch.expiryDate).toLocaleDateString('pl-PL')
                }
              </Typography>
            )}
            
            {/* Ilość */}
            {batch && (
              <Typography variant="body1" sx={{ mb: 0.5, fontSize: '18px' }}>
                Ilość: {batch.quantity} {item?.unit || 'szt.'}
              </Typography>
            )}

            {/* Dodatkowe informacje (opcjonalne) */}
            {labelData.additionalInfo && (
              <Typography variant="body1" sx={{ mt: 0.5, fontSize: '16px', fontStyle: 'italic' }}>
                {labelData.additionalInfo}
              </Typography>
            )}
          </Box>

          {/* Kod kreskowy/QR */}
          {labelData.showCode && (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              my: 1, 
              bgcolor: 'white', 
              p: labelData.codeType === 'qrcode' ? 1 : 1.5,
              mx: 'auto',
              width: labelData.codeType === 'qrcode' ? '50%' : '90%',
              borderRadius: '4px'
            }}>
              {labelData.codeType === 'qrcode' ? (
                <QRCode
                  value={qrData}
                  size={150}
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <Barcode
                  value={codeData}
                  width={1.8}
                  height={70}
                  fontSize={14}
                  margin={5}
                  displayValue={true}
                  background="white"
                  lineColor="black"
                />
              )}
            </Box>
          )}
        </Paper>
      </div>

      <Typography variant="body2" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', fontSize: '14px', mb: 2 }}>
        Data wygenerowania: {new Date().toLocaleString('pl-PL')}
      </Typography>

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

export default InventoryLabel; 