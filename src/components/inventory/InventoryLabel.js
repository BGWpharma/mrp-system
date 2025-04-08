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

const InventoryLabel = forwardRef(({ item, batch = null, onClose, address = null }, ref) => {
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
    showCode: true,
    boxQuantity: '', // ilość w kartonie
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
        showAddress: !!address
      }));
      
      // Pobierz grupy, do których należy produkt
      fetchProductGroups();
    }
  }, [item, address]);

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
      
      // Przygotowujemy style i zawartość HTML - dostosowane do proporcji 2:3
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Druk etykiety</title>
          <style>
            @page {
              size: 10cm 15cm; /* proporcja 2:3 */
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
        <body onload="window.print(); window.setTimeout(function() { window.close(); }, 500);">
          <div class="label-container">
            <div class="info-box">
              <div class="label-title">${labelData.title}</div>
              <div class="label-info">Category: ${item?.category || 'No category'}</div>
              ${itemGroups.length > 0 ? 
                `<div class="label-info">Group: ${itemGroups.map(g => g.name).join(', ')}</div>` : 
                ''}
              
              <div class="divider"></div>
              
              ${batch ? `
                <div class="label-lot">LOT: ${batch.lotNumber || batch.batchNumber || 'No number'}</div>
                ${batch.moNumber ? `
                  <div class="label-info bold-info">MO: ${batch.moNumber}</div>
                ` : ''}
                ${batch.orderNumber ? `
                  <div class="label-info bold-info">CO: ${batch.orderNumber}</div>
                ` : ''}
                ${batch.expiryDate ? `
                  <div class="label-info">Expiry date: ${new Date(batch.expiryDate).toLocaleDateString('en-US', {year: 'numeric', month: '2-digit', day: '2-digit'})}</div>
                ` : ''}
                <div class="label-info">Quantity: ${batch.quantity} ${item?.unit || 'pcs.'}</div>
              ` : ''}
              
              ${labelData.boxQuantity ? `
                <div class="label-info bold-info">Box quantity: ${labelData.boxQuantity} ${item?.unit || 'pcs.'}</div>
              ` : ''}
              
              ${labelData.palletQuantity ? `
                <div class="label-info bold-info">Pallet quantity: ${labelData.palletQuantity} ${item?.unit || 'pcs.'}</div>
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
      
    } catch (error) {
      console.error('Błąd podczas drukowania:', error);
      alert('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    }
  };
  
  // Funkcja generująca obraz kodu QR lub kreskowego
  const getCodeImage = async () => {
    try {
      // Znajdujemy element kodu w naszym komponencie
      const codeElement = labelRef.current.querySelector('div[style*="background-color: white"]');
      
      if (!codeElement) {
        console.log('Nie znaleziono elementu kodu');
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
    <Box sx={{ p: 2 }}>
      {isEditing && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Edytuj etykietę</Typography>
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
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość w kartonie"
                name="boxQuantity"
                type="number"
                value={labelData.boxQuantity}
                onChange={handleChange}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość na palecie"
                name="palletQuantity"
                type="number"
                value={labelData.palletQuantity}
                onChange={handleChange}
                inputProps={{ min: 0 }}
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
                <FormLabel component="legend">Rodzaj kodu</FormLabel>
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
            {address && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={labelData.showAddress}
                      onChange={(e) => handleChange({
                        target: { name: 'showAddress', value: e.target.checked, checked: e.target.checked, type: 'checkbox' }
                      })}
                      name="showAddress"
                    />
                  }
                  label="Pokaż adres"
                />
              </Grid>
            )}
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

      <div className="print-container" style={{ width: '10cm', margin: '0 auto' }}>
        <Paper
          ref={labelRef}
          elevation={1}
          sx={{
            width: '10cm',
            height: '15cm', // proporcja 2:3
            p: 1,
            backgroundColor: 'white',
            color: 'black',
            border: '1px solid #ddd',
            m: 'auto',
            mb: 3,
            pageBreakInside: 'avoid',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            '@media print': {
              backgroundColor: 'white',
              color: 'black',
              width: '10cm',
              height: '15cm',
              margin: 0,
              padding: '0.6cm',
              boxShadow: 'none',
              pageBreakAfter: 'always'
            }
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Typography
              variant="h5"
              component="h3"
              sx={{ 
                fontWeight: 'bold', 
                fontSize: `${labelData.fontSize + 6}px`,
                mb: 1,
                mt: 0.5,
                lineHeight: 1.2
              }}
            >
              {labelData.title}
            </Typography>
            
            <Typography variant="body2" gutterBottom>
              Category: {item?.category || 'No category'}
            </Typography>

            {itemGroups.length > 0 && (
              <Typography variant="body2" gutterBottom>
                Group: {itemGroups.map(g => g.name).join(', ')}
              </Typography>
            )}

            <Divider sx={{ my: 1 }} />
            
            {batch && (
              <>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                  LOT: {batch.lotNumber || batch.batchNumber || 'No number'}
                </Typography>
                
                {batch.moNumber && (
                  <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    MO: {batch.moNumber}
                  </Typography>
                )}
                
                {batch.orderNumber && (
                  <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    CO: {batch.orderNumber}
                  </Typography>
                )}
                
                {batch.expiryDate && (
                  <Typography variant="body2" gutterBottom>
                    Expiry date: {
                      batch.expiryDate instanceof Date 
                        ? batch.expiryDate.toLocaleDateString('en-US', {year: 'numeric', month: '2-digit', day: '2-digit'}) 
                        : new Date(batch.expiryDate).toLocaleDateString('en-US', {year: 'numeric', month: '2-digit', day: '2-digit'})
                    }
                  </Typography>
                )}
                
                <Typography variant="body2" gutterBottom>
                  Quantity: {batch.quantity} {item?.unit || 'pcs.'}
                </Typography>
              </>
            )}
            
            {labelData.boxQuantity && (
              <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                Box quantity: {labelData.boxQuantity} {item?.unit || 'pcs.'}
              </Typography>
            )}
            
            {labelData.palletQuantity && (
              <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                Pallet quantity: {labelData.palletQuantity} {item?.unit || 'pcs.'}
              </Typography>
            )}

            {labelData.additionalInfo && (
              <Typography variant="body2" sx={{ mt: 0.5, fontSize: '14px', fontStyle: 'italic' }}>
                {labelData.additionalInfo}
              </Typography>
            )}
          </Box>

          {address && labelData.showAddress && (
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 1, 
                mt: 1, 
                mb: 1, 
                whiteSpace: 'pre-line',
                fontSize: '14px',
                lineHeight: 1.3
              }}
            >
              {address}
            </Paper>
          )}

          {labelData.showCode && (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              my: 1, 
              bgcolor: 'white', 
              p: labelData.codeType === 'qrcode' ? 0.8 : 1,
              mx: 'auto',
              width: labelData.codeType === 'qrcode' ? '45%' : '80%',
              borderRadius: '4px',
              border: '1px solid #eee'
            }}>
              {labelData.codeType === 'qrcode' ? (
                <QRCode
                  value={qrData}
                  size={120}
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <Barcode
                  value={codeData}
                  width={1.5}
                  height={50}
                  fontSize={12}
                  margin={3}
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
        Generated: {new Date().toLocaleString('en-US')}
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