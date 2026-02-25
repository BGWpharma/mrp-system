import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
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
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { formatDateForInput } from '../../utils/dateUtils';
import { Send as SendIcon, ArrowBack as ArrowBackIcon, Delete as DeleteIcon, Visibility as VisibilityIcon, AttachFile as AttachFileIcon, Print as PrintIcon, Assignment as AssignmentIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { getMONumbersForSelect } from '../../services/moService';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  getFormHeaderStyles, 
  getFormSectionStyles,
  getFormContainerStyles, 
  getFormPaperStyles, 
  getFormButtonStyles,
  getFormActionsStyles 
} from '../../styles/formStyles';

// Funkcja do pobierania szczegółów zadania produkcyjnego (MO) na podstawie numeru MO
const getMODetailsById = async (moNumber) => {
  try {
    const tasksRef = collection(db, 'productionTasks');
    const q = query(tasksRef, where('moNumber', '==', moNumber));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const taskDoc = querySnapshot.docs[0];
      const taskData = taskDoc.data();
      
      return {
        id: taskDoc.id,
        ...taskData
      };
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania szczegółów MO:', error);
    return null;
  }
};

// Komponent do wyświetlania istniejącego załącznika
const ExistingAttachment = ({ fileUrl, fileName, onRemove, t }) => {
  if (!fileUrl) return null;

  const isImage = fileName && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);

  return (
    <Box sx={{ 
      mt: 1, 
      p: 2, 
      border: '1px solid #e0e0e0', 
      borderRadius: 1, 
      backgroundColor: 'rgba(0, 0, 0, 0.02)',
      display: 'flex',
      alignItems: 'center',
      gap: 2
    }}>
      {isImage ? (
        <img 
          src={fileUrl} 
          alt={fileName || t('common.attachedFile')}
          style={{ 
            maxWidth: '60px', 
            maxHeight: '60px', 
            borderRadius: '4px',
            cursor: 'pointer' 
          }}
          onClick={() => window.open(fileUrl, '_blank')}
        />
      ) : (
        <AttachFileIcon color="action" />
      )}
      
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2" color="text.primary">
          {fileName || t('common.attachedFile')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('common.currentAttachment')}
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<VisibilityIcon />}
          onClick={() => window.open(fileUrl, '_blank')}
        >
          {t('common.show')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={onRemove}
        >
          {t('common.remove')}
        </Button>
      </Box>
    </Box>
  );
};

const CompletedMOForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEditMode = searchParams.get('edit') === 'true';
  const { currentUser } = useAuth();
  const theme = useTheme();
  const { t } = useTranslation('forms');

  const [formData, setFormData] = useState({
    email: '',
    date: new Date(),
    time: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }),
    moNumber: '',
    productQuantity: '',
    packagingLoss: '',
    bulkLoss: '',
    rawMaterialLoss: '',
    netCapsuleWeight: '', // Nowe pole - waga netto kapsułek
    mixingPlanReport: null,
    mixingPlanReportUrl: '',
    mixingPlanReportName: ''
  });

  const [editId, setEditId] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);
  const [removedAttachments, setRemovedAttachments] = useState([]);
  const [currentTaskData, setCurrentTaskData] = useState(null); // Dodamy stan na dane zadania
  const [generatingPDF, setGeneratingPDF] = useState(false); // Stan dla generowania PDF
  const [saving, setSaving] = useState(false);

  // Sprawdź, czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        // Konwersja z Timestamp (jeśli istnieje)
        const date = editData.date ? 
          (typeof editData.date === 'string' ? new Date(editData.date) : editData.date) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          date: date,
          time: editData.time || '',
          moNumber: editData.moNumber || '',
          productQuantity: editData.productQuantity || '',
          packagingLoss: editData.packagingLoss || '',
          bulkLoss: editData.bulkLoss || '',
          rawMaterialLoss: editData.rawMaterialLoss || '',
          netCapsuleWeight: editData.netCapsuleWeight || '', // Nowe pole
          mixingPlanReport: null,
          mixingPlanReportUrl: editData.mixingPlanReportUrl || '',
          mixingPlanReportName: editData.mixingPlanReportName || ''
        });
        setEditId(editData.id);
      }
      // Wyczyść dane z sessionStorage po ich wykorzystaniu
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

  // Pobierz numery MO przy pierwszym renderowaniu komponentu
  useEffect(() => {
    let cancelled = false;

    const fetchMONumbers = async () => {
      try {
        setLoadingMO(true);
        const options = await getMONumbersForSelect();
        if (cancelled) return;
        setMoOptions(options);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania numerów MO:', error);
      } finally {
        if (!cancelled) {
          setLoadingMO(false);
        }
      }
    };

    fetchMONumbers();
    
    if (currentUser && currentUser.email) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email
      }));
    }

    return () => { cancelled = true; };
  }, [currentUser]);

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Jeśli zmieniono numer MO, pobierz szczegóły zadania
    if (name === 'moNumber' && value) {
      try {
        setLoadingMO(true);
        const taskDetails = await getMODetailsById(value);
        if (taskDetails) {
          setCurrentTaskData(taskDetails);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania szczegółów MO:', error);
      } finally {
        setLoadingMO(false);
      }
    }
    
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
        mixingPlanReport: file,
        // Wyczyść istniejący URL gdy użytkownik wybierze nowy plik
        mixingPlanReportUrl: '',
        mixingPlanReportName: ''
      }));
    }
  };

  const handleRemoveAttachment = () => {
    // Jeśli istnieje URL do pliku, dodaj go do listy do usunięcia
    if (formData.mixingPlanReportUrl) {
      setRemovedAttachments(prev => [...prev, {
        url: formData.mixingPlanReportUrl,
        name: formData.mixingPlanReportName
      }]);
    }
    
    setFormData(prev => ({
      ...prev,
      mixingPlanReport: null,
      mixingPlanReportUrl: '',
      mixingPlanReportName: ''
    }));
  };

  const validate = () => {
    const errors = {};
    
    if (!formData.email) {
      errors.email = t('validation.emailRequired');
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = t('validation.emailInvalid');
    }
    
    if (!formData.time) {
      errors.time = t('validation.timeRequired');
    }
    
    if (!formData.moNumber) {
      errors.moNumber = t('validation.moNumberRequired');
    }
    
    if (!formData.productQuantity) {
      errors.productQuantity = t('validation.productionQuantityRequired');
    } else if (isNaN(formData.productQuantity)) {
      errors.productQuantity = t('validation.numericRequired');
    }
    
    if (formData.packagingLoss && isNaN(formData.packagingLoss)) {
      errors.packagingLoss = t('validation.numericRequired');
    }
    
    if (formData.rawMaterialLoss && isNaN(formData.rawMaterialLoss)) {
      errors.rawMaterialLoss = t('validation.numericRequired');
    }
    
    
    if (formData.netCapsuleWeight && isNaN(formData.netCapsuleWeight)) {
      errors.netCapsuleWeight = t('validation.numericRequired');
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Zabezpieczenie przed wielokrotnym zapisywaniem
    if (saving) return;
    
    if (validate()) {
      try {
        setSaving(true);
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
        
        // Obsługa plików
        // Usuń pliki które zostały oznaczone do usunięcia
        for (const removedFile of removedAttachments) {
          try {
            // Wyciągnij ścieżkę z URL Firebase Storage
            const url = removedFile.url;
            if (url.includes('firebase')) {
              // Dekoduj URL aby uzyskać ścieżkę pliku
              const baseUrl = 'https://firebasestorage.googleapis.com/v0/b/';
              const pathStart = url.indexOf('/o/') + 3;
              const pathEnd = url.indexOf('?');
              if (pathStart > 2 && pathEnd > pathStart) {
                const filePath = decodeURIComponent(url.substring(pathStart, pathEnd));
                const fileRef = ref(storage, filePath);
                await deleteObject(fileRef);
                console.log(`Usunięto plik: ${filePath}`);
              }
            }
          } catch (error) {
            console.error('Błąd podczas usuwania pliku:', error);
            // Kontynuuj mimo błędu usuwania
          }
        }
        
        // Sprawdź czy plik został usunięty
        const wasRemoved = removedAttachments.length > 0;
        
        if (formData.mixingPlanReport) {
          // Jeśli wybrano nowy plik, prześlij go
          const storageRef = ref(storage, `forms/skonczone-mo/${formData.moNumber}/${Date.now()}-${formData.mixingPlanReport.name}`);
          await uploadBytes(storageRef, formData.mixingPlanReport);
          const fileUrl = await getDownloadURL(storageRef);
          odpowiedzData.mixingPlanReportUrl = fileUrl;
          odpowiedzData.mixingPlanReportName = formData.mixingPlanReport.name;
        } else if (formData.mixingPlanReportUrl && !wasRemoved) {
          // Jeśli nie wybrano nowego pliku ale istnieje URL i nie został usunięty, zachowaj go
          odpowiedzData.mixingPlanReportUrl = formData.mixingPlanReportUrl;
          odpowiedzData.mixingPlanReportName = formData.mixingPlanReportName;
        } else if (wasRemoved) {
          // Jeśli plik został usunięty, ustaw pola na null
          odpowiedzData.mixingPlanReportUrl = null;
          odpowiedzData.mixingPlanReportName = null;
        }
        
        // Zapisz odpowiedź w Firestore
        if (isEditMode && editId) {
          // Aktualizacja istniejącego dokumentu
          const docRef = doc(db, 'Forms/SkonczoneMO/Odpowiedzi', editId);
          await updateDoc(docRef, odpowiedzData);
          console.log('Formularz zaktualizowany z danymi:', odpowiedzData);
        } else {
          // Dodanie nowego dokumentu
          await addDoc(odpowiedziRef, odpowiedzData);
          console.log('Formularz wysłany z danymi:', odpowiedzData);
        }
        
        setSubmitted(true);
        
        // Wyczyść listę usuniętych załączników po pomyślnym zapisie
        setRemovedAttachments([]);
        
        // Reset formularza po pomyślnym wysłaniu
        setFormData({
          email: '',
          date: new Date(),
          time: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }),
          moNumber: '',
          productQuantity: '',
          packagingLoss: '',
          bulkLoss: '',
          rawMaterialLoss: '',
          netCapsuleWeight: '', // Nowe pole
          mixingPlanReport: null,
          mixingPlanReportUrl: '',
          mixingPlanReportName: ''
        });
        setRemovedAttachments([]); // Wyczyść listę usuniętych załączników
        
        // Przekierowanie do strony odpowiedzi po 1.2 sekundach
        setTimeout(() => {
          navigate('/production/forms/responses?tab=completedMO');
        }, 1200);
      } catch (error) {
        console.error('Błąd podczas zapisywania formularza:', error);
        alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleBack = () => {
    navigate('/production/forms/responses?tab=completedMO');
  };

  // Funkcja do generowania PDF szczegółów MO i dodawania jako załącznik
  const handlePrintMODetails = async () => {
    if (!currentTaskData) {
      alert('Najpierw wybierz numer MO, aby pobrać dane zadania');
      return;
    }

    try {
      setGeneratingPDF(true);

      const { jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

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
            <h2>MO: ${currentTaskData.moNumber || 'Nie określono'}</h2>
          </div>
          
          <div style="margin-top: 20px;">
            <h3>Informacje podstawowe</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Nazwa zadania:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.name || 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Produkt:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.productName || 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Ilość:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.quantity || '0'} ${currentTaskData.unit || 'szt.'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Status:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.status || 'Nie określono'}</td></tr>
              ${(currentTaskData.recipeName || currentTaskData.recipe?.recipeName) ? `<tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Receptura:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.recipeName || currentTaskData.recipe?.recipeName}${currentTaskData.recipeVersion ? ` (wersja ${currentTaskData.recipeVersion})` : ''}</td></tr>` : ''}
            </table>
          </div>

          <div style="margin-top: 20px; background-color: #f9f9f9; border-left: 4px solid #2196F3; padding-left: 10px;">
            <h3>Informacje o partii produktu</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Numer LOT:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.lotNumber || 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Data ważności:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.expiryDate ? formatDateForPrint(currentTaskData.expiryDate).split(',')[0] : 'Nie określono'}</td></tr>
            </table>
          </div>

          <div style="margin-top: 20px;">
            <h3>Harmonogram</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Planowany start:</th><td style="border: 1px solid #ddd; padding: 8px;">${formatDateForPrint(currentTaskData.scheduledDate)}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Planowane zakończenie:</th><td style="border: 1px solid #ddd; padding: 8px;">${formatDateForPrint(currentTaskData.endDate)}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Szacowany czas produkcji:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.estimatedDuration ? (currentTaskData.estimatedDuration / 60).toFixed(2) + ' godz.' : 'Nie określono'}</td></tr>
              <tr><th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; width: 30%;">Czas na jednostkę:</th><td style="border: 1px solid #ddd; padding: 8px;">${currentTaskData.productionTimePerUnit ? parseFloat(currentTaskData.productionTimePerUnit).toFixed(2) + ' min./szt.' : 'Nie określono'}</td></tr>
            </table>
          </div>

          <div style="margin-top: 20px;">
            <h3>Materiały</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <thead>
                <tr>
                  <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Nazwa</th>
                  <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Zaplanowana ilość</th>
                  <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Jednostka</th>
                </tr>
              </thead>
              <tbody>
                ${(currentTaskData.materials || []).map(material => `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${material.name || 'Nie określono'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${material.quantity || 0}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${material.unit || 'szt.'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          ${currentTaskData.notes ? `
          <div style="margin-top: 20px;">
            <h3>Notatki</h3>
            <p>${currentTaskData.notes}</p>
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
        doc.text(`MO: ${currentTaskData.moNumber || 'Nie określono'}`, 105, yPos, { align: 'center' });
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
          ['Nazwa zadania', currentTaskData.name || 'Nie określono'],
          ['Produkt', currentTaskData.productName || 'Nie określono'],
          ['Ilość', `${currentTaskData.quantity || '0'} ${currentTaskData.unit || 'szt.'}`],
          ['Status', currentTaskData.status || 'Nie określono']
        ]);

        if (currentTaskData.recipeName || currentTaskData.recipe?.recipeName) {
          addSection('Receptura', [
            ['Receptura', `${currentTaskData.recipeName || currentTaskData.recipe?.recipeName}${currentTaskData.recipeVersion ? ` (wersja ${currentTaskData.recipeVersion})` : ''}`]
          ]);
        }

        addSection('Informacje o partii produktu', [
          ['Numer LOT', currentTaskData.lotNumber || 'Nie określono'],
          ['Data ważności', currentTaskData.expiryDate ? formatDateForPrint(currentTaskData.expiryDate).split(',')[0] : 'Nie określono']
        ]);

        addSection('Harmonogram', [
          ['Planowany start', formatDateForPrint(currentTaskData.scheduledDate)],
          ['Planowane zakończenie', formatDateForPrint(currentTaskData.endDate)],
          ['Szacowany czas produkcji', currentTaskData.estimatedDuration ? `${(currentTaskData.estimatedDuration / 60).toFixed(2)} godz.` : 'Nie określono'],
          ['Czas na jednostkę', currentTaskData.productionTimePerUnit ? `${parseFloat(currentTaskData.productionTimePerUnit).toFixed(2)} min./szt.` : 'Nie określono']
        ]);

        if (currentTaskData.materials && currentTaskData.materials.length > 0) {
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
          doc.text('Zaplanowana ilość', 100, yPos);
          doc.text('Jednostka', 150, yPos);
          yPos += 6;
          
          // Linia pod nagłówkami
          doc.line(25, yPos, 180, yPos);
          yPos += 4;
          
          currentTaskData.materials.forEach(material => {
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

        if (currentTaskData.notes) {
          addSection('Notatki', [['', currentTaskData.notes]]);
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
        const fileName = `Szczegoly_MO_${currentTaskData.moNumber || currentTaskData.id}_${new Date().toISOString().split('T')[0]}.pdf`;
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
        
        setFormData(prev => ({
          ...prev,
          mixingPlanReport: pdfFile,
          mixingPlanReportUrl: '',
          mixingPlanReportName: ''
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
      const fileName = `Szczegoly_MO_${currentTaskData.moNumber || currentTaskData.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      
      // Dodaj PDF jako załącznik do formularza
      setFormData(prev => ({
        ...prev,
        mixingPlanReport: pdfFile,
        // Wyczyść istniejący URL jeśli był
        mixingPlanReportUrl: '',
        mixingPlanReportName: ''
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
    <Container maxWidth="md" sx={getFormContainerStyles()}>
      <Paper sx={getFormPaperStyles(theme)}>
        <Box sx={getFormHeaderStyles(theme, isEditMode)}>
          <Typography variant="h5" gutterBottom align="center" fontWeight="bold" sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            color: isEditMode ? 'warning.main' : 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1
          }}>
            <AssignmentIcon sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }} />
            {isEditMode ? t('productionForms.completedMO.editTitle') : t('productionForms.completedMO.formTitle')}
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" paragraph sx={{
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            mb: 0
          }}>
            {t('common.emergencyContact')} mateusz@bgwpharma.com
          </Typography>
        </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {isEditMode ? t('common.successUpdate') : t('common.successCreate')}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit} sx={{ px: { xs: 1, sm: 0 } }}>
          {/* SEKCJA 1 z 4 - IDENTYFIKACJA */}
          <Box sx={getFormSectionStyles(theme, 'primary')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
              {t('common.section', { current: 1, total: 4 })}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              👤 {t('sections.identification')}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label={t('fields.email')}
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  error={!!validationErrors.email}
                  helperText={validationErrors.email}
                  InputProps={{
                    readOnly: true, // Pole tylko do odczytu
                  }}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                  <DateTimePicker
                    label={t('fields.fillDate')}
                    value={formData.date}
                    onChange={handleDateChange}
                    renderInput={(params) => <TextField {...params} fullWidth required />}
                    format="dd.MM.yyyy"
                  />
                </LocalizationProvider>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  required
                  fullWidth
                  label={t('fields.fillTime')}
                  name="time"
                  value={formData.time}
                  onChange={handleChange}
                  placeholder="np. 8:30"
                  error={!!validationErrors.time}
                  helperText={validationErrors.time}
                />
              </Grid>
            </Grid>
          </Box>

          {/* SEKCJA 2 z 4 - INFORMACJE O MO */}
          <Box sx={getFormSectionStyles(theme, 'warning')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'warning.main', fontWeight: 'bold' }}>
              {t('common.section', { current: 2, total: 4 })}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'warning.main' }}>
              📋 {t('sections.moReport')}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid item xs={12}>
                <FormControl 
                  fullWidth 
                  required 
                  error={!!validationErrors.moNumber}
                >
                  <InputLabel>{t('fields.moNumber')}</InputLabel>
                  <Select
                    name="moNumber"
                    value={formData.moNumber}
                    onChange={handleChange}
                    label={t('fields.moNumber')}
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
            </Grid>
          </Box>

          {/* SEKCJA 3 z 4 - DANE PRODUKCYJNE I STRATY */}
          <Box sx={getFormSectionStyles(theme, 'success')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'success.main', fontWeight: 'bold' }}>
              {t('common.section', { current: 3, total: 4 })}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'success.main' }}>
              📊 {t('sections.lossReport')}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label={t('fields.productionQuantity')}
                  name="productQuantity"
                  value={formData.productQuantity}
                  onChange={handleChange}
                  placeholder={t('helpers.numericOnly')}
                  error={!!validationErrors.productQuantity}
                  helperText={validationErrors.productQuantity}
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('fields.packagingLoss')}
                  name="packagingLoss"
                  value={formData.packagingLoss}
                  onChange={handleChange}
                  placeholder={t('helpers.finishedProductLossHelper')}
                  error={!!validationErrors.packagingLoss}
                  helperText={validationErrors.packagingLoss}
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('fields.bulkLoss')}
                  name="bulkLoss"
                  value={formData.bulkLoss}
                  onChange={handleChange}
                  placeholder={t('helpers.finishedProductLossHelper')}
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('fields.rawMaterialLoss')}
                  name="rawMaterialLoss"
                  value={formData.rawMaterialLoss}
                  onChange={handleChange}
                  placeholder={t('helpers.lossDescription')}
                  error={!!validationErrors.rawMaterialLoss}
                  helperText={validationErrors.rawMaterialLoss || t('helpers.rawMaterialLossHelper')}
                  multiline
                  rows={5}
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('fields.netCapsuleWeight')}
                  name="netCapsuleWeight"
                  value={formData.netCapsuleWeight}
                  onChange={handleChange}
                  placeholder={t('helpers.netCapsuleWeightHelper')}
                  type="number"
                  inputProps={{ step: "0.01", min: "0" }}
                  error={!!validationErrors.netCapsuleWeight}
                  helperText={validationErrors.netCapsuleWeight || t('helpers.optionalField')}
                />
              </Grid>
            </Grid>
          </Box>

          {/* SEKCJA 4 z 4 - ZAŁĄCZNIKI */}
          <Box sx={getFormSectionStyles(theme, 'info')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'info.main', fontWeight: 'bold' }}>
              {t('common.section', { current: 4, total: 4 })}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'info.main' }}>
              📎 {t('sections.attachments')}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('fields.mixingPlanReport')}:
                </Typography>
                
                {/* Wyświetlaj istniejący załącznik z URL */}
                <ExistingAttachment
                  fileUrl={formData.mixingPlanReportUrl}
                  fileName={formData.mixingPlanReportName}
                  onRemove={handleRemoveAttachment}
                  t={t}
                />
                
                {/* Wyświetlaj lokalny plik (wygenerowany PDF) */}
                {formData.mixingPlanReport && !formData.mixingPlanReportUrl && (
                  <Box sx={{ 
                    mt: 1, 
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
                  onChange={handleFileChange}
                  style={{ width: '100%', marginTop: '8px' }}
                />
              </Grid>
            </Grid>
          </Box>

          {/* PRZYCISKI AKCJI */}
          <Box sx={getFormActionsStyles()}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
              sx={getFormButtonStyles('outlined')}
            >
              {t('common.back')}
            </Button>
            {currentTaskData && (
              <Button
                variant="outlined"
                color="primary"
                startIcon={<PrintIcon />}
                onClick={handlePrintMODetails}
                disabled={generatingPDF}
                sx={getFormButtonStyles('outlined')}
              >
                {generatingPDF ? t('common.generatingPdf') : t('common.generatePdf')}
              </Button>
            )}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saving}
              startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
              sx={{
                ...getFormButtonStyles('contained'),
                flexGrow: 1
              }}
            >
              {saving ? t('common.saving') : (isEditMode ? t('common.update') : t('common.submit'))}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default CompletedMOForm; 