import React, { useState, useEffect } from 'react';
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
  Divider,
  Autocomplete,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
  Preview as PreviewIcon,
  Upload as UploadIcon,
  Description as FileIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { getAllPurchaseOrders, updatePurchaseOrder } from '../../services/purchaseOrderService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../services/firebase/config';

const CoAGeneratorDialog = ({ open, onClose, onGenerate }) => {
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();
  const [documentName, setDocumentName] = useState(`CoA_${new Date().toISOString().slice(0, 10)}`);
  const [selectedPO, setSelectedPO] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [markdownContent, setMarkdownContent] = useState(`# Certificate of Analysis (CoA)

## Informacje o produkcie
**Nazwa produktu:** [Nazwa produktu]<br>**LOT:** [Numer LOT]<br>**Data produkcji:** [Data]<br>**Data waznosci:** [Data]

## Parametry jakosciowe
### Wyglad
**Kolor:** [Opis]<br>**Zapach:** [Opis]<br>**Konsystencja:** [Opis]

### Parametry chemiczne
| Parametr | Jednostka | Wynik | Norma |
|----------|-----------|-------|-------|
| pH | - | 7.2 | 6.8 - 7.5 |
| Wilgotność | % | 2.1 | ≤ 3.0 |
| Zawartość substancji aktywnej | % | 98.5 | ≥ 98.0 |
| Temperatura topnienia | °C | 125 ± 2 | 123 - 127 |
| Gęstość | g/cm³ | 1.05 | ≈ 1.0 |

### Parametry mikrobiologiczne
| Parametr | Jednostka | Wynik | Norma |
|----------|-----------|-------|-------|
| Liczba bakterii aerobowych | jtk/g | <10 | ≤ 1000 |
| Drożdże i pleśnie | jtk/g | <10 | ≤ 100 |
| E. coli | CFU/g | Nie wykryto | Nieobecność |

## Podsumowanie
Produkt **ZGODNY** z wymaganiami specyfikacji.

**Osoba odpowiedzialna:** [Imie nazwisko] | **Data badania:** [Data]

---
*Certyfikat wygenerowany przez system MRP BGW Pharma*`);

  const [showPreview, setShowPreview] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);

  const handleGeneratePdf = async () => {
    try {
      // Funkcja do zamiany polskich znaków na zwykłe
      const sanitizeTextForPDF = (text) => {
        if (!text) return '';
        
        // Mapa zamian polskich znaków na łacinskie (tylko jeśli nie są obsługiwane przez PDF)
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
        
        // Zamień tylko polskie znaki, zachowaj znaki matematyczne i specjalne
        let result = text.replace(/[ąĄćĆęĘłŁńŃóÓśŚźŹżŻ]/g, char => polishMap[char] || char);
        
        // Obsługa znaków matematycznych i specjalnych używanych w analizach
        const mathSymbolMap = {
          '≥': '>=',        // większe lub równe
          '≤': '<=',        // mniejsze lub równe  
          '±': '+/-',       // plus-minus
          '≠': '!=',        // różne od
          '≈': '~',         // w przybliżeniu
          '∞': 'inf',       // nieskończoność
          '°': 'deg',       // stopnie (temperatura)
          'µ': 'u',         // mikro (jednostka)
          '×': 'x',         // znak mnożenia
          '÷': '/',         // znak dzielenia
          '−': '-',         // minus matematyczny
          '–': '-',         // en dash
          '—': '-'          // em dash
        };
        
        // Zastąp znaki matematyczne tylko jeśli są problematyczne w PDF
        Object.keys(mathSymbolMap).forEach(symbol => {
          result = result.replace(new RegExp(symbol, 'g'), mathSymbolMap[symbol]);
        });
        
        // Obsługa potęg - zamień unicode superscript na zwykły tekst z ^
        const superscriptMap = {
          '⁰': '^0', '¹': '^1', '²': '^2', '³': '^3', '⁴': '^4',
          '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9',
          '⁺': '^+', '⁻': '^-', '⁼': '^=', '⁽': '^(', '⁾': '^)'
        };
        
        Object.keys(superscriptMap).forEach(sup => {
          result = result.replace(new RegExp(sup, 'g'), superscriptMap[sup]);
        });
        
        // Obsługa indeksów dolnych - zamień unicode subscript na zwykły tekst z _
        const subscriptMap = {
          '₀': '_0', '₁': '_1', '₂': '_2', '₃': '_3', '₄': '_4',
          '₅': '_5', '₆': '_6', '₇': '_7', '₈': '_8', '₉': '_9',
          '₊': '_+', '₋': '_-', '₌': '_=', '₍': '_(', '₎': '_)'
        };
        
        Object.keys(subscriptMap).forEach(sub => {
          result = result.replace(new RegExp(sub, 'g'), subscriptMap[sub]);
        });
        
        // Obsługa tekstu pogrubionego **tekst** - usuń gwiazdki i zamień na wielkie litery
        result = result.replace(/\*\*(.*?)\*\*/g, (match, content) => {
          return content.toUpperCase();
        });
        
        // Obsługa znaczników <br> i <br/> - zamień na znak nowej linii
        result = result.replace(/<br\s*\/?>/gi, '\n');
        
        return result;
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
        
        // Konwertuj polskie znaki i znaki specjalne
        const cleanText = sanitizeTextForPDF(text);
        
        // Podziel tekst na linie według znaków nowej linii (z <br>)
        const paragraphs = cleanText.split('\n');
        
        const maxWidth = doc.internal.pageSize.width - 2 * margin - indent;
        
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i];
          
          if (paragraph.trim() === '') {
            // Pusta linia - dodaj mniejszy odstęp
            yPosition += lineHeight * 0.5;
            continue;
          }
          
          const lines = doc.splitTextToSize(paragraph, maxWidth);
          
          for (const line of lines) {
            await checkPageBreak();
            doc.text(line, margin + indent, yPosition);
            yPosition += lineHeight;
          }
          
          // Dodaj małą przerwę między paragrafami (wywołanymi przez <br>)
          if (i < paragraphs.length - 1 && paragraphs[i + 1].trim() !== '') {
            yPosition += lineHeight * 0.3;
          }
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
             
             const cells = cleanLine.split('|').map(cell => sanitizeTextForPDF(cell.trim()));
             
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
          
          // Użyj autoTable dla lepszego formatowania z obsługą zawijania tekstu
          if (typeof doc.autoTable === 'function') {
            doc.autoTable({
              head: [headers],
              body: rows,
              startY: yPosition,
              margin: { left: margin, right: margin },
              styles: { 
                fontSize: 8,
                cellPadding: 3,
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                halign: 'left',
                valign: 'top',
                overflow: 'linebreak',
                cellWidth: 'wrap'
              },
              headStyles: { 
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                lineColor: [0, 0, 0],
                lineWidth: 0.2,
                cellPadding: 3,
                halign: 'center',
                valign: 'middle',
                minCellHeight: 8
              },
              bodyStyles: {
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                cellPadding: 3,
                minCellHeight: 8,
                overflow: 'linebreak'
              },
              alternateRowStyles: {
                fillColor: [250, 250, 250]
              },
              tableLineColor: [0, 0, 0],
              tableLineWidth: 0.2,
              // Definiuj szerokości kolumn dla lepszego rozmieszczenia
              columnStyles: {
                0: { cellWidth: 'auto', minCellWidth: 40 }, // Pierwsza kolumna (Parametr)
                1: { cellWidth: 25, halign: 'center' },    // Druga kolumna (Jednostka) 
                2: { cellWidth: 30, halign: 'center' },    // Trzecia kolumna (Wynik)
                3: { cellWidth: 'auto', minCellWidth: 35 } // Czwarta kolumna (Norma)
              },
              didParseCell: function(data) {
                // Zwiększ wysokość wiersza jeśli tekst jest długi
                if (data.cell.text && data.cell.text.length > 0) {
                  const textLength = data.cell.text.join(' ').length;
                  if (textLength > 30) {
                    data.cell.styles.minCellHeight = Math.max(12, Math.ceil(textLength / 30) * 6);
                  }
                }
              }
            });
            yPosition = doc.lastAutoTable.finalY + 5;
                       } else {
              // Fallback - ręczne rysowanie tabeli z zawijaniem tekstu
              const tableWidth = doc.internal.pageSize.width - 2 * margin;
              
              // Definiuj szerokości kolumn (dostosuj do zawartości)
              const colWidths = [];
              if (headers.length === 4) {
                // Typowa tabela CoA: Parametr | Jednostka | Wynik | Norma
                colWidths[0] = tableWidth * 0.4;  // 40% dla parametru
                colWidths[1] = tableWidth * 0.15; // 15% dla jednostki
                colWidths[2] = tableWidth * 0.2;  // 20% dla wyniku
                colWidths[3] = tableWidth * 0.25; // 25% dla normy
              } else {
                // Równo podziel dla innych tabel
                const defaultWidth = tableWidth / headers.length;
                for (let i = 0; i < headers.length; i++) {
                  colWidths[i] = defaultWidth;
                }
              }
              
              const cellPadding = 2;
              const minRowHeight = 8;
              let currentY = yPosition;
              
              // Funkcja do zawijania tekstu
                             const wrapText = (text, maxWidth, fontSize = 8) => {
                 doc.setFontSize(fontSize);
                 const words = sanitizeTextForPDF(text || '').split(' ');
                const lines = [];
                let currentLine = '';
                
                words.forEach(word => {
                  const testLine = currentLine + (currentLine ? ' ' : '') + word;
                  const testWidth = doc.getTextWidth(testLine);
                  
                  if (testWidth > maxWidth - 2 * cellPadding && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                  } else {
                    currentLine = testLine;
                  }
                });
                
                if (currentLine) {
                  lines.push(currentLine);
                }
                
                return lines;
              };
              
              // Oblicz wysokość każdego wiersza na podstawie zawartości
              const rowHeights = [];
              
              // Wysokość nagłówka
              let headerHeight = minRowHeight;
              headers.forEach((header, i) => {
                const wrappedLines = wrapText(header, colWidths[i], 8);
                headerHeight = Math.max(headerHeight, wrappedLines.length * 4 + cellPadding * 2);
              });
              rowHeights.push(headerHeight);
              
              // Wysokości wierszy danych
              rows.forEach(row => {
                let rowHeight = minRowHeight;
                row.forEach((cell, cellIndex) => {
                  if (cellIndex < colWidths.length) {
                    const wrappedLines = wrapText(cell, colWidths[cellIndex], 8);
                    rowHeight = Math.max(rowHeight, wrappedLines.length * 4 + cellPadding * 2);
                  }
                });
                rowHeights.push(rowHeight);
              });
              
              // Sprawdź czy tabela mieści się na stronie
              const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);
              await checkPageBreak(totalHeight + 8);
              currentY = yPosition;
              
              // Rysuj nagłówki
              doc.setFillColor(240, 240, 240);
              doc.rect(margin, currentY, tableWidth, rowHeights[0], 'FD');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(8);
              
              let xOffset = margin;
              headers.forEach((header, i) => {
                const wrappedLines = wrapText(header, colWidths[i], 8);
                wrappedLines.forEach((line, lineIndex) => {
                  doc.text(line, xOffset + cellPadding, currentY + cellPadding + (lineIndex + 1) * 4);
                });
                xOffset += colWidths[i];
              });
              
              currentY += rowHeights[0];
              
              // Rysuj wiersze danych
              doc.setFont('helvetica', 'normal');
              rows.forEach((row, rowIndex) => {
                const rowHeight = rowHeights[rowIndex + 1];
                
                // Alternating colors
                if (rowIndex % 2 === 1) {
                  doc.setFillColor(250, 250, 250);
                  doc.rect(margin, currentY, tableWidth, rowHeight, 'F');
                }
                
                xOffset = margin;
                row.forEach((cell, cellIndex) => {
                  if (cellIndex < colWidths.length) {
                    const wrappedLines = wrapText(cell, colWidths[cellIndex], 8);
                    wrappedLines.forEach((line, lineIndex) => {
                      // Wyśrodkuj tekst w komórkach z jednostkami i wynikami
                      let textX = xOffset + cellPadding;
                      if (cellIndex === 1 || cellIndex === 2) { // Jednostka i Wynik
                        const textWidth = doc.getTextWidth(line);
                        textX = xOffset + (colWidths[cellIndex] - textWidth) / 2;
                      }
                      doc.text(line, textX, currentY + cellPadding + (lineIndex + 1) * 4);
                    });
                  }
                  xOffset += colWidths[cellIndex] || 0;
                });
                
                currentY += rowHeight;
              });
              
              // Rysuj obramowanie
              doc.setDrawColor(0, 0, 0);
              doc.setLineWidth(0.2);
              
              // Zewnętrzne obramowanie
              doc.rect(margin, yPosition, tableWidth, currentY - yPosition);
              
              // Linie poziome
              let tempY = yPosition;
              rowHeights.forEach(height => {
                doc.line(margin, tempY + height, margin + tableWidth, tempY + height);
                tempY += height;
              });
              
              // Linie pionowe
              xOffset = margin;
              for (let i = 0; i <= headers.length; i++) {
                doc.line(xOffset, yPosition, xOffset, currentY);
                if (i < colWidths.length) {
                  xOffset += colWidths[i];
                }
              }
              
              yPosition = currentY + 5;
           }
         }
       };
      
      // Funkcja do sprawdzania czy po nagłówku następuje tabela
      const findNextTable = (lines, startIndex) => {
        for (let i = startIndex + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line === '') continue; // Pomijamy puste linie
          if (line.includes('|')) {
            // Znaleźliśmy początek tabeli, teraz znajdźmy jej koniec
            const tableLines = [];
            for (let j = i; j < lines.length; j++) {
              const tableLine = lines[j];
              if (tableLine.includes('|') || tableLine.includes('---') || tableLine.includes('===')) {
                tableLines.push(tableLine);
              } else if (tableLine.trim() === '') {
                continue; // Pomijamy puste linie w tabeli
              } else {
                break; // Koniec tabeli
              }
            }
            return { found: true, tableLines, endIndex: i + tableLines.length - 1 };
          }
          break; // Jeśli napotkamy coś innego niż pusty wiersz lub tabelę, przerywamy
        }
        return { found: false, tableLines: [], endIndex: startIndex };
      };

      // Funkcja do obliczania wysokości tabeli z uwzględnieniem zawijania tekstu
      const calculateTableHeight = (tableLines) => {
        let dataRows = 0;
        let maxCellsInRow = 0;
        let hasLongText = false;
        
        tableLines.forEach(line => {
          if (line.includes('|') && !line.includes('---') && !line.includes('===')) {
            dataRows++;
            // Sprawdź czy wiersz zawiera długi tekst
            const cells = line.split('|').map(cell => cell.trim());
            maxCellsInRow = Math.max(maxCellsInRow, cells.length);
            
            cells.forEach(cell => {
              if (cell.length > 25) { // Jeśli tekst jest dłuższy niż 25 znaków
                hasLongText = true;
              }
            });
          }
        });
        
        // Bazowa wysokość wiersza - większa jeśli jest długi tekst
        const baseRowHeight = hasLongText ? 12 : 8;
        const headerHeight = 12; // Nagłówek zawsze wyższy
        
        return Math.max(dataRows, 1) * baseRowHeight + headerHeight + 15; // 15 to dodatkowy margines
      };

      // Funkcja do obliczania wysokości nagłówka
      const calculateHeaderHeight = (line) => {
        if (line.startsWith('# ')) return 3 + 18 + 2; // margines + wysokość tekstu + margines
        if (line.startsWith('## ')) return 2 + 14 + 1; // margines + wysokość tekstu + margines
        if (line.startsWith('### ')) return 1 + 12 + 1; // margines + wysokość tekstu + margines
        return 10; // domyślna wysokość
      };

      // Parsowanie markdown z inteligentnym przenoszeniem nagłówków z tabelami
      const lines = markdownContent.split('\n');
      let tableLines = [];
      let inTable = false;
      let i = 0;
      
      while (i < lines.length) {
        const line = lines[i];
        
        // Sprawdź czy jesteśmy w trakcie przetwarzania tabeli
        if (inTable) {
          if (line.includes('|') || line.includes('---') || line.includes('===')) {
            tableLines.push(line);
            i++;
            continue;
          } else if (line.trim() === '') {
            i++;
            continue; // Pomijamy puste linie w tabeli
          } else {
            // Koniec tabeli
            await addTable(tableLines);
            inTable = false;
            tableLines = [];
            yPosition += 3;
            continue; // Przetworz tę linię w następnej iteracji
          }
        }
        
        // Sprawdź czy to tabela
        if (line.includes('|') && !inTable) {
          inTable = true;
          tableLines = [line];
          i++;
          continue;
        }
        
        // Sprawdź czy to nagłówek
        if (line.startsWith('#')) {
          const nextTable = findNextTable(lines, i);
          
          if (nextTable.found) {
            // Oblicz całkowitą wysokość nagłówka + tabeli
            const headerHeight = calculateHeaderHeight(line);
            const tableHeight = calculateTableHeight(nextTable.tableLines);
            const totalHeight = headerHeight + tableHeight + 5; // 5 to dodatkowy margines między nagłówkiem a tabelą
            
            // Sprawdź czy nagłówek + tabela mieszczą się na stronie
            await checkPageBreak(totalHeight);
            
            // Dodaj nagłówek
            if (line.startsWith('# ')) {
              yPosition += 3;
              await addText(line.replace('# ', ''), 14, 'bold');
              yPosition += 2;
            } else if (line.startsWith('## ')) {
              yPosition += 2;
              await addText(line.replace('## ', ''), 12, 'bold');
              yPosition += 1;
            } else if (line.startsWith('### ')) {
              yPosition += 1;
              await addText(line.replace('### ', ''), 10, 'bold');
              yPosition += 1;
            }
            
            // Przeskocz do tabeli i przetwórz ją
            i = lines.findIndex((l, idx) => idx > i && l.includes('|'));
            if (i !== -1) {
              inTable = true;
              tableLines = [lines[i]];
            }
            i++;
            continue;
          } else {
            // Nagłówek bez tabeli - przetwórz normalnie
            if (line.startsWith('# ')) {
              yPosition += 3;
              await addText(line.replace('# ', ''), 14, 'bold');
              yPosition += 2;
            } else if (line.startsWith('## ')) {
              yPosition += 2;
              await addText(line.replace('## ', ''), 12, 'bold');
              yPosition += 1;
            } else if (line.startsWith('### ')) {
              yPosition += 1;
              await addText(line.replace('### ', ''), 10, 'bold');
              yPosition += 1;
            }
          }
        }
        // Puste linie
        else if (line.trim() === '') {
          yPosition += 2;
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
        
        i++;
      }
      
      // Jeśli zakończono w trakcie tworzenia tabeli
      if (inTable && tableLines.length > 0) {
        await addTable(tableLines);
      }
      
      // Zapisz plik
      const fileName = documentName + '.pdf';
      
      // Jeśli wybrano PO, dodaj CoA do załączników
      if (selectedPO) {
        try {
          // Przekonwertuj PDF na blob
          const pdfBlob = doc.output('blob');
          
          // Prześlij do Firebase Storage
          const timestamp = new Date().getTime();
          const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
          const storagePath = `purchase-order-attachments/${selectedPO}/${timestamp}_${sanitizedFileName}`;
          
          const fileRef = ref(storage, storagePath);
          await uploadBytes(fileRef, pdfBlob);
          const downloadURL = await getDownloadURL(fileRef);
          
          // Przygotuj obiekt załącznika
          const newAttachment = {
            id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
            fileName: fileName,
            storagePath,
            downloadURL,
            contentType: 'application/pdf',
            size: pdfBlob.size,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentUser?.uid
          };
          
                     // Pobierz aktualne dane wybranego PO (optymalizacja - nie pobieramy wszystkich)
          const selectedPOData = purchaseOrders.find(po => po.id === selectedPO);
          
          if (selectedPOData) {
            // Dodaj nowy załącznik do istniejących
            const updatedAttachments = [...(selectedPOData.attachments || []), newAttachment];
            
            // Aktualizuj PO z nowym załącznikiem
            await updatePurchaseOrder(selectedPO, { 
              attachments: updatedAttachments 
            }, currentUser?.uid);
            
            showSuccess(`CoA zostało dodane do załączników zamówienia ${selectedPOData.number}`);
          }
        } catch (error) {
          console.error('Błąd podczas dodawania CoA do PO:', error);
          showError('Błąd podczas dodawania CoA do zamówienia: ' + error.message);
        }
      }
      
      // Pobierz plik lokalnie
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

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Sprawdź rozszerzenie pliku
    if (!file.name.toLowerCase().endsWith('.md')) {
      showError('Proszę wybrać plik z rozszerzeniem .md');
      return;
    }
    
    // Sprawdź rozmiar pliku (max 1MB)
    if (file.size > 1024 * 1024) {
      showError('Plik jest za duży. Maksymalny rozmiar to 1MB.');
      return;
    }
    
    try {
      setUploadingFile(true);
      
      // Czytaj zawartość pliku
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        setMarkdownContent(content);
        showSuccess(`Plik ${file.name} został załadowany pomyślnie`);
        setUploadingFile(false);
      };
      
      reader.onerror = () => {
        showError('Błąd podczas czytania pliku');
        setUploadingFile(false);
      };
      
      reader.readAsText(file, 'UTF-8');
    } catch (error) {
      console.error('Błąd podczas uploadu pliku:', error);
      showError('Błąd podczas uploadu pliku: ' + error.message);
      setUploadingFile(false);
    }
    
    // Resetuj input
    event.target.value = '';
  };

  const handleDownloadMarkdown = () => {
    try {
      // Twórz Blob z zawartością markdown
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      
      // Twórz URL dla blob
      const url = URL.createObjectURL(blob);
      
      // Twórz element <a> do pobrania
      const link = document.createElement('a');
      link.href = url;
      link.download = `${documentName || 'CoA'}.md`;
      
      // Kliknij link automatycznie
      document.body.appendChild(link);
      link.click();
      
      // Posprzątaj
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showSuccess('Plik markdown został pobrany');
    } catch (error) {
      console.error('Błąd podczas pobierania pliku markdown:', error);
      showError('Błąd podczas pobierania pliku markdown: ' + error.message);
    }
  };

  const handleClose = () => {
    // Resetuj stan
    setDocumentName(`CoA_${new Date().toISOString().slice(0, 10)}`);
    setSelectedPO('');
    setUploadingFile(false);
    onClose();
  };

  useEffect(() => {
    const fetchPurchaseOrders = async () => {
      if (!open) return; // Pobieraj dane tylko gdy dialog jest otwarty
      
      try {
        setLoadingPOs(true);
        const orders = await getAllPurchaseOrders();
        setPurchaseOrders(orders);
      } catch (error) {
        console.error('Błąd podczas pobierania zamówień:', error);
        showError('Błąd podczas pobierania zamówień: ' + error.message);
      } finally {
        setLoadingPOs(false);
      }
    };

    fetchPurchaseOrders();
  }, [open, showError]);

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
            <Tooltip title="Załaduj plik markdown (.md)">
              <IconButton component="label" disabled={uploadingFile}>
                {uploadingFile ? <CircularProgress size={24} /> : <UploadIcon />}
                <input
                  type="file"
                  accept=".md"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </IconButton>
            </Tooltip>
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
      
      <DialogContent sx={{ p: 0, height: 'calc(100% - 120px)', display: 'flex', flexDirection: 'column' }}>
        {/* Nazwa dokumentu i wybór PO - pełna szerokość na górze */}
        <Box sx={{ p: 2, borderBottom: '1px solid #eee', flexShrink: 0 }}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Nazwa dokumentu"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="np. CoA_Batch_XYZ"
                size="small"
                helperText="Bez rozszerzenia .pdf"
              />
            </Grid>
            <Grid item xs={6}>
              <Autocomplete
                size="small"
                options={purchaseOrders}
                value={purchaseOrders.find(po => po.id === selectedPO) || null}
                onChange={(event, newValue) => {
                  setSelectedPO(newValue ? newValue.id : '');
                }}
                getOptionLabel={(option) => 
                  `${option.number} - ${option.supplier?.name || 'Brak dostawcy'} (${option.status})`
                }
                filterOptions={(options, { inputValue }) => {
                  return options.filter(option => 
                    option.number.toLowerCase().includes(inputValue.toLowerCase()) ||
                    (option.supplier?.name || '').toLowerCase().includes(inputValue.toLowerCase()) ||
                    option.status.toLowerCase().includes(inputValue.toLowerCase())
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Purchase Order (opcjonalnie)"
                    placeholder="Wyszukaj PO po numerze, dostawcy lub statusie"
                    helperText={selectedPO ? 'CoA zostanie dodany do załączników PO' : 'Jeśli wybierzesz PO, CoA zostanie automatycznie dodany do załączników'}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingPOs ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                loading={loadingPOs}
                disabled={loadingPOs}
                noOptionsText="Brak zamówień do wyświetlenia"
                clearOnBlur={false}
                clearOnEscape={true}
              />
            </Grid>
          </Grid>
        </Box>

        {/* Główny obszar edycji i podglądu */}
        <Box sx={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
          {/* Pole edycji markdown - lewa strona */}
          <Box sx={{ 
            width: showPreview ? '50%' : '100%', 
            p: 2, 
            display: 'flex', 
            flexDirection: 'column',
            minHeight: 0
          }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">
                Treść markdown:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  component="label"
                  size="small"
                  startIcon={uploadingFile ? <CircularProgress size={16} /> : <FileIcon />}
                  disabled={uploadingFile}
                  sx={{ minWidth: 'auto' }}
                >
                  {uploadingFile ? 'Ładowanie...' : 'Załaduj .md'}
                  <input
                    type="file"
                    accept=".md"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </Button>
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadMarkdown}
                  sx={{ minWidth: 'auto' }}
                >
                  Pobierz .md
                </Button>
              </Box>
            </Box>
                          <TextField
                multiline
                fullWidth
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                placeholder="Wprowadź treść certyfikatu w formacie markdown lub załaduj plik .md..."
                variant="outlined"
                helperText="Obsługiwane: nagłówki (# ## ###), tabele (|), pogrubienie (**tekst**), listy (- element), linie poziome (---), łamanie linii (<br>)"
              sx={{
                flexGrow: 1,
                '& .MuiInputBase-root': {
                  height: '100%',
                  alignItems: 'stretch'
                },
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  height: '100% !important',
                  overflow: 'auto !important'
                }
              }}
            />
          </Box>
          
          {/* Podgląd markdown - prawa strona */}
          {showPreview && (
            <>
              <Divider orientation="vertical" flexItem />
              <Box sx={{ 
                width: '50%', 
                p: 2, 
                display: 'flex', 
                flexDirection: 'column',
                minHeight: 0
              }}>
                <Typography variant="subtitle2" gutterBottom>
                  Podgląd:
                </Typography>
                <Paper 
                  elevation={1} 
                  sx={{ 
                    p: 2, 
                    flexGrow: 1,
                    overflow: 'auto',
                    backgroundColor: '#fafafa'
                  }}
                >
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', fontSize: '18px', mt: 2, mb: 1 }}>{children}</Typography>,
                      h2: ({ children }) => <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', fontSize: '16px', mt: 1.5, mb: 0.5 }}>{children}</Typography>,
                      h3: ({ children }) => <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', fontSize: '14px', mt: 1, mb: 0.5 }}>{children}</Typography>,
                      p: ({ children }) => {
                        // Obsłuż przypadek gdy paragraph zawiera mixed content z **bold**
                        return <Typography variant="body1" paragraph sx={{ fontSize: '12px', lineHeight: 1.4, mb: 1 }}>{children}</Typography>;
                      },
                      strong: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{children}</Typography>,
                      em: ({ children }) => <Typography component="span" sx={{ fontStyle: 'italic' }}>{children}</Typography>,
                      ul: ({ children }) => (
                        <Box component="ul" sx={{ 
                          pl: 2, 
                          my: 1,
                          '& li': {
                            fontSize: '12px',
                            lineHeight: 1.4,
                            mb: 0.5,
                            listStyleType: 'disc'
                          }
                        }}>
                          {children}
                        </Box>
                      ),
                      ol: ({ children }) => (
                        <Box component="ol" sx={{ 
                          pl: 2, 
                          my: 1,
                          '& li': {
                            fontSize: '12px',
                            lineHeight: 1.4,
                            mb: 0.5
                          }
                        }}>
                          {children}
                        </Box>
                      ),
                      li: ({ children }) => <li>{children}</li>,
                      table: ({ children }) => (
                        <Box sx={{ 
                          overflowX: 'auto', 
                          my: 2,
                          '& table': {
                            width: '100%',
                            borderCollapse: 'collapse',
                            border: '2px solid #000',
                            fontSize: '12px'
                          },
                          '& tbody tr:nth-of-type(even)': {
                            backgroundColor: '#fafafa'
                          }
                        }}>
                          <table>
                            {children}
                          </table>
                        </Box>
                      ),
                      thead: ({ children }) => (
                        <thead style={{ backgroundColor: '#f0f0f0' }}>
                          {children}
                        </thead>
                      ),
                      tbody: ({ children }) => <tbody>{children}</tbody>,
                      tr: ({ children }) => <tr>{children}</tr>,
                      th: ({ children }) => (
                        <th style={{ 
                          border: '1px solid #000', 
                          padding: '8px 6px', 
                          backgroundColor: '#f0f0f0',
                          textAlign: 'left',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          lineHeight: 1.2
                        }}>
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td style={{ 
                          border: '1px solid #000', 
                          padding: '6px',
                          fontSize: '12px',
                          lineHeight: 1.2,
                          verticalAlign: 'middle'
                        }}>
                          {children}
                        </td>
                      ),
                      hr: () => <Divider sx={{ my: 2, borderColor: '#888', borderWidth: '1px' }} />,
                      // Dodaj obsługę kodu
                      code: ({ children, inline }) => 
                        inline ? (
                          <Typography component="code" sx={{ 
                            fontFamily: 'monospace', 
                            backgroundColor: '#f5f5f5', 
                            padding: '2px 4px', 
                            borderRadius: '3px',
                            fontSize: '11px'
                          }}>
                            {children}
                          </Typography>
                        ) : (
                          <Box component="pre" sx={{ 
                            fontFamily: 'monospace', 
                            backgroundColor: '#f5f5f5', 
                            padding: 2, 
                            borderRadius: 1,
                            fontSize: '11px',
                            overflow: 'auto',
                            my: 1
                          }}>
                            <code>{children}</code>
                          </Box>
                        ),
                      // Obsługa cytatów
                      blockquote: ({ children }) => (
                        <Box sx={{ 
                          borderLeft: '4px solid #ccc', 
                          paddingLeft: 2, 
                          marginLeft: 1,
                          fontStyle: 'italic',
                          color: '#666',
                          my: 1
                        }}>
                          {children}
                        </Box>
                      ),
                      // Obsługa znacznika <br>
                      br: () => <br />
                    }}
                                        skipHtml={false}
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[]}
                    >
                      {markdownContent}
                    </ReactMarkdown>
                </Paper>
              </Box>
            </>
          )}
        </Box>
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