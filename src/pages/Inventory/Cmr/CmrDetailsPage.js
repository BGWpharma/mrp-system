import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Grid, 
  Divider, 
  Button, 
  Card, 
  CardHeader, 
  CardContent,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  AlertTitle,
  styled,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem as MenuItemComponent,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import { 
  getCmrDocumentById, 
  updateCmrStatus, 
  CMR_STATUSES,
  CMR_PAYMENT_STATUSES,
  translatePaymentStatus,
  updateCmrPaymentStatus,
  migrateCmrToNewFormat,
  uploadCmrAttachment,
  getCmrAttachments,
  deleteCmrAttachment
} from '../../../services/cmrService';
import { getOrderById } from '../../../services/orderService';
import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../../services/firebase/config';
import { 
  calculatePalletWeights, 
  calculateBoxWeights, 
  getInventoryDataFromBatches 
} from '../../../utils/cmrWeightCalculator';
import LabelsDisplayDialog from '../../../components/cmr/LabelsDisplayDialog';
import LabelGenerator from '../../../components/cmr/LabelGenerator';

// Ikony
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import EventIcon from '@mui/icons-material/Event';
import BusinessIcon from '@mui/icons-material/Business';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PersonIcon from '@mui/icons-material/Person';
import InventoryIcon from '@mui/icons-material/Inventory';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import LabelIcon from '@mui/icons-material/Label';
import GridViewIcon from '@mui/icons-material/GridView';
import WarningIcon from '@mui/icons-material/Warning';
import CheckIcon from '@mui/icons-material/Check';
import MoreVertIcon from '@mui/icons-material/MoreVert';

// TabPanel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`cmr-tabpanel-${index}`}
      aria-labelledby={`cmr-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `cmr-tab-${index}`,
    'aria-controls': `cmr-tabpanel-${index}`,
  };
}

// Globalne style CSS dla drukowania
const GlobalStyles = styled('style')({});

// Treść globalnych stylów CSS do drukowania
const globalPrintCss = `
  @media print {
    body * {
      visibility: hidden;
    }
    .print-container, .print-container * {
      visibility: visible;
    }
    .print-container {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      display: block !important;
    }
    .no-print {
      display: none !important;
    }
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    .print-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #000;
    }
    .print-section {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .print-section-title {
      font-weight: bold;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    .print-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .print-grid-item {
      margin-bottom: 10px;
    }
    .print-label {
      font-weight: bold;
      font-size: 0.9rem;
    }
    .print-value {
      margin-bottom: 5px;
    }
    .print-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    .print-table th, .print-table td {
      border: 1px solid #000;
      padding: 6px;
      text-align: left;
      font-size: 0.9rem;
    }
    .print-table th {
      background-color: #f3f3f3;
    }
    .print-footer {
      margin-top: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }
    .print-signature {
      text-align: center;
      margin-top: 40px;
      border-top: 1px solid #000;
      padding-top: 5px;
    }
  }
`;

const CmrDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('cmr');
  
  const [loading, setLoading] = useState(true);
  const [cmrData, setCmrData] = useState(null);
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  
  // Stan dla Tabs
  const [activeTab, setActiveTab] = useState(0);
  
  // Stany dla odpowiedzi formularzy
  const [loadingFormResponses, setLoadingFormResponses] = useState([]);
  const [loadingFormResponsesLoading, setLoadingFormResponsesLoading] = useState(false);
  
  // Stany dla dialogu walidacji formularzy załadunku przed zmianą statusu na transport
  const [loadingFormValidationDialogOpen, setLoadingFormValidationDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  
  // Stany dla szczegółów wag
  const [itemsWeightDetails, setItemsWeightDetails] = useState([]);
  const [weightDetailsLoading, setWeightDetailsLoading] = useState(false);
  const [weightSummary, setWeightSummary] = useState({
    totalWeight: 0,
    totalPallets: 0,
    totalBoxes: 0,
    itemsBreakdown: []
  });
  
  // Stany dla dialogów
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [currentLabels, setCurrentLabels] = useState([]);
  const [currentLabelType, setCurrentLabelType] = useState('unknown');
  
  // Stan dla menu
  const [anchorEl, setAnchorEl] = useState(null);
  
  // Stany dla załączników
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const menuOpen = Boolean(anchorEl);
  
  useEffect(() => {
    fetchCmrDocument();
  }, [id]);
  
  // Funkcja do obliczania szczegółów wag dla pozycji CMR
  const calculateItemsWeightDetails = async (items) => {
    if (!items || items.length === 0) {
      setItemsWeightDetails([]);
      setWeightSummary({
        totalWeight: 0,
        totalPallets: 0,
        totalBoxes: 0,
        itemsBreakdown: []
      });
      return;
    }

    setWeightDetailsLoading(true);
    
    try {
      const weightDetails = [];
      let totalWeight = 0;
      let totalPallets = 0;
      let totalBoxes = 0;

      for (const item of items) {
        const weight = parseFloat(item.weight) || 0;
        totalWeight += weight;

        // Sprawdź czy pozycja ma powiązane partie
        if (item.linkedBatches && item.linkedBatches.length > 0) {
          try {
            const inventoryData = await getInventoryDataFromBatches(item.linkedBatches);
            
            if (inventoryData) {
              // Oblicz szczegóły palet - działa niezależnie od kartonów
              const palletData = calculatePalletWeights({
                quantity: parseFloat(item.quantity) || 0,
                unitWeight: inventoryData.weight || 0,
                itemsPerBox: inventoryData.itemsPerBox || 0,
                boxesPerPallet: inventoryData.boxesPerPallet || 0
              });

              // Oblicz szczegóły kartonów tylko jeśli pozycja ma kartony
              let boxData = { fullBox: null, partialBox: null, totalBoxes: 0 };
              if (inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0) {
                boxData = calculateBoxWeights({
                  quantity: parseFloat(item.quantity) || 0,
                  unitWeight: inventoryData.weight || 0,
                  itemsPerBox: inventoryData.itemsPerBox
                });
              }

              totalPallets += palletData.palletsCount;
              totalBoxes += boxData.totalBoxes;

              weightDetails.push({
                itemId: item.id || item.description,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                weight: weight,
                barcode: inventoryData.barcode, // Dodaj kod kreskowy na głównym poziomie
                hasDetailedData: true,
                palletsCount: palletData.palletsCount,
                pallets: palletData.pallets,
                boxesCount: boxData.totalBoxes,
                boxes: boxData,
                hasBoxes: inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0, // Dodaj flagę czy pozycja ma kartony
                linkedBatches: item.linkedBatches.map(batch => ({
                  ...batch,
                  // Uzupełnij dane partii z pełnych danych z bazy jeśli są dostępne
                  ...(inventoryData.batchData ? {
                    orderNumber: inventoryData.batchData.orderNumber,
                    moNumber: inventoryData.batchData.moNumber,
                    expiryDate: inventoryData.batchData.expiryDate,
                    lotNumber: inventoryData.batchData.lotNumber
                  } : {})
                })),
                inventoryData: {
                  itemsPerBox: inventoryData.itemsPerBox || 0,
                  boxesPerPallet: inventoryData.boxesPerPallet || 0,
                  unitWeight: inventoryData.weight,
                  barcode: inventoryData.barcode
                }
              });
            } else {
              // Brak szczegółowych danych
              weightDetails.push({
                itemId: item.id || item.description,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                weight: weight,
                barcode: inventoryData?.barcode, // Dodaj kod kreskowy jeśli dostępny
                hasDetailedData: false,
                palletsCount: 0,
                pallets: [],
                boxesCount: 0,
                boxes: { fullBox: null, partialBox: null },
                linkedBatches: item.linkedBatches.map(batch => ({
                  ...batch,
                  // Uzupełnij dane partii z pełnych danych z bazy jeśli są dostępne
                  ...(inventoryData?.batchData ? {
                    orderNumber: inventoryData.batchData.orderNumber,
                    moNumber: inventoryData.batchData.moNumber,
                    expiryDate: inventoryData.batchData.expiryDate,
                    lotNumber: inventoryData.batchData.lotNumber
                  } : {})
                })),
                inventoryData: null
              });
            }
          } catch (error) {
            console.error('Błąd podczas obliczania wagi dla pozycji:', error);
            // Dodaj pozycję bez szczegółów w przypadku błędu
            weightDetails.push({
              itemId: item.id || item.description,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              weight: weight,
              barcode: null, // Brak kodu kreskowego przy błędzie
              hasDetailedData: false,
              palletsCount: 0,
              pallets: [],
              boxesCount: 0,
              boxes: { fullBox: null, partialBox: null },
              linkedBatches: item.linkedBatches,
              inventoryData: null,
              error: error.message
            });
          }
        } else {
          // Pozycja bez powiązanych partii
          weightDetails.push({
            itemId: item.id || item.description,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            weight: weight,
            barcode: null, // Brak kodu kreskowego bez powiązanych partii
            hasDetailedData: false,
            palletsCount: 0,
            pallets: [],
            boxesCount: 0,
            boxes: { fullBox: null, partialBox: null },
            linkedBatches: item.linkedBatches || [],
            inventoryData: null
          });
        }
      }

      setItemsWeightDetails(weightDetails);
      setWeightSummary({
        totalWeight: Number(totalWeight.toFixed(3)),
        totalPallets,
        totalBoxes,
        itemsBreakdown: weightDetails
      });

    } catch (error) {
      console.error('Błąd podczas obliczania szczegółów wag:', error);
      showError(t('details.errors.loadingWeights'));
    } finally {
      setWeightDetailsLoading(false);
    }
  };
  
  // Funkcja pobierania odpowiedzi formularzy załadunku dla danego CMR
  const fetchLoadingFormResponses = async (cmrNumber) => {
    if (!cmrNumber) return;
    
    setLoadingFormResponsesLoading(true);
    try {
      console.log('🔍 Searching for loading forms with CMR number:', cmrNumber);
      
      // Sprawdź różne warianty numeru CMR
      const cmrVariants = [
        cmrNumber,                    // Oryginalny numer (np. "CMR 08-07-2025 COR")
        cmrNumber.replace('CMR ', ''), // Bez prefiksu (np. "08-07-2025 COR")
        cmrNumber.replace(' COR', ''), // Bez sufiksu (np. "CMR 08-07-2025")
        cmrNumber.replace('CMR ', '').replace(' COR', ''), // Tylko data (np. "08-07-2025")
        `CMR ${cmrNumber}`,          // Z dodatkowym prefiksem (na wszelki wypadek)
      ].filter((variant, index, array) => array.indexOf(variant) === index); // Usuń duplikaty
      
      console.log('🔍 Checking CMR variants:', cmrVariants);
      
      let loadingData = [];
      
      // Spróbuj wszystkie warianty
      for (const variant of cmrVariants) {
        const loadingQuery = query(
          collection(db, 'Forms/ZaladunekTowaru/Odpowiedzi'), 
          where('cmrNumber', '==', variant)
        );
        const loadingSnapshot = await getDocs(loadingQuery);
        
        console.log(`📄 Found ${loadingSnapshot.docs.length} loading form responses for variant: "${variant}"`);
        
        if (loadingSnapshot.docs.length > 0) {
          const variantData = loadingSnapshot.docs.map(doc => {
            const data = doc.data();
            console.log('📝 Processing document:', doc.id, 'with CMR:', data.cmrNumber);
            return {
              id: doc.id,
              ...data,
              fillDate: data.fillDate?.toDate(),
              loadingDate: data.loadingDate?.toDate(),
              formType: 'loading'
            };
          });
          loadingData.push(...variantData);
        }
      }
      
      // Jeśli nadal nic nie znaleziono, pokaż wszystkie numery CMR w kolekcji dla debugowania
      if (loadingData.length === 0) {
        console.log('🔍 No results found for any variant. Let me check all CMR numbers in the collection...');
        const allDocsQuery = query(collection(db, 'Forms/ZaladunekTowaru/Odpowiedzi'));
        const allDocsSnapshot = await getDocs(allDocsQuery);
        console.log('📋 All CMR numbers in collection:');
        allDocsSnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          console.log(`${index + 1}. CMR: "${data.cmrNumber}" (type: ${typeof data.cmrNumber})`);
        });
      }

      // Sortowanie odpowiedzi od najnowszych (według daty wypełnienia)
      const sortByFillDate = (a, b) => {
        const dateA = a.fillDate || new Date(0);
        const dateB = b.fillDate || new Date(0);
        return new Date(dateB) - new Date(dateA); // Od najnowszych
      };

      setLoadingFormResponses(loadingData.sort(sortByFillDate));
      console.log('✅ Set', loadingData.length, 'loading form responses');
    } catch (error) {
      console.error('Błąd podczas pobierania odpowiedzi formularzy załadunku:', error);
      setLoadingFormResponses([]);
    } finally {
      setLoadingFormResponsesLoading(false);
    }
  };
  
  const fetchCmrDocument = async () => {
    try {
      setLoading(true);
      const data = await getCmrDocumentById(id);
      setCmrData(data);
      
      // Oblicz szczegóły wag dla pozycji CMR
      if (data && data.items && data.items.length > 0) {
        await calculateItemsWeightDetails(data.items);
      }
      
      // Pobierz odpowiedzi formularzy załadunku dla tego CMR
      if (data && data.cmrNumber) {
        console.log('🚛 CMR Document loaded with number:', data.cmrNumber, '(type:', typeof data.cmrNumber, ')');
        fetchLoadingFormResponses(data.cmrNumber);
      } else {
        console.log('❌ No CMR number found in document data:', data);
      }
      
      // Debug: Wyświetl strukturę danych CMR (można usunąć po testach)
      console.log('CMR data:', data);
      console.log('linkedOrderId:', data.linkedOrderId);
      console.log('linkedOrderIds:', data.linkedOrderIds);
      console.log('linkedOrderNumbers:', data.linkedOrderNumbers);
      
      // Pobierz dane powiązanych zamówień klienta
      const ordersToFetch = [];
      
      // Sprawdź nowy format (wiele zamówień)
      if (data.linkedOrderIds && Array.isArray(data.linkedOrderIds) && data.linkedOrderIds.length > 0) {
        ordersToFetch.push(...data.linkedOrderIds);
      }
      
      // Sprawdź stary format (pojedyncze zamówienie) - dla kompatybilności wstecznej
      if (data.linkedOrderId && !ordersToFetch.includes(data.linkedOrderId)) {
        ordersToFetch.push(data.linkedOrderId);
      }
      
      // Pobierz dane wszystkich powiązanych zamówień
      if (ordersToFetch.length > 0) {
        try {
          const orderPromises = ordersToFetch.map(orderId => getOrderById(orderId));
          const orderResults = await Promise.allSettled(orderPromises);
          
          const validOrders = orderResults
            .filter(result => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value);
          
          setLinkedOrders(validOrders);
          
          // Loguj błędy dla zamówień, których nie udało się pobrać
          orderResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              console.error(`Błąd podczas pobierania zamówienia ${ordersToFetch[index]}:`, result.reason);
            }
          });
        } catch (orderError) {
          console.error('Błąd podczas pobierania powiązanych zamówień:', orderError);
          // Nie przerywamy procesu - CMR może istnieć bez powiązanych zamówień
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentu CMR:', error);
      showError(t('details.errors.loadingDocument'));
      navigate('/inventory/cmr');
    } finally {
      setLoading(false);
    }
  };
  
  const handleEdit = () => {
    console.log('handleEdit wywołane z id:', id);
    console.log('Próba nawigacji do:', `/inventory/cmr/${id}/edit`);
    navigate(`/inventory/cmr/${id}/edit`);
  };
  
  const handleBack = () => {
    navigate('/inventory/cmr');
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };
  
  const handlePrint = () => {
    window.print();
  };

  const handleBoxLabel = () => {
    if (itemsWeightDetails.length === 0) {
      showError('Brak danych do wygenerowania etykiet kartonów');
      return;
    }
    
    // Filtruj tylko pozycje które mają kartony
    const itemsWithBoxes = itemsWeightDetails.filter(item => 
      item.hasDetailedData && item.hasBoxes && item.boxesCount > 0
    );
    
    if (itemsWithBoxes.length === 0) {
      showError('Żadna z pozycji nie ma przypisanych kartonów');
      return;
    }
    
    const labels = LabelGenerator.generateBoxLabels(cmrData, itemsWithBoxes);
    setCurrentLabels(labels);
    setCurrentLabelType('box');
    setLabelsDialogOpen(true);
  };

  const handlePalletLabel = () => {
    if (itemsWeightDetails.length === 0) {
      showError('Brak danych do wygenerowania etykiet palet');
      return;
    }
    const labels = LabelGenerator.generatePalletLabels(cmrData, itemsWeightDetails);
    setCurrentLabels(labels);
    setCurrentLabelType('pallet');
    setLabelsDialogOpen(true);
  };

  const handleLabelsDialogClose = () => {
    setLabelsDialogOpen(false);
    setCurrentLabels([]);
    setCurrentLabelType('unknown');
  };
  
  const handleGenerateOfficialCmr = async () => {
    try {
      // Opcje optymalizacji PDF dla różnych scenariuszy
      // System automatycznie wykrywa typ urządzenia i dostosowuje parametry:
      // - Mobile (telefony): 150 DPI, jakość JPEG 75% → rozmiar ~3-5MB
      // - Tablet: 180 DPI, jakość JPEG 85% → rozmiar ~5-8MB  
      // - Desktop: 200 DPI, jakość JPEG 90% → rozmiar ~8-12MB
      // (poprzednie ustawienia: 300 DPI, PNG → rozmiar 160MB)
      const pdfOptimizationOptions = {
        // Automatyczna detekcja urządzenia (domyślnie)
        // dpi: 150,        // Można nadpisać DPI ręcznie (50-300)
        // quality: 0.85,   // Można nadpisać jakość JPEG ręcznie (0.1-1.0)
      };

      // Lista tła dla każdej kopii
      const backgroundTemplates = [
        'cmr-template-1.svg',
        'cmr-template-2.svg', 
        'cmr-template-3.svg',
        'cmr-template-4.svg'
      ];

      const generatedDocuments = [];

      // Pobierz główny szablon z polami formularza
      const mainTemplateResponse = await fetch('/templates/cmr-template.svg');
      if (!mainTemplateResponse.ok) {
        throw new Error('Nie udało się pobrać głównego szablonu CMR');
      }
      const mainTemplateText = await mainTemplateResponse.text();

      // Generuj każdy z 4 szablonów
      for (let i = 0; i < backgroundTemplates.length; i++) {
        const backgroundTemplateName = backgroundTemplates[i];
        const copyNumber = i + 1;

        try {
          // Pobierz szablon tła
          const bgResponse = await fetch(`/templates/cmr/${backgroundTemplateName}`);
          if (!bgResponse.ok) {
            throw new Error(`Nie udało się pobrać tła ${backgroundTemplateName}`);
          }
          const bgImageBlob = await bgResponse.blob();
          
          // Konwertuj tło na base64
          const reader = new FileReader();
          const base64BgData = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(bgImageBlob);
          });

          // Skopiuj główny szablon i zastąp tło
          let svgText = mainTemplateText;
          
          // Zastąp tło w szablonie
          svgText = svgText.replace(
            '<rect id="template-background" width="793.33331" height="1122.6667" fill="white" />',
            `<image id="template-background" href="${base64BgData}" width="793.33331" height="1122.6667" />`
          );

          // Utworz parser DOM dla SVG
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
          
          // Sprawdź, czy szablon został poprawnie sparsowany
          const parseError = svgDoc.querySelector('parsererror');
          if (parseError) {
            console.error(`Błąd parsowania SVG dla szablonu ${copyNumber}:`, parseError);
            throw new Error(`Nie udało się przetworzyć szablonu CMR ${copyNumber}`);
          }
          
          // Funkcja do dodawania tekstu do pola formularza
          const addTextToField = (svgDoc, fieldId, text, fontSize = '7px', fontWeight = 'normal') => {
            if (!text) return;
            
            // Znajdź pole formularza po ID
            const field = svgDoc.getElementById(fieldId);
            if (!field) {
              console.warn(`Nie znaleziono pola o ID: ${fieldId}`);
              return;
            }
            
            // Pobierz współrzędne i wymiary pola
            const x = parseFloat(field.getAttribute('x')) + 5;
            const y = parseFloat(field.getAttribute('y')) + 15;
            const width = parseFloat(field.getAttribute('width'));
            const height = parseFloat(field.getAttribute('height'));
            
            // Utwórz element tekstowy
            const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textElement.setAttribute('x', x);
            textElement.setAttribute('y', y);
            textElement.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
            textElement.setAttribute('font-size', fontSize);
            textElement.setAttribute('font-weight', fontWeight);
            textElement.setAttribute('fill', 'black');
            
            // Podziel tekst na linie
            const lines = text.toString().split('\n');
            
            // Dostosowanie wysokości linii w zależności od pola
            let lineHeight;
            if (fieldId === 'field-goods' || fieldId === 'field-packages' ||
                fieldId === 'field-weight' || fieldId === 'field-volume' ||
                fieldId === 'field-statistical-number' || fieldId === 'field-marks' ||
                fieldId === 'field-packing') {
              lineHeight = parseInt(fontSize) * 1.6; // Wyważona wysokość dla pól w tabeli towarów - kompromis między zwartym a czytelnym
            } else {
              lineHeight = parseInt(fontSize) * 1.2; // Standardowa wysokość dla pozostałych pól
            }
            
            lines.forEach((line, index) => {
              // Jeśli tekst jest zbyt długi dla pola, podziel go na kilka linii
              const maxCharsPerLine = Math.floor(width / (parseInt(fontSize) * 0.6));
              let currentLine = line;
              let lineCount = 0;
              
              while (currentLine.length > 0) {
                const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                tspan.setAttribute('x', x);
                
                if (currentLine.length <= maxCharsPerLine) {
                  tspan.textContent = currentLine;
                  tspan.setAttribute('y', y + (index * lineHeight) + (lineCount * lineHeight));
                  textElement.appendChild(tspan);
                  break;
                } else {
                  // Znajdź ostatnią spację przed maxCharsPerLine
                  let cutIndex = maxCharsPerLine;
                  while (cutIndex > 0 && currentLine.charAt(cutIndex) !== ' ') {
                    cutIndex--;
                  }
                  
                  // Jeśli nie znaleziono spacji, przetnij po prostu po maxCharsPerLine znaków
                  if (cutIndex === 0) {
                    cutIndex = maxCharsPerLine;
                  }
                  
                  const linePart = currentLine.substring(0, cutIndex);
                  tspan.textContent = linePart;
                  tspan.setAttribute('y', y + (index * lineHeight) + (lineCount * lineHeight));
                  textElement.appendChild(tspan);
                  
                  currentLine = currentLine.substring(cutIndex).trim();
                  lineCount++;
                  
                  // Sprawdź, czy nie wychodzimy poza wysokość pola
                  if (y + (index * lineHeight) + (lineCount * lineHeight) > y + height) {
                    break;
                  }
                }
              }
            });
            
            // Dodaj element tekstowy do dokumentu
            const formFields = svgDoc.getElementById('form-fields');
            if (formFields) {
              formFields.appendChild(textElement);
            } else {
              console.warn('Nie znaleziono grupy form-fields w dokumencie SVG');
              svgDoc.documentElement.appendChild(textElement);
            }
          };
          
          // Funkcja do mapowania danych na pola w dokumencie
          const fillDocumentFields = (svgDoc) => {
            // Formatowanie daty w formie DD.MM.YYYY
            const formatDateSimple = (date) => {
              if (!date) return '';
              
              // Obsługa timestampu Firestore
              if (date && typeof date === 'object' && typeof date.toDate === 'function') {
                date = date.toDate();
              }
              
              let dateObj;
              if (typeof date === 'string') {
                dateObj = new Date(date);
              } else {
                dateObj = date;
              }
              
              if (isNaN(dateObj.getTime())) {
                return '';
              }
              
              const day = dateObj.getDate().toString().padStart(2, '0');
              const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
              const year = dateObj.getFullYear();
              
              return `${day}.${month}.${year}`;
            };
            
            // Mapowanie danych CMR na pola w szablonie
            
            // Dane nadawcy
            const senderText = [
              cmrData.sender,
              cmrData.senderAddress,
              `${cmrData.senderPostalCode || ''} ${cmrData.senderCity || ''}`,
              cmrData.senderCountry
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-sender', senderText, '7px');
            
            // Dane odbiorcy
            const recipientText = [
              cmrData.recipient,
              cmrData.recipientAddress
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-recipient', recipientText, '7px');
            
            // Miejsce przeznaczenia
            addTextToField(svgDoc, 'field-destination', cmrData.deliveryPlace, '7px');
            
            // Miejsce i data załadowania
            const loadingText = `${cmrData.loadingPlace || ''}\n${formatDateSimple(cmrData.loadingDate) || ''}`;
            addTextToField(svgDoc, 'field-loading-place-date', loadingText, '7px');
            
            // Miejsce wystawienia (adres z miejsca załadowania)
            addTextToField(svgDoc, 'field-issue-place-address', cmrData.loadingPlace || '', '7px');
            
            // Załączone dokumenty
            addTextToField(svgDoc, 'field-documents', cmrData.attachedDocuments, '7px');
            
            // Numery rejestracyjne (dodane w dwóch miejscach)
            const vehicleRegText = `${cmrData.vehicleInfo?.vehicleRegistration || ''} / ${cmrData.vehicleInfo?.trailerRegistration || ''}`;
            addTextToField(svgDoc, 'field-vehicle-registration', vehicleRegText, '7px');
            addTextToField(svgDoc, 'field-vehicle-registration-2', vehicleRegText, '7px');
            
            // Dane o towarach
            if (cmrData.items && cmrData.items.length > 0) {
              const items = cmrData.items;
              
              // Cechy i numery (pole 6)
              let marksText = items.map((item, index) =>
                index === 0 ? item.id || '' : '\n\n' + (item.id || '')
              ).join('');
              addTextToField(svgDoc, 'field-marks', marksText, '6px');

              // Ilość sztuk (pole 7)
              let packagesText = items.map((item, index) =>
                index === 0 ? item.quantity?.toString() || '' : '\n\n' + (item.quantity?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-packages', packagesText, '6px');

              // Sposób opakowania (pole 8)
              let packingText = items.map((item, index) =>
                index === 0 ? item.unit || '' : '\n\n' + (item.unit || '')
              ).join('');
              addTextToField(svgDoc, 'field-packing', packingText, '6px');

              // Rodzaj towaru (pole 9)
              let goodsText = items.map((item, index) =>
                index === 0 ? item.description || '' : '\n\n' + (item.description || '')
              ).join('');
              addTextToField(svgDoc, 'field-goods', goodsText, '6px');

              // Numer Statystyczny (pole 10) - numer CO z którego pochodzi pozycja
              let statisticalNumberText = items.map((item, index) => {
                let coNumber = '';

                // Sprawdź czy pozycja ma informacje o zamówieniu z którego pochodzi
                if (item.originalOrderItem && item.originalOrderItem.orderNumber) {
                  coNumber = item.originalOrderItem.orderNumber;
                } else if (item.orderNumber) {
                  coNumber = item.orderNumber;
                } else {
                  // Fallback - użyj pierwszego numeru z linkedOrderNumbers jeśli dostępny
                  if (cmrData.linkedOrderNumbers && cmrData.linkedOrderNumbers.length > 0) {
                    coNumber = cmrData.linkedOrderNumbers[0];
                  } else if (cmrData.linkedOrders && cmrData.linkedOrders.length > 0) {
                    coNumber = cmrData.linkedOrders[0].orderNumber || '';
                  }
                }

                console.log(`CMR pozycja ${index + 1}: towar="${item.description}", CO="${coNumber}"`);
                return index === 0 ? coNumber : '\n\n' + coNumber;
              }).join('');
              addTextToField(svgDoc, 'field-statistical-number', statisticalNumberText, '6.5px');

              // Waga brutto (pole 11)
              let weightsText = items.map((item, index) =>
                index === 0 ? item.weight?.toString() || '' : '\n\n' + (item.weight?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-weight', weightsText, '6.5px');

              // Objętość (pole 12)
              let volumesText = items.map((item, index) =>
                index === 0 ? item.volume?.toString() || '' : '\n\n' + (item.volume?.toString() || '')
              ).join('');
              addTextToField(svgDoc, 'field-volume', volumesText, '6.5px');
            }
            
            // Dane przewoźnika
            const carrierText = [
              cmrData.carrier,
              cmrData.carrierAddress,
              `${cmrData.carrierPostalCode || ''} ${cmrData.carrierCity || ''}`,
              cmrData.carrierCountry
            ].filter(Boolean).join('\n');
            addTextToField(svgDoc, 'field-carrier', carrierText, '7px');
            
            // Zastrzeżenia i uwagi
            addTextToField(svgDoc, 'field-reservations', cmrData.reservations, '7px');
            
            // Instrukcje nadawcy
            addTextToField(svgDoc, 'field-instructions', cmrData.instructionsFromSender, '7px');
            
            // Postanowienia specjalne
            addTextToField(svgDoc, 'field-special-agreements', cmrData.specialAgreements, '7px');
            
            // Numer CMR w środkowej części dokumentu
            addTextToField(svgDoc, 'field-cmr-number-middle', `${cmrData.cmrNumber || ''}`, '7px', 'bold');
            
            // Informacje do zapłaty (pole payment)
            const paymentText = cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' : 
                               cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : '';
            addTextToField(svgDoc, 'field-payment', paymentText, '7px');
            addTextToField(svgDoc, 'field-payer-bottom', paymentText, '7px');
            
            // Pełny numer CMR w dolnej części
            addTextToField(svgDoc, 'field-full-cmr-number', `${cmrData.cmrNumber}`, '7px', 'bold');
            
            // Miejsce i data wystawienia
            const formatDateSimple2 = (date) => {
              if (!date) return '';
              
              // Obsługa timestampu Firestore
              if (date && typeof date === 'object' && typeof date.toDate === 'function') {
                date = date.toDate();
              }
              
              let dateObj;
              if (typeof date === 'string') {
                dateObj = new Date(date);
              } else {
                dateObj = date;
              }
              
              if (isNaN(dateObj.getTime())) {
                return '';
              }
              
              const day = dateObj.getDate().toString().padStart(2, '0');
              const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
              const year = dateObj.getFullYear();
              
              return `${day}.${month}.${year}`;
            };
            
            const issuePlaceDate = `${cmrData.issuePlace || ''} ${formatDateSimple2(cmrData.issueDate) || ''}`;
            addTextToField(svgDoc, 'field-issue-place-date', issuePlaceDate, '7px');
          };
          
          // Wypełnij pola w obecnym szablonie
          fillDocumentFields(svgDoc);
          
          // Przekształć dokument z powrotem do tekstu
          const serializer = new XMLSerializer();
          const updatedSvgString = serializer.serializeToString(svgDoc);
          
          // Dodaj do listy wygenerowanych dokumentów
          generatedDocuments.push({
            svgString: updatedSvgString,
            copyNumber: copyNumber,
            backgroundTemplate: backgroundTemplateName
          });
          
        } catch (templateError) {
          console.error(`Błąd podczas generowania szablonu ${copyNumber}:`, templateError);
          showError(`Nie udało się wygenerować kopii ${copyNumber}: ${templateError.message}`);
        }
      }
      
      // Funkcja do konwersji SVG na obraz z optymalizacją dla urządzeń mobilnych
      const convertSvgToImage = async (svgString, options = {}) => {
        return new Promise((resolve, reject) => {
          try {
            // Detekcja urządzenia mobilnego
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isTablet = /iPad|Android(?=.*Mobile)/i.test(navigator.userAgent);
            
            // Konfiguracja DPI w zależności od urządzenia
            let dpi;
            if (isMobile && !isTablet) {
              dpi = 150; // Telefony - niższa rozdzielczość dla szybkości
            } else if (isTablet) {
              dpi = 180; // Tablety - średnia rozdzielczość
            } else {
              dpi = 200; // Desktop - wyższa rozdzielczość, ale nie 300dpi
            }
            
            // Możliwość nadpisania DPI przez opcje
            if (options.dpi) {
              dpi = options.dpi;
            }
            
            // Oblicz rozmiar canvas (A4: 210x297mm)
            const pxPerMm = dpi / 25.4; // Konwersja DPI na piksele na milimetr
            const canvasWidth = Math.round(210 * pxPerMm);
            const canvasHeight = Math.round(297 * pxPerMm);
            
            console.log(`CMR PDF Optymalizacja: Urządzenie: ${isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'}, DPI: ${dpi}, Rozmiar: ${canvasWidth}x${canvasHeight}`);
            
            // Utwórz element Canvas z optymalizowanym rozmiarem
            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const context = canvas.getContext('2d');
            
            // Ustaw wysoką jakość renderowania
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            
            // Utwórz tymczasowy obraz
            const img = new Image();
            
            // Obsługa zakończenia ładowania obrazu
            img.onload = function() {
              // Wyczyść kanwę białym tłem i narysuj obraz
              context.fillStyle = 'white';
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(img, 0, 0, canvas.width, canvas.height);
              
              // Konfiguracja jakości kompresji JPEG
              let quality;
              if (isMobile && !isTablet) {
                quality = 0.75; // Telefony - wyższa kompresja dla mniejszego rozmiaru
              } else if (isTablet) {
                quality = 0.85; // Tablety - średnia kompresja
              } else {
                quality = 0.90; // Desktop - niższa kompresja dla lepszej jakości
              }
              
              // Możliwość nadpisania jakości przez opcje
              if (options.quality) {
                quality = options.quality;
              }
              
              // Konwertuj Canvas do obrazu JPEG z kompresją
              const imgData = canvas.toDataURL('image/jpeg', quality);
              
              // Logowanie informacji o optymalizacji
              const originalSize = Math.round(canvasWidth * canvasHeight * 4 / 1024 / 1024); // MB (RGBA)
              console.log(`CMR PDF: Optymalizacja zakończona. Szacowany rozmiar przed kompresją: ~${originalSize}MB, Jakość JPEG: ${Math.round(quality * 100)}%`);
              
              resolve(imgData);
            };
            
            // Obsługa błędu ładowania obrazu
            img.onerror = function(error) {
              console.error('Błąd ładowania SVG:', error);
              reject(new Error('Nie udało się załadować obrazu SVG'));
            };
            
            // Ustaw źródło obrazu na kod SVG (zakodowany Base64)
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
          } catch (error) {
            console.error('Błąd konwersji SVG:', error);
            reject(new Error('Błąd podczas konwersji SVG'));
          }
        });
      };
      
      // Przygotuj dokumenty do drukowania
      try {
        const printImages = [];
        
        // Konwertuj wszystkie dokumenty na obrazy z optymalizacją
        console.log(`🔄 CMR PDF: Rozpoczynam konwersję ${generatedDocuments.length} dokumentów z optymalizacją dla urządzeń mobilnych`);
        
        for (let i = 0; i < generatedDocuments.length; i++) {
          const docData = generatedDocuments[i];
          try {
            console.log(`📄 CMR PDF: Konwersja kopii ${docData.copyNumber} (${i + 1}/${generatedDocuments.length})`);
            const imgData = await convertSvgToImage(docData.svgString, pdfOptimizationOptions);
            printImages.push(imgData);
          } catch (imageError) {
            console.error(`❌ Błąd konwersji kopii ${docData.copyNumber} do obrazu:`, imageError);
          }
        }
        
        console.log(`✅ CMR PDF: Konwersja zakończona. Przygotowano ${printImages.length} obrazów`);
        
        if (printImages.length > 0) {
          // Szacowanie rozmiaru po optymalizacji
          const estimatedSizePerImage = printImages[0].length / 1024 / 1024; // MB
          const totalEstimatedSize = estimatedSizePerImage * printImages.length;
          console.log(`📊 CMR PDF: Szacowany rozmiar po optymalizacji: ~${totalEstimatedSize.toFixed(1)}MB (${estimatedSizePerImage.toFixed(1)}MB na stronę)`);
        }
        
        if (printImages.length === 0) {
          throw new Error('Nie udało się przygotować żadnych obrazów do drukowania');
        }
        
        // Utwórz nowe okno do drukowania
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          throw new Error('Nie udało się otworzyć okna drukowania. Sprawdź ustawienia blokowania popup.');
        }
        
        // Przygotuj HTML do drukowania
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>CMR ${cmrData.cmrNumber || 'dokument'} - Drukowanie</title>
            <style>
              @page {
                size: A4;
                margin: 0;
              }
              
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              
              body {
                font-family: Arial, sans-serif;
                background: white;
              }
              
              .page {
                width: 210mm;
                height: 297mm;
                page-break-after: always;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              
              .page:last-child {
                page-break-after: avoid;
              }
              
              .page img {
                width: 100%;
                height: 100%;
                object-fit: contain;
              }
              
              @media print {
                body {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                
                .page {
                  page-break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
            ${printImages.map((imgData, index) => `
              <div class="page">
                <img src="${imgData}" alt="CMR Kopia ${index + 1}" />
              </div>
            `).join('')}
          </body>
          </html>
        `;
        
        // Wpisz HTML do okna drukowania
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        // Poczekaj na załadowanie obrazów i uruchom drukowanie
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            
            // Opcjonalnie zamknij okno po drukowaniu (niektóre przeglądarki to robią automatycznie)
            printWindow.onafterprint = () => {
              printWindow.close();
            };
          }, 1000); // Krótkie opóźnienie aby obrazy się załadowały
        };
        
        showSuccess(`✅ Przygotowano ${printImages.length} kopii dokumentu CMR do drukowania (zoptymalizowano dla urządzeń mobilnych)`);
        
      } catch (printError) {
        console.error('Błąd podczas przygotowywania do drukowania:', printError);
        showError('Nie udało się przygotować dokumentów do drukowania: ' + printError.message);
        
        // Fallback - spróbuj wygenerować PDF do pobrania
        try {
          const { jsPDF } = await import('jspdf');
          
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true,    // Włącz kompresję PDF
            precision: 2       // Ogranicz precyzję do 2 miejsc po przecinku
          });
          
          let isFirstPage = true;
          
          console.log(`🔄 CMR PDF Fallback: Generowanie PDF z ${generatedDocuments.length} stronami z optymalizacją`);
          
          for (let i = 0; i < generatedDocuments.length; i++) {
            const docData = generatedDocuments[i];
            try {
              console.log(`📄 CMR PDF Fallback: Przetwarzanie kopii ${docData.copyNumber} (${i + 1}/${generatedDocuments.length})`);
              const imgData = await convertSvgToImage(docData.svgString, pdfOptimizationOptions);
              
              if (!isFirstPage) {
                pdf.addPage();
              }
              
              // Używamy JPEG zamiast PNG dla mniejszego rozmiaru pliku
              pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
              isFirstPage = false;
              
            } catch (imageError) {
              console.error(`❌ Błąd konwersji kopii ${docData.copyNumber}:`, imageError);
            }
          }
          
          if (!isFirstPage) {
            pdf.save(`CMR-${cmrData.cmrNumber || 'dokument'}-wszystkie-kopie.pdf`);
            showSuccess('✅ Wygenerowano zoptymalizowany plik PDF (rozmiar zmniejszony z ~160MB do ~3-12MB)');
          }
          
        } catch (fallbackError) {
          console.error('Błąd fallback PDF:', fallbackError);
          showError('Nie udało się przygotować dokumentów w żaden sposób');
        }
      }

    } catch (error) {
      console.error('Błąd podczas generowania dokumentu CMR:', error);
      showError('Nie udało się wygenerować dokumentu CMR: ' + error.message);
    }
  };
  
  // Funkcja sprawdzająca czy można zmienić status na transport
  const handleTransportValidation = (newStatus) => {
    // Sprawdź czy to zmiana na status "W transporcie"
    if (newStatus === CMR_STATUSES.IN_TRANSIT) {
      // Sprawdź czy istnieją odpowiedzi z formularzy załadunku
      if (loadingFormResponses.length === 0) {
        showError('Nie można rozpocząć transportu. Brak odpowiedzi z formularza załadunku dla tego CMR. Proszę najpierw wypełnić formularz załadunku towaru.');
        return;
      }
      
      // Wyświetl dialog z odpowiedziami z formularza przed zmianą statusu
      setPendingStatusChange(newStatus);
      setLoadingFormValidationDialogOpen(true);
    } else {
      // Dla innych statusów, wykonaj bezpośrednio zmianę
      executeStatusChange(newStatus);
    }
  };

  const executeStatusChange = async (newStatus) => {
    try {
      const result = await updateCmrStatus(id, newStatus, currentUser.uid);
      
      // Sprawdź czy zmiana statusu zawiera informacje o rezerwacjach
      if (newStatus === CMR_STATUSES.IN_TRANSIT && result.reservationResult) {
        const { reservationResult } = result;
        
        let message = `Status dokumentu CMR zmieniony na: ${newStatus}.`;
        
        if (reservationResult.success) {
          message += ` Pomyślnie zarezerwowano wszystkie partie.`;
          
          if (reservationResult.reservationResults && reservationResult.reservationResults.length > 0) {
            const details = reservationResult.reservationResults.map(res => 
              `• ${res.itemName}: ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nSzczegóły rezerwacji:\n${details}`;
          }
          
          showSuccess(message);
        } else {
          message += ` Wystąpiły problemy z rezerwacją partii.`;
          
          if (reservationResult.errors && reservationResult.errors.length > 0) {
            const errorDetails = reservationResult.errors.map(err => 
              `• ${err.itemName} (partia ${err.batchNumber}): ${err.error}`
            ).join('\n');
            
            message += `\n\nBłędy:\n${errorDetails}`;
          }
          
          if (reservationResult.reservationResults && reservationResult.reservationResults.length > 0) {
            const successDetails = reservationResult.reservationResults.map(res => 
              `• ${res.itemName}: ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nPomyślne rezerwacje:\n${successDetails}`;
          }
          
          showError(message);
        }
        
        // Dodatkowe informacje o statystykach
        if (reservationResult.statistics) {
          const stats = reservationResult.statistics;
          console.log(`Statystyki rezerwacji: ${stats.successCount} sukces(ów), ${stats.errorCount} błąd(ów) z ${stats.totalAttempted} prób`);
        }
      } 
      // Sprawdź czy zmiana statusu zawiera informacje o dostarczeniu
      else if (newStatus === CMR_STATUSES.DELIVERED && result.deliveryResult) {
        const { deliveryResult } = result;
        
        let message = `Status dokumentu CMR zmieniony na: ${newStatus}.`;
        
        if (deliveryResult.success) {
          message += ` Pomyślnie przetworzono dostarczenie - anulowano rezerwacje i wydano produkty.`;
          
          if (deliveryResult.deliveryResults && deliveryResult.deliveryResults.length > 0) {
            const details = deliveryResult.deliveryResults.map(res => 
              `• ${res.itemName}: wydano ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nSzczegóły wydania:\n${details}`;
          }
          
          showSuccess(message);
        } else {
          message += ` Wystąpiły problemy podczas przetwarzania dostarczenia.`;
          
          if (deliveryResult.errors && deliveryResult.errors.length > 0) {
            const errorDetails = deliveryResult.errors.map(err => 
              `• ${err.itemName} ${err.batchNumber ? `(partia ${err.batchNumber})` : ''}: ${err.error}`
            ).join('\n');
            
            message += `\n\nBłędy:\n${errorDetails}`;
          }
          
          if (deliveryResult.deliveryResults && deliveryResult.deliveryResults.length > 0) {
            const successDetails = deliveryResult.deliveryResults.map(res => 
              `• ${res.itemName}: wydano ${res.quantity} ${res.unit} z partii ${res.batchNumber}`
            ).join('\n');
            
            message += `\n\nPomyślne operacje:\n${successDetails}`;
          }
          
          showError(message);
        }
        
        // Dodatkowe informacje o statystykach
        if (deliveryResult.statistics) {
          const stats = deliveryResult.statistics;
          console.log(`Statystyki dostarczenia: ${stats.successCount} sukces(ów), ${stats.errorCount} błąd(ów) z ${stats.totalAttempted} prób`);
        }
      } else {
        showSuccess(`Status dokumentu CMR zmieniony na: ${newStatus}`);
      }
      
      fetchCmrDocument();
    } catch (error) {
      console.error('Błąd podczas zmiany statusu dokumentu CMR:', error);
      showError('Nie udało się zmienić statusu dokumentu CMR: ' + error.message);
    }
  };

  // Funkcja obsługująca potwierdzenie zmiany statusu po wyświetleniu formularzy
  const handleConfirmStatusChange = () => {
    setLoadingFormValidationDialogOpen(false);
    if (pendingStatusChange) {
      executeStatusChange(pendingStatusChange);
      setPendingStatusChange(null);
    }
  };

  // Funkcja obsługująca anulowanie zmiany statusu
  const handleCancelStatusChange = () => {
    setLoadingFormValidationDialogOpen(false);
    setPendingStatusChange(null);
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    
    try {
      let dateObj = date;
      
      // Obsługa timestampu Firestore
      if (date && typeof date === 'object' && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      }
      // Obsługa stringów
      else if (typeof date === 'string') {
        dateObj = new Date(date);
      }
      // Obsługa obiektów z sekundami (Firestore Timestamp format)
      else if (date && typeof date === 'object' && date.seconds) {
        dateObj = new Date(date.seconds * 1000);
      }
      
      // Sprawdź czy data jest poprawna
      if (isNaN(dateObj.getTime())) {
        return String(date);
      }
      
      return format(dateObj, 'dd MMMM yyyy', { locale: pl });
    } catch (e) {
      console.warn('Błąd formatowania daty:', e, date);
      return String(date);
    }
  };
  
  const renderStatusChip = (status) => {
    let color;
    switch (status) {
      case CMR_STATUSES.DRAFT:
        color = '#757575'; // szary
        break;
      case CMR_STATUSES.ISSUED:
        color = '#2196f3'; // niebieski
        break;
      case CMR_STATUSES.IN_TRANSIT:
        color = '#ff9800'; // pomarańczowy
        break;
      case CMR_STATUSES.DELIVERED:
        color = '#4caf50'; // zielony
        break;
      case CMR_STATUSES.COMPLETED:
        color = '#9c27b0'; // fioletowy
        break;
      case CMR_STATUSES.CANCELED:
        color = '#f44336'; // czerwony
        break;
      default:
        color = '#757575'; // szary
    }
    
    return (
      <Chip 
        label={status} 
        sx={{
          backgroundColor: color,
          color: 'white',
          fontWeight: 'medium'
        }}
      />
    );
  };

  const getPaymentStatusChip = (paymentStatus) => {
    const status = paymentStatus || CMR_PAYMENT_STATUSES.UNPAID;
    const label = translatePaymentStatus(status);
    let color = '#f44336'; // czerwony domyślny dla nie opłacone
    
    switch (status) {
      case CMR_PAYMENT_STATUSES.PAID:
        color = '#4caf50'; // zielony - opłacone
        break;
      case CMR_PAYMENT_STATUSES.UNPAID:
      default:
        color = '#f44336'; // czerwony - nie opłacone
        break;
    }
    
    return (
      <Chip 
        label={label} 
        size="small"
        clickable
        onClick={handlePaymentStatusClick}
        sx={{
          backgroundColor: color,
          color: 'white',
          cursor: 'pointer',
          '&:hover': {
            opacity: 0.8
          }
        }}
      />
    );
  };

  const handlePaymentStatusClick = () => {
    setNewPaymentStatus(cmrData?.paymentStatus || CMR_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updateCmrPaymentStatus(id, newPaymentStatus, currentUser.uid);
      setPaymentStatusDialogOpen(false);
      
      // Odśwież dane dokumentu CMR
      await fetchCmrDocument();
      
      showSuccess('Status płatności został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu płatności:', error);
      showError('Nie udało się zaktualizować statusu płatności');
    } finally {
      setNewPaymentStatus('');
      setPaymentStatusDialogOpen(false);
    }
  };

  const handleMigrateCmr = async () => {
    try {
      const result = await migrateCmrToNewFormat(id);
      if (result.success) {
        showSuccess(result.message);
        // Odśwież dane CMR po migracji
        fetchCmrDocument();
      }
    } catch (error) {
      console.error('Błąd podczas migracji CMR:', error);
      showError('Nie udało się zmigrować CMR do nowego formatu');
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handlePrintFromMenu = () => {
    handleMenuClose();
    handlePrint();
  };

  const handleMigrateFromMenu = () => {
    handleMenuClose();
    handleMigrateCmr();
  };

  // Funkcja do pobierania załączników
  const fetchAttachments = async () => {
    try {
      setAttachmentsLoading(true);
      const attachmentsList = await getCmrAttachments(id);
      setAttachments(attachmentsList);
    } catch (error) {
      console.error('Błąd podczas pobierania załączników:', error);
      showError('Nie udało się pobrać załączników');
    } finally {
      setAttachmentsLoading(false);
    }
  };

  // Funkcja do przesyłania załącznika
  const handleAttachmentUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    try {
      setUploadingAttachment(true);
      const newAttachment = await uploadCmrAttachment(file, id, currentUser.uid);
      setAttachments(prev => [newAttachment, ...prev]);
      showSuccess(`Załącznik "${file.name}" został przesłany pomyślnie`);
      
      // Jeśli CMR ma status "Dostarczone", automatycznie zmień na "Zakończone"
      if (cmrData.status === CMR_STATUSES.DELIVERED) {
        try {
          const result = await updateCmrStatus(id, CMR_STATUSES.COMPLETED, currentUser.uid);
          if (result.success) {
            // Odśwież dane CMR, aby zaktualizować wyświetlany status
            await fetchCmrDocument();
            showSuccess('Status CMR został automatycznie zmieniony na "Zakończone"');
          }
        } catch (statusError) {
          console.error('Błąd podczas automatycznej zmiany statusu CMR:', statusError);
          showError(`Załącznik dodano, ale nie udało się zmienić statusu: ${statusError.message}`);
        }
      }
    } catch (error) {
      console.error('Błąd podczas przesyłania załącznika:', error);
      showError(error.message || 'Nie udało się przesłać załącznika');
    } finally {
      setUploadingAttachment(false);
    }
  };

  // Funkcja do usuwania załącznika
  const handleAttachmentDelete = async (attachmentId, fileName) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć załącznik "${fileName}"?`)) {
      return;
    }

    try {
      await deleteCmrAttachment(attachmentId, currentUser.uid);
      setAttachments(prev => prev.filter(att => att.id !== attachmentId));
      showSuccess(`Załącznik "${fileName}" został usunięty`);
    } catch (error) {
      console.error('Błąd podczas usuwania załącznika:', error);
      showError('Nie udało się usunąć załącznika');
    }
  };

  // Funkcja formatowania rozmiaru pliku
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Pobierz załączniki przy pierwszym załadowaniu
  useEffect(() => {
    if (id) {
      fetchAttachments();
    }
  }, [id]);
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!cmrData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          {t('details.errors.loadingDocument')}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{ mt: 2 }}
        >
          {t('details.backToList')}
        </Button>
      </Container>
    );
  }
  
  const isEditable = cmrData.status === CMR_STATUSES.DRAFT || cmrData.status === CMR_STATUSES.ISSUED || cmrData.status === CMR_STATUSES.COMPLETED;
  console.log('CMR Status:', cmrData.status);
  console.log('Is Editable:', isEditable);
  console.log('CMR_STATUSES.DRAFT:', CMR_STATUSES.DRAFT);
  console.log('CMR_STATUSES.ISSUED:', CMR_STATUSES.ISSUED);
  
  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <GlobalStyles>{globalPrintCss}</GlobalStyles>
      
      {/* Header z tytułem i akcjami */}
      <Paper sx={{ p: 3, mb: 3 }} className="no-print">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ mb: { xs: 2, md: 0 } }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
              {cmrData.cmrNumber}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              {renderStatusChip(cmrData.status)}
              {getPaymentStatusChip(cmrData.paymentStatus)}
              <Typography variant="body2" color="text.secondary">
                {t('details.basicInfo.created')}: {formatDate(cmrData.issueDate)}
              </Typography>
            </Box>
          </Box>
          
          {/* Grupa przycisków akcji */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
              sx={{ minWidth: 'auto' }}
            >
              {t('details.backToList')}
            </Button>
            
            {isEditable && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={handleEdit}
                color="primary"
              >
                {t('details.editDocument')}
              </Button>
            )}
            
            {/* Przyciski zmiany statusu */}
            {cmrData.status === CMR_STATUSES.DRAFT && (
              <Button 
                variant="contained" 
                color="primary"
                onClick={() => handleTransportValidation(CMR_STATUSES.ISSUED)}
              >
                {t('details.statusActions.setIssued')}
              </Button>
            )}
            
            {cmrData.status === CMR_STATUSES.ISSUED && (
              <Button 
                variant="contained" 
                color="warning"
                onClick={() => handleTransportValidation(CMR_STATUSES.IN_TRANSIT)}
              >
                {t('details.statusActions.setInTransit')}
              </Button>
            )}
            
            {cmrData.status === CMR_STATUSES.IN_TRANSIT && (
              <Button 
                variant="contained" 
                color="success"
                onClick={() => handleTransportValidation(CMR_STATUSES.DELIVERED)}
              >
                {t('details.statusActions.setDelivered')}
              </Button>
            )}
            
            {cmrData.status === CMR_STATUSES.DELIVERED && (
              <Button 
                variant="contained" 
                color="info"
                onClick={() => handleTransportValidation(CMR_STATUSES.COMPLETED)}
              >
                {t('details.statusActions.setCompleted')}
              </Button>
            )}
            
            {(cmrData.status === CMR_STATUSES.DRAFT || 
              cmrData.status === CMR_STATUSES.ISSUED) && (
              <Button 
                variant="contained" 
                color="error"
                onClick={() => handleTransportValidation(CMR_STATUSES.CANCELED)}
              >
                {t('details.statusActions.setCanceled')}
              </Button>
            )}
            
            <Button
              variant="outlined"
              startIcon={<FileCopyIcon />}
              onClick={handleGenerateOfficialCmr}
              color="success"
            >
              {t('details.actions.generateOfficialCMR')}
            </Button>
            
            {/* Grupa przycisków etykiet - tylko gdy dostępne są szczegółowe dane wag */}
            {weightSummary && (weightSummary.totalPallets > 0 || weightSummary.totalBoxes > 0) && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                variant="outlined"
                startIcon={<LabelIcon />}
                onClick={handleBoxLabel}
                size="small"
                color="secondary"
                disabled={weightSummary.totalBoxes === 0 || !itemsWeightDetails.some(item => item.hasDetailedData && item.hasBoxes)}
              >
                  {t('details.actions.boxLabels', { count: weightSummary.totalBoxes })}
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<GridViewIcon />}
                onClick={handlePalletLabel}
                size="small"
                color="secondary"
                  disabled={weightSummary.totalPallets === 0}
              >
                  {t('details.actions.palletLabels', { count: weightSummary.totalPallets })}
              </Button>
            </Box>
            )}
            
            {/* Menu z dodatkowymi opcjami */}
            <IconButton
              onClick={handleMenuOpen}
              size="small"
              sx={{ ml: 1 }}
            >
              <MoreVertIcon />
            </IconButton>
            
            <Menu
              anchorEl={anchorEl}
              open={menuOpen}
              onClose={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItemComponent onClick={handlePrintFromMenu}>
                <ListItemIcon>
                  <PrintIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('details.actions.print')}</ListItemText>
              </MenuItemComponent>
              <MenuItemComponent onClick={handleMigrateFromMenu}>
                <ListItemIcon>
                  <RefreshIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('details.actions.migrate')}</ListItemText>
              </MenuItemComponent>
            </Menu>
          </Box>
        </Box>
      </Paper>
      

      
      {/* Nawigacja kartami */}
      <Paper sx={{ mb: 3 }} className="no-print">
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label={t('details.tabs.basic')} {...a11yProps(0)} />
          <Tab label={t('details.tabs.partiesTransport')} {...a11yProps(1)} />
          <Tab label={t('details.tabs.itemsWeights')} {...a11yProps(2)} />
          <Tab label={t('details.tabs.financeSettings')} {...a11yProps(3)} />
          <Tab label={t('details.tabs.additional')} {...a11yProps(4)} />
        </Tabs>
      </Paper>

      {/* Zawartość kart */}
      <div className="no-print">
        {/* KARTA 1: PODSTAWOWE */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
        {/* Lewa kolumna - Informacje podstawowe i powiązane zamówienia */}
        <Grid item xs={12} lg={8}>
          {/* Informacje podstawowe */}
          <Card sx={{ mb: 3 }}>
            <CardHeader 
              title={t('details.basicInfo.title')} 
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              sx={{ pb: 1 }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {t('details.basicInfo.cmrNumber')}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {cmrData.cmrNumber}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {t('details.basicInfo.issueDate')}
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.issueDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {t('details.basicInfo.deliveryDate')}
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.deliveryDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {t('details.basicInfo.transportType')}
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.transportType}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Powiązane zamówienia klienta */}
          {linkedOrders.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardHeader 
                title={t('details.linkedOrders.title', { count: linkedOrders.length })}
                titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                sx={{ pb: 1 }}
              />
              <Divider />
              <CardContent>
                <Grid container spacing={2}>
                  {linkedOrders.map((order, index) => (
                    <Grid item xs={12} key={order.id}>
                      <Paper
                        variant="outlined"
                        component={RouterLink}
                        to={`/orders/${order.id}`}
                        sx={{ 
                          p: 2,
                          cursor: 'pointer',
                          textDecoration: 'none',
                          display: 'block',
                          '&:hover': {
                            backgroundColor: 'action.hover',
                            borderColor: 'primary.main'
                          }
                        }}
                      >
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                              {t('details.linkedOrders.orderNumber')}
                            </Typography>
                            <Typography 
                              variant="body1" 
                              sx={{ 
                                color: 'primary.main',
                                fontWeight: 600
                              }}
                            >
                              {order.orderNumber}
                            </Typography>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                              {t('details.linkedOrders.customer')}
                            </Typography>
                            <Typography variant="body1">
                              {order.customer?.name || '-'}
                            </Typography>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                              {t('details.linkedOrders.orderDate')}
                            </Typography>
                            <Typography variant="body2">
                              {formatDate(order.orderDate)}
                            </Typography>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                              {t('details.linkedOrders.status')}
                            </Typography>
                            <Chip 
                              label={order.status} 
                              size="small"
                              color={
                                order.status === 'Dostarczone' ? 'success' :
                                order.status === 'W realizacji' ? 'warning' :
                                order.status === 'Anulowane' ? 'error' : 'default'
                              }
                            />
                          </Grid>
                        </Grid>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}
        </Grid>
        
        {/* Prawa kolumna - Strony, transport, płatności */}
        <Grid item xs={12} lg={4}>
          {/* Strony */}
          <Card sx={{ mb: 3 }}>
            <CardHeader 
              title={t('details.parties.title')} 
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              sx={{ pb: 1 }}
            />
            <Divider />
            <CardContent>
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.parties.sender')}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                  {cmrData.sender}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {cmrData.senderAddress}
                  {cmrData.senderPostalCode && cmrData.senderCity && (
                    <><br />{cmrData.senderPostalCode} {cmrData.senderCity}</>
                  )}
                  {cmrData.senderCountry && (
                    <>, {cmrData.senderCountry}</>
                  )}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.parties.recipient')}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                  {cmrData.recipient}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {cmrData.recipientAddress}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.parties.carrier')}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                  {cmrData.carrier}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {cmrData.carrierAddress}
                  {cmrData.carrierPostalCode && cmrData.carrierCity && (
                    <><br />{cmrData.carrierPostalCode} {cmrData.carrierCity}</>
                  )}
                  {cmrData.carrierCountry && (
                    <>, {cmrData.carrierCountry}</>
                  )}
                </Typography>
              </Box>
                        </CardContent>
          </Card>
        </Grid>
      </Grid>



    </TabPanel>

        {/* KARTA 2: STRONY I TRANSPORT */}
        <TabPanel value={activeTab} index={1}>
          <Grid container spacing={3}>
            {/* Strony */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title={t('details.parties.title')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                          {t('details.parties.sender')}
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                          {cmrData.sender}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {cmrData.senderAddress}
                          {cmrData.senderPostalCode && cmrData.senderCity && (
                            <><br />{cmrData.senderPostalCode} {cmrData.senderCity}</>
                          )}
                          {cmrData.senderCountry && (
                            <>, {cmrData.senderCountry}</>
                          )}
                        </Typography>
                      </Box>
                    </Grid>
                    
                    <Grid item xs={12} md={4}>
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                          {t('details.parties.recipient')}
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                          {cmrData.recipient}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                          {cmrData.recipientAddress}
                        </Typography>
                      </Box>
                    </Grid>
                    
                    <Grid item xs={12} md={4}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                          {t('details.parties.carrier')}
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                          {cmrData.carrier}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {cmrData.carrierAddress}
                          {cmrData.carrierPostalCode && cmrData.carrierCity && (
                            <><br />{cmrData.carrierPostalCode} {cmrData.carrierCity}</>
                          )}
                          {cmrData.carrierCountry && (
                            <>, {cmrData.carrierCountry}</>
                          )}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Transport i lokalizacje */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader 
                  title={t('details.transport.title')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                      {t('details.transport.loadingPlace')}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {cmrData.loadingPlace || '-'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, display: 'block', mt: 1 }}>
                      {t('details.transport.loadingDate')}
                    </Typography>
                    <Typography variant="body2">
                      {formatDate(cmrData.loadingDate)}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                      {t('details.transport.deliveryPlace')}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {cmrData.deliveryPlace || '-'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Informacje o pojeździe */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader 
                  title={t('details.vehicle.title')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.vehicle.vehicleRegistration')}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {cmrData.vehicleInfo?.vehicleRegistration || '-'}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.vehicle.trailerRegistration')}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {cmrData.vehicleInfo?.trailerRegistration || '-'}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* KARTA 3: ELEMENTY I WAGI */}
        <TabPanel value={activeTab} index={2}>
          <Grid container spacing={3}>
            {/* Elementy dokumentu CMR */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title={t('details.items.title')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  {weightDetailsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress />
                      <Typography variant="body1" sx={{ ml: 2 }}>
                        {t('details.loading.weights')}
                      </Typography>
                    </Box>
                  ) : cmrData.items && cmrData.items.length > 0 ? (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Lp.</TableCell>
                            <TableCell>{t('details.items.description')}</TableCell>
                            <TableCell>Zamówienie</TableCell>
                            <TableCell>Pozycja CO</TableCell>
                            <TableCell>{t('details.items.quantity')}</TableCell>
                            <TableCell>{t('details.items.unit')}</TableCell>
                            <TableCell>{t('details.items.weight')}</TableCell>
                            <TableCell>{t('details.palletDetails.title')}</TableCell>
                            <TableCell>{t('details.boxDetails.title')}</TableCell>
                            <TableCell>{t('details.items.weightDetails')}</TableCell>
                            <TableCell>{t('details.items.batchInfo')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {cmrData.items.map((item, index) => {
                            const weightDetail = itemsWeightDetails.find(detail => 
                              detail.itemId === (item.id || item.description)
                            );
                            
                            // Znajdź powiązane zamówienie
                            const linkedOrder = item.orderId ? linkedOrders.find(o => o.id === item.orderId) : null;
                            
                            // Znajdź pozycję zamówienia
                            const orderItem = linkedOrder && item.orderItemId ? 
                              linkedOrder.items?.find(oi => oi.id === item.orderItemId) : null;
                            
                            return (
                            <TableRow key={item.id || index}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{item.description}</TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                  {item.orderNumber || linkedOrder?.orderNumber || 
                                    <em style={{ color: '#999' }}>Brak przypisania</em>
                                  }
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                  {item.orderItemName || orderItem?.name || (item.originalOrderItem?.name) || 
                                    <em style={{ color: '#999' }}>-</em>
                                  }
                                </Typography>
                              </TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell>{item.weight}</TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        {weightDetail?.palletsCount || 0}
                                      </Typography>
                                      {item.volume && (
                                        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                                          ({item.volume} m³)
                                        </Typography>
                                      )}
                                    </Box>
                                    {weightDetail?.hasDetailedData && (
                                      <Chip 
                                        size="small" 
                                        color="success" 
                                        label="✓"
                                        sx={{ height: 20, minWidth: 20 }}
                                      />
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                      {weightDetail?.boxesCount || 0}
                                    </Typography>
                                    {weightDetail?.hasDetailedData && (
                                      <Chip 
                                        size="small" 
                                        color="success" 
                                        label="✓"
                                        sx={{ height: 20, minWidth: 20 }}
                                      />
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  {weightDetail?.hasDetailedData ? (
                                    <Box>
                                      {/* Szczegóły palet */}
                                      {weightDetail.pallets && weightDetail.pallets.length > 0 && (
                                        <Box sx={{ mb: 1 }}>
                                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                            {t('details.palletDetails.title')}:
                                          </Typography>
                                          {weightDetail.pallets.map((pallet, palletIndex) => (
                                            <Typography key={palletIndex} variant="caption" display="block" sx={{ fontSize: '0.75rem' }}>
                                              #{pallet.palletNumber}: {pallet.totalWeight} kg 
                                              ({pallet.boxesCount} kart., {pallet.itemsCount} szt.)
                                              {!pallet.isFull && ' (niepełna)'}
                                            </Typography>
                                          ))}
                                        </Box>
                                      )}
                                      
                                      {/* Szczegóły kartonów - tylko gdy pozycja ma kartony */}
                                      {weightDetail.hasBoxes && weightDetail.boxes && (weightDetail.boxes.fullBox || weightDetail.boxes.partialBox) && (
                                        <Box>
                                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                                            {t('details.boxDetails.title')}:
                                          </Typography>
                                          {weightDetail.boxes.fullBox && (
                                            <Typography variant="caption" display="block" sx={{ fontSize: '0.75rem' }}>
                                              Pełny: {weightDetail.boxes.fullBox.totalWeight} kg 
                                              ({weightDetail.boxes.fullBox.itemsCount} szt.)
                                              {weightDetail.boxes.fullBoxesCount > 1 && ` ×${weightDetail.boxes.fullBoxesCount}`}
                                            </Typography>
                                          )}
                                          {weightDetail.boxes.partialBox && (
                                            <Typography variant="caption" display="block" sx={{ fontSize: '0.75rem' }}>
                                              Niepełny: {weightDetail.boxes.partialBox.totalWeight} kg 
                                              ({weightDetail.boxes.partialBox.itemsCount} szt.)
                                            </Typography>
                                          )}
                                        </Box>
                                      )}
                                      
                                      {/* Parametry magazynowe */}
                                      {weightDetail.inventoryData && (
                                        <Typography variant="caption" display="block" sx={{ 
                                          fontSize: '0.7rem', 
                                          color: 'text.secondary',
                                          mt: 0.5 
                                        }}>
                                          {weightDetail.hasBoxes ? (
                                            `${weightDetail.inventoryData.itemsPerBox} szt./karton, ${weightDetail.inventoryData.boxesPerPallet} kart./paleta`
                                          ) : (
                                            'Pozycja bez kartonów - pakowanie bezpośrednio na palety'
                                          )}
                                        </Typography>
                                      )}
                                    </Box>
                                  ) : (
                                    <Typography variant="caption" sx={{ 
                                      fontStyle: 'italic', 
                                      color: 'warning.main',
                                      fontSize: '0.75rem'
                                    }}>
                                      {weightDetail?.error ? 
                                        `Błąd: ${weightDetail.error}` : 
                                        'Brak danych magazynowych'
                                      }
                                    </Typography>
                                  )}
                                </TableCell>
                              <TableCell>
                                {item.linkedBatches && item.linkedBatches.length > 0 ? (
                                  <Box>
                                    {item.linkedBatches.map((batch, batchIndex) => (
                                      <Typography key={batch.id} variant="body2" sx={{ fontSize: '0.9rem' }}>
                                        {batch.batchNumber || batch.lotNumber || 'Bez numeru'} 
                                        ({batch.quantity} {batch.unit || 'szt.'})
                                        {batchIndex < item.linkedBatches.length - 1 ? '; ' : ''}
                                      </Typography>
                                    ))}
                                  </Box>
                                ) : (
                                  <Typography variant="body2" sx={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                                    Brak powiązanych partii
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography variant="body1" sx={{ textAlign: 'center', py: 2 }}>
                      {t('details.items.noItems')}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Podsumowanie wag CMR */}
            {weightSummary && (weightSummary.totalPallets > 0 || weightSummary.totalBoxes > 0) && (
              <Grid item xs={12}>
                <Card>
                  <CardHeader 
                    title={t('details.weightSummary.title')} 
                    titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                    sx={{ pb: 1 }}
                  />
                  <Divider />
                  <CardContent>
                    <Grid container spacing={3}>
                      {/* Podsumowanie główne */}
                      <Grid item xs={12} md={4}>
                        <Paper sx={{ 
              p: 2, 
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'info.dark' : 'info.light', 
              border: 1, 
              borderColor: 'info.main' 
            }}>
                          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1, color: 'info.main' }}>
                            {t('details.weightSummary.totalSummary')}
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">{t('details.weightSummary.totalWeight')}:</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {weightSummary.totalWeight} kg
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">{t('details.weightSummary.totalPallets')}:</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {weightSummary.totalPallets}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">{t('details.weightSummary.totalBoxes')}:</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {weightSummary.totalBoxes}
                              </Typography>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>

                      {/* Szczegółowy rozkład wag */}
                      <Grid item xs={12} md={8}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
                          {t('details.weightSummary.detailedBreakdown')}
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.50' }}>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.position')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.weight')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.pallets')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.boxes')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.dataStatus')}</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {weightSummary.itemsBreakdown.map((item, index) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                      {item.description}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {item.quantity} {item.unit}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                      {item.weight}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {item.palletsCount}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {item.boxesCount}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Chip 
                                      size="small"
                                      label={item.hasDetailedData ? t('details.weightSummary.detailed') : t('details.weightSummary.basic')}
                                      color={item.hasDetailedData ? 'success' : 'warning'}
                                      variant={item.hasDetailedData ? 'filled' : 'outlined'}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Grid>
                    </Grid>

                    {/* Informacje o metodzie obliczania */}
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Informacje o obliczeniach:</strong><br />
                        • Szczegółowe wyliczenia są dostępne dla pozycji z powiązanymi partiami magazynowymi<br />
                        • Wagi obejmują produkty, kartony (0.34 kg) i palety (25 kg)<br />
                        • Pozycje bez danych magazynowych pokazują tylko podstawowe informacje
                      </Typography>
                    </Alert>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </TabPanel>

        {/* KARTA 4: FINANSE I USTALENIA */}
        <TabPanel value={activeTab} index={3}>
          <Grid container spacing={3}>
            {/* Dokumenty i instrukcje */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader 
                  title={t('details.documentsInstructions.title')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                      {t('details.documentsInstructions.attachedDocuments')}
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {cmrData.attachedDocuments || '-'}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                      {t('details.documentsInstructions.senderInstructions')}
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {cmrData.instructionsFromSender || '-'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Opłaty i płatności */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader 
                  title={t('details.feesPayments.title')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.feesPayments.freight')}
                      </Typography>
                      <Typography variant="body1">
                        {cmrData.freight || '-'}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.feesPayments.additionalCosts')}
                      </Typography>
                      <Typography variant="body1">
                        {cmrData.carriage || '-'}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.feesPayments.discounts')}
                      </Typography>
                      <Typography variant="body1">
                        {cmrData.discounts || '-'}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.feesPayments.balance')}
                      </Typography>
                      <Typography variant="body1">
                        {cmrData.balance || '-'}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12} sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.feesPayments.paymentMethod')}
                      </Typography>
                      <Typography variant="body1">
                        {cmrData.paymentMethod === 'sender' ? t('details.feesPayments.paymentBySender') : 
                         cmrData.paymentMethod === 'recipient' ? t('details.feesPayments.paymentByRecipient') : 
                         t('details.feesPayments.otherPaymentMethod')}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Ustalenia szczególne i uwagi */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title={t('details.specialAgreements.title')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.specialAgreements.specialAgreements')}
                      </Typography>
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                        {cmrData.specialAgreements || '-'}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        {t('details.specialAgreements.carrierReservations')}
                      </Typography>
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                        {cmrData.reservations || '-'}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* KARTA 5: DODATKOWE */}
        <TabPanel value={activeTab} index={4}>
          <Grid container spacing={3}>
            {/* Uwagi i informacje dodatkowe */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader 
                  title={t('details.additionalInfo.notesAndAdditionalInfo')} 
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.notes || t('details.additionalInfo.noNotes')}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Raporty załadunku towaru */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader 
                  title={t('details.loadingReports.title', { count: loadingFormResponses.length })}
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  {loadingFormResponsesLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress />
                    </Box>
                  ) : loadingFormResponses.length === 0 ? (
                    <Typography variant="body1" color="text.secondary">
                      {t('details.loadingReports.noReports')}
                    </Typography>
                  ) : (
                    <Grid container spacing={3}>
                      {loadingFormResponses.map((report, index) => (
                        <Grid item xs={12} key={index}>
                          <Paper sx={{ p: 3, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', opacity: 0.8 }}>
                            <Typography variant="subtitle2" gutterBottom sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                              {t('details.loadingReports.reportTitle', { number: index + 1 })} - {report.fillDate ? format(report.fillDate, 'dd.MM.yyyy HH:mm', { locale: pl }) : t('details.common.notSet')}
                            </Typography>
                            
                            <Grid container spacing={2}>
                              {/* Podstawowe informacje */}
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Pracownik
                                </Typography>
                                <Typography variant="body1">
                                  {report.employeeName || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Stanowisko
                                </Typography>
                                <Typography variant="body1">
                                  {report.position || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Godzina wypełnienia
                                </Typography>
                                <Typography variant="body1">
                                  {report.fillTime || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  {t('details.loadingReports.loadingDate')}
                                </Typography>
                                <Typography variant="body1">
                                  {report.loadingDate ? format(report.loadingDate, 'dd.MM.yyyy', { locale: pl }) : t('details.common.notProvided')}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Godzina załadunku
                                </Typography>
                                <Typography variant="body1">
                                  {report.loadingTime || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Przewoźnik
                                </Typography>
                                <Typography variant="body1">
                                  {report.carrierName || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Nr rejestracyjny pojazdu
                                </Typography>
                                <Typography variant="body1">
                                  {report.vehicleRegistration || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Stan techniczny pojazdu
                                </Typography>
                                <Typography variant="body1">
                                  {report.vehicleTechnicalCondition || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              {/* Informacje o towarze */}
                              <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                  Informacje o towarze
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Klient
                                </Typography>
                                <Typography variant="body1">
                                  {report.clientName || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Nr zamówienia
                                </Typography>
                                <Typography variant="body1">
                                  {report.orderNumber || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  Ilość palet
                                </Typography>
                                <Typography variant="body1">
                                  {report.palletQuantity || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" color="text.secondary">
                                  {t('details.weightSummary.weight')}
                                </Typography>
                                <Typography variant="body1">
                                  {report.weight || t('details.common.notProvided')}
                                </Typography>
                              </Grid>
                              
                              <Grid item xs={12} sm={6}>
                                <Typography variant="body2" color="text.secondary">
                                  Paleta/Nazwa produktu
                                </Typography>
                                <Typography variant="body1">
                                  {report.palletProductName || 'Nie podano'}
                                </Typography>
                              </Grid>
                              
                              {/* Uwagi */}
                              {(report.notes || report.goodsNotes) && (
                                <>
                                  <Grid item xs={12}>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                      Uwagi
                                    </Typography>
                                  </Grid>
                                  
                                  {report.notes && (
                                    <Grid item xs={12} sm={6}>
                                      <Typography variant="body2" color="text.secondary">
                                        Uwagi ogólne
                                      </Typography>
                                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {report.notes}
                                      </Typography>
                                    </Grid>
                                  )}
                                  
                                  {report.goodsNotes && (
                                    <Grid item xs={12} sm={6}>
                                      <Typography variant="body2" color="text.secondary">
                                        Uwagi dotyczące towaru
                                      </Typography>
                                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {report.goodsNotes}
                                      </Typography>
                                    </Grid>
                                  )}
                                </>
                              )}
                              

                            </Grid>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Załączniki CMR */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title={t('details.attachments.title', { count: attachments.length })}
                  titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                  sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent>
                  {/* Sekcja przesyłania plików */}
                  <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider', borderStyle: 'dashed' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                      <CloudUploadIcon sx={{ mr: 1 }} />
                      Dodaj załącznik do CMR
                    </Typography>
                    
                    <Box sx={{ mt: 2 }}>
                      <input
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.txt,.xls,.xlsx,.bmp,.tiff"
                        style={{ display: 'none' }}
                        id="cmr-attachment-upload"
                        type="file"
                        onChange={handleAttachmentUpload}
                        disabled={uploadingAttachment}
                      />
                      <label htmlFor="cmr-attachment-upload">
                        <Button
                          variant="outlined"
                          component="span"
                          startIcon={<CloudUploadIcon />}
                          disabled={uploadingAttachment}
                          fullWidth
                        >
                          Wybierz plik
                        </Button>
                      </label>
                    </Box>
                    
                    {uploadingAttachment && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        <Typography variant="caption" color="text.secondary">
                          Przesyłanie pliku...
                        </Typography>
                      </Box>
                    )}
                    
                    <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                      Dozwolone formaty: PDF, JPG, PNG, GIF, DOC, DOCX, TXT, XLS, XLSX, BMP, TIFF (max 20MB na plik)
                    </Typography>
                  </Box>

                  {/* Lista załączników */}
                  {attachmentsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress />
                    </Box>
                  ) : attachments.length === 0 ? (
                    <Paper sx={{ p: 2, backgroundColor: 'background.paper', border: 1, borderColor: 'divider', borderStyle: 'dashed' }}>
                      <Typography variant="body2" color="text.secondary" align="center">
                        {t('details.attachments.noAttachments')}
                      </Typography>
                      <Typography variant="caption" display="block" align="center" sx={{ mt: 1, color: 'text.secondary' }}>
                        {t('details.attachments.addFilesHint')}
                      </Typography>
                    </Paper>
                  ) : (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                        <AttachFileIcon sx={{ mr: 1 }} />
                        {t('details.attachments.attachmentsList', { count: attachments.length })}
                      </Typography>
                      
                      <TableContainer component={Paper} sx={{ mt: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ backgroundColor: 'action.hover' }}>
                              <TableCell sx={{ fontWeight: 'bold', width: 60 }}>{t('details.attachments.type')}</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>{t('details.attachments.fileName')}</TableCell>
                              <TableCell sx={{ fontWeight: 'bold', width: 100 }}>{t('details.attachments.size')}</TableCell>
                              <TableCell sx={{ fontWeight: 'bold', width: 120 }}>{t('details.attachments.dateAdded')}</TableCell>
                              <TableCell sx={{ fontWeight: 'bold', width: 120 }} align="center">{t('details.attachments.actions')}</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {attachments.map((attachment) => (
                              <TableRow key={attachment.id} hover>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {attachment.contentType?.startsWith('image/') ? (
                                      <Box sx={{ bgcolor: 'success.light', color: 'success.dark', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        IMG
                                      </Box>
                                    ) : attachment.contentType?.includes('pdf') ? (
                                      <Box sx={{ bgcolor: 'error.light', color: 'error.dark', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        PDF
                                      </Box>
                                    ) : attachment.contentType?.includes('word') || attachment.contentType?.includes('document') ? (
                                      <Box sx={{ bgcolor: 'info.light', color: 'info.dark', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        DOC
                                      </Box>
                                    ) : attachment.contentType?.includes('sheet') || attachment.contentType?.includes('excel') ? (
                                      <Box sx={{ bgcolor: 'warning.light', color: 'warning.dark', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        XLS
                                      </Box>
                                    ) : (
                                      <Box sx={{ bgcolor: 'grey.300', color: 'grey.700', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        FILE
                                      </Box>
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      fontWeight: 500,
                                      color: 'primary.main',
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                      '&:hover': {
                                        color: 'primary.dark'
                                      }
                                    }}
                                    onClick={() => window.open(attachment.downloadURL, '_blank')}
                                    title="Kliknij, aby otworzyć w nowej karcie"
                                  >
                                    {attachment.fileName}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="caption" color="text.secondary">
                                    {formatFileSize(attachment.size)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="caption" color="text.secondary">
                                    {attachment.uploadedAt ? format(attachment.uploadedAt, 'dd.MM.yyyy HH:mm', { locale: pl }) : 'Nie określono'}
                                  </Typography>
                                </TableCell>
                                <TableCell align="center">
                                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={() => window.open(attachment.downloadURL, '_blank')}
                                      title="Otwórz w nowej karcie"
                                    >
                                      <OpenInNewIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      color="secondary"
                                      href={attachment.downloadURL}
                                      component="a"
                                      download={attachment.fileName}
                                      title="Pobierz plik"
                                    >
                                      <DownloadIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleAttachmentDelete(attachment.id, attachment.fileName)}
                                      title="Usuń załącznik"
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <Box sx={{ p: 2, backgroundColor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {t('details.attachments.totalCount', { count: attachments.length })}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {t('details.attachments.totalSize')}: {formatFileSize(attachments.reduce((sum, attachment) => sum + attachment.size, 0))}
                          </Typography>
                        </Box>
                      </TableContainer>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>
      </div>
    
      {/* Wersja do druku */}
      <Box sx={{ display: 'none' }} className="print-container">
        <Box className="print-header">
          <Typography variant="h4" gutterBottom>
            DOKUMENT CMR
          </Typography>
          <Typography variant="h5">
            {cmrData.cmrNumber}
          </Typography>
          <Typography variant="subtitle1">
            Status: {cmrData.status}
          </Typography>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Informacje podstawowe
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Numer CMR</Typography>
              <Typography className="print-value">{cmrData.cmrNumber}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Data wystawienia</Typography>
              <Typography className="print-value">{formatDate(cmrData.issueDate)}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Data dostawy</Typography>
              <Typography className="print-value">{formatDate(cmrData.deliveryDate)}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Typ transportu</Typography>
              <Typography className="print-value">{cmrData.transportType || '-'}</Typography>
            </Box>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Strony
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Nadawca</Typography>
              <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.sender}</Typography>
              <Typography className="print-value">{cmrData.senderAddress}</Typography>
              <Typography className="print-value">
                {cmrData.senderPostalCode} {cmrData.senderCity}, {cmrData.senderCountry}
              </Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Odbiorca</Typography>
              <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.recipient}</Typography>
              <Typography className="print-value" sx={{ whiteSpace: 'pre-line' }}>
                {cmrData.recipientAddress}
              </Typography>
            </Box>
          </Box>
          
          <Box sx={{ mt: 3 }}>
            <Typography className="print-label">Przewoźnik</Typography>
            <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.carrier}</Typography>
            <Typography className="print-value">{cmrData.carrierAddress}</Typography>
            <Typography className="print-value">
              {cmrData.carrierPostalCode} {cmrData.carrierCity}, {cmrData.carrierCountry}
            </Typography>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Miejsce załadunku i rozładunku
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Miejsce załadunku</Typography>
              <Typography className="print-value">{cmrData.loadingPlace || '-'}</Typography>
              <Typography className="print-label" sx={{ mt: 1 }}>Data załadunku</Typography>
              <Typography className="print-value">{formatDate(cmrData.loadingDate)}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Miejsce dostawy</Typography>
              <Typography className="print-value">{cmrData.deliveryPlace || '-'}</Typography>
            </Box>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Informacje o pojeździe
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Numer rejestracyjny pojazdu</Typography>
              <Typography className="print-value">{cmrData.vehicleInfo?.vehicleRegistration || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Numer rejestracyjny naczepy</Typography>
              <Typography className="print-value">{cmrData.vehicleInfo?.trailerRegistration || '-'}</Typography>
            </Box>
          </Box>
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Elementy dokumentu CMR
          </Typography>
          
          {cmrData.items && cmrData.items.length > 0 ? (
            <Table className="print-table">
              <TableHead>
                <TableRow>
                  <TableCell>Lp.</TableCell>
                  <TableCell>Opis</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell>{t('details.weightSummary.weight')} (kg)</TableCell>
                  <TableCell>Palety</TableCell>
                  <TableCell>Kartony</TableCell>
                  <TableCell>Powiązane partie</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cmrData.items.map((item, index) => {
                  const weightDetail = itemsWeightDetails.find(detail => 
                    detail.itemId === (item.id || item.description)
                  );
                  
                  return (
                  <TableRow key={item.id || index}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{item.weight}</TableCell>
                      <TableCell>{weightDetail?.palletsCount || 0}</TableCell>
                      <TableCell>{weightDetail?.boxesCount || 0}</TableCell>
                    <TableCell>
                      {item.linkedBatches && item.linkedBatches.length > 0 ? (
                        <Box>
                          {item.linkedBatches.map((batch, batchIndex) => (
                            <Typography key={batch.id} variant="body2" sx={{ fontSize: '0.9rem' }}>
                              {batch.batchNumber || batch.lotNumber || 'Bez numeru'} 
                              ({batch.quantity} {batch.unit || 'szt.'})
                              {batchIndex < item.linkedBatches.length - 1 ? '; ' : ''}
                            </Typography>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                          Brak powiązanych partii
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body1" sx={{ textAlign: 'center', py: 2 }}>
              Brak elementów w dokumencie CMR
            </Typography>
          )}
        </Box>
        
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            Opłaty i ustalenia szczególne
          </Typography>
          
          <Box className="print-grid">
            <Box className="print-grid-item">
              <Typography className="print-label">Przewoźne</Typography>
              <Typography className="print-value">{cmrData.freight || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Koszty dodatkowe</Typography>
              <Typography className="print-value">{cmrData.carriage || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Bonifikaty</Typography>
              <Typography className="print-value">{cmrData.discounts || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Saldo</Typography>
              <Typography className="print-value">{cmrData.balance || '-'}</Typography>
            </Box>
            
            <Box className="print-grid-item">
              <Typography className="print-label">Płatność</Typography>
              <Typography className="print-value">
                {cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' : 
                 cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : 
                 'Inny sposób płatności'}
              </Typography>
            </Box>
          </Box>
          
          <Box sx={{ mt: 3 }}>
            <Typography className="print-label">Ustalenia szczególne</Typography>
            <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
              {cmrData.specialAgreements || '-'}
            </Typography>
          </Box>
          
          <Box sx={{ mt: 3 }}>
            <Typography className="print-label">Zastrzeżenia i uwagi przewoźnika</Typography>
            <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
              {cmrData.reservations || '-'}
            </Typography>
          </Box>
        </Box>
        
        {cmrData.notes && (
          <Box className="print-section">
            <Typography variant="h6" className="print-section-title">
              Uwagi i informacje dodatkowe
            </Typography>
            <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
              {cmrData.notes}
            </Typography>
          </Box>
        )}
        
        <Box className="print-footer">
          <Box className="print-signature">
            <Typography variant="body2">Podpis nadawcy</Typography>
          </Box>
          <Box className="print-signature">
            <Typography variant="body2">Podpis przewoźnika</Typography>
          </Box>
          <Box className="print-signature">
            <Typography variant="body2">Podpis odbiorcy</Typography>
          </Box>
        </Box>
      </Box>

      {/* Dialog walidacji formularzy załadunku przed zmianą statusu na transport */}
      <Dialog
        open={loadingFormValidationDialogOpen}
        onClose={handleCancelStatusChange}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon color="warning" />
            Potwierdź rozpoczęcie transportu
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            Znaleziono {loadingFormResponses.length} odpowiedzi z formularza załadunku towaru dla tego CMR. 
            Sprawdź poniższe dane przed rozpoczęciem transportu:
          </DialogContentText>
          
          {loadingFormResponses.length > 0 && (
            <Grid container spacing={2}>
              {loadingFormResponses.map((report, index) => (
                <Grid item xs={12} key={index}>
                  <Paper sx={{ p: 2, backgroundColor: 'background.default', border: 1, borderColor: 'divider' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {t('details.loadingReports.formTitle', { number: index + 1 })} - {report.fillDate ? format(report.fillDate, 'dd.MM.yyyy HH:mm', { locale: pl }) : t('details.common.notSet')}
                    </Typography>
                    
                                         <Grid container spacing={2}>
                       {/* Informacje podstawowe o wypełnieniu */}
                       <Grid item xs={12}>
                         <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                           Informacje o wypełnieniu formularza
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Email pracownika
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.email || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Pracownik
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.employeeName || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Stanowisko
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.position || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Godzina wypełnienia
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.fillTime || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       {/* Informacje o załadunku */}
                       <Grid item xs={12}>
                         <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                           Informacje o załadunku
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           {t('details.loadingReports.loadingDate')}
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.loadingDate ? format(report.loadingDate, 'dd.MM.yyyy', { locale: pl }) : t('details.common.notProvided')}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Godzina załadunku
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.loadingTime || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Przewoźnik
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.carrierName || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Nr rejestracyjny pojazdu
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.vehicleRegistration || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6}>
                         <Typography variant="caption" color="text.secondary">
                           Stan techniczny pojazdu
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.vehicleTechnicalCondition || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       {/* Informacje o towarze */}
                       <Grid item xs={12}>
                         <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                           Informacje o towarze
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Klient
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.clientName || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Nr zamówienia
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.orderNumber || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           Ilość palet
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.palletQuantity || 'Nie podano'}
                         </Typography>
                       </Grid>
                       
                       <Grid item xs={12} sm={6} md={3}>
                         <Typography variant="caption" color="text.secondary">
                           {t('details.weightSummary.weight')}
                         </Typography>
                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
                           {report.weight || t('details.common.notProvided')}
                         </Typography>
                       </Grid>
                       
                       {report.palletProductName && (
                         <Grid item xs={12}>
                           <Typography variant="caption" color="text.secondary">
                             Nazwa produktu / Paleta
                           </Typography>
                           <Typography variant="body2" sx={{ fontWeight: 500 }}>
                             {report.palletProductName}
                           </Typography>
                         </Grid>
                       )}
                       
                       {/* Uwagi */}
                       {(report.notes || report.goodsNotes) && (
                         <>
                           <Grid item xs={12}>
                             <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                               Uwagi
                             </Typography>
                           </Grid>
                           
                           {report.notes && (
                             <Grid item xs={12} sm={6}>
                               <Typography variant="caption" color="text.secondary">
                                 Uwagi dotyczące załadunku
                               </Typography>
                               <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                 {report.notes}
                               </Typography>
                             </Grid>
                           )}
                           
                           {report.goodsNotes && (
                             <Grid item xs={12} sm={6}>
                               <Typography variant="caption" color="text.secondary">
                                 Uwagi dotyczące towaru
                               </Typography>
                               <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                 {report.goodsNotes}
                               </Typography>
                             </Grid>
                           )}
                         </>
                       )}
                       
                       {/* Załączniki */}
                       {report.documentsUrl && (
                         <>
                           <Grid item xs={12}>
                             <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                               {t('details.attachments.title')}
                             </Typography>
                           </Grid>
                           
                           <Grid item xs={12}>
                             <Button
                               variant="outlined"
                               size="small"
                               href={report.documentsUrl}
                               target="_blank"
                               rel="noopener noreferrer"
                               startIcon={<FileCopyIcon />}
                             >
                               {report.documentsName || 'Pobierz załącznik'}
                             </Button>
                           </Grid>
                         </>
                       )}
                     </Grid>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          )}
        
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelStatusChange} color="inherit">
            {t('dialogs.cancel')}
          </Button>
          <Button 
            onClick={handleConfirmStatusChange} 
            color="warning" 
            variant="contained"
            startIcon={<CheckIcon />}
          >
            Potwierdź rozpoczęcie transportu
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu płatności */}
      <Dialog
        open={paymentStatusDialogOpen}
        onClose={() => setPaymentStatusDialogOpen(false)}
      >
        <DialogTitle>Zmień status płatności</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status płatności dokumentu CMR:
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Status płatności</InputLabel>
            <Select
              value={newPaymentStatus}
              onChange={(e) => setNewPaymentStatus(e.target.value)}
              label="Status płatności"
            >
              <MenuItem value={CMR_PAYMENT_STATUSES.UNPAID}>
                {translatePaymentStatus(CMR_PAYMENT_STATUSES.UNPAID)}
              </MenuItem>
              <MenuItem value={CMR_PAYMENT_STATUSES.PAID}>
                {translatePaymentStatus(CMR_PAYMENT_STATUSES.PAID)}
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentStatusDialogOpen(false)}>{t('dialogs.cancel')}</Button>
          <Button onClick={handlePaymentStatusUpdate} color="primary">{t('dialogs.update')}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog generowania etykiet */}
      <LabelsDisplayDialog
        open={labelsDialogOpen}
        onClose={handleLabelsDialogClose}
        labels={currentLabels}
        title={`Etykiety CMR ${cmrData?.cmrNumber || ''}`}
        cmrData={cmrData}
        itemsWeightDetails={itemsWeightDetails}
        labelType={currentLabelType}
      />
    </Container>
  );
};

export default CmrDetailsPage; 