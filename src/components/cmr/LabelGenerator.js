import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid,
  Divider
} from '@mui/material';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import Barcode from 'react-barcode';
import QRCode from 'react-qr-code';

// Funkcja pomocnicza do formatowania daty
const formatDate = (date) => {
  if (!date) return 'N/A';
  
  try {
    let dateObj;
    if (date.toDate && typeof date.toDate === 'function') {
      // Firestore Timestamp
      dateObj = date.toDate();
    } else if (date.seconds && typeof date.seconds === 'number') {
      // Firestore Timestamp jako obiekt z seconds i nanoseconds
      dateObj = new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      return 'N/A';
    }
    
    if (isNaN(dateObj.getTime())) return 'N/A';
    
    return dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return 'N/A';
  }
};

// Funkcja do generowania danych QR kodu
const generateQRData = (linkedBatch) => {
  if (!linkedBatch) {
    return 'No batch data available';
  }
  
  const qrData = {
    CO: linkedBatch.orderNumber || 'N/A',
    MO: linkedBatch.moNumber || 'N/A', 
    LOT: linkedBatch.batchNumber || linkedBatch.lotNumber || 'N/A',
    EXP: formatDate(linkedBatch.expiryDate)
  };
  
  return JSON.stringify(qrData, null, 2);
};

// Funkcja do formatowania adresu z podziałem na linie
const formatAddress = (address) => {
  if (!address || address === 'N/A') return 'N/A';
  
  // Dzielimy adres na linie używając różnych separatorów
  return address
    .split(/[\n\r]+/)  // Podział na linie
    .map(line => line.trim())  // Usuwamy białe znaki
    .filter(line => line.length > 0);  // Usuwamy puste linie
};

// Komponent etykiety kartonu
const BoxLabel = ({ 
  cmrData, 
  itemData, 
  boxDetails
}) => {
  const formatDate = (date) => {
    if (!date) return '';
    if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    return format(new Date(date), 'dd.MM.yyyy', { locale: pl });
  };

  return (
    <Paper 
      sx={{ 
        width: '600px', 
        height: '400px', 
        p: 3,
        position: 'relative',
        fontSize: '16px',
        fontFamily: 'monospace',
        backgroundColor: 'white !important',
        color: 'black !important',
        boxShadow: 'none !important',
        zIndex: 1000,
        isolation: 'isolate'
      }}
      elevation={0}
    >
      {/* Nagłówek z logo i numerami */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.1, borderBottom: 1, pb: 0.1 }}>
        {/* Logo w lewym rogu */}
        <Box sx={{ mr: 1 }}>
          <img 
            src="/templates/cmr/BGWPHARMA_logo50.png" 
            alt="BGW Pharma"
            style={{ width: '35px', height: '35px', objectFit: 'contain' }}
          />
        </Box>
        
        {/* Numery po prawej stronie logo - w jednej linii */}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" sx={{ fontSize: '14px', fontWeight: 'bold' }}>
            <span style={{ color: '#1976d2' }}>CMR: {cmrData.cmrNumber}</span>
            {!boxDetails.isFull && (
              <>
                {' | '}
                <span style={{ color: '#d32f2f' }}>BOX: PARTIAL</span>
              </>
            )}
          </Typography>
        </Box>
      </Box>

      {/* Główne informacje */}
      <Grid container spacing={1.5} sx={{ height: '330px' }}>
        {/* Lewa kolumna */}
        <Grid item xs={6}>
          <Box sx={{ fontSize: '14px' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              PRODUCT:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '16px', fontWeight: 'bold', mb: 1.5, lineHeight: 1.2 }}>
              {itemData.description}
              {itemData.linkedBatches && itemData.linkedBatches[0] && (itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber) && (
                <Box component="span" sx={{ display: 'block', fontSize: '14px', fontWeight: 'normal', color: 'text.secondary', mt: 0.5 }}>
                  LOT: {itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber}
                </Box>
              )}
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              QTY IN BOX:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 'bold', mb: 1.5 }}>
              {boxDetails.itemsCount} / {itemData.inventoryData?.itemsPerBox || 'N/A'} pcs
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              BOX WEIGHT:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 'bold', mb: 1.5 }}>
              {boxDetails.totalWeight} kg
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              EXPIRY DATE:
            </Typography>
            <Typography variant="body2" sx={{ 
              fontSize: '12px', 
              fontWeight: 'bold', 
              mb: 1.5,
              color: formatDate(itemData.linkedBatches?.[0]?.expiryDate) === 'N/A' ? 'text.secondary' : 'inherit'
            }}>
              {formatDate(itemData.linkedBatches?.[0]?.expiryDate)}
            </Typography>

          </Box>
        </Grid>

        {/* Prawa kolumna */}
        <Grid item xs={6}>
          <Box sx={{ fontSize: '14px' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              SENDER:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '14px', mb: 1.5, lineHeight: 1.3 }}>
              {cmrData.sender}
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              RECIPIENT:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '14px', mb: 0.5, lineHeight: 1.3 }}>
              {cmrData.recipient}
            </Typography>
            
            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              DELIVERY ADDRESS:
            </Typography>
            <Box sx={{ fontSize: '12px', mb: 1.5, lineHeight: 1.2 }}>
              {(() => {
                const address = cmrData.recipientAddress || cmrData.deliveryPlace || cmrData.unloadingPlace || 'N/A';
                const addressLines = formatAddress(address);
                
                if (addressLines === 'N/A') {
                  return <Typography variant="body2" sx={{ fontSize: '12px' }}>N/A</Typography>;
                }
                
                return addressLines.map((line, index) => (
                  <Typography 
                    key={index} 
                    variant="body2" 
                    sx={{ fontSize: '12px', display: 'block', mb: index < addressLines.length - 1 ? 0.2 : 0 }}
                  >
                    {line}
                  </Typography>
                ));
              })()}
            </Box>


          </Box>
        </Grid>
      </Grid>

      {/* QR kod i kod kreskowy */}
      <Box sx={{ 
        position: 'absolute', 
        bottom: 8, 
        left: 16, 
        right: 16,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between'
      }}>
        {/* QR Code po lewej stronie */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {itemData.linkedBatches && itemData.linkedBatches[0] ? (
            <QRCode 
              value={generateQRData(itemData.linkedBatches[0])}
              size={80}
              level="M"
            />
          ) : (
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary', textAlign: 'center' }}>
              No batch data<br/>for QR code
            </Typography>
          )}
        </Box>

        {/* Kod kreskowy po prawej stronie */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', flexGrow: 1, justifyContent: 'center' }}>
          {itemData.linkedBatches && itemData.linkedBatches[0]?.barcode ? (
            <Barcode
              value={itemData.linkedBatches[0].barcode.replace(/\s+/g, '')}
              width={3.5}
              height={45}
              fontSize={10}
              textAlign="center"
              textPosition="bottom"
              background="transparent"
              lineColor="#000000"
              displayValue={false}
            />
          ) : (
            <Typography variant="caption" sx={{ fontSize: '12px', color: 'text.secondary' }}>
              No barcode available
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
};

// Komponent etykiety palety
const PalletLabel = ({ 
  cmrData, 
  itemData, 
  palletDetails
}) => {
  const formatDate = (date) => {
    if (!date) return '';
    if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    return format(new Date(date), 'dd.MM.yyyy', { locale: pl });
  };

  return (
    <Paper 
      sx={{ 
        width: '600px', 
        height: '400px', 
        p: 3,
        position: 'relative',
        fontSize: '16px',
        fontFamily: 'monospace',
        backgroundColor: 'white !important',
        color: 'black !important',
        boxShadow: 'none !important',
        zIndex: 1000,
        isolation: 'isolate'
      }}
      elevation={0}
    >
      {/* Nagłówek z logo i numerami */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.1, borderBottom: 1, pb: 0.1 }}>
        {/* Logo w lewym rogu */}
        <Box sx={{ mr: 1 }}>
          <img 
            src="/templates/cmr/BGWPHARMA_logo50.png" 
            alt="BGW Pharma"
            style={{ width: '35px', height: '35px', objectFit: 'contain' }}
          />
        </Box>
        
        {/* Numery po prawej stronie logo - w jednej linii */}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" sx={{ fontSize: '14px', fontWeight: 'bold' }}>
            <span style={{ color: '#2e7d32' }}>CMR: {cmrData.cmrNumber}</span>
            {!palletDetails.isFull && (
              <>
                {' | '}
                <span style={{ color: '#d32f2f' }}>PALLET: PARTIAL</span>
              </>
            )}
          </Typography>
        </Box>
      </Box>

      {/* Główne informacje */}
      <Grid container spacing={1.5} sx={{ height: '330px' }}>
        {/* Lewa kolumna */}
        <Grid item xs={6}>
          <Box sx={{ fontSize: '14px' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              PRODUCT:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '16px', fontWeight: 'bold', mb: 1.5, lineHeight: 1.2 }}>
              {itemData.description}
              {itemData.linkedBatches && itemData.linkedBatches[0] && (itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber) && (
                <Box component="span" sx={{ display: 'block', fontSize: '14px', fontWeight: 'normal', color: 'text.secondary', mt: 0.5 }}>
                  LOT: {itemData.linkedBatches[0].batchNumber || itemData.linkedBatches[0].lotNumber}
                </Box>
              )}
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              QTY ON PALLET:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 'bold', mb: 1.5 }}>
              {palletDetails.itemsCount} / {itemData.inventoryData?.boxesPerPallet * itemData.inventoryData?.itemsPerBox || 'N/A'} pcs
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              BOXES COUNT:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 'bold', mb: 1.5 }}>
              {palletDetails.boxesCount} / {itemData.inventoryData?.boxesPerPallet || 'N/A'} pcs
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              PALLET WEIGHT:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 'bold', mb: 1.5 }}>
              {palletDetails.totalWeight} kg
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              EXPIRY DATE:
            </Typography>
            <Typography variant="body2" sx={{ 
              fontSize: '12px', 
              fontWeight: 'bold',
              color: formatDate(itemData.linkedBatches?.[0]?.expiryDate) === '' ? 'text.secondary' : 'inherit'
            }}>
              {formatDate(itemData.linkedBatches?.[0]?.expiryDate) || 'N/A'}
            </Typography>
          </Box>
        </Grid>

        {/* Prawa kolumna */}
        <Grid item xs={6}>
          <Box sx={{ fontSize: '14px' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              SENDER:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '14px', mb: 1.5, lineHeight: 1.3 }}>
              {cmrData.sender}
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              RECIPIENT:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '14px', mb: 0.5, lineHeight: 1.3 }}>
              {cmrData.recipient}
            </Typography>
            
            <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '12px', display: 'block', mb: 0.5 }}>
              DELIVERY ADDRESS:
            </Typography>
            <Box sx={{ fontSize: '12px', mb: 1.5, lineHeight: 1.2 }}>
              {(() => {
                const address = cmrData.recipientAddress || cmrData.deliveryPlace || cmrData.unloadingPlace || 'N/A';
                const addressLines = formatAddress(address);
                
                if (addressLines === 'N/A') {
                  return <Typography variant="body2" sx={{ fontSize: '12px' }}>N/A</Typography>;
                }
                
                return addressLines.map((line, index) => (
                  <Typography 
                    key={index} 
                    variant="body2" 
                    sx={{ fontSize: '12px', display: 'block', mb: index < addressLines.length - 1 ? 0.2 : 0 }}
                  >
                    {line}
                  </Typography>
                ));
              })()}
            </Box>

          </Box>
        </Grid>
      </Grid>

      {/* QR kod i kod kreskowy */}
      <Box sx={{ 
        position: 'absolute', 
        bottom: 8, 
        left: 16, 
        right: 16,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between'
      }}>
        {/* QR Code po lewej stronie */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {itemData.linkedBatches && itemData.linkedBatches[0] ? (
            <QRCode 
              value={generateQRData(itemData.linkedBatches[0])}
              size={80}
              level="M"
            />
          ) : (
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary', textAlign: 'center' }}>
              No batch data<br/>for QR code
            </Typography>
          )}
        </Box>

        {/* Kod kreskowy po prawej stronie */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', flexGrow: 1, justifyContent: 'center' }}>
          {itemData.linkedBatches && itemData.linkedBatches[0]?.barcode ? (
            <Barcode
              value={itemData.linkedBatches[0].barcode.replace(/\s+/g, '')}
              width={3.5}
              height={45}
              fontSize={10}
              textAlign="center"
              textPosition="bottom"
              background="transparent"
              lineColor="#000000"
              displayValue={false}
            />
          ) : (
            <Typography variant="caption" sx={{ fontSize: '12px', color: 'text.secondary' }}>
              No barcode available
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
};

// Główny komponent generatora etykiet
const LabelGenerator = {
  // Funkcja generowania etykiet kartonów
  generateBoxLabels: (cmrData, itemsWeightDetails) => {
    const labels = [];
    
    itemsWeightDetails.forEach(itemDetail => {
      // Generuj etykiety kartonów tylko dla pozycji które mają kartony
      if (itemDetail.hasDetailedData && itemDetail.hasBoxes && itemDetail.boxes) {
        
        // Etykieta dla pełnych kartonów (tylko jedna)
        if (itemDetail.boxes.fullBox && itemDetail.boxes.fullBoxesCount > 0) {
          labels.push(
            <BoxLabel
              key={`${itemDetail.itemId}-full`}
              cmrData={cmrData}
              itemData={itemDetail}
              boxDetails={itemDetail.boxes.fullBox}
            />
          );
        }
        
        // Etykieta dla niepełnego kartonu (tylko jedna)
        if (itemDetail.boxes.partialBox) {
          labels.push(
            <BoxLabel
              key={`${itemDetail.itemId}-partial`}
              cmrData={cmrData}
              itemData={itemDetail}
              boxDetails={itemDetail.boxes.partialBox}
            />
          );
        }
      }
    });
    
    return labels;
  },

  // Funkcja generowania etykiet palet
  generatePalletLabels: (cmrData, itemsWeightDetails) => {
    const labels = [];
    
    itemsWeightDetails.forEach(itemDetail => {
      if (itemDetail.hasDetailedData && itemDetail.pallets && itemDetail.pallets.length > 0) {
        // Znajdź pełne i niepełne palety
        const fullPallets = itemDetail.pallets.filter(pallet => pallet.isFull);
        const partialPallets = itemDetail.pallets.filter(pallet => !pallet.isFull);
        
        // Jedna etykieta dla pełnych palet
        if (fullPallets.length > 0) {
          labels.push(
            <PalletLabel
              key={`${itemDetail.itemId}-pallet-full`}
              cmrData={cmrData}
              itemData={itemDetail}
              palletDetails={fullPallets[0]}
            />
          );
        }
        
        // Jedna etykieta dla niepełnych palet
        if (partialPallets.length > 0) {
          labels.push(
            <PalletLabel
              key={`${itemDetail.itemId}-pallet-partial`}
              cmrData={cmrData}
              itemData={itemDetail}
              palletDetails={partialPallets[0]}
            />
          );
        }
      }
    });
    
    return labels;
  }
};

export default LabelGenerator; 