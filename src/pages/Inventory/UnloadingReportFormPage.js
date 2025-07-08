import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Divider,
  Alert,
  Snackbar,
  InputAdornment,
  CircularProgress
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, CloudUpload as CloudUploadIcon, AttachFile as AttachFileIcon, Delete as DeleteIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInventoryEmployeeOptions, useInventoryPositionOptions } from '../../hooks/useFormOptions';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../hooks/useAuth';

const UnloadingReportFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  
  // Sprawdź czy jesteśmy w trybie edycji
  const isEditMode = new URLSearchParams(location.search).get('edit') === 'true';
  
  // Pobieranie opcji z bazy danych
  const { options: employeeOptions, loading: employeeLoading } = useInventoryEmployeeOptions();
  const { options: positionOptions, loading: positionLoading } = useInventoryPositionOptions();
  
  const [formData, setFormData] = useState({
    // Informacje użytkownika
    email: '',
    
    // Sekcja 1: Identyfikacja
    employeeName: '',
    position: '',
    fillDate: new Date(),
    
    // Sekcja 2: Informacje o rozładunku
    unloadingDate: new Date(),
    carrierName: '',
    vehicleRegistration: '',
    vehicleTechnicalCondition: '',
    transportHygiene: '',
    notes: '',
    
    // Sekcja 3: Informacje o towarze
    supplierName: '',
    poNumber: '',
    goodsDescription: '',
    palletQuantity: '',
    cartonsTubsQuantity: '',
    weight: '',
    visualInspectionResult: '',
    ecoCertificateNumber: '',
    goodsNotes: '',
    
    // Załączniki
    documentsFile: null,
    documentsUrl: '',
    documentsName: ''
  });
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [editId, setEditId] = useState(null);

  // Sprawdź czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        // Konwersja dat z Timestamp na Date
        const fillDate = editData.fillDate ? 
          (editData.fillDate.toDate ? editData.fillDate.toDate() : new Date(editData.fillDate)) : 
          new Date();
        
        const unloadingDate = editData.unloadingDate ? 
          (editData.unloadingDate.toDate ? editData.unloadingDate.toDate() : new Date(editData.unloadingDate)) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          employeeName: editData.employeeName || '',
          position: editData.position || '',
          fillDate: fillDate,
          unloadingDate: unloadingDate,
          carrierName: editData.carrierName || '',
          vehicleRegistration: editData.vehicleRegistration || '',
          vehicleTechnicalCondition: editData.vehicleTechnicalCondition || '',
          transportHygiene: editData.transportHygiene || '',
          notes: editData.notes || '',
          supplierName: editData.supplierName || '',
          poNumber: editData.poNumber || '',
          goodsDescription: editData.goodsDescription || '',
          palletQuantity: editData.palletQuantity || '',
          cartonsTubsQuantity: editData.cartonsTubsQuantity || '',
          weight: editData.weight || '',
          visualInspectionResult: editData.visualInspectionResult || '',
          ecoCertificateNumber: editData.ecoCertificateNumber || '',
          goodsNotes: editData.goodsNotes || '',
          documentsFile: null,
          documentsUrl: editData.documentsUrl || '',
          documentsName: editData.documentsName || ''
        });
        
        setEditId(editData.id);
      }
      // Wyczyść dane z sessionStorage po ich wykorzystaniu
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

  // Ustaw email zalogowanego użytkownika (tylko jeśli nie jesteśmy w trybie edycji)
  useEffect(() => {
    if (currentUser && currentUser.email && !isEditMode) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email
      }));
    }
  }, [currentUser, isEditMode]);

  const handleInputChange = (field) => (event) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Usuń błąd po poprawieniu pola
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleDateChange = (field) => (date) => {
    setFormData(prev => ({
      ...prev,
      [field]: date
    }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setFormData(prev => ({
      ...prev,
      documentsFile: file
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Walidacja imienia i nazwiska
    if (!formData.employeeName) {
      newErrors.employeeName = 'Imię i nazwisko jest wymagane';
    }
    
    // Walidacja stanowiska
    if (!formData.position) {
      newErrors.position = 'Stanowisko jest wymagane';
    }
    
    // Walidacja przewoźnika
    if (!formData.carrierName.trim()) {
      newErrors.carrierName = 'Nazwa przewoźnika jest wymagana';
    }
    if (!formData.vehicleRegistration.trim()) {
      newErrors.vehicleRegistration = 'Nr rejestracyjny samochodu jest wymagany';
    }
    if (!formData.vehicleTechnicalCondition) {
      newErrors.vehicleTechnicalCondition = 'Stan techniczny samochodu jest wymagany';
    }
    if (!formData.transportHygiene) {
      newErrors.transportHygiene = 'Higiena środka transportu i kierowcy jest wymagana';
    }
    
    // Walidacja informacji o towarze
    if (!formData.supplierName.trim()) {
      newErrors.supplierName = 'Nazwa dostawcy jest wymagana';
    }
    if (!formData.poNumber.trim()) {
      newErrors.poNumber = 'Numer zamówienia (PO) jest wymagany';
    }
    if (!formData.goodsDescription.trim()) {
      newErrors.goodsDescription = 'Nazwa i ilość dostarczonego towaru jest wymagana';
    }
    if (!formData.palletQuantity.trim()) {
      newErrors.palletQuantity = 'Ilość palet jest wymagana';
    }
    if (!formData.cartonsTubsQuantity.trim()) {
      newErrors.cartonsTubsQuantity = 'Ilość kartonów/tub jest wymagana';
    }
    if (!formData.weight.trim()) {
      newErrors.weight = 'Waga jest wymagana';
    }
    if (!formData.visualInspectionResult) {
      newErrors.visualInspectionResult = 'Wynik oceny wizualnej jest wymagany';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      // Przygotuj dane do zapisania
      const odpowiedzData = {
        email: formData.email,
        employeeName: formData.employeeName,
        position: formData.position,
        fillDate: formData.fillDate,
        unloadingDate: formData.unloadingDate,
        carrierName: formData.carrierName,
        vehicleRegistration: formData.vehicleRegistration,
        vehicleTechnicalCondition: formData.vehicleTechnicalCondition,
        transportHygiene: formData.transportHygiene,
        notes: formData.notes,
        supplierName: formData.supplierName,
        poNumber: formData.poNumber,
        goodsDescription: formData.goodsDescription,
        palletQuantity: formData.palletQuantity,
        cartonsTubsQuantity: formData.cartonsTubsQuantity,
        weight: formData.weight,
        visualInspectionResult: formData.visualInspectionResult,
        ecoCertificateNumber: formData.ecoCertificateNumber,
        goodsNotes: formData.goodsNotes,
        type: 'unloading-report'
      };

      // Obsługa załączników
      if (formData.documentsFile) {
        const storageRef = ref(storage, `forms/rozladunek-towaru/${Date.now()}-${formData.documentsFile.name}`);
        await uploadBytes(storageRef, formData.documentsFile);
        const fileUrl = await getDownloadURL(storageRef);
        odpowiedzData.documentsUrl = fileUrl;
        odpowiedzData.documentsName = formData.documentsFile.name;
      } else if (formData.documentsUrl) {
        // Zachowaj istniejące załączniki w trybie edycji
        odpowiedzData.documentsUrl = formData.documentsUrl;
        odpowiedzData.documentsName = formData.documentsName;
      }

      if (isEditMode && editId) {
        // Aktualizuj istniejący dokument
        odpowiedzData.updatedAt = serverTimestamp();
        const docRef = doc(db, 'Forms/RozladunekTowaru/Odpowiedzi', editId);
        await updateDoc(docRef, odpowiedzData);
        console.log('Formularz rozładunku towaru zaktualizowany z danymi:', odpowiedzData);
      } else {
        // Utwórz nowy dokument
        odpowiedzData.createdAt = serverTimestamp();
        const odpowiedziRef = collection(db, 'Forms/RozladunekTowaru/Odpowiedzi');
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Formularz rozładunku towaru wysłany z danymi:', odpowiedzData);
      }
      
      setShowSuccess(true);
      
      // Reset formularza po pomyślnym wysłaniu (tylko w trybie tworzenia)
      if (!isEditMode) {
        setFormData({
          email: currentUser?.email || '',
          employeeName: '',
          position: '',
          fillDate: new Date(),
          unloadingDate: new Date(),
          carrierName: '',
          vehicleRegistration: '',
          vehicleTechnicalCondition: '',
          transportHygiene: '',
          notes: '',
          supplierName: '',
          poNumber: '',
          goodsDescription: '',
          palletQuantity: '',
          cartonsTubsQuantity: '',
          weight: '',
          visualInspectionResult: '',
          ecoCertificateNumber: '',
          goodsNotes: '',
          documentsFile: null,
          documentsUrl: '',
          documentsName: ''
        });
      }
      
      // Przekierowanie po 2 sekundach
      setTimeout(() => {
        navigate('/inventory/forms/responses');
      }, 2000);
      
    } catch (error) {
      console.error('Błąd podczas zapisywania formularza:', error);
      alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
    }
  };

  const handleBack = () => {
    navigate('/inventory/forms');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            variant="outlined"
          >
            Powrót
          </Button>
          <Box>
            <Typography variant="h5" gutterBottom>
              {isEditMode ? 'EDYCJA RAPORTU - ROZŁADUNEK TOWARU' : 'RAPORT - ROZŁADUNEK TOWARU'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isEditMode ? 'Edytuj wypełniony formularz rozładunku towaru' : 'Formularz dokumentujący proces rozładunku towaru'}
            </Typography>
          </Box>
        </Box>

        {/* Informacja kontaktowa */}
        <Alert severity="info" sx={{ mb: 3 }}>
          W razie awarii i pilnych zgłoszeń prosimy o kontakt: <strong>mateusz@bgwpharma.com</strong>
        </Alert>

        <Paper component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
          <Grid container spacing={3}>
            {/* Email użytkownika */}
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Adres e-mail"
                name="email"
                value={formData.email}
                onChange={handleInputChange('email')}
                error={!!errors.email}
                helperText={errors.email}
                InputProps={{
                  readOnly: true, // Pole tylko do odczytu
                }}
              />
            </Grid>
            
            {/* Sekcja 1: Identyfikacja */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Sekcja: Identyfikacja
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.employeeName}>
                <FormLabel component="legend">Imię i nazwisko: *</FormLabel>
                <RadioGroup
                  value={formData.employeeName}
                  onChange={handleInputChange('employeeName')}
                >
                  {employeeLoading ? (
                    <Typography variant="body2" color="text.secondary">Ładowanie opcji...</Typography>
                  ) : (
                    employeeOptions.map((employee) => (
                      <FormControlLabel 
                        key={employee}
                        value={employee} 
                        control={<Radio />} 
                        label={employee} 
                      />
                    ))
                  )}
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.position}>
                <FormLabel component="legend">Stanowisko: *</FormLabel>
                <RadioGroup
                  value={formData.position}
                  onChange={handleInputChange('position')}
                >
                  {positionLoading ? (
                    <Typography variant="body2" color="text.secondary">Ładowanie opcji...</Typography>
                  ) : (
                    positionOptions.map((position) => (
                      <FormControlLabel 
                        key={position}
                        value={position} 
                        control={<Radio />} 
                        label={position} 
                      />
                    ))
                  )}
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data wypełnienia *"
                value={formData.fillDate}
                onChange={handleDateChange('fillDate')}
                renderInput={(params) => <TextField {...params} fullWidth required />}
              />
            </Grid>

            {/* Sekcja 2: Informacje o rozładunku */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                Sekcja: Informacje o rozładunku
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data rozładunku *"
                value={formData.unloadingDate}
                onChange={handleDateChange('unloadingDate')}
                renderInput={(params) => <TextField {...params} fullWidth required />}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nazwa przewoźnika *"
                value={formData.carrierName}
                onChange={handleInputChange('carrierName')}
                fullWidth
                required
                error={!!errors.carrierName}
                helperText={errors.carrierName || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nr rejestracyjny samochodu *"
                value={formData.vehicleRegistration}
                onChange={handleInputChange('vehicleRegistration')}
                fullWidth
                required
                error={!!errors.vehicleRegistration}
                helperText={errors.vehicleRegistration || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.vehicleTechnicalCondition}>
                <FormLabel component="legend">Stan techniczny samochodu: *</FormLabel>
                <RadioGroup
                  value={formData.vehicleTechnicalCondition}
                  onChange={handleInputChange('vehicleTechnicalCondition')}
                  row
                >
                  <FormControlLabel 
                    value="Bez uszkodzeń" 
                    control={<Radio />} 
                    label="Bez uszkodzeń" 
                  />
                  <FormControlLabel 
                    value="Uszkodzony" 
                    control={<Radio />} 
                    label="Uszkodzony" 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label="Inna odpowiedź" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.transportHygiene}>
                <FormLabel component="legend">Higiena środka transportu i kierowcy: *</FormLabel>
                <RadioGroup
                  value={formData.transportHygiene}
                  onChange={handleInputChange('transportHygiene')}
                  row
                >
                  <FormControlLabel 
                    value="Prawidłowa" 
                    control={<Radio />} 
                    label="Prawidłowa" 
                  />
                  <FormControlLabel 
                    value="Nieprawidłowa" 
                    control={<Radio />} 
                    label="Nieprawidłowa" 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label="Inna odpowiedź" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Uwagi"
                value={formData.notes}
                onChange={handleInputChange('notes')}
                fullWidth
                multiline
                rows={4}
                placeholder="Ewentualne uwagi do stanu technicznego samochodu lub higieny"
                helperText="Tekst długiej odpowiedzi"
              />
            </Grid>

            {/* Sekcja 3: Informacje o towarze */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                Sekcja: Informacje o towarze
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nazwa dostawcy *"
                value={formData.supplierName}
                onChange={handleInputChange('supplierName')}
                fullWidth
                required
                error={!!errors.supplierName}
                helperText={errors.supplierName || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Numer zamówienia (PO) *"
                value={formData.poNumber}
                onChange={handleInputChange('poNumber')}
                fullWidth
                required
                error={!!errors.poNumber}
                helperText={errors.poNumber || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Nazwa i ilość dostarczonego towaru (batch/exp) *"
                value={formData.goodsDescription}
                onChange={handleInputChange('goodsDescription')}
                fullWidth
                required
                multiline
                rows={3}
                error={!!errors.goodsDescription}
                helperText={errors.goodsDescription || "Tekst długiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Ilość palet *"
                value={formData.palletQuantity}
                onChange={handleInputChange('palletQuantity')}
                fullWidth
                required
                error={!!errors.palletQuantity}
                helperText={errors.palletQuantity || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Ilość kartonów/tub *"
                value={formData.cartonsTubsQuantity}
                onChange={handleInputChange('cartonsTubsQuantity')}
                fullWidth
                required
                error={!!errors.cartonsTubsQuantity}
                helperText={errors.cartonsTubsQuantity || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Waga *"
                value={formData.weight}
                onChange={handleInputChange('weight')}
                fullWidth
                required
                error={!!errors.weight}
                helperText={errors.weight || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.visualInspectionResult}>
                <FormLabel component="legend">Wynik oceny wizualnej (wygląd, zapach, opakowanie): *</FormLabel>
                <RadioGroup
                  value={formData.visualInspectionResult}
                  onChange={handleInputChange('visualInspectionResult')}
                  row
                >
                  <FormControlLabel 
                    value="Prawidłowy" 
                    control={<Radio />} 
                    label="Prawidłowy" 
                  />
                  <FormControlLabel 
                    value="Nieprawidłowy" 
                    control={<Radio />} 
                    label="Nieprawidłowy" 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label="Inna odpowiedź" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nr certyfikatu ekologicznego oraz jego data ważności"
                value={formData.ecoCertificateNumber}
                onChange={handleInputChange('ecoCertificateNumber')}
                fullWidth
                helperText="Tekst krótkiej odpowiedzi"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Uwagi"
                value={formData.goodsNotes}
                onChange={handleInputChange('goodsNotes')}
                fullWidth
                helperText="Tekst krótkiej odpowiedzi"
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="body1" gutterBottom>
                Skan dokumentów dostawy:
              </Typography>
              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUploadIcon />}
                sx={{ mb: 1 }}
                fullWidth
              >
                {formData.documentsFile ? 'Zmień załącznik' : 'Dodaj plik'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
              </Button>
              {formData.documentsFile && (
                <Box sx={{ 
                  mt: 2, 
                  p: 2, 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 1, 
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2
                }}>
                  <AttachFileIcon color="action" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" color="text.primary">
                      {formData.documentsFile.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(formData.documentsFile.size / 1024 / 1024).toFixed(2)} MB
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setFormData(prev => ({ ...prev, documentsFile: null }))}
                  >
                    Usuń
                  </Button>
                </Box>
              )}
              
              {/* Wyświetl istniejące załączniki z serwera (tryb edycji) */}
              {!formData.documentsFile && formData.documentsUrl && (
                <Box sx={{ 
                  mt: 2, 
                  p: 2, 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 1, 
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2
                }}>
                  <AttachFileIcon color="action" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" color="text.primary">
                      {formData.documentsName || 'Załącznik'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Istniejący plik
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<VisibilityIcon />}
                    onClick={() => window.open(formData.documentsUrl, '_blank')}
                  >
                    Zobacz
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setFormData(prev => ({ ...prev, documentsUrl: '', documentsName: '' }))}
                  >
                    Usuń
                  </Button>
                </Box>
              )}
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                Dodaj plik PDF, JPG lub PNG zawierający skan dokumentów dostawy
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
                <Button
                  variant="outlined"
                  onClick={handleBack}
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                >
                  {isEditMode ? 'Zapisz zmiany' : 'Prześlij raport'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        <Snackbar
          open={showSuccess}
          autoHideDuration={6000}
          onClose={() => setShowSuccess(false)}
        >
          <Alert onClose={() => setShowSuccess(false)} severity="success" sx={{ width: '100%' }}>
            {isEditMode ? 'Raport rozładunku towaru został zaktualizowany pomyślnie!' : 'Raport rozładunku towaru został przesłany pomyślnie!'}
          </Alert>
        </Snackbar>
      </Container>
    </LocalizationProvider>
  );
};

export default UnloadingReportFormPage; 