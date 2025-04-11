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
    title: item?.name || 'Produkt',
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

  useEffect(() => {
    if (item) {
      setLabelData(prev => ({
        ...prev,
        title: item.name || 'Produkt',
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
      console.error('Błąd podczas pobierania grup:', error);
    }
  };

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
      
      // Debugowanie
      console.log("Wygenerowany obraz kodu:", codeImageUrl);
      
      // Przygotowujemy style i zawartość HTML - dostosowane do proporcji 2:3
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Druk etykiety</title>
          <style>
            @page {
              size: 10cm 15cm; /* proporcja 2:3 - landscape */
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
            }
            .label-container {
              width: 10cm;
              height: 15cm;
              background-color: white;
              color: black;
              padding: 0.6cm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
              font-family: Arial, sans-serif;
              border: 1px solid #ddd;
            }
            .label-title {
              font-size: ${labelData.fontSize + 6}px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.4cm;
            }
            .label-info {
              font-size: 16px;
              text-align: center;
              margin-bottom: 0.2cm;
            }
            .divider {
              border-top: 1px solid rgba(0, 0, 0, 0.2);
              margin: 0.3cm 0;
            }
            .label-lot {
              font-size: 20px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.2cm;
            }
            .code-container {
              background-color: white;
              margin: 0.3cm auto;
              padding: 0.3cm;
              border-radius: 4px;
              text-align: center;
              border: 1px solid #eee;
              width: ${labelData.codeType === 'qrcode' ? '4cm' : '7.5cm'};
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
              padding: 0.3cm;
              margin-top: 0.5cm;
              white-space: pre-line;
              line-height: 1.3;
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            <div class="info-box">
              <div class="label-title">${labelData.title}</div>
              <div class="label-info">Kategoria: ${item?.category || 'Brak kategorii'}</div>
              ${itemGroups.length > 0 ? 
                `<div class="label-info">Grupa: ${itemGroups.map(g => g.name).join(', ')}</div>` : 
                ''}
              
              <div class="divider"></div>
              
              ${labelType === 'batch' && batch ? `
                <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'}</div>
                ${batch.moNumber ? `
                  <div class="label-info bold-info">MO: ${batch.moNumber}</div>
                ` : ''}
                ${batch.orderNumber ? `
                  <div class="label-info bold-info">CO: ${batch.orderNumber}</div>
                ` : ''}
                ${batch.expiryDate ? `
                  <div class="label-info">Data ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}</div>
                ` : ''}
                <div class="label-info">Ilość: ${batch.quantity} ${item?.unit || 'szt.'}</div>
              ` : ''}
              
              ${labelType === 'box' ? `
                <div class="label-lot">Ilość w kartonie: ${labelData.boxQuantity} ${item?.unit || 'szt.'}</div>
                ${batch ? `
                  <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'}</div>
                  ${batch.moNumber ? `
                    <div class="label-info bold-info">MO: ${batch.moNumber}</div>
                  ` : ''}
                  ${batch.orderNumber ? `
                    <div class="label-info bold-info">CO: ${batch.orderNumber}</div>
                  ` : ''}
                  ${batch.expiryDate ? `
                    <div class="label-info">Data ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}</div>
                  ` : ''}
                ` : ''}
              ` : ''}
              
              ${labelData.palletQuantity ? `
                <div class="label-info bold-info">Ilość na palecie: ${labelData.palletQuantity} ${item?.unit || 'szt.'}</div>
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
        console.error('Brak elementu etykiety do pobrania');
        alert('Błąd: nie znaleziono elementu etykiety');
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
          <title>Etykieta</title>
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
              padding: 0.6cm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
              font-family: Arial, sans-serif;
              border: 1px solid #ddd;
              box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            .label-title {
              font-size: ${labelData.fontSize + 6}px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.4cm;
            }
            .label-info {
              font-size: 16px;
              text-align: center;
              margin-bottom: 0.2cm;
            }
            .divider {
              border-top: 1px solid rgba(0, 0, 0, 0.2);
              margin: 0.3cm 0;
            }
            .label-lot {
              font-size: 20px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 0.2cm;
            }
            .code-container {
              background-color: white;
              margin: 0.3cm auto;
              padding: 0.3cm;
              border-radius: 4px;
              text-align: center;
              border: 1px solid #eee;
              width: ${labelData.codeType === 'qrcode' ? '4cm' : '7.5cm'};
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
              padding: 0.3cm;
              margin-top: 0.5cm;
              white-space: pre-line;
              line-height: 1.3;
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
          </style>
        </head>
        <body>
          <div class="label-container" id="label-to-capture">
            <div class="info-box">
              <div class="label-title">${labelData.title}</div>
              <div class="label-info">Kategoria: ${item?.category || 'Brak kategorii'}</div>
              ${itemGroups.length > 0 ? 
                `<div class="label-info">Grupa: ${itemGroups.map(g => g.name).join(', ')}</div>` : 
                ''}
              
              <div class="divider"></div>
              
              ${labelType === 'batch' && batch ? `
                <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'}</div>
                ${batch.moNumber ? `
                  <div class="label-info bold-info">MO: ${batch.moNumber}</div>
                ` : ''}
                ${batch.orderNumber ? `
                  <div class="label-info bold-info">CO: ${batch.orderNumber}</div>
                ` : ''}
                ${batch.expiryDate ? `
                  <div class="label-info">Data ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}</div>
                ` : ''}
                <div class="label-info">Ilość: ${batch.quantity} ${item?.unit || 'szt.'}</div>
              ` : ''}
              
              ${labelType === 'box' ? `
                <div class="label-lot">Ilość w kartonie: ${labelData.boxQuantity} ${item?.unit || 'szt.'}</div>
                ${batch ? `
                  <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'}</div>
                  ${batch.moNumber ? `
                    <div class="label-info bold-info">MO: ${batch.moNumber}</div>
                  ` : ''}
                  ${batch.orderNumber ? `
                    <div class="label-info bold-info">CO: ${batch.orderNumber}</div>
                  ` : ''}
                  ${batch.expiryDate ? `
                    <div class="label-info">Data ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}</div>
                  ` : ''}
                ` : ''}
              ` : ''}
              
              ${labelData.palletQuantity ? `
                <div class="label-info bold-info">Ilość na palecie: ${labelData.palletQuantity} ${item?.unit || 'szt.'}</div>
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
          </div>
          <button id="capture-button">Pobierz etykietę</button>
          <a id="download-link"></a>
          
          <script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
          <script>
            document.getElementById('capture-button').addEventListener('click', function() {
              var element = document.getElementById('label-to-capture');
              html2canvas(element, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true
              }).then(function(canvas) {
                // Utwórz link do pobrania pliku
                var dataUrl = canvas.toDataURL('image/png');
                var downloadLink = document.getElementById('download-link');
                downloadLink.href = dataUrl;
                downloadLink.download = '${labelType === 'batch' ? 'batch' : 'box'}-label-${item?.name?.replace(/\s+/g, '-') || 'product'}-${new Date().toISOString().slice(0, 10)}.png';
                downloadLink.click();
                
                // Zamknij okno po pobraniu
                setTimeout(function() {
                  window.close();
                }, 100);
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
      console.error('Błąd podczas zapisywania etykiety jako obrazu:', error);
      alert('Wystąpił błąd podczas zapisywania etykiety. Spróbuj ponownie.');
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
    name: item?.name || '',
    lot: batch?.lotNumber || batch?.batchNumber || '',
    qty: batch?.quantity || '',
    exp: batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-US', {year: 'numeric', month: '2-digit', day: '2-digit'}) : '',
    group: itemGroups.length > 0 ? itemGroups[0].name : '',
    moNumber: batch?.moNumber || '',
    orderNumber: batch?.orderNumber || '',
    boxQty: labelData.boxQuantity || '',
    palletQty: labelData.palletQuantity || '',
    address: address || ''
  });

  return (
    <Box ref={labelRef} sx={{ width: '100%', maxWidth: 400, mx: 'auto', mb: 2 }}>
      {isEditing ? (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Edytuj etykietę
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tytuł etykiety"
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
                rows={2}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Rozmiar czcionki tytułu"
                name="fontSize"
                type="number"
                value={labelData.fontSize}
                onChange={handleChange}
                inputProps={{ min: 12, max: 36 }}
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Typ kodu</FormLabel>
                <RadioGroup
                  name="codeType"
                  value={labelData.codeType}
                  onChange={handleChange}
                >
                  <FormControlLabel value="barcode" control={<Radio />} label="Kod kreskowy" />
                  <FormControlLabel value="qrcode" control={<Radio />} label="Kod QR" />
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
                label="Pokaż kod na etykiecie"
              />
            </Grid>
            {labelType === 'box' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ilość produktu w kartonie"
                  name="boxQuantity"
                  type="number"
                  value={labelData.boxQuantity}
                  onChange={handleChange}
                  InputProps={{ endAdornment: item?.unit || 'szt.' }}
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Ilość na palecie"
                name="palletQuantity"
                type="number"
                value={labelData.palletQuantity}
                onChange={handleChange}
                InputProps={{ endAdornment: item?.unit || 'szt.' }}
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
                  label="Pokaż adres na etykiecie"
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
              Anuluj
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
            >
              Zapisz zmiany
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
            Edytuj etykietę
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
          Kategoria: {item?.category || 'Brak kategorii'}
        </Typography>
        
        {itemGroups.length > 0 && (
          <Typography variant="subtitle1" sx={{ textAlign: 'center', mb: 1 }}>
            Grupa: {itemGroups.map(g => g.name).join(', ')}
          </Typography>
        )}
        
        <Divider sx={{ my: 1.5 }} />
        
        {labelType === 'batch' && batch && (
          <>
            <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
              LOT: {batch.lotNumber || batch.batchNumber || 'Brak numeru'}
            </Typography>
            
            {batch.moNumber && (
              <Typography variant="subtitle1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                MO: {batch.moNumber}
              </Typography>
            )}
            
            {batch.orderNumber && (
              <Typography variant="subtitle1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                CO: {batch.orderNumber}
              </Typography>
            )}
            
            {batch.expiryDate && (
              <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                Data ważności: {new Date(batch.expiryDate).toLocaleDateString('pl-PL')}
              </Typography>
            )}
            
            <Typography variant="body1" sx={{ textAlign: 'center', mb: 1 }}>
              Ilość: {batch.quantity} {item?.unit || 'szt.'}
            </Typography>
          </>
        )}
        
        {labelType === 'box' && (
          <>
            <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 1 }}>
              Ilość w kartonie: {labelData.boxQuantity} {item?.unit || 'szt.'}
            </Typography>
            
            {batch && (
              <>
                <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                  LOT: {batch.lotNumber || batch.batchNumber || 'Brak numeru'}
                </Typography>
                
                {batch.moNumber && (
                  <Typography variant="subtitle1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                    MO: {batch.moNumber}
                  </Typography>
                )}
                
                {batch.orderNumber && (
                  <Typography variant="subtitle1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
                    CO: {batch.orderNumber}
                  </Typography>
                )}
                
                {batch.expiryDate && (
                  <Typography variant="body1" sx={{ textAlign: 'center', mb: 0.5 }}>
                    Data ważności: {new Date(batch.expiryDate).toLocaleDateString('pl-PL')}
                  </Typography>
                )}
              </>
            )}
          </>
        )}
        
        {labelData.palletQuantity && (
          <Typography variant="body1" sx={{ textAlign: 'center', fontWeight: 'bold', mb: 0.5 }}>
            Ilość na palecie: {labelData.palletQuantity} {item?.unit || 'szt.'}
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
                value={
                  `${item?.name || 'Product'}\n` +
                  (batch ? `LOT: ${batch.lotNumber || batch.batchNumber || 'No'}\n` : '') +
                  (batch && batch.expiryDate ? `EXP: ${new Date(batch.expiryDate).toLocaleDateString('en-US')}\n` : '') +
                  (batch && batch.moNumber ? `MO: ${batch.moNumber}\n` : '') +
                  (batch && batch.orderNumber ? `CO: ${batch.orderNumber}\n` : '') +
                  `${(labelType === 'box' && labelData.boxQuantity) ? `BOX QTY: ${labelData.boxQuantity} ${item?.unit || 'pcs'}\n` : ''}` +
                  `CAT: ${item?.category || 'No category'}`
                }
                size={128}
              />
            ) : (
              <Barcode 
                value={
                  labelType === 'batch' 
                    ? (batch?.batchNumber || batch?.lotNumber || item?.id || '0000000000') 
                    : (batch?.batchNumber || batch?.lotNumber || item?.id || '0000000000')
                }
                width={1.5}
                height={60}
                fontSize={12}
                margin={5}
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
          Zapisz jako obraz
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
        >
          Drukuj
        </Button>
      </Box>
    </Box>
  );
});

export default InventoryLabel; 