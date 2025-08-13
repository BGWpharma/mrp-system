import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Container,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  Divider,
  CircularProgress
} from '@mui/material';
import { Close as CloseIcon, Send as SendIcon, ArrowBack as ArrowBackIcon, Print as PrintIcon, Delete as DeleteIcon, AttachFile as AttachFileIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { getMONumbersForSelect } from '../../services/moService';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../hooks/useAuth';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const CompletedMOFormDialog = ({ 
  open, 
  onClose, 
  task = null,
  onSuccess = null 
}) => {
  const { currentUser } = useAuth();
  const theme = useTheme();

  const [formData, setFormData] = useState({
    email: '',
    date: new Date(),
    time: '',
    moNumber: '',
    productQuantity: '',
    packagingLoss: '',
    bulkLoss: '',
    rawMaterialLoss: '',
    netCapsuleWeight: '', // Nowe pole - waga netto kapsułek
    mixingPlanReport: null
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false); // Stan dla generowania PDF

  // Przygotuj dane wstępne na podstawie zadania produkcyjnego
  useEffect(() => {
    if (task && open) {
      setFormData(prev => ({
        ...prev,
        email: currentUser?.email || '',
        moNumber: task.moNumber || '',
        date: new Date(),
        time: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
      }));
    }
  }, [task, open, currentUser]);

  // Pobierz numery MO przy pierwszym renderowaniu komponentu
  useEffect(() => {
    if (open) {
      const fetchMONumbers = async () => {
        try {
          setLoadingMO(true);
          const options = await getMONumbersForSelect();
          setMoOptions(options);
        } catch (error) {
          console.error('Błąd podczas pobierania numerów MO:', error);
        } finally {
          setLoadingMO(false);
        }
      };

      fetchMONumbers();
    }
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Wyczyść błąd walidacji po zmianie wartości
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleDateChange = (date) => {
    setFormData(prev => ({
      ...prev,
      date
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        mixingPlanReport: file
      }));
    }
  };

  const validate = () => {
    const errors = {};
    
    if (!formData.email) {
      errors.email = 'Adres e-mail jest wymagany';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Podaj prawidłowy adres e-mail';
    }
    
    if (!formData.time) {
      errors.time = 'Godzina wypełnienia jest wymagana';
    }
    
    if (!formData.moNumber) {
      errors.moNumber = 'Numer MO jest wymagany';
    }
    
    if (!formData.productQuantity) {
      errors.productQuantity = 'Ilość produktu końcowego jest wymagana';
    } else if (isNaN(formData.productQuantity)) {
      errors.productQuantity = 'Podaj wartość liczbową';
    }
    
    if (formData.packagingLoss && isNaN(formData.packagingLoss)) {
      errors.packagingLoss = 'Podaj wartość liczbową';
    }
    
    if (formData.rawMaterialLoss && isNaN(formData.rawMaterialLoss)) {
      errors.rawMaterialLoss = 'Podaj wartość liczbową';
    }
    
    
    if (formData.netCapsuleWeight && isNaN(formData.netCapsuleWeight)) {
      errors.netCapsuleWeight = 'Podaj wartość liczbową';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validate()) {
      try {
        setSubmitted(false);
        
        // Ścieżka do kolekcji odpowiedzi formularza w Firestore
        const odpowiedziRef = collection(db, 'Forms/SkonczoneMO/Odpowiedzi');
        
        // Przygotuj dane do zapisania
        const odpowiedzData = {
          email: formData.email,
          date: formData.date,
          time: formData.time,
          moNumber: formData.moNumber,
          productQuantity: formData.productQuantity,
          packagingLoss: formData.packagingLoss,
          bulkLoss: formData.bulkLoss,
          rawMaterialLoss: formData.rawMaterialLoss,
          netCapsuleWeight: formData.netCapsuleWeight, // Nowe pole
          createdAt: serverTimestamp()
        };
        
        // Jeśli dołączono plik, prześlij go do Firebase Storage
        if (formData.mixingPlanReport) {
          const storageRef = ref(storage, `forms/skonczone-mo/${formData.moNumber}/${Date.now()}-${formData.mixingPlanReport.name}`);
          await uploadBytes(storageRef, formData.mixingPlanReport);
          const fileUrl = await getDownloadURL(storageRef);
          odpowiedzData.mixingPlanReportUrl = fileUrl;
          odpowiedzData.mixingPlanReportName = formData.mixingPlanReport.name;
        }
        
        // Dodaj dokument do kolekcji
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Formularz zakończonego MO wysłany z danymi:', odpowiedzData);
        
        setSubmitted(true);
        
        // Wywołaj callback sukcesu i zamknij dialog
        if (onSuccess) {
          onSuccess(odpowiedzData);
        }
        setTimeout(() => {
          if (onClose) {
            onClose();
          }
        }, 1500);
        
      } catch (error) {
        console.error('Błąd podczas zapisywania formularza zakończonego MO:', error);
        alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
      }
    }
  };

  const handleClose = () => {
    // Resetuj formularz przy zamknięciu
    setFormData({
      email: currentUser?.email || '',
      date: new Date(),
      time: '',
      moNumber: task?.moNumber || '',
      productQuantity: '',
      packagingLoss: '',
      bulkLoss: '',
      rawMaterialLoss: '',
      netCapsuleWeight: '', // Nowe pole
      mixingPlanReport: null
    });
    setValidationErrors({});
    setSubmitted(false);
    onClose();
  };

  // Funkcja do generowania PDF szczegółów MO i dodawania jako załącznik
  const handlePrintMODetails = async () => {
    if (!task) {
      alert('Brak danych zadania do wygenerowania PDF');
      return;
    }

    try {
      setGeneratingPDF(true);

      // Funkcja pomocnicza do formatowania dat
      const formatDateForPrint = (dateValue) => {
        if (!dateValue) return 'Nie określono';
        
        try {
          let date;
          if (dateValue instanceof Date) {
            date = dateValue;
          } else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
          } else if (dateValue.seconds) {
            date = new Date(dateValue.seconds * 1000);
          } else {
            date = new Date(dateValue);
          }
          
          if (isNaN(date.getTime())) {
            return 'Nie określono';
          }
          
          return date.toLocaleDateString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch (error) {
          console.error('Błąd konwersji daty:', error);
          return 'Nie określono';
        }
      };

      // Przygotuj zawartość HTML (skopiowaną z TaskDetailsPage)
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; margin: 20px; background: white; padding: 20px;">
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">
            <h1 style="margin-bottom: 5px;">Szczegóły zlecenia produkcyjnego</h1>
            <h2>MO: ${task.moNumber || 'Nie określono'}</h2>
          </div>
          
          <div style="margin-top: 20px;">
            <h3>Informacje podstawowe</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Nazwa zadania:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.name || 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Produkt:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.productName || 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Ilość:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.quantity || '0'} ${task.unit || 'szt.'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Status:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.status || 'Nie określono'}</td></tr>
              ${(task.recipeName || task.recipe?.recipeName) ? `<tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Receptura:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.recipeName || task.recipe?.recipeName}${task.recipeVersion ? ` (wersja ${task.recipeVersion})` : ''}</td></tr>` : ''}
            </table>
          </div>

          <div style="margin-top: 20px; background-color: #f9f9f9; border-left: 4px solid #2196F3; padding-left: 10px;">
            <h3>Informacje o partii produktu</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Numer LOT:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.lotNumber || 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Data ważności:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.expiryDate ? formatDateForPrint(task.expiryDate).split(',')[0] : 'Nie określono'}</td></tr>
            </table>
          </div>

          <div style="margin-top: 20px;">
            <h3>Harmonogram</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Planowany start:</th><td style="border: 1px solid #ddd; padding: 8px;">${formatDateForPrint(task.scheduledDate)}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Planowane zakończenie:</th><td style="border: 1px solid #ddd; padding: 8px;">${formatDateForPrint(task.endDate)}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Szacowany czas produkcji:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.estimatedDuration ? (task.estimatedDuration / 60).toFixed(2) + ' godz.' : 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Czas na jednostkę:</th><td style="border: 1px solid #ddd; padding: 8px;">${task.productionTimePerUnit ? parseFloat(task.productionTimePerUnit).toFixed(2) + ' min./szt.' : 'Nie określono'}</td></tr>
            </table>
          </div>

          <div style="margin-top: 20px;">
            <h3>Materiały</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <thead>
                <tr>
                  <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Nazwa</th>
                  <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Rzeczywista ilość</th>
                  <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Jednostka</th>
                </tr>
              </thead>
              <tbody>
                ${(task.materials || []).map(material => `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${material.name || 'Nie określono'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${material.quantity || 0}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${material.unit || 'szt.'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          ${task.notes ? `
          <div style="margin-top: 20px;">
            <h3>Notatki</h3>
            <p>${task.notes}</p>
          </div>
          ` : ''}

          <div style="text-align: center; margin-top: 50px; font-size: 0.8em; border-top: 1px solid #ccc; padding-top: 10px;">
            <p>Data wydruku: ${new Date().toLocaleDateString('pl-PL', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
            <p>System MRP</p>
          </div>
        </div>
      `;

      // Utwórz tymczasowy div z HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '794px'; // Szerokość A4 w pikselach przy 96 DPI
      tempDiv.style.height = 'auto';
      tempDiv.style.backgroundColor = 'white';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      tempDiv.style.fontSize = '14px';
      tempDiv.style.lineHeight = '1.4';
      tempDiv.style.color = 'black';
      document.body.appendChild(tempDiv);

      // Poczekaj na pełne renderowanie
      await new Promise(resolve => setTimeout(resolve, 500));

      // Konwertuj HTML na canvas z ulepszonymi opcjami
      const canvas = await html2canvas(tempDiv, {
        backgroundColor: '#ffffff',
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: 794,
        height: tempDiv.scrollHeight,
        windowWidth: 794,
        windowHeight: tempDiv.scrollHeight,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.querySelector('div');
          if (clonedElement) {
            clonedElement.style.fontFamily = 'Arial, sans-serif';
            clonedElement.style.fontSize = '14px';
            clonedElement.style.color = 'black';
          }
        }
      });

      // Usuń tymczasowy div
      document.body.removeChild(tempDiv);

      // Sprawdź czy canvas zawiera dane (nie jest pusty)
      const imgData = canvas.toDataURL('image/png');
      
      // Jeśli canvas jest pusty (tylko białe tło), użyj alternatywnego podejścia
      if (canvas.width < 100 || canvas.height < 100) {
        console.warn('Canvas jest pusty, używam alternatywnego podejścia z jsPDF');
        
        // Alternatywne rozwiązanie z prostym formatowaniem jsPDF
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        let yPos = 20;
        const lineHeight = 6;
        const pageHeight = 280;

        // Nagłówek
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Szczegóły zlecenia produkcyjnego', 105, yPos, { align: 'center' });
        yPos += 10;
        
        doc.setFontSize(14);
        doc.text(`MO: ${task.moNumber || 'Nie określono'}`, 105, yPos, { align: 'center' });
        yPos += 15;

        // Linia
        doc.line(20, yPos, 190, yPos);
        yPos += 10;

        // Funkcja dodająca sekcję
        const addSection = (title, data) => {
          if (yPos > pageHeight - 30) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(title, 20, yPos);
          yPos += 8;
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          
          data.forEach(([label, value]) => {
            if (yPos > pageHeight - 10) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(`${label}: ${value}`, 25, yPos);
            yPos += lineHeight;
          });
          yPos += 5;
        };

        // Dodaj sekcje
        addSection('Informacje podstawowe', [
          ['Nazwa zadania', task.name || 'Nie określono'],
          ['Produkt', task.productName || 'Nie określono'],
          ['Ilość', `${task.quantity || '0'} ${task.unit || 'szt.'}`],
          ['Status', task.status || 'Nie określono']
        ]);

        if (task.recipeName || task.recipe?.recipeName) {
          addSection('Receptura', [
            ['Receptura', `${task.recipeName || task.recipe?.recipeName}${task.recipeVersion ? ` (wersja ${task.recipeVersion})` : ''}`]
          ]);
        }

        addSection('Informacje o partii produktu', [
          ['Numer LOT', task.lotNumber || 'Nie określono'],
          ['Data ważności', task.expiryDate ? formatDateForPrint(task.expiryDate).split(',')[0] : 'Nie określono']
        ]);

        addSection('Harmonogram', [
          ['Planowany start', formatDateForPrint(task.scheduledDate)],
          ['Planowane zakończenie', formatDateForPrint(task.endDate)],
          ['Szacowany czas produkcji', task.estimatedDuration ? `${(task.estimatedDuration / 60).toFixed(2)} godz.` : 'Nie określono'],
          ['Czas na jednostkę', task.productionTimePerUnit ? `${parseFloat(task.productionTimePerUnit).toFixed(2)} min./szt.` : 'Nie określono']
        ]);

        if (task.materials && task.materials.length > 0) {
          // Dodaj nagłówki dla materiałów
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('Materiały', 20, yPos);
          yPos += 8;
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text('Nazwa', 25, yPos);
          doc.text('Rzeczywista ilość', 100, yPos);
          doc.text('Jednostka', 150, yPos);
          yPos += 6;
          
          // Linia pod nagłówkami
          doc.line(25, yPos, 180, yPos);
          yPos += 4;
          
          task.materials.forEach(material => {
            if (yPos > pageHeight - 10) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(material.name || 'Nie określono', 25, yPos);
            doc.text(String(material.quantity || 0), 100, yPos);
            doc.text(material.unit || 'szt.', 150, yPos);
            yPos += lineHeight;
          });
          yPos += 5;
        }

        if (task.notes) {
          addSection('Notatki', [['', task.notes]]);
        }

        // Stopka
        yPos = pageHeight - 15;
        doc.setFontSize(8);
        doc.text(`Data wydruku: ${new Date().toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`, 105, yPos, { align: 'center' });
        doc.text('System MRP', 105, yPos + 5, { align: 'center' });

        const pdfBlob = doc.output('blob');
        const fileName = `Szczegoly_MO_${task.moNumber || task.id}_${new Date().toISOString().split('T')[0]}.pdf`;
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
        
        setFormData(prev => ({
          ...prev,
          mixingPlanReport: pdfFile
        }));

        alert(`PDF "${fileName}" został wygenerowany (tryb podstawowy) i dodany jako załącznik!`);
        return;
      }

      // Jeśli canvas jest OK, użyj oryginalnego podejścia
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm', 
        format: 'a4'
      });

      const imgWidth = 210; // A4 width w mm
      const pageHeight = 295; // A4 height w mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      // Dodaj pierwszą stronę
      doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Dodaj kolejne strony jeśli potrzebne
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        doc.addPage();
        doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Konwertuj PDF do Blob
      const pdfBlob = doc.output('blob');
      
      // Utwórz plik File z Blob
      const fileName = `Szczegoly_MO_${task.moNumber || task.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      
      // Dodaj PDF jako załącznik do formularza
      setFormData(prev => ({
        ...prev,
        mixingPlanReport: pdfFile
      }));

      alert(`PDF "${fileName}" został wygenerowany i dodany jako załącznik do formularza!`);

    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      alert('Wystąpił błąd podczas generowania PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          minHeight: '80vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ 
        p: { xs: 2, sm: 3 },
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ 
            p: 2, 
            borderRadius: 2, 
            background: theme.palette.mode === 'dark' 
            ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(76,175,80,0.1) 100%)'
            : 'linear-gradient(135deg, #f5f5f5 0%, #e8f5e8 100%)',
            border: '1px solid',
            borderColor: 'primary.light',
            flex: 1,
            mr: 2
          }}>
            <Typography variant="h6" sx={{
              fontSize: { xs: '1.1rem', sm: '1.25rem' },
              color: 'primary.main',
              fontWeight: 'bold'
            }}>
              📋 Raport - Skończone MO
            </Typography>
          </Box>
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ 
          mb: 2,
          p: 2,
          borderRadius: 2,
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(33,150,243,0.1) 0%, rgba(255,255,255,0.05) 100%)'
            : 'linear-gradient(135deg, #f0f8ff 0%, #f5f5f5 100%)',
          border: '1px solid',
          borderColor: 'divider'
        }}>
          <Typography variant="body2" align="center" color="text.secondary" sx={{
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            mb: 0
          }}>
            W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
          </Typography>
        </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Raport skończonego MO został wysłany pomyślnie!
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Adres e-mail"
                name="email"
                value={formData.email}
                onChange={handleChange}
                error={!!validationErrors.email}
                helperText={validationErrors.email}
                InputProps={{
                  readOnly: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data wypełnienia"
                  value={formData.date}
                  onChange={handleDateChange}
                  renderInput={(params) => 
                    <TextField {...params} fullWidth required />
                  }
                  format="dd.MM.yyyy"
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                label="Godzina wypełnienia"
                name="time"
                type="time"
                value={formData.time}
                onChange={handleChange}
                error={!!validationErrors.time}
                helperText={validationErrors.time}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                error={!!validationErrors.moNumber}
              >
                <InputLabel>Manufacturing Order</InputLabel>
                <Select
                  name="moNumber"
                  value={formData.moNumber}
                  onChange={handleChange}
                  label="Manufacturing Order"
                  disabled={loadingMO}
                  startAdornment={
                    loadingMO ? 
                    <CircularProgress size={20} sx={{ mr: 1 }} /> : 
                    null
                  }
                >
                  {moOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
                {validationErrors.moNumber && (
                  <Typography variant="caption" color="error">
                    {validationErrors.moNumber}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Ilość produktu końcowego (szt.)"
                name="productQuantity"
                type="number"
                value={formData.productQuantity}
                onChange={handleChange}
                error={!!validationErrors.productQuantity}
                helperText={validationErrors.productQuantity}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Straty opakowania (szt.)"
                name="packagingLoss"
                type="number"
                value={formData.packagingLoss}
                onChange={handleChange}
                error={!!validationErrors.packagingLoss}
                helperText={validationErrors.packagingLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Straty wieczka (szt.)"
                name="bulkLoss"
                type="number"
                value={formData.bulkLoss}
                onChange={handleChange}
                error={!!validationErrors.bulkLoss}
                helperText={validationErrors.bulkLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Straty surowca (kg)"
                name="rawMaterialLoss"
                type="number"
                value={formData.rawMaterialLoss}
                onChange={handleChange}
                error={!!validationErrors.rawMaterialLoss}
                helperText={validationErrors.rawMaterialLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
                        <Grid item xs={12}>
              <TextField
                fullWidth
                label="Waga netto kapsułek (opcjonalne)"
                name="netCapsuleWeight"
                type="number"
                value={formData.netCapsuleWeight}
                onChange={handleChange}
                error={!!validationErrors.netCapsuleWeight}
                helperText={validationErrors.netCapsuleWeight || "Podaj wagę netto kapsułek w gramach lub kilogramach"}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Raport planu mieszań
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Plik PDF z raportem mieszań (opcjonalnie)
              </Typography>
              
              {/* Wyświetlaj lokalny plik (wygenerowany PDF) */}
              {formData.mixingPlanReport && (
                <Box sx={{ 
                  mt: 1, 
                  mb: 2,
                  p: 2, 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 1, 
                  backgroundColor: 'rgba(76, 175, 80, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2
                }}>
                  <AttachFileIcon color="success" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" color="text.primary">
                      {formData.mixingPlanReport.name}
                    </Typography>
                    <Typography variant="caption" color="success.main">
                      Plik PDF wygenerowany automatycznie - gotowy do wysłania
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setFormData(prev => ({ ...prev, mixingPlanReport: null }))}
                  >
                    Usuń
                  </Button>
                </Box>
              )}
              
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<ArrowBackIcon />}
                  onClick={handleClose}
                >
                  Anuluj
                </Button>
                {task && (
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<PrintIcon />}
                    onClick={handlePrintMODetails}
                    disabled={generatingPDF}
                  >
                    {generatingPDF ? 'Generowanie...' : 'Załącz szczegóły MO'}
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                  startIcon={<SendIcon />}
                >
                  Wyślij raport
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default CompletedMOFormDialog; 