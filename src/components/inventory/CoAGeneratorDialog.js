import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Grid,
  Paper,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
  Preview as PreviewIcon
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const CoAGeneratorDialog = ({ open, onClose, onGenerate }) => {
  const [markdownContent, setMarkdownContent] = useState(`# Certificate of Analysis (CoA)

## Informacje o produkcie
**Nazwa produktu:** [Nazwa produktu] | **LOT:** [Numer LOT]  
**Data produkcji:** [Data] | **Data waznosci:** [Data]

## Parametry jakosciowe
### Wyglad
**Kolor:** [Opis] | **Zapach:** [Opis] | **Konsystencja:** [Opis]

### Parametry chemiczne
| Parametr | Jednostka | Wynik | Norma |
|----------|-----------|-------|-------|
| pH | - | 7.2 | 6.8 - 7.5 |
| Wilgotnosc | % | 2.1 | <= 3.0 |
| Zawartosc substancji aktywnej | % | 98.5 | >= 98.0 |

### Parametry mikrobiologiczne
| Parametr | Jednostka | Wynik | Norma |
|----------|-----------|-------|-------|
| Liczba bakterii aerobowych | jtk/g | <10 | <= 1000 |
| Drozdze i plesnie | jtk/g | <10 | <= 100 |

## Podsumowanie
Produkt **ZGODNY** z wymaganiami specyfikacji.

**Osoba odpowiedzialna:** [Imie nazwisko] | **Data badania:** [Data]

---
*Certyfikat wygenerowany przez system MRP BGW Pharma*`);

  const [showPreview, setShowPreview] = useState(true);

  const handleGeneratePdf = async () => {
    try {
      // Funkcja do zamiany polskich znaków na zwykłe
      const removePolishChars = (text) => {
        const polishMap = {
          'ą': 'a', 'Ą': 'A',
          'ć': 'c', 'Ć': 'C',
          'ę': 'e', 'Ę': 'E',
          'ł': 'l', 'Ł': 'L',
          'ń': 'n', 'Ń': 'N',
          'ó': 'o', 'Ó': 'O',
          'ś': 's', 'Ś': 'S',
          'ź': 'z', 'Ź': 'Z',
          'ż': 'z', 'Ż': 'Z'
        };
        
        return text.replace(/[ąĄćĆęĘłŁńŃóÓśŚźŹżŻ]/g, char => polishMap[char] || char);
      };

      const doc = new jsPDF();
      
      // Dodaj tło z szablonu CoA
      try {
        const imgUrl = '/templates/CoA-template.png';
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          img.onload = () => {
            // Dodaj obraz jako tło na całą stronę A4
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            doc.addImage(img, 'PNG', 0, 0, pageWidth, pageHeight);
            resolve();
          };
          img.onerror = reject;
          img.src = imgUrl;
        });
      } catch (error) {
        console.warn('Nie udało się załadować tła CoA:', error);
        // Kontynuuj bez tła
      }
      
      let yPosition = 45; // Pozycja startowa dla treści - bliżej nagłówka
      const pageHeight = doc.internal.pageSize.height;
      const margin = 20; // Margines - zmniejszony dla lepszego wykorzystania miejsca
      const lineHeight = 4; // Zmniejszamy wysokość linii dla większej kompaktowości
      
      // Funkcja do dodawania tła na nowej stronie
      const addBackgroundToPage = async () => {
        try {
          const imgUrl = '/templates/CoA-template.png';
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          return new Promise((resolve, reject) => {
            img.onload = () => {
              const pageWidth = doc.internal.pageSize.getWidth();
              const pageHeight = doc.internal.pageSize.getHeight();
              doc.addImage(img, 'PNG', 0, 0, pageWidth, pageHeight);
              resolve();
            };
            img.onerror = reject;
            img.src = imgUrl;
          });
        } catch (error) {
          console.warn('Nie udało się załadować tła na nowej stronie:', error);
        }
      };

      // Funkcja do sprawdzania i dodawania nowej strony
      const checkPageBreak = async (requiredSpace = lineHeight) => {
        if (yPosition + requiredSpace > pageHeight - margin) {
          doc.addPage();
          await addBackgroundToPage();
          yPosition = 80; // Pozycja startowa na nowej stronie (z miejscem na nagłówek)
        }
      };
      
      // Funkcja do formatowania tekstu z uwzględnieniem szerokości
      const addText = async (text, fontSize = 9, style = 'normal', indent = 0) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', style);
        
        // Konwertuj polskie znaki
        const cleanText = removePolishChars(text);
        
        const maxWidth = doc.internal.pageSize.width - 2 * margin - indent;
        const lines = doc.splitTextToSize(cleanText, maxWidth);
        
        for (const line of lines) {
          await checkPageBreak();
          doc.text(line, margin + indent, yPosition);
          yPosition += lineHeight;
        }
      };
      
                   // Funkcja do tworzenia tabeli
      const addTable = async (tableLines) => {
         const rows = [];
         let headers = [];
         
         // Parsowanie linii tabeli
         tableLines.forEach((line, index) => {
           if (line.includes('|')) {
             // Usuń pierwsze i ostatnie | jeśli istnieją, a następnie podziel
             let cleanLine = line.trim();
             if (cleanLine.startsWith('|')) cleanLine = cleanLine.substring(1);
             if (cleanLine.endsWith('|')) cleanLine = cleanLine.substring(0, cleanLine.length - 1);
             
             const cells = cleanLine.split('|').map(cell => removePolishChars(cell.trim()));
             
             if (index === 0) {
               headers = cells;
             } else if (!line.includes('---') && !line.includes('===')) {
               // Pomijamy linię separatora
               if (cells.length > 0 && cells.some(cell => cell.length > 0)) {
                 rows.push(cells);
               }
             }
           }
         });
         
                         if (headers.length > 0 && rows.length > 0) {
          const tableHeight = (headers.length + rows.length) * 6 + 15;
          await checkPageBreak(tableHeight);
          
          // Użyj autoTable dla lepszego formatowania
          if (typeof doc.autoTable === 'function') {
            doc.autoTable({
              head: [headers],
              body: rows,
              startY: yPosition,
              margin: { left: margin, right: margin },
              styles: { 
                fontSize: 8,
                cellPadding: 2,
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                halign: 'left',
                valign: 'middle'
              },
              headStyles: { 
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                lineColor: [0, 0, 0],
                lineWidth: 0.2,
                cellPadding: 2
              },
              bodyStyles: {
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                cellPadding: 2
              },
              alternateRowStyles: {
                fillColor: [250, 250, 250]
              },
              tableLineColor: [0, 0, 0],
              tableLineWidth: 0.2
            });
            yPosition = doc.lastAutoTable.finalY + 5;
                       } else {
              // Fallback - ręczne rysowanie tabeli
              await checkPageBreak((rows.length + 1) * 6 + 8);
              const startY = yPosition;
              const rowHeight = 6;
              const cellPadding = 1;
              const tableWidth = doc.internal.pageSize.width - 2 * margin;
              const colWidth = tableWidth / headers.length;
             
                           // Rysuj nagłówki
              doc.setFillColor(240, 240, 240);
              doc.rect(margin, startY, tableWidth, rowHeight, 'FD');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(8);
             headers.forEach((header, i) => {
               doc.text(removePolishChars(header), margin + i * colWidth + cellPadding, startY + rowHeight - 2);
             });
             
             // Rysuj wiersze danych
             doc.setFont('helvetica', 'normal');
             rows.forEach((row, rowIndex) => {
               const currentY = startY + (rowIndex + 1) * rowHeight;
               
               // Alternating colors
               if (rowIndex % 2 === 1) {
                 doc.setFillColor(250, 250, 250);
                 doc.rect(margin, currentY, tableWidth, rowHeight, 'F');
               }
               
               row.forEach((cell, cellIndex) => {
                 if (cellIndex < headers.length) {
                   doc.text(removePolishChars(cell || ''), margin + cellIndex * colWidth + cellPadding, currentY + rowHeight - 2);
                 }
               });
             });
             
             // Rysuj obramowanie
             doc.setDrawColor(0, 0, 0);
             doc.setLineWidth(0.2);
             // Zewnętrzne obramowanie
             doc.rect(margin, startY, tableWidth, (rows.length + 1) * rowHeight);
             
             // Linie poziome
             for (let i = 0; i <= rows.length; i++) {
               doc.line(margin, startY + i * rowHeight, margin + tableWidth, startY + i * rowHeight);
             }
             
             // Linie pionowe
             for (let i = 0; i <= headers.length; i++) {
               doc.line(margin + i * colWidth, startY, margin + i * colWidth, startY + (rows.length + 1) * rowHeight);
             }
             
                           yPosition = startY + (rows.length + 1) * rowHeight + 5;
           }
         }
       };
      
      // Parsowanie markdown
      const lines = markdownContent.split('\n');
      let tableLines = [];
      let inTable = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
                 // Sprawdź czy to tabela
         if (line.includes('|') && !inTable) {
           inTable = true;
           tableLines = [line];
           continue;
         } else if (inTable && (line.includes('|') || line.includes('---') || line.includes('==='))) {
           tableLines.push(line);
           continue;
                 } else if (inTable && !line.includes('|') && !line.includes('---') && !line.includes('===')) {
          // Koniec tabeli
          await addTable(tableLines);
          inTable = false;
          tableLines = [];
          yPosition += 3;
        }
        
        // Puste linie
        if (line.trim() === '') {
          yPosition += 2;
          continue;
        }
        
        // Nagłówki H1
        if (line.startsWith('# ')) {
          yPosition += 3;
          await addText(line.replace('# ', ''), 14, 'bold');
          yPosition += 2;
        }
        // Nagłówki H2
        else if (line.startsWith('## ')) {
          yPosition += 2;
          await addText(line.replace('## ', ''), 12, 'bold');
          yPosition += 1;
        }
        // Nagłówki H3
        else if (line.startsWith('### ')) {
          yPosition += 1;
          await addText(line.replace('### ', ''), 10, 'bold');
          yPosition += 1;
        }
        // Lista punktowana
        else if (line.startsWith('- ')) {
          await addText('• ' + line.replace('- ', ''), 8, 'normal', 10);
        }
        // Linie poziome
        else if (line.startsWith('---')) {
          await checkPageBreak(3);
          doc.setDrawColor(128, 128, 128);
          doc.line(margin, yPosition, doc.internal.pageSize.width - margin, yPosition);
          yPosition += 4;
        }
        // Tekst pogrubiony w linii
        else if (line.includes('**')) {
          // Prosta obsługa tekstu pogrubionego
          const parts = line.split('**');
          let processedText = '';
          for (let j = 0; j < parts.length; j++) {
            if (j % 2 === 1) {
              // To jest pogrubiony tekst - zamieniamy na wielkie litery dla lepszej widoczności
              processedText += parts[j].toUpperCase();
            } else {
              processedText += parts[j];
            }
          }
          await addText(processedText, 8);
        }
        // Zwykły tekst
        else {
          await addText(line, 8);
        }
      }
      
      // Jeśli zakończono w trakcie tworzenia tabeli
      if (inTable && tableLines.length > 0) {
        await addTable(tableLines);
      }
      
      // Zapisz plik
      const fileName = `CoA_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
      
      if (onGenerate) {
        onGenerate(markdownContent);
      }
      
      onClose();
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      alert('Błąd podczas generowania PDF: ' + error.message);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '90vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Generator CoA (Certificate of Analysis)</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={showPreview ? "Ukryj podgląd" : "Pokaż podgląd"}>
              <IconButton onClick={() => setShowPreview(!showPreview)}>
                <PreviewIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={handleClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ p: 0 }}>
        <Grid container sx={{ height: '100%' }}>
          {/* Pole edycji markdown */}
          <Grid item xs={showPreview ? 6 : 12}>
            <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2" gutterBottom>
                Treść markdown:
              </Typography>
              <TextField
                multiline
                fullWidth
                minRows={25}
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                placeholder="Wprowadź treść certyfikatu w formacie markdown..."
                variant="outlined"
                sx={{
                  flexGrow: 1,
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: '14px'
                  }
                }}
              />
            </Box>
          </Grid>
          
          {/* Podgląd markdown */}
          {showPreview && (
            <>
              <Divider orientation="vertical" flexItem />
              <Grid item xs={6}>
                <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Podgląd:
                  </Typography>
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      height: 'calc(100% - 30px)', 
                      overflow: 'auto',
                      backgroundColor: '#fafafa'
                    }}
                  >
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <Typography variant="h4" gutterBottom>{children}</Typography>,
                        h2: ({ children }) => <Typography variant="h5" gutterBottom sx={{ mt: 2 }}>{children}</Typography>,
                        h3: ({ children }) => <Typography variant="h6" gutterBottom sx={{ mt: 1 }}>{children}</Typography>,
                        p: ({ children }) => <Typography variant="body1" paragraph>{children}</Typography>,
                        strong: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold' }}>{children}</Typography>,
                        table: ({ children }) => (
                          <Box sx={{ overflowX: 'auto', my: 2 }}>
                            <table style={{ 
                              width: '100%', 
                              borderCollapse: 'collapse',
                              border: '1px solid #ddd'
                            }}>
                              {children}
                            </table>
                          </Box>
                        ),
                        thead: ({ children }) => (
                          <thead style={{ backgroundColor: '#f0f0f0' }}>
                            {children}
                          </thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody>
                            {children}
                          </tbody>
                        ),
                        tr: ({ children, isHeader }) => (
                          <tr style={{ 
                            backgroundColor: isHeader ? '#f0f0f0' : 'transparent',
                            '&:nth-of-type(even)': { backgroundColor: '#fafafa' }
                          }}>
                            {children}
                          </tr>
                        ),
                        th: ({ children }) => (
                          <th style={{ 
                            border: '1px solid #ddd', 
                            padding: '12px 8px', 
                            backgroundColor: '#f0f0f0',
                            textAlign: 'left',
                            fontWeight: 'bold',
                            fontSize: '14px'
                          }}>
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td style={{ 
                            border: '1px solid #ddd', 
                            padding: '8px',
                            fontSize: '14px'
                          }}>
                            {children}
                          </td>
                        ),
                        hr: () => <Divider sx={{ my: 2 }} />
                      }}
                    >
                      {markdownContent}
                    </ReactMarkdown>
                  </Paper>
                </Box>
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, borderTop: '1px solid #eee' }}>
        <Button onClick={handleClose} color="secondary">
          Anuluj
        </Button>
        <Button 
          onClick={handleGeneratePdf} 
          variant="contained" 
          startIcon={<PdfIcon />}
          color="primary"
        >
          Generuj PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CoAGeneratorDialog; 