import React, { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Divider,
  Alert,
  Snackbar,
  Box,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Grid,
  TextField
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  CleaningServices as CleaningIcon,
  Search as SearchIcon,
  LocalShipping as LocalShippingIcon,
  SmartToy as AIIcon,
  Assessment as ReportIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';
import * as Sentry from '@sentry/react';
import { addBreadcrumb } from '../../utils/errorHandler';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { migrateAIMessageLimits, migrateNutritionalComponents, cleanupOrphanedProductionHistory } from '../../services/migrationService';
import { cleanNegativeCmrHistoryEntries } from '../../services/cmrService';
import { checkCmrItemsForMigration, migrateCmrItemsWithPalletInfo } from '../../services/cmrMigrationService';
import APIKeySettings from '../../components/common/APIKeySettings';
import CounterEditor from '../../components/admin/CounterEditor';
import FormOptionsManager from '../../components/admin/FormOptionsManager';
import NutritionalComponentsManager from '../../components/admin/NutritionalComponentsManager';
import { 
  migrateInventoryItemsFromV1toV2, 
  checkInventoryIntegrityAndFix,
  bulkUpdateSupplierPricesFromCompletedPOs
} from '../../services/inventory';
import { triggerWeeklyConsumptionReport } from '../../services/cloudFunctionsService';

/**
 * Strona dla administratorów z narzędziami do zarządzania systemem
 */
const SystemManagementPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showNotification } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [migrationResults, setMigrationResults] = useState(null);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [componentsMigrationResults, setComponentsMigrationResults] = useState(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [priceUpdateDays, setPriceUpdateDays] = useState(30);
  
  // Nowe stany dla czyszczenia historii produkcji
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResults, setCleanupResults] = useState(null);
  
  // Stany dla czyszczenia ujemnych wpisów CMR
  const [cmrCleanupLoading, setCmrCleanupLoading] = useState(false);
  const [cmrCleanupResults, setCmrCleanupResults] = useState(null);
  
  // Stany dla migracji pozycji CMR
  const [cmrMigrationLoading, setCmrMigrationLoading] = useState(false);
  const [cmrMigrationCheck, setCmrMigrationCheck] = useState(null);
  const [cmrMigrationResults, setCmrMigrationResults] = useState(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  
  // Stany dla Cloud Functions - Test łańcucha aktualizacji
  const [cfTestLoading, setcfTestLoading] = useState(false);
  const [cfTestResults, setCfTestResults] = useState(null);
  const [cfTestStep, setCfTestStep] = useState('');
  
  // Stany dla generowania raportu konsumpcji MO
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportResults, setWeeklyReportResults] = useState(null);
  
  // Funkcja do wywołania cotygodniowego raportu konsumpcji MO
  const handleTriggerWeeklyReport = async () => {
    try {
      setWeeklyReportLoading(true);
      setWeeklyReportResults(null);
      
      showNotification('Rozpoczynam generowanie raportu konsumpcji MO...', 'info');
      
      const result = await triggerWeeklyConsumptionReport();
      
      setWeeklyReportResults(result);
      showSuccess(`Raport wygenerowany pomyślnie! Przeanalizowano ${result.tasksAnalyzed} zadań, znaleziono ${result.issuesFound} problemów.`);
      
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      showError(`Błąd podczas generowania raportu: ${error.message}`);
    } finally {
      setWeeklyReportLoading(false);
    }
  };

  // Funkcja do testowania Cloud Functions łańcucha PO → Batch → MO → CO
  const handleTestCloudFunctionsChain = async () => {
    try {
      setcfTestLoading(true);
      setCfTestResults(null);
      setCfTestStep('Sprawdzanie statusu Cloud Functions...');
      
      // Import funkcji Firestore
      const { collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
      const { db } = await import('../../services/firebase/config');
      
      const results = {
        functionsStatus: 'unknown',
        testPO: null,
        testBatch: null,
        testTask: null,
        testOrder: null,
        events: [],
        recommendations: []
      };
      
      // 1. Sprawdź czy są _systemEvents (oznaka że Cloud Functions działają)
      setCfTestStep('Sprawdzanie eventów systemowych...');
      const eventsQuery = query(
        collection(db, '_systemEvents'),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      
      if (!eventsSnapshot.empty) {
        results.functionsStatus = 'active';
        results.events = eventsSnapshot.docs.map(doc => ({
          id: doc.id,
          type: doc.data().type,
          processed: doc.data().processed,
          timestamp: doc.data().timestamp?.toDate()?.toLocaleString('pl-PL') || 'N/A'
        }));
      } else {
        results.functionsStatus = 'no_events';
        results.recommendations.push('Brak eventów _systemEvents. Cloud Functions mogą nie być wdrożone lub nie było jeszcze żadnych aktualizacji.');
      }
      
      // 2. Znajdź ostatnie PO z powiązanymi partiami
      setCfTestStep('Szukanie testowego PO...');
      const poQuery = query(
        collection(db, 'purchaseOrders'),
        where('status', '!=', 'draft'),
        orderBy('status'),
        orderBy('updatedAt', 'desc'),
        limit(5)
      );
      const poSnapshot = await getDocs(poQuery);
      
      for (const poDoc of poSnapshot.docs) {
        const poData = poDoc.data();
        
        // Sprawdź czy to PO ma powiązane partie
        const batchesQuery = query(
          collection(db, 'inventoryBatches'),
          where('purchaseOrderDetails.id', '==', poDoc.id),
          limit(1)
        );
        const batchesSnapshot = await getDocs(batchesQuery);
        
        if (!batchesSnapshot.empty) {
          results.testPO = {
            id: poDoc.id,
            poNumber: poData.poNumber,
            supplier: poData.supplier?.name || 'N/A',
            itemsCount: poData.items?.length || 0,
            updatedAt: poData.updatedAt?.toDate()?.toLocaleString('pl-PL') || 'N/A'
          };
          
          results.testBatch = {
            id: batchesSnapshot.docs[0].id,
            batchNumber: batchesSnapshot.docs[0].data().batchNumber,
            materialId: batchesSnapshot.docs[0].data().materialId,
            unitPrice: batchesSnapshot.docs[0].data().unitPrice,
            updatedAt: batchesSnapshot.docs[0].data().updatedAt?.toDate()?.toLocaleString('pl-PL') || 'N/A',
            lastPriceUpdateReason: batchesSnapshot.docs[0].data().lastPriceUpdateReason || 'N/A'
          };
          
          // Sprawdź czy partia jest używana w jakimś zadaniu
          const batchId = batchesSnapshot.docs[0].id;
          const tasksSnapshot = await getDocs(query(collection(db, 'tasks'), limit(50)));
          
          for (const taskDoc of tasksSnapshot.docs) {
            const taskData = taskDoc.data();
            const materialBatches = taskData.materialBatches || {};
            
            let found = false;
            for (const materialId of Object.keys(materialBatches)) {
              const batches = materialBatches[materialId] || [];
              if (batches.some(batch => batch.batchId === batchId)) {
                results.testTask = {
                  id: taskDoc.id,
                  moNumber: taskData.moNumber,
                  productName: taskData.productName || 'N/A',
                  totalMaterialCost: taskData.totalMaterialCost,
                  updatedAt: taskData.updatedAt?.toDate()?.toLocaleString('pl-PL') || 'N/A',
                  lastCostUpdateReason: taskData.lastCostUpdateReason || 'N/A'
                };
                found = true;
                break;
              }
            }
            
            if (found) {
              // Sprawdź czy zadanie jest powiązane z zamówieniem
              const ordersSnapshot = await getDocs(query(collection(db, 'orders'), limit(50)));
              
              for (const orderDoc of ordersSnapshot.docs) {
                const orderData = orderDoc.data();
                const items = orderData.items || [];
                
                if (items.some(item => item.productionTaskId === taskDoc.id)) {
                  results.testOrder = {
                    id: orderDoc.id,
                    orderNumber: orderData.orderNumber,
                    customerName: orderData.customer?.name || 'N/A',
                    totalValue: orderData.totalValue,
                    updatedAt: orderData.updatedAt?.toDate()?.toLocaleString('pl-PL') || 'N/A',
                    lastCostUpdateReason: orderData.lastCostUpdateReason || 'N/A'
                  };
                  break;
                }
              }
              break;
            }
          }
          break;
        }
      }
      
      // 3. Rekomendacje
      if (results.testPO && !results.testBatch) {
        results.recommendations.push('Znaleziono PO, ale nie ma powiązanych partii. Utwórz przyjęcie magazynowe.');
      }
      if (results.testBatch && !results.testTask) {
        results.recommendations.push('Znaleziono partię, ale nie jest używana w żadnym zadaniu. Zarezerwuj partię w zadaniu produkcyjnym.');
      }
      if (results.testTask && !results.testOrder) {
        results.recommendations.push('Znaleziono zadanie, ale nie jest powiązane z zamówieniem. Utwórz zamówienie klienta z tym zadaniem.');
      }
      if (results.testPO && results.testBatch && results.testTask && results.testOrder) {
        results.recommendations.push('✅ Znaleziono kompletny łańcuch PO → Batch → MO → CO!');
        results.recommendations.push('💡 Możesz teraz przetestować: Edytuj PO (zmień cenę), zapisz i sprawdź czy wartości aktualizują się automatycznie.');
      }
      
      // 4. Sprawdzenie czy Cloud Functions są aktywne na podstawie pól
      if (results.testBatch?.lastPriceUpdateReason?.includes('Cloud Function')) {
        results.functionsStatus = 'confirmed';
        results.recommendations.push('✅ Potwierdzono: Cloud Functions są aktywne (wykryto aktualizację przez CF)');
      } else if (results.functionsStatus === 'active') {
        results.recommendations.push('⚠️ Cloud Functions mogą być aktywne (są eventy), ale nie wykryto jeszcze aktualizacji przez CF');
      }
      
      setCfTestResults(results);
      setCfTestStep('');
      showSuccess('Test zakończony! Sprawdź wyniki poniżej.');
      
    } catch (error) {
      console.error('Błąd podczas testowania Cloud Functions:', error);
      showError(`Błąd: ${error.message}`);
      setCfTestStep('');
    } finally {
      setcfTestLoading(false);
    }
  };
  
  // Funkcja do uruchomienia migracji limitów wiadomości AI
  const handleRunAILimitsMigration = async () => {
    try {
      setIsLoading(true);
      const results = await migrateAIMessageLimits();
      
      if (results.success) {
        showSuccess(`Migracja zakończona. Zaktualizowano ${results.updated} użytkowników.`);
        setMigrationResults(results);
      } else {
        showError(`Błąd podczas migracji: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas uruchamiania migracji:', error);
      showError('Wystąpił błąd podczas migracji. Sprawdź konsolę.');
    } finally {
      setIsLoading(false);
    }
  };

  // Funkcja do uruchomienia migracji składników odżywczych
  const handleRunComponentsMigration = async () => {
    try {
      setIsLoadingComponents(true);
      const results = await migrateNutritionalComponents();
      
      if (results.success) {
        showSuccess(`Migracja składników zakończona. Dodano ${results.added} składników, pominięto ${results.skipped}.`);
        setComponentsMigrationResults(results);
      } else {
        showError(`Błąd podczas migracji składników: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas uruchamiania migracji składników:', error);
      showError('Wystąpił błąd podczas migracji składników. Sprawdź konsolę.');
    } finally {
      setIsLoadingComponents(false);
    }
  };

  const handleBulkUpdateSupplierPrices = async () => {
    if (!window.confirm(`Czy na pewno chcesz zaktualizować ceny dostawców na podstawie zamówień z ostatnich ${priceUpdateDays} dni? Ta operacja może trwać kilka minut.`)) {
      return;
    }

    try {
      setUpdatingPrices(true);
      showNotification('Rozpoczynam masową aktualizację cen dostawców...', 'info');

      const result = await bulkUpdateSupplierPricesFromCompletedPOs(currentUser.uid, priceUpdateDays);

      if (result.success) {
        showNotification(
          `Zakończono masową aktualizację cen dostawców. ${result.message}`,
          'success'
        );
      } else {
        showNotification('Błąd podczas masowej aktualizacji cen dostawców', 'error');
      }
    } catch (error) {
      console.error('Błąd podczas masowej aktualizacji cen dostawców:', error);
      showNotification('Błąd podczas masowej aktualizacji cen dostawców: ' + error.message, 'error');
    } finally {
      setUpdatingPrices(false);
    }
  };

  // Funkcja do sprawdzenia sierocych wpisów historii produkcji
  const handleCheckOrphanedHistory = async () => {
    try {
      setCleanupLoading(true);
      setCleanupResults(null);
      
      const results = await cleanupOrphanedProductionHistory(true); // dry run
      
      if (results.success) {
        setCleanupResults(results);
        if (results.orphanedCount > 0) {
          showNotification(`Znaleziono ${results.orphanedCount} sierocych wpisów historii produkcji. Sprawdź szczegóły w konsoli.`, 'warning');
        } else {
          showSuccess('Nie znaleziono sierocych wpisów historii produkcji. Baza danych jest czysta!');
        }
      } else {
        showError(`Błąd podczas sprawdzania: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas sprawdzania sierocych wpisów:', error);
      showError('Wystąpił błąd podczas sprawdzania. Sprawdź konsolę.');
    } finally {
      setCleanupLoading(false);
    }
  };

  // Funkcja do usunięcia sierocych wpisów historii produkcji
  const handleCleanupOrphanedHistory = async () => {
    if (!cleanupResults || cleanupResults.orphanedCount === 0) {
      showError('Najpierw sprawdź sierocze wpisy!');
      return;
    }

    const confirmMessage = `Czy na pewno chcesz usunąć ${cleanupResults.orphanedCount} sierocych wpisów historii produkcji? Ta operacja jest nieodwracalna!`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setCleanupLoading(true);
      
      const results = await cleanupOrphanedProductionHistory(false); // rzeczywiste usuwanie
      
      if (results.success) {
        showSuccess(`Pomyślnie usunięto ${results.deletedCount} sierocych wpisów historii produkcji.`);
        setCleanupResults(results);
      } else {
        showError(`Błąd podczas czyszczenia: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas czyszczenia sierocych wpisów:', error);
      showError('Wystąpił błąd podczas czyszczenia. Sprawdź konsolę.');
    } finally {
      setCleanupLoading(false);
    }
  };

  // Funkcja do czyszczenia ujemnych wpisów w cmrHistory
  const handleCleanNegativeCmrEntries = async () => {
    const confirmMessage = `Czy na pewno chcesz wyczyścić ujemne wpisy w historii CMR? Ta operacja usunie wszystkie ujemne wartości z cmrHistory i przeliczy ilości wysłane. Operacja jest nieodwracalna!`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setCmrCleanupLoading(true);
      setCmrCleanupResults(null);
      
      showNotification('Rozpoczynam oczyszczanie ujemnych wpisów CMR...', 'info');
      
      const results = await cleanNegativeCmrHistoryEntries(currentUser.uid);
      
      if (results.success) {
        setCmrCleanupResults(results);
        showSuccess(`Oczyszczanie zakończone: ${results.cleanedOrders} zamówień, ${results.cleanedEntries} ujemnych wpisów usuniętych`);
      } else {
        showError(`Błąd podczas oczyszczania: ${results.error || 'Nieznany błąd'}`);
      }
    } catch (error) {
      console.error('Błąd podczas oczyszczania ujemnych wpisów CMR:', error);
      showError('Wystąpił błąd podczas oczyszczania ujemnych wpisów CMR. Sprawdź konsolę.');
    } finally {
      setCmrCleanupLoading(false);
    }
  };

  // Funkcja do sprawdzenia pozycji CMR do migracji
  const handleCheckCmrMigration = async () => {
    try {
      setCmrMigrationLoading(true);
      setCmrMigrationCheck(null);
      setCmrMigrationResults(null);
      
      showNotification('Sprawdzam pozycje CMR...', 'info');
      
      const results = await checkCmrItemsForMigration();
      
      if (results.success) {
        setCmrMigrationCheck(results);
        if (results.needsMigration > 0) {
          setShowMigrationDialog(true);
          showNotification(`Znaleziono ${results.needsMigration} pozycji CMR do zaktualizowania`, 'info');
        } else {
          showSuccess('Wszystkie pozycje CMR mają już informacje o paletach!');
        }
      } else {
        showError(`Błąd podczas sprawdzania: ${results.error || 'Nieznany błąd'}`);
      }
    } catch (error) {
      console.error('Błąd podczas sprawdzania pozycji CMR:', error);
      showError('Wystąpił błąd podczas sprawdzania pozycji CMR. Sprawdź konsolę.');
    } finally {
      setCmrMigrationLoading(false);
    }
  };

  // Funkcja do wykonania migracji pozycji CMR
  const handleExecuteCmrMigration = async () => {
    try {
      setShowMigrationDialog(false);
      setCmrMigrationLoading(true);
      
      showNotification('Rozpoczynam migrację pozycji CMR...', 'info');
      
      const results = await migrateCmrItemsWithPalletInfo();
      
      if (results.success) {
        setCmrMigrationResults(results);
        showSuccess(`Migracja zakończona: zaktualizowano ${results.updated} pozycji CMR`);
      } else {
        showError(`Błąd podczas migracji: ${results.error || 'Nieznany błąd'}`);
      }
    } catch (error) {
      console.error('Błąd podczas migracji pozycji CMR:', error);
      showError('Wystąpił błąd podczas migracji pozycji CMR. Sprawdź konsolę.');
    } finally {
      setCmrMigrationLoading(false);
    }
  };

  // Funkcja do zamknięcia dialogu
  const handleCloseMigrationDialog = () => {
    setShowMigrationDialog(false);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <SettingsIcon sx={{ mr: 2, fontSize: 30 }} />
        <Typography variant="h4">Zarządzanie systemem</Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" gutterBottom>
          Narzędzia administracyjne
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        {/* Sekcja konfiguracji Asystenta AI */}
        <APIKeySettings />
        
        {/* Edytor liczników systemowych */}
        <CounterEditor />
        
        {/* Zarządzanie opcjami formularzy */}
        <FormOptionsManager />
        
        {/* Zarządzanie składnikami odżywczymi */}
        <NutritionalComponentsManager />
        
        {/* SEKCJA: Raport AI - Cotygodniowa analiza konsumpcji MO */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <AIIcon sx={{ mr: 1, color: 'primary.main' }} />
              Raport AI - Cotygodniowa analiza konsumpcji MO
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Ręczne wywołanie Cloud Function generującej raport analizy konsumpcji MO.
              Raport automatycznie generowany jest w każdą niedzielę o 06:00.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Raport analizuje:
            </Typography>
            <Box component="ul" sx={{ mt: 1, mb: 2, pl: 2 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                Konsumpcje MO i porównanie z planem (odchylenia)
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Historię transakcji magazynowych
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Niewykorzystane pozostałości partii
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Partie zamrożone (z rezerwacjami bez konsumpcji)
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Wydajność produkcji i błędy konsumpcji
              </Typography>
            </Box>
            
            {weeklyReportResults && (
              <Box sx={{ mt: 2 }}>
                <Alert severity="success">
                  Raport wygenerowany pomyślnie!
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Przeanalizowano zadań: ${weeklyReportResults.tasksAnalyzed}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Wykryto problemów: ${weeklyReportResults.issuesFound}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Odchyleń od planu: ${weeklyReportResults.deviationsFound}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Analiza AI: ${weeklyReportResults.hasAiAnalysis ? '✅ Wygenerowana' : '❌ Brak (sprawdź klucz API Gemini)'}`} 
                    />
                  </ListItem>
                </List>
                <Alert severity="info" sx={{ mt: 1 }}>
                  Raport jest dostępny w: <strong>Produkcja → Raport MO → Raport AI</strong>
                </Alert>
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={weeklyReportLoading ? <CircularProgress size={20} /> : <ReportIcon />}
              variant="contained" 
              color="primary"
              onClick={handleTriggerWeeklyReport}
              disabled={weeklyReportLoading}
            >
              {weeklyReportLoading ? 'Generowanie raportu...' : 'Wygeneruj raport teraz'}
            </Button>
          </CardActions>
        </Card>

        {/* NOWA SEKCJA: Test Cloud Functions - Łańcuch aktualizacji */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              ⚡ Cloud Functions - Test łańcucha aktualizacji PO → Batch → MO → CO
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              To narzędzie testuje czy Cloud Functions poprawnie obsługują automatyczną aktualizację łańcucha wartości:
              Purchase Order → Inventory Batch → Manufacturing Order → Customer Order.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Test sprawdza: status Cloud Functions, przykładowe dane z bazy, oraz kompletność łańcucha.
            </Typography>
            
            {cfTestStep && (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Alert severity="info">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2">{cfTestStep}</Typography>
                  </Box>
                </Alert>
              </Box>
            )}
            
            {cfTestResults && (
              <Box sx={{ mt: 2 }}>
                {/* Status Cloud Functions */}
                <Alert 
                  severity={
                    cfTestResults.functionsStatus === 'confirmed' ? 'success' :
                    cfTestResults.functionsStatus === 'active' ? 'info' : 'warning'
                  } 
                  sx={{ mb: 2 }}
                >
                  <Typography variant="subtitle2" gutterBottom>
                    Status Cloud Functions: {
                      cfTestResults.functionsStatus === 'confirmed' ? '✅ Potwierdzone - Działają' :
                      cfTestResults.functionsStatus === 'active' ? 'ℹ️ Aktywne (eventy wykryte)' :
                      cfTestResults.functionsStatus === 'no_events' ? '⚠️ Brak eventów' :
                      '❓ Nieznany'
                    }
                  </Typography>
                </Alert>
                
                {/* Ostatnie eventy */}
                {cfTestResults.events.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      📊 Ostatnie eventy systemowe ({cfTestResults.events.length}):
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Typ</TableCell>
                            <TableCell>Przetworzony</TableCell>
                            <TableCell>Data</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {cfTestResults.events.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell>{event.type}</TableCell>
                              <TableCell>{event.processed ? '✅ Tak' : '⏳ Nie'}</TableCell>
                              <TableCell>{event.timestamp}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}
                
                {/* Testowy łańcuch danych */}
                <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                  🔗 Testowy łańcuch danych:
                </Typography>
                
                <Grid container spacing={2}>
                  {/* Purchase Order */}
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: cfTestResults.testPO ? 'success.light' : 'grey.100' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        1️⃣ Purchase Order {cfTestResults.testPO ? '✅' : '❌'}
                      </Typography>
                      {cfTestResults.testPO ? (
                        <>
                          <Typography variant="body2">PO: {cfTestResults.testPO.poNumber}</Typography>
                          <Typography variant="body2">Dostawca: {cfTestResults.testPO.supplier}</Typography>
                          <Typography variant="body2">Pozycji: {cfTestResults.testPO.itemsCount}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Aktualizacja: {cfTestResults.testPO.updatedAt}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">Brak testowego PO</Typography>
                      )}
                    </Paper>
                  </Grid>
                  
                  {/* Batch */}
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: cfTestResults.testBatch ? 'success.light' : 'grey.100' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        2️⃣ Inventory Batch {cfTestResults.testBatch ? '✅' : '❌'}
                      </Typography>
                      {cfTestResults.testBatch ? (
                        <>
                          <Typography variant="body2">Nr: {cfTestResults.testBatch.batchNumber}</Typography>
                          <Typography variant="body2">Cena: {cfTestResults.testBatch.unitPrice}€</Typography>
                          <Typography variant="body2" sx={{ 
                            color: cfTestResults.testBatch.lastPriceUpdateReason?.includes('Cloud Function') ? 'success.main' : 'text.primary'
                          }}>
                            Aktualizacja: {cfTestResults.testBatch.lastPriceUpdateReason}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {cfTestResults.testBatch.updatedAt}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">Brak powiązanej partii</Typography>
                      )}
                    </Paper>
                  </Grid>
                  
                  {/* Task (MO) */}
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: cfTestResults.testTask ? 'success.light' : 'grey.100' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        3️⃣ Manufacturing Order {cfTestResults.testTask ? '✅' : '❌'}
                      </Typography>
                      {cfTestResults.testTask ? (
                        <>
                          <Typography variant="body2">MO: {cfTestResults.testTask.moNumber}</Typography>
                          <Typography variant="body2">Produkt: {cfTestResults.testTask.productName}</Typography>
                          <Typography variant="body2">Koszt: {cfTestResults.testTask.totalMaterialCost?.toFixed(2) || 'N/A'}€</Typography>
                          <Typography variant="body2" sx={{ 
                            color: cfTestResults.testTask.lastCostUpdateReason?.includes('Cloud Function') ? 'success.main' : 'text.primary'
                          }}>
                            Aktualizacja: {cfTestResults.testTask.lastCostUpdateReason}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {cfTestResults.testTask.updatedAt}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">Brak powiązanego zadania</Typography>
                      )}
                    </Paper>
                  </Grid>
                  
                  {/* Order (CO) */}
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: cfTestResults.testOrder ? 'success.light' : 'grey.100' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        4️⃣ Customer Order {cfTestResults.testOrder ? '✅' : '❌'}
                      </Typography>
                      {cfTestResults.testOrder ? (
                        <>
                          <Typography variant="body2">CO: {cfTestResults.testOrder.orderNumber}</Typography>
                          <Typography variant="body2">Klient: {cfTestResults.testOrder.customerName}</Typography>
                          <Typography variant="body2">Wartość: {cfTestResults.testOrder.totalValue?.toFixed(2) || 'N/A'}€</Typography>
                          <Typography variant="body2" sx={{ 
                            color: cfTestResults.testOrder.lastCostUpdateReason?.includes('Cloud Function') ? 'success.main' : 'text.primary'
                          }}>
                            Aktualizacja: {cfTestResults.testOrder.lastCostUpdateReason || 'N/A'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {cfTestResults.testOrder.updatedAt}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">Brak powiązanego zamówienia</Typography>
                      )}
                    </Paper>
                  </Grid>
                </Grid>
                
                {/* Rekomendacje */}
                {cfTestResults.recommendations.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      💡 Rekomendacje i następne kroki:
                    </Typography>
                    {cfTestResults.recommendations.map((rec, index) => (
                      <Alert 
                        key={index} 
                        severity={rec.includes('✅') ? 'success' : rec.includes('⚠️') ? 'warning' : 'info'}
                        sx={{ mb: 1 }}
                      >
                        {rec}
                      </Alert>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={cfTestLoading ? <CircularProgress size={20} /> : <SettingsIcon />}
              variant="contained" 
              color="primary"
              onClick={handleTestCloudFunctionsChain}
              disabled={cfTestLoading}
            >
              {cfTestLoading ? 'Testowanie...' : 'Testuj Cloud Functions'}
            </Button>
          </CardActions>
        </Card>
        
        {/* NOWA SEKCJA: Czyszczenie ujemnych wpisów CMR */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              🗑️ Czyszczenie ujemnych wpisów CMR
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie znajdzie i usunie ujemne wpisy w historii CMR (cmrHistory) z zamówień.
              Ujemne wartości mogą powstać przez błędy w systemie anulowania CMR i powodują nieprawidłowe wyświetlanie ilości wysłanych w tabeli CO.
              Po oczyszczeniu ilości wysłane będą przeliczone na podstawie pozostałych pozytywnych wpisów CMR.
            </Typography>
            
            {cmrCleanupResults && (
              <Box sx={{ mt: 2 }}>
                <Alert severity="success">
                  Oczyszczanie ujemnych wpisów CMR zakończone pomyślnie!
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Przetworzono zamówień: ${cmrCleanupResults.processedOrders}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Oczyszczono zamówień: ${cmrCleanupResults.cleanedOrders}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Usunięto ujemnych wpisów: ${cmrCleanupResults.cleanedEntries}`} 
                    />
                  </ListItem>
                </List>
                <Alert severity="info" sx={{ mt: 1 }}>
                  Szczegóły operacji zostały wyświetlone w konsoli przeglądarki (F12).
                </Alert>
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={cmrCleanupLoading ? <CircularProgress size={20} /> : <CleaningIcon />}
              variant="contained" 
              color="warning"
              onClick={handleCleanNegativeCmrEntries}
              disabled={cmrCleanupLoading}
            >
              {cmrCleanupLoading ? 'Oczyszczanie...' : 'Wyczyść ujemne wpisy CMR'}
            </Button>
          </CardActions>
        </Card>

        {/* NOWA SEKCJA: Migracja informacji o paletach w CMR */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              📦 Migracja informacji o paletach w CMR
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie zaktualizuje stare pozycje CMR, dodając informacje o ilościach palet i kartonów.
              Obecnie przy zapisywaniu CMR system automatycznie oblicza i zapisuje te informacje, ale stare CMR ich nie zawierają.
              Migracja wykorzysta dane z powiązanych partii magazynowych do obliczenia brakujących informacji.
            </Typography>
            
            {cmrMigrationResults && (
              <Box sx={{ mt: 2 }}>
                <Alert severity="success">
                  Migracja pozycji CMR zakończona pomyślnie!
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Wszystkie pozycje CMR: ${cmrMigrationResults.total}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Zaktualizowano: ${cmrMigrationResults.updated} pozycji`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Pominięto: ${cmrMigrationResults.skipped} pozycji`} 
                    />
                  </ListItem>
                  {cmrMigrationResults.errors > 0 && (
                    <ListItem>
                      <ListItemText 
                        primary={`Błędy: ${cmrMigrationResults.errors}`}
                        secondary="Sprawdź konsolę dla szczegółów"
                      />
                    </ListItem>
                  )}
                </List>
                <Alert severity="info" sx={{ mt: 1 }}>
                  Szczegóły operacji zostały wyświetlone w konsoli przeglądarki (F12).
                </Alert>
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={cmrMigrationLoading ? <CircularProgress size={20} /> : <LocalShippingIcon />}
              variant="contained" 
              color="primary"
              onClick={handleCheckCmrMigration}
              disabled={cmrMigrationLoading}
            >
              {cmrMigrationLoading ? 'Sprawdzanie...' : 'Sprawdź CMR do migracji'}
            </Button>
          </CardActions>
        </Card>

        {/* SEKCJA: Czyszczenie sierocych wpisów historii produkcji */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              🧹 Czyszczenie historii produkcji
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie znajdzie i usunie wpisy z historii produkcji, które nie mają odpowiadających im zadań produkcyjnych.
              Takie "sierocze" wpisy mogą powstać gdy zadanie produkcyjne zostało usunięte, ale jego historia nie została oczyszczona.
              Wpisy te powodują wyświetlanie "Brak MO" w raportach czasu produkcji.
            </Typography>
            
            {cleanupResults && (
              <Box sx={{ mt: 2 }}>
                <Alert 
                  severity={
                    cleanupResults.orphanedCount === 0 ? "success" :
                    cleanupResults.dryRun ? "warning" : "info"
                  }
                >
                  {cleanupResults.dryRun ? 'Sprawdzanie zakończone' : 'Czyszczenie zakończone'}. Wyniki:
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Sierocze wpisy: ${cleanupResults.orphanedCount}`} 
                    />
                  </ListItem>
                  {!cleanupResults.dryRun && (
                    <ListItem>
                      <ListItemText 
                        primary={`Usunięto: ${cleanupResults.deletedCount} wpisów`} 
                      />
                    </ListItem>
                  )}
                  {cleanupResults.errors > 0 && (
                    <ListItem>
                      <ListItemText 
                        primary={`Błędy: ${cleanupResults.errors}`} 
                        secondary="Sprawdź konsolę dla szczegółów" 
                      />
                    </ListItem>
                  )}
                </List>
                {cleanupResults.dryRun && cleanupResults.orphanedCount > 0 && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Szczegóły sierocych wpisów zostały wyświetlone w konsoli przeglądarki (F12).
                  </Alert>
                )}
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={cleanupLoading ? <CircularProgress size={20} /> : <SearchIcon />}
              variant="outlined" 
              color="primary"
              onClick={handleCheckOrphanedHistory}
              disabled={cleanupLoading}
              sx={{ mr: 1 }}
            >
              {cleanupLoading ? 'Sprawdzanie...' : 'Sprawdź sierocze wpisy'}
            </Button>
            
            <Button 
              startIcon={cleanupLoading ? <CircularProgress size={20} /> : <CleaningIcon />}
              variant="contained" 
              color="warning"
              onClick={handleCleanupOrphanedHistory}
              disabled={cleanupLoading || !cleanupResults || cleanupResults.orphanedCount === 0}
            >
              {cleanupLoading ? 'Usuwanie...' : `Usuń ${cleanupResults?.orphanedCount || 0} wpisów`}
            </Button>
          </CardActions>
        </Card>
        
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Migracja limitów wiadomości AI
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie zaktualizuje wszystkich istniejących użytkowników, dodając im limity wiadomości AI
              w zależności od ich roli (Administrator: 250, Pracownik: 50).
              Użyj tego narzędzia tylko raz po dodaniu funkcji limitów wiadomości.
            </Typography>
            
            {migrationResults && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={migrationResults.errors > 0 ? "warning" : "success"}>
                  Migracja zakończona. Wyniki:
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Zaktualizowano: ${migrationResults.updated} użytkowników`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Błędy: ${migrationResults.errors}`} 
                      secondary={migrationResults.error || ''} 
                    />
                  </ListItem>
                </List>
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={isLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
              variant="contained" 
              color="primary"
              onClick={handleRunAILimitsMigration}
              disabled={isLoading}
            >
              {isLoading ? 'Przetwarzanie...' : 'Uruchom migrację'}
            </Button>
          </CardActions>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Migracja składników odżywczych
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie przeniesie wszystkie składniki odżywcze z kodu do bazy danych. 
              Obejmuje to makroelementy, witaminy, minerały, składniki aktywne i wartości energetyczne.
              Po migracji składniki będą pobierane z bazy danych zamiast z pliku constants.js.
            </Typography>
            
            {componentsMigrationResults && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={componentsMigrationResults.errors > 0 ? "warning" : "success"}>
                  Migracja składników odżywczych zakończona. Wyniki:
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Łącznie składników: ${componentsMigrationResults.total}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Dodano: ${componentsMigrationResults.added} składników`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Pominięto (już istniały): ${componentsMigrationResults.skipped}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Błędy: ${componentsMigrationResults.errors}`} 
                      secondary={componentsMigrationResults.error || ''} 
                    />
                  </ListItem>
                </List>
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={isLoadingComponents ? <CircularProgress size={20} /> : <RefreshIcon />}
              variant="contained" 
              color="secondary"
              onClick={handleRunComponentsMigration}
              disabled={isLoadingComponents}
            >
              {isLoadingComponents ? 'Przetwarzanie...' : 'Migruj składniki odżywcze'}
            </Button>
          </CardActions>
        </Card>
        
        {/* Sekcja zarządzania cenami dostawców */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Zarządzanie cenami dostawców
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Narzędzia do automatycznej aktualizacji cen dostawców na podstawie zakończonych zamówień zakupu.
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Masowa aktualizacja cen dostawców
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Automatycznie aktualizuje ceny dostawców na podstawie najnowszych zakończonych zamówień zakupu.
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      <TextField
                        type="number"
                        label="Liczba dni wstecz"
                        value={priceUpdateDays}
                        onChange={(e) => setPriceUpdateDays(parseInt(e.target.value) || 30)}
                        InputProps={{
                          inputProps: { min: 1, max: 365 }
                        }}
                        helperText="Ile dni wstecz sprawdzać zakończone zamówienia"
                        size="small"
                        sx={{ mb: 2 }}
                      />
                    </Box>

                    <Button
                      variant="contained"
                      onClick={handleBulkUpdateSupplierPrices}
                      disabled={updatingPrices}
                      startIcon={updatingPrices ? <CircularProgress size={20} /> : <RefreshIcon />}
                    >
                      {updatingPrices ? 'Aktualizowanie...' : 'Aktualizuj ceny dostawców'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Jak to działa?
                    </Typography>
                    <Typography variant="body2" component="div">
                      <ul>
                        <li>System przeszukuje zamówienia zakupu ze statusem "zakończone" z wybranego okresu</li>
                        <li>Dla każdej pozycji w zamówieniu sprawdza czy dostawca ma już przypisaną cenę</li>
                        <li>Jeśli cena istnieje i różni się od ceny w zamówieniu - aktualizuje ją</li>
                        <li>Jeśli ceny nie ma - tworzy nową z danymi z zamówienia</li>
                        <li>Zachowuje historię zmian cen dla każdego dostawcy</li>
                      </ul>
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Sekcja testowania Sentry.io */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <BugReportIcon sx={{ mr: 1.5, color: 'warning.main' }} />
              <Typography variant="h6">
                🛡️ Test Sentry Error Tracking
              </Typography>
            </Box>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Narzędzia do testowania integracji z Sentry.io - systemem monitorowania błędów i wydajności aplikacji.
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Test błędu JavaScript
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Rzuca błąd JavaScript który zostanie przechwycony przez ErrorBoundary i wysłany do Sentry.
                    </Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Po kliknięciu pojawi się strona błędu. Kliknij "Spróbuj ponownie" aby wrócić.
                    </Alert>
                    <Button
                      variant="contained"
                      color="warning"
                      startIcon={<BugReportIcon />}
                      onClick={() => {
                        // Dodaj breadcrumb przed testem
                        addBreadcrumb('Admin clicked Sentry test button', 'sentry-test', 'info', {
                          testType: 'error',
                          location: 'SystemManagementPage',
                          userId: currentUser?.uid
                        });
                        
                        // Rzuć błąd testowy
                        throw new Error('This is your first error!');
                      }}
                    >
                      Break the world
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Test logowania wiadomości
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Wysyła testową wiadomość do Sentry bez rzucania błędu (poziom: info).
                    </Typography>
                    <Alert severity="success" sx={{ mb: 2 }}>
                      Wiadomość zostanie wysłana w tle. Sprawdź konsolę i Sentry.io.
                    </Alert>
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<BugReportIcon />}
                      onClick={() => {
                        // Dodaj breadcrumb
                        addBreadcrumb('Admin clicked Sentry message test', 'sentry-test', 'info', {
                          testType: 'message',
                          location: 'SystemManagementPage'
                        });
                        
                        // Wyślij testową wiadomość
                        Sentry.captureMessage('Test message from SystemManagementPage', {
                          level: 'info',
                          tags: {
                            testType: 'manual',
                            source: 'admin-panel'
                          },
                          extra: {
                            userId: currentUser?.uid,
                            userEmail: currentUser?.email,
                            timestamp: new Date().toISOString()
                          }
                        });
                        
                        showSuccess('Wiadomość testowa wysłana do Sentry.io');
                      }}
                    >
                      Test Message
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info">
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Dokumentacja Sentry:
                  </Typography>
                  <Typography variant="body2" component="div">
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li><strong>Quick Start:</strong> <code>src/utils/README_SENTRY.md</code></li>
                      <li><strong>Pełna dokumentacja:</strong> <code>src/utils/SENTRY_ERROR_HANDLING.md</code></li>
                      <li><strong>Przykłady użycia:</strong> <code>src/utils/sentryExamples.js</code></li>
                    </ul>
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Wszystkie nieobsłużone błędy są automatycznie wysyłane do Sentry. 
                    Dla błędów w try-catch użyj <code>handleError()</code> lub <code>withFirebaseErrorHandling()</code>.
                  </Typography>
                </Alert>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Paper>

      {/* Dialog potwierdzenia migracji CMR */}
      <Dialog 
        open={showMigrationDialog} 
        onClose={handleCloseMigrationDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <LocalShippingIcon sx={{ mr: 1 }} />
            Potwierdzenie migracji pozycji CMR
          </Box>
        </DialogTitle>
        <DialogContent>
          {cmrMigrationCheck && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Znaleziono pozycje CMR wymagające aktualizacji. Poniżej znajduje się podsumowanie.
              </Alert>
              
              <Typography variant="h6" gutterBottom>
                Podsumowanie:
              </Typography>
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Wszystkie pozycje CMR"
                    secondary={cmrMigrationCheck.total}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Wymaga aktualizacji (brak informacji o paletach)"
                    secondary={cmrMigrationCheck.needsMigration}
                    secondaryTypographyProps={{ 
                      sx: { fontWeight: 'bold', color: 'primary.main' }
                    }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Ma już informacje o paletach"
                    secondary={cmrMigrationCheck.hasInfo}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Brak powiązanych partii (nie można zaktualizować)"
                    secondary={cmrMigrationCheck.noBatches}
                  />
                </ListItem>
              </List>

              {cmrMigrationCheck.itemsToMigrate && cmrMigrationCheck.itemsToMigrate.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Przykładowe pozycje do aktualizacji:
                  </Typography>
                  <TableContainer sx={{ maxHeight: 300 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Opis</TableCell>
                          <TableCell align="right">Ilość</TableCell>
                          <TableCell align="right">Partie</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {cmrMigrationCheck.itemsToMigrate.slice(0, 10).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell align="right">{item.linkedBatchesCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {cmrMigrationCheck.itemsToMigrate.length > 10 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      ... i {cmrMigrationCheck.itemsToMigrate.length - 10} więcej pozycji
                    </Typography>
                  )}
                </>
              )}

              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Uwaga:</strong> Ta operacja zaktualizuje {cmrMigrationCheck.needsMigration} pozycji CMR w bazie danych.
                  Dla każdej pozycji zostaną obliczone i zapisane informacje o:
                </Typography>
                <ul style={{ marginTop: 8, marginBottom: 0 }}>
                  <li>Liczbie palet (palletsCount)</li>
                  <li>Szczegółach palet (pallets)</li>
                  <li>Liczbie kartonów (boxesCount)</li>
                  <li>Szczegółach kartonów (boxes)</li>
                </ul>
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMigrationDialog} color="inherit">
            Anuluj
          </Button>
          <Button 
            onClick={handleExecuteCmrMigration} 
            variant="contained" 
            color="primary"
            startIcon={<LocalShippingIcon />}
          >
            Zatwierdź i wykonaj migrację
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SystemManagementPage;