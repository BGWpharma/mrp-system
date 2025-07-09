import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  Print as PrintIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

const LabelsDisplayDialog = ({ 
  open, 
  onClose, 
  labels, 
  title = "Etykiety CMR" 
}) => {
  const componentRef = useRef();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');

  // Funkcja oczekiwania na załadowanie obrazów
  const waitForImages = (element) => {
    const images = element.querySelectorAll('img, svg');
    const promises = Array.from(images).map(img => {
      if (img.complete || img.tagName === 'SVG') {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = resolve; // Kontynuuj nawet jeśli obraz się nie załaduje
        setTimeout(resolve, 5000); // Timeout po 5 sekundach
      });
    });
    return Promise.all(promises);
  };

  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
    documentTitle: `${title} - ${new Date().toLocaleDateString()}`,
    pageStyle: `
      @page {
        size: auto;
        margin: 0;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          color-adjust: exact;
        }
      }
    `
  });

  const generatePDF = async () => {
    if (!componentRef.current || labels.length === 0) return;

    setIsGeneratingPdf(true);
    setPdfProgress('Przygotowywanie PDF...');
    
    try {
      // Ustawienia PDF dla etykiet 600x400px (proporcje 3:2)
      const labelWidth = 600;
      const labelHeight = 400;
      
      // Konwersja px na mm (1px ≈ 0.264583mm)
      const mmWidth = labelWidth * 0.264583;
      const mmHeight = labelHeight * 0.264583;
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [mmWidth, mmHeight]
      });

      // Usuń pierwszą pustą stronę
      pdf.deletePage(1);

      const labelsContainer = componentRef.current;
      const labelElements = labelsContainer.querySelectorAll('.label-item');

      console.log(`Znaleziono ${labelElements.length} etykiet do konwersji`);
      setPdfProgress(`Konwersja etykiet (0/${labelElements.length})...`);

      for (let i = 0; i < labelElements.length; i++) {
        const labelElement = labelElements[i];
        
        console.log(`Przetwarzanie etykiety ${i + 1}/${labelElements.length}`);
        setPdfProgress(`Konwersja etykiet (${i + 1}/${labelElements.length})...`);
        
        // Poczekaj na załadowanie wszystkich obrazów w etykiecie
        await waitForImages(labelElement);
        
        // Krótka pauza dla stabilności
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Konwertuj etykietę na canvas z ulepszonymi opcjami
        const canvas = await html2canvas(labelElement, {
          scale: 2, // Wyższa rozdzielczość
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: labelWidth,
          height: labelHeight,
          scrollX: 0,
          scrollY: 0,
          windowWidth: labelWidth,
          windowHeight: labelHeight,
          ignoreElements: (element) => {
            // Ignoruj elementy które mogą powodować problemy
            return element.tagName === 'SCRIPT' || 
                   element.tagName === 'STYLE' ||
                   element.classList.contains('ignore-print');
          },
          onclone: (clonedDoc) => {
            // Upewnij się że wszystkie style są skopiowane
            const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
            styles.forEach(style => {
              if (style.tagName === 'STYLE') {
                const clonedStyle = clonedDoc.createElement('style');
                clonedStyle.textContent = style.textContent;
                clonedDoc.head.appendChild(clonedStyle);
              } else if (style.tagName === 'LINK') {
                const clonedLink = clonedDoc.createElement('link');
                clonedLink.rel = 'stylesheet';
                clonedLink.href = style.href;
                clonedDoc.head.appendChild(clonedLink);
              }
            });
          }
        });

        // Dodaj nową stronę dla każdej etykiety
        pdf.addPage([mmWidth, mmHeight], 'landscape');
        
        // Dodaj obraz etykiety do PDF
        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', 0, 0, mmWidth, mmHeight);
        
        console.log(`Etykieta ${i + 1} dodana do PDF`);
      }

      setPdfProgress('Zapisywanie pliku...');
      
      // Zapisz PDF
      const fileName = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      console.log(`PDF zapisany jako: ${fileName}`);
      setPdfProgress('Gotowe!');
      
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      
      // Próba alternatywnego podejścia jeśli html2canvas nie działa
      try {
        console.log('Próbuję alternatywne podejście z jsPDF...');
        setPdfProgress('Próba alternatywnej metody...');
        await generatePDFAlternative();
      } catch (altError) {
        console.error('Alternatywne podejście z jsPDF również nie powiodło się:', altError);
        
        // Próba z @react-pdf/renderer
        try {
          console.log('Próbuję podejście z @react-pdf/renderer...');
          setPdfProgress('Próba trzeciej metody...');
          await generatePDFWithReactPDF();
        } catch (reactPdfError) {
          console.error('Wszystkie metody generowania PDF nie powiodły się:', reactPdfError);
          setPdfProgress('Błąd generowania');
          alert('Wystąpił błąd podczas generowania PDF. Spróbuj ponownie lub użyj funkcji drukowania.');
        }
      }
    } finally {
      setIsGeneratingPdf(false);
      setTimeout(() => setPdfProgress(''), 3000); // Wyczyść komunikat po 3 sekundach
    }
  };

  // Alternatywna metoda generowania PDF bez html2canvas
  const generatePDFAlternative = async () => {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    pdf.deletePage(1);

    for (let i = 0; i < labels.length; i++) {
      pdf.addPage('a4', 'landscape');
      
      // Dodaj prostą reprezentację tekstową etykiety
      pdf.setFontSize(16);
      pdf.text(`Etykieta ${i + 1}/${labels.length}`, 20, 20);
      
      pdf.setFontSize(12);
      pdf.text('Uwaga: Nie udało się wygenerować graficznej reprezentacji etykiety.', 20, 40);
      pdf.text('Użyj funkcji drukowania dla pełnej wersji etykiet.', 20, 50);
      
      // Dodaj podstawowe informacje o etykiecie jeśli dostępne
      pdf.text(`Tytuł: ${title}`, 20, 70);
      pdf.text(`Data: ${new Date().toLocaleDateString()}`, 20, 80);
    }

    const fileName = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}_fallback.pdf`;
    pdf.save(fileName);
  };

  // Trzecia alternatywa - używanie @react-pdf/renderer
  const generatePDFWithReactPDF = async () => {
    const styles = StyleSheet.create({
      page: {
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        padding: 20,
      },
      title: {
        fontSize: 24,
        marginBottom: 20,
        textAlign: 'center',
      },
      labelContainer: {
        border: 2,
        borderColor: '#000000',
        padding: 12,
        marginBottom: 20,
        minHeight: 200,
      },
      header: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
      },
      row: {
        flexDirection: 'row',
        marginBottom: 5,
      },
      label: {
        fontSize: 10,
        fontWeight: 'bold',
        width: '30%',
      },
      value: {
        fontSize: 10,
        width: '70%',
      },
      note: {
        fontSize: 8,
        fontStyle: 'italic',
        marginTop: 10,
        textAlign: 'center',
      }
    });

    const MyDocument = () => (
      <Document>
        {labels.map((_, index) => (
          <Page key={index} size="A4" orientation="landscape" style={styles.page}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.labelContainer}>
              <Text style={styles.header}>Etykieta {index + 1} / {labels.length}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Numer CMR:</Text>
                <Text style={styles.value}>Dostępny w wersji graficznej</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Produkt:</Text>
                <Text style={styles.value}>Dostępny w wersji graficznej</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Data:</Text>
                <Text style={styles.value}>{new Date().toLocaleDateString()}</Text>
              </View>
              <Text style={styles.note}>
                To jest uproszczona wersja etykiety. Dla pełnej wersji z kodami kreskowymi użyj funkcji drukowania.
              </Text>
            </View>
          </Page>
        ))}
      </Document>
    );

    try {
      const blob = await pdf(<MyDocument />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}_reactpdf.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Błąd w @react-pdf/renderer:', error);
      throw error;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '90vw',
          height: '90vh',
          maxWidth: 'none',
          maxHeight: 'none'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">{title}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={isGeneratingPdf ? <CircularProgress size={16} /> : <PdfIcon />}
            onClick={generatePDF}
            disabled={isGeneratingPdf || labels.length === 0}
            color="secondary"
          >
            {isGeneratingPdf ? (pdfProgress || 'Generowanie PDF...') : 'Pobierz PDF'}
          </Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            disabled={labels.length === 0}
          >
            Drukuj
          </Button>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        <Box 
          ref={componentRef}
          sx={{ 
            p: 2,
            '& .label-item': {
              mb: 2,
              '&:last-child': {
                mb: 0
              }
            }
          }}
        >
          {labels.length > 0 ? (
            labels.map((label, index) => (
              <Box key={index} className="label-item">
                {label}
              </Box>
            ))
          ) : (
            <Typography variant="body1" sx={{ textAlign: 'center', p: 4 }}>
              Brak etykiet do wyświetlenia
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Typography variant="caption" color="text.secondary">
          Liczba etykiet: {labels.length}
        </Typography>
      </DialogActions>
    </Dialog>
  );
};

export default LabelsDisplayDialog; 