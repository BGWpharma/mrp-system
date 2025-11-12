import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  FormHelperText,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Autocomplete,
  FormControlLabel,
  Switch,
  Chip,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  TableContainer,
  Collapse
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  AttachMoney as AttachMoneyIcon,
  LocalShipping as LocalShippingIcon,
  EventNote as EventNoteIcon,
  Calculate as CalculateIcon,
  Upload as UploadIcon,
  DownloadRounded as DownloadIcon,
  Person as PersonIcon,
  CloudUpload as CloudUploadIcon,
  ShoppingCart as ShoppingCartIcon,
  Refresh as RefreshIcon,
  PlaylistAdd as PlaylistAddIcon,
  Link as LinkIcon,
  OpenInNew as OpenInNewIcon,
  BuildCircle as ServiceIcon,
  Receipt as ReceiptIcon,
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  DragIndicator as DragIndicatorIcon
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { 
  createOrder, 
  updateOrder, 
  getOrderById, 
  ORDER_STATUSES,
  DEFAULT_ORDER,
  uploadDeliveryProof,
  deleteDeliveryProof,
  calculateOrderTotal
} from '../../services/orderService';
import { getAllInventoryItems, getIngredientPrices, getInventoryItemsByCategory } from '../../services/inventory';
import { getAllCustomers, createCustomer } from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency } from '../../utils/formatUtils';
import { formatDateForInput, formatDate, safeParseDate, ensureDateInputFormat } from '../../utils/dateUtils';
import { getAllRecipes, getRecipeById } from '../../services/recipeService';
import { storage } from '../../services/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { calculateProductionCost } from '../../utils/costCalculator';
import { createPurchaseOrder, getPurchaseOrderById, getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { getBestSupplierPricesForItems, getAllSuppliers } from '../../services/supplierService';
import { getPriceForCustomerProduct } from '../../services/priceListService';
import { 
  getInventoryItemByName as findProductByName, 
  getInventoryItemById as getProductById 
} from '../../services/inventory';
import { 
  getRecipeById as getRecipeByProductId 
} from '../../services/recipeService';
import { 
  getAllInventoryItems as getAllProducts 
} from '../../services/inventory';
import { getExchangeRate } from '../../services/exchangeRateService';
import { getLastRecipeUsageInfo } from '../../services/orderService';

const DEFAULT_ITEM = {
  id: '',
  name: '',
  description: '',
  quantity: 1,
  unit: 'szt.',
  price: 0,
  margin: 0,
  basePrice: 0,
  fromPriceList: false,
  isRecipe: false,
  itemType: 'product'
};

// Funkcja do generowania unikalnego ID pozycji
const generateItemId = () => {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const DEFAULT_MARGIN = 20; // Domyślna marża w procentach

// Komponent dla sortowalnego wiersza z drag-and-drop
const SortableRow = ({ 
  item, 
  index, 
  expandedRows,
  services,
  recipes,
  validationErrors,
  inputSx,
  handleItemChange,
  handleProductSelect,
  toggleExpandRow,
  refreshItemPrice,
  removeItem,
  formatCurrency,
  calculateItemTotalValue,
  calculateTotalItemsValue,
  calculateAdditionalCosts,
  calculateDiscounts,
  itemsLength,
  refreshProductionTasks,
  refreshingPTs,
  navigate,
  formatDateToDisplay,
  t
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && {
      opacity: 0.5,
      zIndex: 1000,
    }),
  };

  return (
    <React.Fragment>
      {/* Główny wiersz z podstawowymi informacjami */}
      <TableRow 
        ref={setNodeRef}
        style={style}
        sx={{ 
          '&:nth-of-type(odd)': { 
            bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : 'background.paper' 
          },
          '&:nth-of-type(even)': { 
            bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.50' 
          },
          '&:hover': {
            bgcolor: 'action.hover'
          },
          ...(isDragging && {
            bgcolor: 'action.selected',
            boxShadow: 3
          })
        }}
      >
        {/* Uchwyt do przeciągania */}
        <TableCell {...attributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
          <DragIndicatorIcon 
            sx={{ 
              color: 'action.active',
            }} 
          />
        </TableCell>
        
        {/* Przycisk rozwijania */}
        <TableCell>
          <IconButton
            aria-label="rozwiń szczegóły"
            size="small"
            onClick={() => toggleExpandRow(index)}
          >
            {expandedRows[index] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </TableCell>
        
        {/* Produkt / Receptura */}
        <TableCell>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <ToggleButtonGroup
              size="small"
              value={item.itemType || (item.isRecipe ? 'recipe' : 'product')}
              exclusive
              onChange={(_, newType) => {
                if (newType !== null) {
                  handleItemChange(index, 'itemType', newType);
                }
              }}
              aria-label="typ produktu"
            >
              <ToggleButton value="product" size="small">
                Produkt
              </ToggleButton>
              <ToggleButton value="recipe" size="small">
                Receptura
              </ToggleButton>
              <ToggleButton value="service" size="small">
                Usługa
              </ToggleButton>
            </ToggleButtonGroup>
            
            {(item.itemType === 'service') ? (
              <Autocomplete
                options={services}
                getOptionLabel={(option) => option.name || ''}
                value={services.find(s => s.id === item.serviceId) || null}
                onChange={(_, newValue) => handleProductSelect(index, newValue, 'service')}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="Usługa"
                    size="small"
                    error={!!validationErrors[`item_${index}_name`]}
                    helperText={validationErrors[`item_${index}_name`]}
                  />
                )}
              />
            ) : (item.itemType === 'recipe' || item.isRecipe) ? (
              <Autocomplete
                options={recipes}
                getOptionLabel={(option) => option.name || ''}
                value={recipes.find(r => r.id === item.recipeId) || null}
                onChange={(_, newValue) => handleProductSelect(index, newValue, 'recipe')}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="Receptura"
                    size="small"
                    error={!!validationErrors[`item_${index}_name`]}
                    helperText={validationErrors[`item_${index}_name`]}
                  />
                )}
              />
            ) : (
              <TextField
                label="Nazwa produktu"
                value={item.name}
                onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                fullWidth
                error={!!validationErrors[`item_${index}_name`]}
                helperText={validationErrors[`item_${index}_name`]}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </TableCell>
        
        {/* Ilość */}
        <TableCell>
          <TextField
            type="number"
            value={item.quantity}
            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
            inputProps={{ min: 1 }}
            fullWidth
            error={!!validationErrors[`item_${index}_quantity`]}
            helperText={validationErrors[`item_${index}_quantity`]}
            size="small"
            variant="outlined"
            sx={inputSx}
          />
        </TableCell>
        
        {/* Jednostka */}
        <TableCell>
          <TextField
            value={item.unit}
            onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
            fullWidth
            size="small"
            variant="outlined"
            sx={inputSx}
          />
        </TableCell>
        
        {/* Cena EUR */}
        <TableCell>
          <TextField
            type="number"
            value={item.price}
            onChange={(e) => handleItemChange(index, 'price', e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Odśwież cenę jednostkową">
                    <IconButton
                      aria-label="odśwież cenę"
                      onClick={() => refreshItemPrice(index)}
                      edge="end"
                      size="small"
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
            inputProps={{ min: 0, step: 'any' }}
            fullWidth
            error={!!validationErrors[`item_${index}_price`]}
            helperText={validationErrors[`item_${index}_price`]}
            size="small"
            variant="outlined"
            sx={inputSx}
          />
        </TableCell>
        
        {/* Wartość */}
        <TableCell>
          <Box sx={{ fontWeight: 'bold' }}>
            {formatCurrency(item.quantity * item.price)}
          </Box>
        </TableCell>
        
        {/* Koszt całk./szt. */}
        <TableCell>
          <Box sx={{ fontWeight: 'medium' }}>
            {(() => {
              const itemTotalValue = calculateItemTotalValue(item);
              const allItemsValue = calculateTotalItemsValue();
              const proportion = allItemsValue > 0 ? itemTotalValue / allItemsValue : 0;
              const additionalCosts = calculateAdditionalCosts();
              const discounts = calculateDiscounts();
              const additionalShare = proportion * (additionalCosts - discounts);
              const totalWithAdditional = itemTotalValue + additionalShare;
              const quantity = parseFloat(item.quantity) || 1;
              const unitCost = totalWithAdditional / quantity;
              return formatCurrency(unitCost, 'EUR', 4, true);
            })()}
          </Box>
        </TableCell>
        
        {/* Pełny koszt prod./szt. */}
        <TableCell align="right">
          {(() => {
            if (item.productionTaskId && item.fullProductionCost !== undefined) {
              if (item.fullProductionUnitCost !== undefined && item.fullProductionUnitCost !== null) {
                return (
                  <Box sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                    {formatCurrency(item.fullProductionUnitCost)}
                  </Box>
                );
              }
              const quantity = parseFloat(item.quantity) || 1;
              const price = parseFloat(item.price) || 0;
              const unitFullProductionCost = (item.fromPriceList && parseFloat(item.price || 0) > 0)
                ? parseFloat(item.fullProductionCost) / quantity
                : (parseFloat(item.fullProductionCost) / quantity) + price;
              return (
                <Box sx={{ fontWeight: 'medium', color: 'warning.main' }}>
                  {formatCurrency(unitFullProductionCost)}
                </Box>
              );
            } else {
              return <Typography variant="body2" color="text.secondary">-</Typography>;
            }
          })()}
        </TableCell>
        
        {/* Przycisk usuwania */}
        <TableCell>
          <IconButton 
            color="error" 
            onClick={() => removeItem(index)}
            disabled={itemsLength === 1}
            size="small"
          >
            <DeleteIcon />
          </IconButton>
        </TableCell>
      </TableRow>
      
      {/* Rozwijany wiersz ze szczegółami - ukrywany podczas przeciągania */}
      {!isDragging && (
        <TableRow>
          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
            <Collapse in={expandedRows[index]} timeout="auto" unmountOnExit>
              <Box sx={{ margin: 1 }}>
                <Typography variant="h6" gutterBottom component="div" sx={{ color: 'primary.main' }}>
                  {t('orderForm.itemDetails.title')}
                </Typography>
                <Grid container spacing={2}>
                  {/* Opis */}
                  <Grid item xs={12} md={6}>
                    <TextField
                      label={t('orderForm.itemDetails.description')}
                      value={item.description || ''}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      fullWidth
                      multiline
                      rows={3}
                      size="small"
                      variant="outlined"
                      placeholder={t('orderForm.placeholders.addItemDescription')}
                    />
                  </Grid>
                  
                  {/* Z listy cenowej */}
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.fromPriceList')}
                      </Typography>
                      <Chip 
                        label={item.fromPriceList ? t('common.yes') : t('common.no')} 
                        size="small" 
                        color={item.fromPriceList ? "success" : "default"}
                        variant={item.fromPriceList ? "filled" : "outlined"}
                        sx={{ borderRadius: 1, alignSelf: 'flex-start' }}
                      />
                    </Box>
                  </Grid>
                  
                  {/* Zadanie produkcyjne */}
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('orderForm.itemDetails.productionTask')}
                        </Typography>
                        <Tooltip title="Odśwież status zadań produkcyjnych">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={refreshProductionTasks}
                            disabled={refreshingPTs}
                          >
                            <RefreshIcon fontSize="small" />
                            {refreshingPTs && <CircularProgress size={16} sx={{ position: 'absolute' }} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {item.productionTaskId ? (
                        <Tooltip title="Przejdź do zadania produkcyjnego">
                          <Chip
                            label={item.productionTaskNumber || `MO-${item.productionTaskId.substr(0, 6)}`}
                            size="small"
                            color={
                              item.productionStatus === 'Zakończone' ? 'success' :
                              item.productionStatus === 'W trakcie' ? 'warning' :
                              item.productionStatus === 'Anulowane' ? 'error' :
                              item.productionStatus === 'Zaplanowane' ? 'primary' : 'default'
                            }
                            onClick={() => navigate(`/production/tasks/${item.productionTaskId}`)}
                            sx={{ cursor: 'pointer', borderRadius: 1, alignSelf: 'flex-start' }}
                            icon={<EventNoteIcon />}
                          />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  {/* Koszt produkcji */}
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.productionCost')}
                      </Typography>
                      {item.productionTaskId && item.productionCost !== undefined ? (
                        <Box sx={{ fontWeight: 'medium', color: 'text.secondary' }}>
                          {formatCurrency(item.productionCost)}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  {/* Profit */}
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.profit')}
                      </Typography>
                      {item.fromPriceList && parseFloat(item.price || 0) > 0 && item.productionCost !== undefined ? (
                        <Box sx={{ 
                          fontWeight: 'medium', 
                          color: (item.quantity * item.price - item.productionCost) > 0 ? 'success.main' : 'error.main' 
                        }}>
                          {formatCurrency(item.quantity * item.price - item.productionCost)}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  {/* Ostatni koszt */}
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.lastCost')}
                      </Typography>
                      {item.lastUsageInfo ? (
                        <Tooltip title={
                          item.lastUsageInfo.estimatedCost 
                            ? `${t('orderForm.itemDetails.estimatedMaterialsCost')}: ${formatCurrency(item.lastUsageInfo.cost)} EUR (${t('orderForm.itemDetails.basedOnMaterials', { count: item.lastUsageInfo.costDetails?.length || 0 })})${
                                item.lastUsageInfo.costDetails?.some(detail => detail.priceConverted) 
                                  ? `\n\n${t('orderForm.itemDetails.currencyConversionWarning')}`
                                  : ''
                              }`
                            : `${t('orderForm.itemDetails.date')}: ${formatDateToDisplay(item.lastUsageInfo.date)}, ${t('orderForm.itemDetails.lastCost')}: ${formatCurrency(item.lastUsageInfo.cost)}`
                        }>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {item.lastUsageInfo.estimatedCost ? t('orderForm.itemDetails.estimated') : formatDateToDisplay(item.lastUsageInfo.date)}
                            </Typography>
                            <Typography 
                              variant="body2" 
                              fontWeight="medium" 
                              sx={{ 
                                color: item.lastUsageInfo.estimatedCost ? 'info.main' : 'purple' 
                              }}
                            >
                              {formatCurrency(item.lastUsageInfo.cost)}
                              {item.lastUsageInfo.estimatedCost && (
                                <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                                  (est.)
                                </Typography>
                              )}
                              {item.lastUsageInfo.estimatedCost && item.lastUsageInfo.costDetails?.some(detail => detail.priceConverted) && (
                                <Typography variant="caption" sx={{ display: 'block', fontSize: '0.7rem', opacity: 0.7, color: 'warning.main' }}>
                                  ({t('orderForm.itemDetails.convertedFromOtherCurrencies')})
                                </Typography>
                              )}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  {/* Suma wartości pozycji */}
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.totalItemValue')}
                      </Typography>
                      <Box sx={{ fontWeight: 'bold', color: 'success.main' }}>
                        {formatCurrency(calculateItemTotalValue(item))}
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
};

const OrderForm = ({ orderId }) => {
  const [loading, setLoading] = useState(!!orderId);
  const [saving, setSaving] = useState(false);
  const [orderData, setOrderData] = useState(() => {
    const defaultOrder = {...DEFAULT_ORDER};
    // Upewnij się, że każda pozycja ma unikalne ID
    if (defaultOrder.items && defaultOrder.items.length > 0) {
      defaultOrder.items = defaultOrder.items.map(item => ({ ...item, id: generateItemId() }));
    }
    return defaultOrder;
  });
  const [customers, setCustomers] = useState([]);
  // USUNIĘTO: const [products, setProducts] = useState([]); 
  // Produkty magazynowe ładowane są na żądanie w generateMaterialsList()
  const [services, setServices] = useState([]); // Lista usług z kategorii "Inne"
  const [recipes, setRecipes] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [refreshingPTs, setRefreshingPTs] = useState(false); // Dodana zmienna stanu dla odświeżania danych kosztów produkcji
  const [recalculatingTransport, setRecalculatingTransport] = useState(false); // Stan dla przeliczania usługi transportowej z CMR

  // Dodatkowe zmienne stanu dla obsługi dodatkowych kosztów
  const [additionalCostsItems, setAdditionalCostsItems] = useState([]);
  
  // Stan dla rozwiniętych wierszy w tabeli pozycji
  const [expandedRows, setExpandedRows] = useState({});

  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const { t } = useTranslation('orders');
  const navigate = useNavigate();
  const location = useLocation();

  const [costCalculation, setCostCalculation] = useState(null);
  const [calculatingCosts, setCalculatingCosts] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({ EUR: 1, PLN: 4.3, USD: 1.08 });
  const [loadingRates, setLoadingRates] = useState(false);

  const [invoices, setInvoices] = useState([]);

  // Sprawdź, czy formularz został otwarty z PO
  const fromPO = location.state?.fromPO || false;
  const poId = location.state?.poId || null;
  const poNumber = location.state?.poNumber || null;

  const handleAddInvoice = () => {
    setInvoices(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        number: '',
        date: '',
        status: 'nieopłacona',
        amount: '',
        paidAmount: ''
      }
    ]);
  };

  const handleInvoiceChange = (id, field, value) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, [field]: value } : inv));
  };

  const handleRemoveInvoice = (id) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        if (orderId) {
          const fetchedOrder = await getOrderById(orderId);
          
          console.log("Ładowanie danych zamówienia o ID:", orderId);
          
          // Pobierz i sparsuj daty w zamówieniu
          const orderDate = safeParseDate(fetchedOrder.orderDate);
          const deadline = safeParseDate(fetchedOrder.deadline) || safeParseDate(fetchedOrder.expectedDeliveryDate);
          const deliveryDate = safeParseDate(fetchedOrder.deliveryDate);
          
          console.log("Daty w pobranym zamówieniu:");
          console.log("- orderDate:", fetchedOrder.orderDate, typeof fetchedOrder.orderDate);
          console.log("- deadline:", fetchedOrder.deadline, typeof fetchedOrder.deadline);
          console.log("- expectedDeliveryDate:", fetchedOrder.expectedDeliveryDate, typeof fetchedOrder.expectedDeliveryDate);
          console.log("- deliveryDate:", fetchedOrder.deliveryDate, typeof fetchedOrder.deliveryDate);

          console.log("Przeformatowane daty przed zapisaniem do state:");
          console.log("- orderDate format:", formatDateForInput(orderDate));
          console.log("- deadline format:", formatDateForInput(deadline));
          console.log("- deliveryDate format:", deliveryDate ? formatDateForInput(deliveryDate) : "");
          
          console.log("DEBUG - Sprawdzanie pozycji zamówienia:");
          console.log("- fetchedOrder.items:", fetchedOrder.items);
          console.log("- Array.isArray(fetchedOrder.items):", Array.isArray(fetchedOrder.items));
          console.log("- fetchedOrder.items.length:", fetchedOrder.items?.length);
          console.log("- Warunek (!fetchedOrder.items || fetchedOrder.items.length === 0):", !fetchedOrder.items || fetchedOrder.items.length === 0);
          
          if (!fetchedOrder.items || fetchedOrder.items.length === 0) {
            console.log("DEBUG - Zastępuję pozycje zamówienia domyślną pozycją");
            fetchedOrder.items = [{ ...DEFAULT_ORDER.items[0], id: generateItemId() }];
          } else {
            console.log("DEBUG - Pozycje zamówienia zostały zachowane:", fetchedOrder.items.length, "pozycji");
            // Upewnij się, że wszystkie pozycje mają unikalne ID i zachowaj kompatybilność z starymi danymi
            fetchedOrder.items = fetchedOrder.items.map(item => {
              const newItem = {
                ...item,
                id: item.id || generateItemId()
              };
              
              // Kompatybilność z starymi danymi - jeśli nie ma recipeId/serviceId/productId ale ma określony typ
              if (!newItem.recipeId && (newItem.itemType === 'recipe' || newItem.isRecipe)) {
                // Dla starych receptur może być przechowane w innym polu lub nie ma tej informacji
                console.log(`Pozycja receptury "${newItem.name}" nie ma recipeId - możliwe stare dane`);
              }
              if (!newItem.serviceId && newItem.itemType === 'service') {
                console.log(`Pozycja usługi "${newItem.name}" nie ma serviceId - możliwe stare dane`);
              }
              if (!newItem.productId && newItem.itemType === 'product') {
                console.log(`Pozycja produktu "${newItem.name}" nie ma productId - możliwe stare dane`);
              }
              
              return newItem;
            });
          }
          
          // Przypisz informacje o zadaniach produkcyjnych do pozycji zamówienia - ZOPTYMALIZOWANE BATCH QUERIES
          if (fetchedOrder.productionTasks && fetchedOrder.productionTasks.length > 0 && fetchedOrder.items.length > 0) {
            const { updateTask } = await import('../../services/productionService');
            const { query, collection, where, getDocs } = await import('firebase/firestore');
            const { db } = await import('../../services/firebase/config');
            
            console.log("Ładowanie zadań produkcyjnych dla zamówienia:", orderId);
            console.log("Elementy zamówienia:", fetchedOrder.items);
            console.log("Zadania produkcyjne:", fetchedOrder.productionTasks);
            
            // OPTYMALIZACJA 1: Batch pobieranie wszystkich zadań produkcyjnych jednym zapytaniem
            const taskIds = fetchedOrder.productionTasks.map(task => task.id);
            const tasksDetailsMap = new Map();
            
            // Pobierz wszystkie zadania w batchach (Firebase limit 10 dla where...in)
            const batchSize = 10;
            for (let i = 0; i < taskIds.length; i += batchSize) {
              const batchIds = taskIds.slice(i, i + batchSize);
              if (batchIds.length > 0) {
                try {
                  const tasksQuery = query(
                    collection(db, 'productionTasks'),
                    where('__name__', 'in', batchIds)
                  );
                  const tasksSnapshot = await getDocs(tasksQuery);
                  
                  tasksSnapshot.docs.forEach(doc => {
                    tasksDetailsMap.set(doc.id, {
                      id: doc.id,
                      ...doc.data()
                    });
                  });
                } catch (error) {
                  console.error(`Błąd podczas pobierania batch zadań produkcyjnych:`, error);
                }
              }
            }
            
            console.log(`Pobrano szczegóły ${tasksDetailsMap.size} zadań produkcyjnych w batch queries`);
            
            // OPTYMALIZACJA 2: Zbierz wszystkie zadania wymagające aktualizacji
            const tasksToUpdate = [];
            const orderUpdates = [];
            
            // Przypisz zadania do pozycji zamówienia
            for (let i = 0; i < fetchedOrder.items.length; i++) {
              const item = fetchedOrder.items[i];
              console.log(`Sprawdzanie elementu zamówienia ${i}:`, item);
              
              // Najpierw szukaj po orderItemId (najdokładniejsze dopasowanie)
              const matchingTask = fetchedOrder.productionTasks.find(task => 
                task.orderItemId && task.orderItemId === item.id
              );
              
              // Jeśli nie znaleziono po orderItemId, spróbuj dopasować po nazwie i ilości
              const alternativeTask = !matchingTask ? fetchedOrder.productionTasks.find(task => 
                task.productName === item.name && 
                parseFloat(task.quantity) === parseFloat(item.quantity) &&
                !fetchedOrder.productionTasks.some(t => t.orderItemId === item.id)
              ) : null;
              
              const taskToUse = matchingTask || alternativeTask;
              
              if (taskToUse) {
                console.log(`Znaleziono dopasowane zadanie dla elementu ${item.name}:`, taskToUse);
                
                // Pobierz szczegóły zadania z mapy (już załadowane)
                const taskDetails = tasksDetailsMap.get(taskToUse.id);
                
                if (taskDetails) {
                  const currentOrderItemId = taskDetails.orderItemId;
                  
                  // Jeśli zadanie ma inny orderItemId niż bieżący element zamówienia, zaplanuj aktualizację
                  if (currentOrderItemId !== item.id) {
                    console.log(`Planowanie aktualizacji zadania ${taskToUse.id} - przypisywanie orderItemId: ${item.id} (było: ${currentOrderItemId || 'brak'})`);
                    
                    tasksToUpdate.push({
                      taskId: taskToUse.id,
                      updateData: {
                        orderItemId: item.id,
                        orderId: orderId,
                        orderNumber: fetchedOrder.orderNumber || null
                      }
                    });
                    
                    orderUpdates.push({
                      taskId: taskToUse.id,
                      updateData: {
                        orderItemId: item.id
                      }
                    });
                  }
                  
                  // Aktualizuj informacje o zadaniu produkcyjnym w elemencie zamówienia
                  fetchedOrder.items[i] = {
                    ...item,
                    productionTaskId: taskToUse.id,
                    productionTaskNumber: taskToUse.moNumber || taskDetails.moNumber,
                    productionStatus: taskToUse.status || taskDetails.status,
                    productionCost: taskDetails.totalMaterialCost || taskToUse.totalMaterialCost || 0,
                    fullProductionCost: taskDetails.totalFullProductionCost || taskToUse.totalFullProductionCost || 0
                  };
                  
                  console.log(`Przypisano zadanie produkcyjne ${taskToUse.moNumber} do elementu zamówienia ${item.name} z kosztem ${fetchedOrder.items[i].productionCost}`);
                } else {
                  console.error(`Nie znaleziono szczegółów zadania ${taskToUse.id} w załadowanych danych`);
                  
                  // Fallback - użyj podstawowych danych z fetchedOrder.productionTasks
                  fetchedOrder.items[i] = {
                    ...item,
                    productionTaskId: taskToUse.id,
                    productionTaskNumber: taskToUse.moNumber,
                    productionStatus: taskToUse.status,
                    productionCost: taskToUse.totalMaterialCost || 0,
                    fullProductionCost: taskToUse.totalFullProductionCost || 0
                  };
                }
              } else {
                console.log(`Nie znaleziono dopasowanego zadania dla elementu ${item.name}`);
              }
            }
            
            // OPTYMALIZACJA 3: Wykonaj wszystkie aktualizacje równolegle
            if (tasksToUpdate.length > 0 || orderUpdates.length > 0) {
              console.log(`Wykonywanie ${tasksToUpdate.length} aktualizacji zadań i ${orderUpdates.length} aktualizacji zamówień równolegle`);
              
              try {
                const updatePromises = [];
                
                // Dodaj aktualizacje zadań
                tasksToUpdate.forEach(({ taskId, updateData }) => {
                  updatePromises.push(
                    updateTask(taskId, updateData, currentUser?.uid || 'system')
                  );
                });
                
                // Dodaj aktualizacje zamówień
                if (orderUpdates.length > 0) {
                  const { updateProductionTaskInOrder } = await import('../../services/orderService');
                  orderUpdates.forEach(({ taskId, updateData }) => {
                    updatePromises.push(
                      updateProductionTaskInOrder(orderId, taskId, updateData, currentUser?.uid || 'system')
                    );
                  });
                }
                
                // Wykonaj wszystkie aktualizacje równolegle
                await Promise.allSettled(updatePromises);
                console.log(`Zakończono ${updatePromises.length} aktualizacji równolegle`);
                
              } catch (error) {
                console.error('Błąd podczas równoległych aktualizacji zadań:', error);
              }
            }
          }
          
          setOrderData({
            ...fetchedOrder,
            orderDate: ensureDateInputFormat(orderDate),
            deadline: ensureDateInputFormat(deadline),
            deliveryDate: ensureDateInputFormat(deliveryDate),
            // Inicjalizacja pustą tablicą, jeśli w zamówieniu nie ma dodatkowych kosztów
            additionalCostsItems: fetchedOrder.additionalCostsItems || []
          });
          
          // Zweryfikuj, czy powiązane zadania produkcyjne istnieją
          const verifiedOrder = await verifyProductionTasks(fetchedOrder);
          
          setOrderData(verifiedOrder);
        }
        
        // OPTYMALIZACJA: Równoległe pobieranie wszystkich danych referencyjnych
        console.log('🚀 OrderForm - rozpoczynam równoległe pobieranie danych referencyjnych...');
        
        const [fetchedCustomers, servicesResult, fetchedRecipes, fetchedSuppliers] = await Promise.all([
          getAllCustomers(),
          getInventoryItemsByCategory('Inne'), // Tylko usługi z kategorii "Inne" zamiast wszystkich produktów
          getAllRecipes(),
          getAllSuppliers()
        ]);
        
        // Ustaw pobrane dane
        setCustomers(fetchedCustomers);
        
        const servicesData = servicesResult?.items || [];
        setServices(servicesData);
        
        setRecipes(fetchedRecipes);
        setSuppliers(fetchedSuppliers);
        
        console.log(`✅ OrderForm - pobrano równolegle: ${fetchedCustomers.length} klientów, ${servicesData.length} usług, ${fetchedRecipes.length} receptur, ${fetchedSuppliers.length} dostawców`);
        
        // Jeśli tworzymy nowe zamówienie na podstawie PO, pokaż informację
        if (fromPO && poNumber) {
          showInfo(`Tworzenie nowego zamówienia klienta powiązanego z zamówieniem zakupowym: ${poNumber}`);
          
          // Ustaw powiązanie z PO w danych zamówienia (tylko w notatkach)
          setOrderData(prev => ({
            ...prev,
            notes: prev.notes ? 
              `${prev.notes}\nPowiązane z zamówieniem zakupowym: ${poNumber}` : 
              `Powiązane z zamówieniem zakupowym: ${poNumber}`
          }));
        }
      } catch (error) {
        showError('Błąd podczas ładowania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [orderId, showError, fromPO, poId, poNumber, showInfo]);

  // Funkcja do automatycznego odświeżenia kosztów produkcji przed zapisaniem
  const refreshProductionTasksForSaving = async (orderDataToUpdate) => {
    try {
      if (!orderDataToUpdate.productionTasks || orderDataToUpdate.productionTasks.length === 0) {
        return;
      }

      console.log('Odświeżanie kosztów produkcji przed zapisaniem zamówienia...');

      // Importuj funkcję do pobierania szczegółów zadania
      const { getTaskById } = await import('../../services/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
      
      if (orderDataToUpdate.items && orderDataToUpdate.items.length > 0) {
        for (let i = 0; i < orderDataToUpdate.items.length; i++) {
          const item = orderDataToUpdate.items[i];
          
          // Znajdź powiązane zadanie produkcyjne
          const associatedTask = orderDataToUpdate.productionTasks.find(task => 
            task.id === item.productionTaskId
          );
          
          if (associatedTask) {
            try {
              // Pobierz szczegółowe dane zadania z bazy danych
              const taskDetails = await getTaskById(associatedTask.id);
              
              const fullProductionCost = taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
              const productionCost = taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0;
              
              // Oblicz koszty jednostkowe z uwzględnieniem logiki listy cenowej
              const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
              const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
              
              // Aktualizuj informacje o zadaniu produkcyjnym w pozycji zamówienia
              orderDataToUpdate.items[i] = {
                ...item,
                productionTaskId: associatedTask.id,
                productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                productionStatus: associatedTask.status || taskDetails.status,
                // Używaj totalMaterialCost jako podstawowy koszt produkcji (tylko materiały wliczane do kosztów)
                productionCost: productionCost,
                // Dodaj pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
                fullProductionCost: fullProductionCost,
                // Dodaj obliczone koszty jednostkowe
                productionUnitCost: calculatedProductionUnitCost,
                fullProductionUnitCost: calculatedFullProductionUnitCost
              };
              
              console.log(`Zaktualizowano koszty dla pozycji ${item.name}: koszt podstawowy = ${orderDataToUpdate.items[i].productionCost}€, pełny koszt = ${orderDataToUpdate.items[i].fullProductionCost}€, pełny koszt/szt = ${calculatedFullProductionUnitCost.toFixed(2)}€ (lista cenowa: ${item.fromPriceList ? 'tak' : 'nie'})`);
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
              
              // W przypadku błędu, użyj podstawowych danych z associatedTask
              const fullProductionCost = associatedTask.totalFullProductionCost || 0;
              const productionCost = associatedTask.totalMaterialCost || 0;
              
              orderDataToUpdate.items[i] = {
                ...item,
                productionTaskId: associatedTask.id,
                productionTaskNumber: associatedTask.moNumber,
                productionStatus: associatedTask.status,
                productionCost: productionCost,
                fullProductionCost: fullProductionCost,
                productionUnitCost: productionCost / (parseFloat(item.quantity) || 1),
                fullProductionUnitCost: fullProductionCost / (parseFloat(item.quantity) || 1)
              };
            }
          }
        }
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania kosztów produkcji:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      window.scrollTo(0, 0); // Przewiń do góry, aby użytkownik widział błędy
      return;
    }
    
    try {
      setSaving(true);
      
      // Walidacja podstawowa
      if (!validateForm()) {
        setSaving(false);
        return;
      }
      
      // Zweryfikuj, czy powiązane zadania produkcyjne istnieją przed zapisaniem
      const verifiedOrderData = await verifyProductionTasks(orderData);
      
      // Automatycznie odśwież koszty produkcji przed zapisaniem
      await refreshProductionTasksForSaving(verifiedOrderData);
      
      // Przygotuj dane zamówienia do zapisania
      const orderToSave = {
        ...verifiedOrderData,
        items: verifiedOrderData.items.map(item => ({ ...item })),
        totalValue: calculateTotal(), // Używamy funkcji która uwzględnia wszystkie składniki: produkty, dostawę, dodatkowe koszty i rabaty
        // Upewniamy się, że daty są poprawne
        orderDate: verifiedOrderData.orderDate ? new Date(verifiedOrderData.orderDate) : new Date(),
        // Zapisujemy deadline jako expectedDeliveryDate w bazie danych
        expectedDeliveryDate: verifiedOrderData.deadline ? new Date(verifiedOrderData.deadline) : null,
        deadline: verifiedOrderData.deadline ? new Date(verifiedOrderData.deadline) : null,
        deliveryDate: verifiedOrderData.deliveryDate ? new Date(verifiedOrderData.deliveryDate) : null
      };

      // Usuń puste pozycje zamówienia
      orderToSave.items = orderToSave.items.filter(item => 
        item.name && item.quantity && item.quantity > 0
      );
      
      let savedOrderId;
      
      if (orderId) {
        await updateOrder(orderId, orderToSave, currentUser.uid);
        savedOrderId = orderId;
        showSuccess('Zamówienie zostało zaktualizowane');
        navigate(`/orders/${savedOrderId}`);
      } else {
        savedOrderId = await createOrder(orderToSave, currentUser.uid);
        showSuccess('Zamówienie zostało utworzone');
        navigate('/orders'); // Zmiana przekierowania na listę zamówień
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania zamówienia:', error);
      showError(`Wystąpił błąd: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!orderData.customer.name) {
      errors.customerName = 'Nazwa klienta jest wymagana';
    }
    
    orderData.items.forEach((item, index) => {
      if (!item.name) {
        errors[`item_${index}_name`] = 'Nazwa produktu jest wymagana';
      }
      
      if (!item.quantity || item.quantity <= 0) {
        errors[`item_${index}_quantity`] = 'Ilość musi być większa od 0';
      }
      
      if (item.price < 0) {
        errors[`item_${index}_price`] = 'Cena nie może być ujemna';
      }
      
      // Sprawdź minimalne ilości zamówienia dla produktów, ale tylko pokazuj informację
      if (item.id && item.itemType === 'product' && !item.isRecipe) {
        const minOrderQuantity = item.minOrderQuantity || 0;
        if (minOrderQuantity > 0 && parseFloat(item.quantity) < minOrderQuantity && item.unit === item.originalUnit) {
          // Nie ustawiamy błędu, tylko pokazujemy informację
          showInfo(`Produkt ${item.name}: Sugerowana minimalna ilość zamówienia to ${minOrderQuantity} ${item.unit}`);
        }
      }
    });
    
    if (!orderData.orderDate) {
      errors.orderDate = 'Data zamówienia jest wymagana';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (['orderDate', 'deadline', 'deliveryDate'].includes(name)) {
      console.log(`Zmiana daty ${name}:`, value);
      
      // Dla pól daty, zawsze używamy wartości jako string
      setOrderData(prev => ({ 
        ...prev, 
        [name]: value 
      }));
    } else if (name === 'invoiceDate' && value) {
      console.log(`Zmiana daty faktury na: ${value}`);
      
      // Zapisz datę faktury
      setOrderData(prev => ({ 
        ...prev, 
        [name]: value 
      }));
      
      // Jeśli mamy walutę inną niż EUR dla kosztów dostawy, pobierz kurs z dnia poprzedzającego datę faktury
      const currency = orderData.shippingCurrency;
      if (currency && currency !== 'EUR') {
        try {
          // Pobierz datę poprzedniego dnia dla daty faktury
          const invoiceDate = new Date(value);
          const rateFetchDate = new Date(invoiceDate);
          rateFetchDate.setDate(rateFetchDate.getDate() - 1);
          
          console.log(`Próbuję pobrać kurs dla ${currency}/EUR z dnia ${rateFetchDate.toISOString().split('T')[0]}`);
          
          // Pobierz kurs z API
          getExchangeRate(currency, 'EUR', rateFetchDate)
            .then(rate => {
              console.log(`Pobrany kurs: ${rate}`);
              
              if (rate > 0) {
                // Przelicz wartość dostawy
                const originalValue = orderData.shippingCostOriginal || orderData.shippingCost || 0;
                const convertedValue = originalValue * rate;
                
                // Aktualizuj stan
                setOrderData(prev => ({
                  ...prev,
                  shippingCost: convertedValue,
                  exchangeRate: rate
                }));
              }
            })
            .catch(error => {
              console.error('Błąd podczas pobierania kursu:', error);
            });
        } catch (error) {
          console.error('Błąd podczas przetwarzania daty faktury:', error);
        }
      }
    } else {
      setOrderData(prev => ({ ...prev, [name]: value }));
    }
    
    if (validationErrors[name]) {
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[name];
      setValidationErrors(updatedErrors);
    }
  };

  const handleCustomerChange = (e, selectedCustomer) => {
    if (selectedCustomer) {
      // Upewnij się, że przekazujemy tylko potrzebne pola klienta jako proste wartości
      setOrderData(prev => ({
        ...prev,
        customer: {
          id: selectedCustomer.id || '',
          name: selectedCustomer.name || '',
          email: selectedCustomer.email || '',
          phone: selectedCustomer.phone || '',
          address: selectedCustomer.address || '',
          shippingAddress: selectedCustomer.shippingAddress || '',
          vatEu: selectedCustomer.vatEu || '',
          billingAddress: selectedCustomer.billingAddress || '',
          orderAffix: selectedCustomer.orderAffix || '',
          notes: selectedCustomer.notes || ''
        }
      }));
      
      if (validationErrors.customerName) {
        const updatedErrors = { ...validationErrors };
        delete updatedErrors.customerName;
        setValidationErrors(updatedErrors);
      }
    } else {
      setOrderData(prev => ({
        ...prev,
        customer: { ...DEFAULT_ORDER.customer }
      }));
    }
  };

  const handleCustomerDetailChange = (e) => {
    const { name, value } = e.target;
    setOrderData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        [name.replace('customer_', '')]: value
      }
    }));
  };

  const handleAddCustomer = () => {
    setOrderData(prev => ({
      ...prev,
      customer: { ...DEFAULT_ORDER.customer }
    }));
    setIsCustomerDialogOpen(true);
  };

  const handleCloseCustomerDialog = () => {
    setIsCustomerDialogOpen(false);
  };

  const handleSaveNewCustomer = async () => {
    try {
      const customerData = orderData.customer;
      
      if (!customerData.name || customerData.name.trim() === '') {
        showError('Nazwa klienta jest wymagana');
        return;
      }
      
      setSaving(true);
      
      const newCustomerId = await createCustomer(customerData, currentUser.uid);
      
      const newCustomer = {
        id: newCustomerId,
        ...customerData
      };
      
      setCustomers(prev => [...prev, newCustomer]);
      
      setOrderData(prev => ({
        ...prev,
        customer: newCustomer
      }));
      
      showSuccess('Klient został dodany');
      setIsCustomerDialogOpen(false);
    } catch (error) {
      showError('Błąd podczas dodawania klienta: ' + error.message);
      console.error('Error adding customer:', error);
    } finally {
      setSaving(false);
    }
  };

  // Funkcja do przeliczania usługi transportowej na podstawie CMR
  const handleRecalculateTransportService = async () => {
    if (!orderId) {
      showError('Zapisz zamówienie przed przeliczeniem usługi transportowej');
      return;
    }
    
    try {
      setRecalculatingTransport(true);
      
      const { recalculateTransportServiceForOrder } = await import('../../services/cmrService');
      const result = await recalculateTransportServiceForOrder(orderId, currentUser.uid);
      
      if (result.success) {
        if (result.action === 'none') {
          showInfo('Brak powiązanych CMR z paletami dla tego zamówienia');
        } else {
          showSuccess(
            `Usługa transportowa ${result.action === 'added' ? 'dodana' : 'zaktualizowana'}: ${result.palletsCount} palet z ${result.cmrCount} CMR`
          );
        }
        
        // Odśwież dane zamówienia
        if (orderId) {
          const updatedOrder = await getOrderById(orderId);
          setOrderData(updatedOrder);
        }
      }
    } catch (error) {
      console.error('Błąd podczas przeliczania usługi transportowej:', error);
      showError('Nie udało się przeliczyć usługi transportowej: ' + error.message);
    } finally {
      setRecalculatingTransport(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...orderData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    
    setOrderData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    if (validationErrors[`item_${index}_${field}`]) {
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_${field}`];
      setValidationErrors(updatedErrors);
    }
  };

  const handleProductSelect = async (index, product, type = 'product') => {
    try {
      if (!product) {
        return;
      }
      
      const itemType = type;
      // Generuj unikalne ID dla pozycji - każda pozycja ma swoje własne ID
      let id = generateItemId();
      let name = product.name;
      let unit = product.unit || 'szt.';
      let basePrice = 0;
      let price = 0;
      let margin = DEFAULT_MARGIN;
      let isRecipe = type === 'recipe';
      let fromPriceList = false;
      // Przechowuj ID receptury/usługi w osobnych polach, a nie jako ID pozycji
      let recipeId = isRecipe ? product.id : null;
      let serviceId = type === 'service' ? product.id : null;
      let productId = (!isRecipe && type !== 'service') ? product.id : null;
      let minOrderQuantity = 0;
      let lastUsageInfo = null;
      
      // Jeżeli mamy klienta, spróbuj pobrać cenę z listy cenowej
      if (orderData.customer?.id) {
        try {
          // Pobierz cenę z listy cenowej klienta, wskazując czy to receptura czy produkt
          const priceListItem = await getPriceForCustomerProduct(orderData.customer.id, product.id, isRecipe);
          
          if (priceListItem) {
            console.log(`Znaleziono cenę w liście cenowej: ${priceListItem} dla ${name} (${isRecipe ? 'receptura' : 'produkt/usługa'})`);
            price = priceListItem;
            fromPriceList = true;
          } else {
            console.log(`Nie znaleziono ceny w liście cenowej dla ${name} (${isRecipe ? 'receptura' : 'produkt/usługa'})`);
          }
        } catch (error) {
          console.error('Błąd podczas pobierania ceny z listy cenowej:', error);
        }
      }
      
      // Jeśli to produkt lub usługa, pobierz jego szczegóły
      if (!isRecipe) {
        try {
          const productDetails = await getProductById(product.id);
          if (productDetails) {
            unit = productDetails.unit || unit;
            minOrderQuantity = productDetails.minOrderQuantity || 0;
            // Jeśli nie mamy ceny z listy cenowej, użyj ceny bazowej produktu
            if (!fromPriceList) {
              basePrice = productDetails.standardPrice || 0;
              
              // Zastosuj marżę do ceny bazowej
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania szczegółów produktu/usługi:', error);
        }
      } else {
        // Jeśli to receptura, oblicz koszt produkcji tylko jeśli nie mamy ceny z listy cenowej
        if (!fromPriceList) {
          try {
            // Spróbuj najpierw pobrać recepturę bezpośrednio
            let recipe = await getRecipeById(product.id);
            
            if (!recipe) {
              // Jeśli nie ma receptury o tym ID, spróbuj pobrać recepturę powiązaną z produktem
              recipe = await getRecipeByProductId(product.id);
            }
            
            if (recipe) {
              // Oblicz koszt produkcji z uwzględnieniem składników, pracy i maszyn
              const cost = await calculateProductionCost(recipe);
              basePrice = cost.totalCost;
              console.log(`Obliczono koszt produkcji receptury: ${basePrice}`);
              
              // Zastosuj marżę do kosztu produkcji
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
              
              // Pobierz informacje o ostatnim użyciu receptury w zamówieniach
              try {
                lastUsageInfo = await getLastRecipeUsageInfo(recipe.id);
                if (lastUsageInfo) {
                  console.log('Znaleziono informacje o ostatnim użyciu receptury:', lastUsageInfo);
                }
                
                // Jeśli nie ma informacji o ostatnim użyciu lub koszt wynosi 0, 
                // oblicz szacowany koszt na podstawie materiałów
                if (!lastUsageInfo || !lastUsageInfo.cost || lastUsageInfo.cost === 0) {
                  console.log('Brak ostatniego kosztu - obliczam szacowany koszt materiałów');
                  
                  const { calculateEstimatedMaterialsCost } = await import('../../utils/costCalculator');
                  const estimatedCost = await calculateEstimatedMaterialsCost(recipe);
                  
                  if (estimatedCost.totalCost > 0) {
                    // Jeśli mamy lastUsageInfo ale bez kosztu, aktualizuj koszt
                    if (lastUsageInfo) {
                      lastUsageInfo.cost = estimatedCost.totalCost;
                      lastUsageInfo.estimatedCost = true;
                      lastUsageInfo.costDetails = estimatedCost.details;
                    } else {
                      // Stwórz nowe lastUsageInfo z szacowanym kosztem
                      lastUsageInfo = {
                        orderId: null,
                        orderNumber: 'Szacowany',
                        orderDate: new Date(),
                        customerName: 'Kalkulacja kosztów',
                        quantity: 1,
                        price: estimatedCost.totalCost,
                        cost: estimatedCost.totalCost,
                        unit: recipe.unit || 'szt.',
                        totalValue: estimatedCost.totalCost,
                        estimatedCost: true,
                        costDetails: estimatedCost.details
                      };
                    }
                    
                                         console.log(`Obliczono szacowany koszt materiałów: ${estimatedCost.totalCost} EUR${estimatedCost.hasCurrencyConversion ? ' (przeliczone z różnych walut)' : ''}`, estimatedCost.details);
                     
                     // Zapamiętaj szacowany koszt w obiekcie lastUsageInfo - zostanie zapisany podczas zapisu zamówienia
                     console.log('Szacowany koszt zostanie zapisany podczas zapisu zamówienia');
                   }
                 }
              } catch (error) {
                console.error('Błąd podczas pobierania informacji o ostatnim użyciu receptury:', error);
              }
            }
          } catch (error) {
            console.error('Błąd podczas obliczania kosztu produkcji:', error);
          }
        }
      }
      
      // Aktualizuj stan przedmiotu
      const updatedItems = [...orderData.items];
      updatedItems[index] = {
        ...updatedItems[index],
        id,
        name,
        unit,
        price,
        basePrice,
        margin,
        fromPriceList,
        isRecipe,
        recipeId,
        serviceId,
        productId,
        itemType,
        minOrderQuantity,
        originalUnit: unit,
        lastUsageInfo: lastUsageInfo // Dodajemy informacje o ostatnim użyciu
      };
      
      setOrderData(prev => ({
        ...prev,
        items: updatedItems,
      }));
      
      // Wyczyść błędy walidacji dla tego przedmiotu
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_name`];
      setValidationErrors(updatedErrors);
      
    } catch (error) {
      console.error('Błąd podczas wyboru produktu/usługi:', error);
      showError(`Wystąpił błąd: ${error.message}`);
    }
  };

  const addItem = () => {
    setOrderData(prev => ({
      ...prev,
      items: [...prev.items, { ...DEFAULT_ITEM, id: generateItemId() }]
    }));
  };

  const removeItem = (index) => {
    const updatedItems = [...orderData.items];
    updatedItems.splice(index, 1);
    
    if (updatedItems.length === 0) {
      updatedItems.push({ ...DEFAULT_ITEM, id: generateItemId() });
    }
    
    setOrderData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    const updatedErrors = { ...validationErrors };
    delete updatedErrors[`item_${index}_name`];
    delete updatedErrors[`item_${index}_quantity`];
    delete updatedErrors[`item_${index}_price`];
    setValidationErrors(updatedErrors);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setOrderData((prev) => {
      const oldIndex = prev.items.findIndex((item) => item.id === active.id);
      const newIndex = prev.items.findIndex((item) => item.id === over.id);

      return {
        ...prev,
        items: arrayMove(prev.items, oldIndex, newIndex),
      };
    });
  };

  const toggleExpandRow = (index) => {
    setExpandedRows(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const calculateSubtotal = () => {
    return orderData.items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      return sum + (quantity * price);
    }, 0);
  };

  // Funkcja obliczająca sumę wartości pozycji z uwzględnieniem kosztów produkcji dla pozycji spoza listy cenowej
  const calculateItemTotalValue = (item) => {
    // Podstawowa wartość pozycji
    const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
    
    // Jeśli produkt jest z listy cenowej I ma cenę większą od 0, zwracamy tylko wartość pozycji
    if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
      return itemValue;
    }
    
    // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodajemy go
    if (item.productionTaskId && item.productionCost !== undefined) {
      return itemValue + parseFloat(item.productionCost || 0);
    }
    
    // Domyślnie zwracamy tylko wartość pozycji
    return itemValue;
  };

  // Funkcja obliczająca sumę wartości wszystkich pozycji z uwzględnieniem kosztów produkcji gdzie to odpowiednie
  const calculateTotalItemsValue = () => {
    return orderData.items.reduce((sum, item) => {
      return sum + calculateItemTotalValue(item);
    }, 0);
  };

  // Funkcja do pobierania kursów walut
  const fetchExchangeRates = async () => {
    try {
      setLoadingRates(true);
      // Pobierz wczorajszy kurs dla głównych walut
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const currencies = ['EUR', 'PLN', 'USD', 'GBP', 'CHF'];
      const baseCurrency = orderData.currency; // Waluta bazowa zamówienia
      
      // Sprawdź, czy baseCurrency jest jedną z obsługiwanych walut
      if (!currencies.includes(baseCurrency)) {
        console.warn(`Nieobsługiwana waluta bazowa: ${baseCurrency}. Używam domyślnej waluty EUR.`);
        setOrderData(prev => ({ ...prev, currency: 'EUR' }));
        return; // Funkcja zostanie ponownie wywołana przez useEffect po zmianie currency
      }
      
      const rates = {};
      // Dodaj kurs 1 dla waluty bazowej
      rates[baseCurrency] = 1;
      
      // Pobierz kursy dla pozostałych walut
      const fetchPromises = currencies
        .filter(currency => currency !== baseCurrency)
        .map(async currency => {
          try {
            const rate = await getExchangeRate(currency, baseCurrency, yesterday);
            if (rate > 0) {
              rates[currency] = rate;
            } else {
              console.error(`Otrzymano nieprawidłowy kurs dla ${currency}/${baseCurrency}: ${rate}`);
              // Nie ustawiamy domyślnego kursu
            }
          } catch (err) {
            console.error(`Błąd podczas pobierania kursu ${currency}/${baseCurrency}:`, err);
            // Nie ustawiamy domyślnego kursu
          }
        });
      
      await Promise.all(fetchPromises);
      
      // Sprawdź, czy mamy kursy dla wszystkich walut, jeśli nie, pokaż komunikat
      const missingCurrencies = currencies
        .filter(currency => currency !== baseCurrency && !rates[currency]);
      
      if (missingCurrencies.length > 0) {
        console.warn(`Brak kursów dla walut: ${missingCurrencies.join(', ')}`);
        showInfo('Nie udało się pobrać kursów dla niektórych walut. Przeliczanie między walutami będzie możliwe po wprowadzeniu daty faktury.');
      }
      
      console.log('Pobrano kursy walut:', rates);
      setExchangeRates(rates);
      
    } catch (error) {
      console.error('Błąd podczas pobierania kursów walut:', error);
      showError('Nie udało się pobrać kursów walut. Przeliczanie między walutami będzie możliwe po wprowadzeniu daty faktury.');
      
      // W przypadku błędu ustawiamy tylko kurs dla waluty bazowej
      const rates = {};
      rates[orderData.currency || 'EUR'] = 1;
      setExchangeRates(rates);
    } finally {
      setLoadingRates(false);
    }
  };
  
  // Pomocnicza funkcja do pobierania domyślnego kursu
  const getDefaultRate = (fromCurrency, toCurrency) => {
    // Zawsze zwracamy 1, ponieważ kursy pobieramy dynamicznie z API
    return 1;
  };
  
  // Pobierz kursy walut przy starcie
  useEffect(() => {
    fetchExchangeRates();
  }, []);
  
  // Funkcja do przeliczania wartości między walutami
  const convertCurrency = (amount, fromCurrency, toCurrency) => {
    if (!amount || amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    const rate = exchangeRates[fromCurrency] / exchangeRates[toCurrency];
    if (!rate) {
      console.error(`Brak kursu dla pary walut ${fromCurrency}/${toCurrency}`);
      showInfo('Aby przeliczać waluty, podaj datę faktury.');
      return amount; // Zwracamy oryginalną wartość bez przeliczania, jeśli nie mamy kursu
    }
    
    // Wartość przeliczona bez zaokrąglania
    return amount * rate;
  };

  // Funkcja dodawania nowego dodatkowego kosztu
  const handleAddAdditionalCost = (isDiscount = false) => {
    const newCost = {
      id: Date.now().toString(), // Unikalny identyfikator
      description: isDiscount ? 'Rabat' : 'Dodatkowy koszt',
      value: isDiscount ? 0 : 0,
      vatRate: 23, // Domyślna stawka VAT
      currency: 'EUR', // Domyślna waluta EUR
      originalValue: 0, // Wartość w oryginalnej walucie
      exchangeRate: 1, // Domyślny kurs wymiany
      invoiceNumber: '', // Numer faktury
      invoiceDate: '' // Data faktury
    };
    
    setOrderData(prev => ({
      ...prev,
      additionalCostsItems: [...(prev.additionalCostsItems || []), newCost]
    }));
  };
  
  // Funkcja obsługi zmiany dodatkowych kosztów
  const handleAdditionalCostChange = (id, field, value) => {
    const updatedCosts = (orderData.additionalCostsItems || []).map(item => {
      if (item.id === id) {
        // Dla pola vatRate upewnij się, że nie jest undefined
        if (field === 'vatRate' && value === undefined) {
          value = 23; // Domyślna wartość VAT
        }
        
        // Specjalna obsługa dla zmiany daty faktury
        if (field === 'invoiceDate' && value) {
          try {
            console.log(`Zmiana daty faktury na: ${value}`);
            
            // Formatowanie daty do obsługi przez input type="date"
            const formattedDate = value;
            console.log(`Sformatowana data faktury: ${formattedDate}`);
            
            // Sprawdź czy data jest kompletna i poprawna przed próbą pobrania kursu
            const invoiceDate = new Date(formattedDate);
            const isValidDate = !isNaN(invoiceDate.getTime()) && 
                               invoiceDate.getFullYear() > 1900 && 
                               invoiceDate.getFullYear() < 2100;
            
            // Jeśli waluta pozycji jest inna niż waluta zamówienia i data jest poprawna
            if (isValidDate && item.currency && item.currency !== 'EUR') {
              try {
                const rateFetchDate = new Date(invoiceDate);
                rateFetchDate.setDate(rateFetchDate.getDate() - 1);
                
                console.log(`Próbuję pobrać kurs dla ${item.currency}/EUR z dnia ${rateFetchDate.toISOString().split('T')[0]}`);
                
                // Używamy getExchangeRate z serwisu kursów walut
                import('../../services/exchangeRateService').then(async ({ getExchangeRate }) => {
                  try {
                    const rate = await getExchangeRate(item.currency, 'EUR', rateFetchDate);
                    console.log(`Pobrany kurs: ${rate}`);
                    
                    if (rate > 0) {
                      // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                      const originalValue = parseFloat(item.originalValue) || parseFloat(item.value) || 0;
                      const convertedValue = originalValue * rate;
                      
                      const updatedItem = {
                        ...item,
                        invoiceDate: formattedDate,
                        exchangeRate: rate,
                        value: convertedValue.toFixed(2)
                      };
                      
                      // Aktualizuj stan
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? updatedItem : cost
                        )
                      }));
                    } else {
                      // W przypadku błędu, po prostu aktualizuj datę faktury
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? { ...cost, invoiceDate: formattedDate } : cost
                        )
                      }));
                    }
                  } catch (error) {
                    console.error(`Błąd podczas pobierania kursu:`, error);
                    // W przypadku błędu nie zmieniamy kursu, tylko aktualizujemy datę
                    setOrderData(prev => ({
                      ...prev,
                      additionalCostsItems: prev.additionalCostsItems.map(cost => 
                        cost.id === id ? { ...cost, invoiceDate: formattedDate } : cost
                      )
                    }));
                  }
                });
                
                // Zwracamy tymczasową wartość z zaktualizowaną datą faktury
                return { ...item, invoiceDate: formattedDate };
              } catch (error) {
                console.error('Błąd podczas przetwarzania daty faktury:', error);
                return { ...item, invoiceDate: formattedDate };
              }
            } else {
              // Jeśli data jest niepełna lub waluta jest EUR, po prostu zaktualizuj datę
              if (!isValidDate && item.currency && item.currency !== 'EUR') {
                console.log(`Data faktury ${formattedDate} jest niepełna - nie pobieram kursu dla dodatkowego kosztu w OrderForm`);
              }
              return { ...item, invoiceDate: formattedDate };
            }
          } catch (error) {
            console.error('Błąd podczas przetwarzania daty faktury:', error);
            return item;
          }
        }
        
        // Specjalna obsługa dla zmiany waluty
        if (field === 'currency') {
          const newCurrency = value;
          const oldCurrency = item.currency || 'EUR';
          
          // Jeśli zmieniono walutę, przelicz wartość
          if (newCurrency !== oldCurrency) {
            const originalValue = parseFloat(item.originalValue) || parseFloat(item.value) || 0;
            
            // Jeśli mamy datę faktury, spróbuj pobrać kurs z API
            if (item.invoiceDate) {
              try {
                const invoiceDate = new Date(item.invoiceDate);
                const rateFetchDate = new Date(invoiceDate);
                rateFetchDate.setDate(rateFetchDate.getDate() - 1);
                
                console.log(`Pobieranie kursu dla zmiany waluty z datą faktury ${item.invoiceDate}, data kursu: ${rateFetchDate.toISOString().split('T')[0]}`);
                
                // Używamy dynamicznego importu, aby uniknąć błędów cyklicznych importów
                import('../../services/exchangeRateService').then(async ({ getExchangeRate }) => {
                  try {
                    const rate = await getExchangeRate(newCurrency, 'EUR', rateFetchDate);
                    console.log(`Pobrany kurs dla ${newCurrency}/EUR z dnia ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
                    
                    if (rate > 0) {
                      // Przelicz wartość
                      const convertedValue = originalValue * rate;
                      
                      // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                      const updatedItem = {
                        ...item,
                        currency: newCurrency,
                        originalValue: originalValue,
                        exchangeRate: rate,
                        value: convertedValue.toFixed(2)
                      };
                      
                      // Aktualizuj stan
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? updatedItem : cost
                        )
                      }));
                    } else {
                      // W przypadku błędu, zaktualizuj tylko walutę
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? { ...cost, currency: newCurrency, originalValue: originalValue } : cost
                        )
                      }));
                    }
                  } catch (error) {
                    console.error(`Błąd podczas pobierania kursu:`, error);
                    // W przypadku błędu, zaktualizuj tylko walutę
                    setOrderData(prev => ({
                      ...prev,
                      additionalCostsItems: prev.additionalCostsItems.map(cost => 
                        cost.id === id ? { ...cost, currency: newCurrency, originalValue: originalValue } : cost
                      )
                    }));
                  }
                });
                
                // Zwracamy tymczasową wartość z zaktualizowaną walutą
                return { ...item, currency: newCurrency, originalValue: originalValue };
              } catch (error) {
                console.error('Błąd podczas zmiany waluty:', error);
              }
            } else {
              // Jeśli nie mamy daty faktury, nie przeliczamy walut - tylko informujemy użytkownika
              showInfo('Aby przeliczać waluty, podaj datę faktury.');
              return { 
                ...item, 
                currency: newCurrency,
                originalValue: originalValue,
                // Nie zmieniamy wartości value, będzie ona przeliczona po podaniu daty faktury
              };
            }
            
            // Ten kod zostanie wykonany tylko jeśli nie mamy daty faktury i wystąpił błąd w powyższym bloku try-catch
            return { 
              ...item, 
              currency: newCurrency,
              originalValue: originalValue,
              // Nie zmieniamy wartości, dopóki użytkownik nie poda daty faktury
            };
          }
        }
        
        // Specjalna obsługa dla zmiany wartości
        if (field === 'value') {
          const newValue = parseFloat(value) || 0;
          
          // Jeśli waluta pozycji jest inna niż EUR (waluta bazowa)
          if (item.currency && item.currency !== 'EUR') {
            // Zapisz oryginalną wartość
            const originalValue = newValue;
            
            // Jeśli mamy datę faktury i kurs wymiany, użyj ich
            if (item.invoiceDate && item.exchangeRate && parseFloat(item.exchangeRate) > 0) {
              const rate = parseFloat(item.exchangeRate);
              const convertedValue = originalValue * rate;
              
              return { 
                ...item, 
                originalValue: originalValue,
                value: convertedValue.toFixed(2)
              };
            } else {
              // Jeśli nie mamy daty faktury lub kursu, nie przeliczamy - zapisujemy oryginalną wartość
              // i czekamy na datę faktury
              return { 
                ...item, 
                originalValue: originalValue,
                value: originalValue // Tymczasowo przechowujemy tę samą wartość - zostanie przeliczona po podaniu daty faktury
              };
            }
          } else {
            // Jeśli waluta to EUR, obie wartości są takie same
            return { 
              ...item, 
              originalValue: newValue,
              value: newValue
            };
          }
        }
        
        // Standardowa obsługa innych pól
        return { ...item, [field]: value };
      }
      return item;
    });
    
    setOrderData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
  };
  
  // Funkcja usuwania pozycji dodatkowych kosztów
  const handleRemoveAdditionalCost = (id) => {
    setOrderData(prev => ({
      ...prev,
      additionalCostsItems: (prev.additionalCostsItems || []).filter(item => item.id !== id)
    }));
  };
  
  // Funkcja obliczająca sumę dodatkowych kosztów (dodatnich)
  const calculateAdditionalCosts = () => {
    if (!orderData.additionalCostsItems || orderData.additionalCostsItems.length === 0) {
      return 0;
    }
    
    return orderData.additionalCostsItems.reduce((sum, cost) => {
      const value = parseFloat(cost.value) || 0;
      return sum + (value > 0 ? value : 0);
    }, 0);
  };

  // Funkcja obliczająca sumę rabatów (wartości ujemne)
  const calculateDiscounts = () => {
    if (!orderData.additionalCostsItems || orderData.additionalCostsItems.length === 0) {
      return 0;
    }
    
    return Math.abs(orderData.additionalCostsItems.reduce((sum, cost) => {
      const value = parseFloat(cost.value) || 0;
      return sum + (value < 0 ? value : 0);
    }, 0));
  };

  const calculateTotal = () => {
    const subtotal = calculateTotalItemsValue();
    const additionalCosts = calculateAdditionalCosts();
    const discounts = calculateDiscounts();
    // Nie uwzględniamy wartości PO w całkowitej wartości zamówienia
    return subtotal + additionalCosts - discounts;
  };

  const handleCalculateCosts = async () => {
    try {
      setCalculatingCosts(true);
      
      if (!orderData.items || orderData.items.length === 0) {
        showError('Zamówienie musi zawierać produkty, aby obliczyć koszty');
        setCalculatingCosts(false);
        return;
      }
      
      const productIds = orderData.items.map(item => item.id).filter(Boolean);
      
      if (productIds.length === 0) {
        showError('Brak prawidłowych identyfikatorów produktów');
        setCalculatingCosts(false);
        return;
      }
      
      const pricesMap = await getIngredientPrices(productIds);
      
      let totalCost = 0;
      let totalRevenue = 0;
      
      const itemsWithCosts = orderData.items.map(item => {
        const productPrice = pricesMap[item.id] || 0;
        const itemCost = productPrice * item.quantity;
        const itemRevenue = item.price * item.quantity;
        
        totalCost += itemCost;
        totalRevenue += itemRevenue;
        
        return {
          ...item,
          cost: itemCost,
          revenue: itemRevenue,
          profit: itemRevenue - itemCost,
          margin: itemCost > 0 ? ((itemRevenue - itemCost) / itemRevenue * 100) : 0
        };
      });
      
      setCostCalculation({
        items: itemsWithCosts,
        totalCost: totalCost,
        totalRevenue: totalRevenue,
        totalProfit: totalRevenue - totalCost,
        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
      });
      
    } catch (error) {
      console.error('Błąd podczas kalkulacji kosztów:', error);
      showError('Nie udało się obliczyć kosztów: ' + error.message);
    } finally {
      setCalculatingCosts(false);
    }
  };
  
  // Funkcja do odświeżania danych zadań produkcyjnych, w tym kosztów produkcji
  const refreshProductionTasks = async () => {
    try {
      setLoading(true);
      
      // Pobierz aktualne dane zamówienia z bazy danych
      const refreshedOrderData = await getOrderById(orderId);
      
      // Importuj funkcję do pobierania szczegółów zadania
      const { getTaskById } = await import('../../services/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
      
      const updatedItems = [...refreshedOrderData.items];
      
      if (refreshedOrderData.productionTasks && refreshedOrderData.productionTasks.length > 0) {
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          
          // Znajdź powiązane zadanie produkcyjne
          const taskToUse = refreshedOrderData.productionTasks.find(task => 
            task.id === item.productionTaskId || 
            (task.productName === item.name && task.quantity == item.quantity)
          );
          
          if (taskToUse) {
            try {
              // Pobierz szczegółowe dane zadania z bazy danych
              const taskDetails = await getTaskById(taskToUse.id);
              
              const fullProductionCost = taskDetails.totalFullProductionCost || taskToUse.totalFullProductionCost || 0;
              const productionCost = taskDetails.totalMaterialCost || taskToUse.totalMaterialCost || 0;
              
              // Oblicz koszty jednostkowe z uwzględnieniem logiki listy cenowej
              const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
              const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
              
              // Aktualizuj informacje o zadaniu produkcyjnym w elemencie zamówienia
              updatedItems[i] = {
                ...item,
                productionTaskId: taskToUse.id,
                productionTaskNumber: taskToUse.moNumber || taskDetails.moNumber,
                productionStatus: taskToUse.status || taskDetails.status,
                // Używaj totalMaterialCost jako podstawowy koszt produkcji (tylko materiały wliczane do kosztów)
                productionCost: productionCost,
                // Dodaj pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
                fullProductionCost: fullProductionCost,
                // Dodaj obliczone koszty jednostkowe
                productionUnitCost: calculatedProductionUnitCost,
                fullProductionUnitCost: calculatedFullProductionUnitCost
              };
              
              console.log(`Przypisano zadanie produkcyjne ${taskToUse.moNumber} do elementu zamówienia ${item.name} z kosztem ${updatedItems[i].productionCost}€ (pełny koszt: ${updatedItems[i].fullProductionCost}€, pełny koszt/szt: ${calculatedFullProductionUnitCost.toFixed(2)}€, lista cenowa: ${item.fromPriceList ? 'tak' : 'nie'})`);
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${taskToUse.id}:`, error);
              
              // W przypadku błędu, użyj podstawowych danych z taskToUse
              const fullProductionCost = taskToUse.totalFullProductionCost || 0;
              const productionCost = taskToUse.totalMaterialCost || 0;
              
              updatedItems[i] = {
                ...item,
                productionTaskId: taskToUse.id,
                productionTaskNumber: taskToUse.moNumber,
                productionStatus: taskToUse.status,
                productionCost: productionCost,
                fullProductionCost: fullProductionCost,
                productionUnitCost: productionCost / (parseFloat(item.quantity) || 1),
                fullProductionUnitCost: fullProductionCost / (parseFloat(item.quantity) || 1)
              };
            }
          } else {
            console.log(`Nie znaleziono dopasowanego zadania dla elementu ${item.name}`);
          }
        }
        
        setOrderData(prev => ({
          ...prev,
          items: updatedItems,
          productionTasks: refreshedOrderData.productionTasks
        }));
        
        // Automatycznie zapisz zaktualizowane dane kosztów w bazie danych (jeśli zamówienie istnieje)
        if (orderId) {
          try {
            console.log('Zapisywanie zaktualizowanych kosztów produkcji w bazie danych...');
            const orderToUpdate = {
              ...refreshedOrderData,
              items: updatedItems
            };
            
            await updateOrder(orderId, orderToUpdate, currentUser.uid);
            console.log('Koszty produkcji zostały zapisane w bazie danych');
          } catch (error) {
            console.error('Błąd podczas zapisywania kosztów produkcji:', error);
            showError('Nie udało się zapisać kosztów produkcji w bazie danych');
          }
        }
      } else {
        setOrderData(prev => ({
          ...prev,
          items: updatedItems,
          productionTasks: refreshedOrderData.productionTasks || []
        }));
      }
      
      showSuccess('Dane zadań produkcyjnych zostały odświeżone');
    } catch (error) {
      console.error('Błąd podczas odświeżania zadań produkcyjnych:', error);
      showError('Nie udało się odświeżyć danych zadań produkcyjnych');
    } finally {
      setLoading(false);
    }
  };

  // Funkcja sprawdzająca czy zadania produkcyjne istnieją i usuwająca nieistniejące referencje
  const verifyProductionTasks = async (orderToVerify) => {
    if (!orderToVerify || !orderToVerify.productionTasks || orderToVerify.productionTasks.length === 0) {
      return orderToVerify;
    }

    try {
      const { getTaskById, updateTask } = await import('../../services/productionService');
      const { removeProductionTaskFromOrder, updateProductionTaskInOrder } = await import('../../services/orderService');
      
      const verifiedTasks = [];
      const tasksToRemove = [];
      
      console.log("Weryfikacja zadań produkcyjnych dla zamówienia:", orderToVerify.id);
      
      // Sprawdź każde zadanie produkcyjne
      for (const task of orderToVerify.productionTasks) {
        try {
          // Próba pobrania zadania z bazy
          const taskDetails = await getTaskById(task.id);
          
          // Sprawdź, czy task ma orderItemId ustawiony
          if (task.orderItemId && (!taskDetails.orderItemId || taskDetails.orderItemId !== task.orderItemId)) {
            console.log(`Aktualizacja orderItemId w zadaniu ${task.id} na ${task.orderItemId}`);
            await updateTask(task.id, {
              orderItemId: task.orderItemId,
              orderId: orderToVerify.id,
              orderNumber: orderToVerify.orderNumber || null
            }, currentUser?.uid || 'system');
          }
          
          // Sprawdź, czy w zamówieniu jest element pasujący do tego zadania
          if (task.orderItemId && orderToVerify.items) {
            const matchingItem = orderToVerify.items.find(item => item.id === task.orderItemId);
            
            if (!matchingItem) {
              console.log(`Nie znaleziono pozycji zamówienia ${task.orderItemId} dla zadania ${task.id}`);
              
              // Jeśli nie ma pasującego elementu zamówienia, spróbuj znaleźć według nazwy i ilości
              const alternativeItem = orderToVerify.items.find(item => 
                item.name === task.productName && 
                parseFloat(item.quantity) === parseFloat(task.quantity) &&
                !orderToVerify.productionTasks.some(t => 
                  t.id !== task.id && // nie to samo zadanie
                  t.orderItemId === item.id // już przypisane do innego zadania
                )
              );
              
              if (alternativeItem) {
                console.log(`Znaleziono alternatywną pozycję zamówienia ${alternativeItem.id} dla zadania ${task.id}`);
                
                // Aktualizuj orderItemId w zadaniu
                await updateTask(task.id, {
                  orderItemId: alternativeItem.id,
                  orderId: orderToVerify.id,
                  orderNumber: orderToVerify.orderNumber || null
                }, currentUser?.uid || 'system');
                
                // Aktualizuj task lokalnie
                task.orderItemId = alternativeItem.id;
                
                // Aktualizuj orderItemId w tabeli productionTasks
                if (orderToVerify.id) {
                  await updateProductionTaskInOrder(orderToVerify.id, task.id, {
                    orderItemId: alternativeItem.id
                  }, currentUser?.uid || 'system');
                }
              }
            }
          }
          
          verifiedTasks.push(task);
        } catch (error) {
          console.error(`Błąd podczas weryfikacji zadania ${task.id}:`, error);
          tasksToRemove.push(task);
          
          // Aktualizuj też powiązane elementy zamówienia
          if (orderToVerify.items) {
            orderToVerify.items = orderToVerify.items.map(item => {
              if (item.productionTaskId === task.id) {
                return {
                  ...item,
                  productionTaskId: null,
                  productionTaskNumber: null,
                  productionStatus: null,
                  productionCost: 0
                };
              }
              return item;
            });
          }
        }
      }
      
      // Jeśli znaleziono nieistniejące zadania, usuń ich referencje z zamówienia
      if (tasksToRemove.length > 0) {
        if (orderToVerify.id) {
          for (const task of tasksToRemove) {
            try {
              await removeProductionTaskFromOrder(orderToVerify.id, task.id);
              console.log(`Usunięto nieistniejące zadanie ${task.id} (${task.moNumber}) z zamówienia ${orderToVerify.id}`);
            } catch (error) {
              console.error(`Błąd podczas usuwania referencji do zadania ${task.id}:`, error);
            }
          }
        }
        
        // Zaktualizuj dane zamówienia lokalnie
        const updatedOrder = {
          ...orderToVerify,
          productionTasks: verifiedTasks
        };
        
        showInfo(`Usunięto ${tasksToRemove.length} nieistniejących zadań produkcyjnych z zamówienia.`);
        return updatedOrder;
      }
      
      return orderToVerify;
    } catch (error) {
      console.error('Błąd podczas weryfikacji zadań produkcyjnych:', error);
      return orderToVerify;
    }
  };

  // Funkcja pomocnicza do formatowania daty dla wyświetlenia
  const formatDateToDisplay = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pl-PL');
  };

  // Funkcja pomocnicza do formatowania kwoty waluty
  const formatCurrency = (amount, currency = 'EUR', precision = 2, forceDecimals = false) => {
    if (amount === undefined || amount === null) return '';
    return new Intl.NumberFormat('pl-PL', { 
      style: 'currency', 
      currency: currency,
      minimumFractionDigits: forceDecimals ? precision : 0,
      maximumFractionDigits: precision 
    }).format(amount);
  };

  // Funkcja do odświeżania ceny jednostkowej pozycji
  const refreshItemPrice = async (index) => {
    try {
      const item = orderData.items[index];
      if (!item || !item.id) {
        showError("Nie można odświeżyć ceny - brak identyfikatora pozycji");
        return;
      }
      
      let price = 0;
      let fromPriceList = false;
      let productId = null;
      
      // Określ ID produktu do wyszukiwania ceny
      if (item.itemType === 'recipe' || item.isRecipe) {
        productId = item.recipeId; // Dla receptur używaj recipeId
      } else if (item.itemType === 'service') {
        productId = item.serviceId; // Dla usług używaj serviceId
      } else {
        productId = item.productId; // Dla zwykłych produktów używaj productId
        // Fallback dla starych danych bez productId
        if (!productId) {
          showError("Nie można odświeżyć ceny dla starych pozycji - brak identyfikatora produktu. Usuń pozycję i dodaj ponownie.");
          return;
        }
      }
      
      if (!productId) {
        showError("Nie można odświeżyć ceny - brak identyfikatora produktu/usługi/receptury");
        return;
      }
      
      // Sprawdź najpierw cenę z listy cenowej klienta, jeśli klient istnieje
      if (orderData.customer?.id) {
        try {
          const priceListItem = await getPriceForCustomerProduct(orderData.customer.id, productId, item.isRecipe);
          
          if (priceListItem) {
            console.log(`Znaleziono cenę w liście cenowej: ${priceListItem} dla ${item.name}`);
            price = priceListItem;
            fromPriceList = true;
          }
        } catch (error) {
          console.error('Błąd podczas pobierania ceny z listy cenowej:', error);
        }
      }
      
      // Jeśli nie znaleziono ceny w liście cenowej
      if (!fromPriceList) {
        // Dla produktu/usługi
        if (!item.isRecipe && item.itemType !== 'recipe') {
          try {
            const productDetails = await getProductById(productId);
            if (productDetails) {
              const basePrice = productDetails.standardPrice || 0;
              const margin = item.margin || DEFAULT_MARGIN;
              
              // Zastosuj marżę do ceny bazowej
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
            }
          } catch (error) {
            console.error('Błąd podczas pobierania szczegółów produktu/usługi:', error);
          }
        } else {
          // Dla receptury
          try {
            // Pobierz recepturę po recipeId
            const recipe = await getRecipeById(productId);
            
            if (recipe) {
              // Oblicz koszt produkcji z receptury (ignoruj processingCostPerUnit dla CO)
              const cost = await calculateProductionCost(recipe);
              const basePrice = cost.totalCost;
              const margin = item.margin || 0;
              
              // Zastosuj marżę do kosztu produkcji
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
              
              // Odśwież również informacje o ostatnim użyciu receptury
              try {
                const lastUsageInfo = await getLastRecipeUsageInfo(recipe.id);
                if (lastUsageInfo) {
                  // Aktualizuj informacje o ostatnim użyciu
                  const updatedItems = [...orderData.items];
                  updatedItems[index] = {
                    ...updatedItems[index],
                    lastUsageInfo
                  };
                  
                  setOrderData(prev => ({
                    ...prev,
                    items: updatedItems,
                  }));
                }
              } catch (error) {
                console.error('Błąd podczas pobierania informacji o ostatnim użyciu receptury:', error);
              }
            }
          } catch (error) {
            console.error('Błąd podczas obliczania kosztu produkcji:', error);
          }
        }
      }
      
      // Aktualizuj cenę pozycji
      const updatedItems = [...orderData.items];
      updatedItems[index] = {
        ...updatedItems[index],
        price,
        fromPriceList
      };
      
      setOrderData(prev => ({
        ...prev,
        items: updatedItems,
      }));
      
      showSuccess('Cena jednostkowa została zaktualizowana');
    } catch (error) {
      console.error('Błąd podczas odświeżania ceny:', error);
      showError(`Wystąpił błąd: ${error.message}`);
    }
  };

  // Funkcja do obliczania szacowanych kosztów dla wszystkich pozycji
  const calculateEstimatedCostsForAllItems = async () => {
    if (!orderId || !currentUser) {
      showError('Musisz najpierw zapisać zamówienie, aby obliczyć szacowane koszty');
      return;
    }
    
    setCalculatingCosts(true);
    let processedItems = 0;
    let updatedItems = 0;
    
    try {
      const { getRecipeById } = await import('../../services/recipeService');
      const { calculateEstimatedMaterialsCost } = await import('../../utils/costCalculator');
      
      for (let index = 0; index < orderData.items.length; index++) {
        const item = orderData.items[index];
        processedItems++;
        
        // Sprawdź czy pozycja to receptura
        const isRecipe = item.itemType === 'recipe' || item.isRecipe;
        if (!isRecipe || !item.recipeId) continue;
        
        // Sprawdź czy pozycja ma już ostatni koszt
        if (item.lastUsageInfo && item.lastUsageInfo.cost && item.lastUsageInfo.cost > 0 && !item.lastUsageInfo.estimatedCost) {
          console.log(`Pozycja ${index} ma już ostatni koszt: ${item.lastUsageInfo.cost}€ - pomijam`);
          continue;
        }
        
        try {
          console.log(`Obliczam szacowany koszt dla pozycji ${index}: ${item.name}`);
          
          const recipe = await getRecipeById(item.recipeId);
          if (!recipe) {
            console.warn(`Nie znaleziono receptury dla pozycji ${index}`);
            continue;
          }
          
          const estimatedCost = await calculateEstimatedMaterialsCost(recipe);
          
          if (estimatedCost.totalCost > 0) {
            // Aktualizuj stan lokalny
            const updatedItemsArray = [...orderData.items];
            updatedItemsArray[index] = {
              ...updatedItemsArray[index],
              lastUsageInfo: {
                orderId: null,
                orderNumber: 'Szacowany',
                orderDate: new Date(),
                customerName: 'Kalkulacja kosztów',
                quantity: 1,
                price: estimatedCost.totalCost,
                cost: estimatedCost.totalCost,
                unit: recipe.unit || 'szt.',
                totalValue: estimatedCost.totalCost,
                estimatedCost: true,
                costDetails: estimatedCost.details
              }
            };
            
            setOrderData(prev => ({
              ...prev,
              items: updatedItemsArray
            }));
            
            updatedItems++;
            
            console.log(`Obliczono szacowany koszt dla pozycji ${index}: ${estimatedCost.totalCost} EUR${estimatedCost.hasCurrencyConversion ? ' (przeliczone z różnych walut)' : ''}`);
          }
        } catch (error) {
          console.error(`Błąd podczas obliczania kosztu dla pozycji ${index}:`, error);
        }
      }
      
      showSuccess(`Przetworzono ${processedItems} pozycji, zaktualizowano ${updatedItems} szacowanych kosztów. Zapisz zamówienie, aby zachować zmiany.`);
      
    } catch (error) {
      console.error('Błąd podczas obliczania szacowanych kosztów:', error);
      showError('Wystąpił błąd podczas obliczania szacowanych kosztów');
    } finally {
      setCalculatingCosts(false);
    }
  };

  // Dodanie stylów dla responsywności pól
  const inputSx = {
    '& .MuiOutlinedInput-root': { 
      borderRadius: '8px',
      minWidth: { xs: '100px', sm: '120px' }
    },
    '& .MuiInputBase-input': {
      minWidth: { xs: '60px', sm: '80px' }
    }
  };
  
  const tableCellSx = {
    minWidth: { xs: '80px', sm: '100px' },
    whiteSpace: 'normal',
    wordBreak: 'break-word'
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, maxWidth: '1600px', mx: 'auto' }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/orders')}
          >
            {t('orderForm.buttons.back')}
          </Button>
          <Typography variant="h5">
            {orderId ? t('orderForm.title.edit') : t('orderForm.title.new')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {/* Przycisk do przeliczania usługi transportowej z CMR */}
            {orderId && (
              <Tooltip title="Przelicz ilość palet w usłudze transportowej na podstawie wszystkich powiązanych CMR">
                <Button 
                  variant="outlined"
                  color="secondary"
                  disabled={recalculatingTransport || saving}
                  startIcon={recalculatingTransport ? <CircularProgress size={20} /> : <LocalShippingIcon />}
                  onClick={handleRecalculateTransportService}
                >
                  {recalculatingTransport ? 'Przeliczam...' : 'Przelicz transport z CMR'}
                </Button>
              </Tooltip>
            )}
            <Button 
              type="submit" 
              variant="contained" 
              color="primary"
              disabled={saving}
              startIcon={<SaveIcon />}
            >
              {saving ? t('orderForm.buttons.saving') : t('orderForm.buttons.save')}
            </Button>
          </Box>
        </Box>

        {orderData.orderNumber && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1, color: 'primary.contrastText', boxShadow: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {t('orderForm.labels.orderNumber')}: {orderData.orderNumber}
            </Typography>
          </Box>
        )}
        
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <PersonIcon sx={{ mr: 1 }} /> {t('orderForm.sections.basicData')}
            </Typography>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>{t('orderForm.labels.orderStatus')}</InputLabel>
              <Select
                name="status"
                value={orderData.status}
                onChange={handleChange}
                label={t('orderForm.labels.orderStatus')}
                sx={{ minWidth: { xs: '120px', sm: '200px' } }}
              >
                {ORDER_STATUSES.map(status => (
                  <MenuItem key={status.value} value={status.value}>
                    {status.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <FormControl fullWidth error={!!validationErrors.customerName}>
                  <Autocomplete
                    options={customers}
                    getOptionLabel={(customer) => customer && typeof customer === 'object' && customer.name ? customer.name : ''}
                    onChange={handleCustomerChange}
                    value={customers.find(c => c && c.id === orderData.customer.id) || null}
                    renderInput={(params) => (
                      <TextField 
                        {...params} 
                        label={t('orderForm.labels.client')} 
                        required
                        error={!!validationErrors.customerName}
                        helperText={validationErrors.customerName}
                        variant="outlined"
                        sx={inputSx}
                      />
                    )}
                  />
                </FormControl>
                <Tooltip title={t('orderForm.tooltips.addNewClient')}>
                  <IconButton 
                    color="primary" 
                    onClick={handleAddCustomer}
                    sx={{ ml: 1, mt: 1 }}
                  >
                    <AddIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label={t('orderForm.labels.orderDate')}
                name="orderDate"
                value={ensureDateInputFormat(orderData.orderDate)}
                onChange={handleChange}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                error={!!validationErrors.orderDate}
                helperText={validationErrors.orderDate}
                variant="outlined"
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_email"
                label={t('orderForm.labels.clientEmail')}
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">@</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_phone"
                label={t('orderForm.labels.clientPhone')}
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">📞</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_shippingAddress"
                label={t('orderForm.labels.shippingAddress')}
                value={orderData.customer.shippingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>📍</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              {/* Pole deadline jest używane w UI, ale w bazie danych zapisywane jako expectedDeliveryDate */}
              <TextField
                type="date"
                label={t('orderForm.labels.expectedDeliveryDate')}
                name="deadline"
                value={ensureDateInputFormat(orderData.deadline)}
                onChange={handleChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Data kiedy zamówienie ma być dostarczone do klienta"
                variant="outlined"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <ShoppingCartIcon sx={{ mr: 1 }} /> {t('orderForm.sections.products')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={addItem}
                color="secondary"
                sx={{ borderRadius: 2 }}
              >
                {t('orderForm.buttons.addProduct')}
              </Button>
              <Button
                variant="outlined"
                startIcon={calculatingCosts ? <CircularProgress size={16} /> : <CalculateIcon />}
                onClick={calculateEstimatedCostsForAllItems}
                disabled={calculatingCosts || !orderId}
                color="info"
                sx={{ borderRadius: 2 }}
              >
                {calculatingCosts ? t('orderForm.buttons.calculating') : t('orderForm.buttons.calculateEstimatedCosts')}
              </Button>
            </Box>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <TableContainer component={Paper} sx={{ mb: 2, boxShadow: 1, borderRadius: 1, overflow: 'auto' }}>
              <Table>
                <TableHead sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.100' }}>
                  <TableRow>
                    <TableCell width="3%" sx={tableCellSx}></TableCell>
                    <TableCell width="5%" sx={tableCellSx}></TableCell>
                    <TableCell width="25%" sx={tableCellSx}>{t('orderForm.table.productRecipe')}</TableCell>
                    <TableCell width="10%" sx={tableCellSx}>{t('orderForm.table.quantity')}</TableCell>
                    <TableCell width="8%" sx={tableCellSx}>{t('orderForm.table.unit')}</TableCell>
                    <TableCell width="12%" sx={tableCellSx}>{t('orderForm.table.priceEUR')}</TableCell>
                    <TableCell width="12%" sx={tableCellSx}>{t('orderForm.table.value')}</TableCell>
                    <TableCell width="14%" sx={tableCellSx}>{t('orderForm.table.totalCostPerUnit')}</TableCell>
                    <TableCell width="14%" sx={tableCellSx}>
                      <Tooltip title={t('orderForm.tooltips.fullProductionCostPerUnit')}>
                        {t('orderForm.table.fullProductionCostPerUnit')}
                      </Tooltip>
                    </TableCell>
                    <TableCell width="5%" sx={tableCellSx}></TableCell>
                  </TableRow>
                </TableHead>
                <SortableContext items={orderData.items.map(item => item.id)} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {orderData.items.map((item, index) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        index={index}
                        expandedRows={expandedRows}
                        services={services}
                        recipes={recipes}
                        validationErrors={validationErrors}
                        inputSx={inputSx}
                        handleItemChange={handleItemChange}
                        handleProductSelect={handleProductSelect}
                        toggleExpandRow={toggleExpandRow}
                        refreshItemPrice={refreshItemPrice}
                        removeItem={removeItem}
                        formatCurrency={formatCurrency}
                        calculateItemTotalValue={calculateItemTotalValue}
                        calculateTotalItemsValue={calculateTotalItemsValue}
                        calculateAdditionalCosts={calculateAdditionalCosts}
                        calculateDiscounts={calculateDiscounts}
                        itemsLength={orderData.items.length}
                        refreshProductionTasks={refreshProductionTasks}
                        refreshingPTs={refreshingPTs}
                        navigate={navigate}
                        formatDateToDisplay={formatDateToDisplay}
                        t={t}
                      />
                    ))}
                  </TableBody>
                </SortableContext>
              </Table>
            </TableContainer>
          </DndContext>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, bgcolor: 'success.light', p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'success.contrastText' }}>
              Suma: {formatCurrency(calculateTotalItemsValue())}
            </Typography>
          </Box>
          {/* Dodatkowy przycisk dodaj produkt na dole */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button 
              variant="contained" 
              startIcon={<AddIcon />} 
              onClick={addItem}
              color="secondary"
              size="large"
              sx={{ borderRadius: 2, px: 4 }}
            >
              {t('orderForm.buttons.addProduct')}
            </Button>
          </Box>
        </Paper>

        {/* Sekcja dodatkowych kosztów */}
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <AttachMoneyIcon sx={{ mr: 1 }} /> {t('orderForm.sections.additionalCosts')}
            </Typography>
            <Box>
              <Button
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={() => handleAddAdditionalCost(false)}
                size="small"
                sx={{ mr: 1, borderRadius: 2 }}
              >
                {t('orderForm.buttons.addCost')}
              </Button>
              <Button
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={() => handleAddAdditionalCost(true)}
                size="small"
                color="secondary"
                sx={{ borderRadius: 2 }}
              >
                {t('orderForm.buttons.addDiscount')}
              </Button>
            </Box>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          {!orderData.additionalCostsItems || orderData.additionalCostsItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
              {t('orderForm.messages.noAdditionalCosts')}
            </Typography>
          ) : (
            <TableContainer sx={{ overflow: 'auto', maxWidth: '100%' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableCellSx}>{t('orderForm.additionalCosts.description')}</TableCell>
                    <TableCell align="right" sx={tableCellSx}>{t('orderForm.additionalCosts.amount')}</TableCell>
                    <TableCell align="right" sx={tableCellSx}>{t('orderForm.additionalCosts.currency')}</TableCell>
                    <TableCell align="right" sx={tableCellSx}>{t('orderForm.additionalCosts.vat')}</TableCell>
                    <TableCell sx={tableCellSx}>{t('orderForm.additionalCosts.invoiceNumber')}</TableCell>
                    <TableCell sx={tableCellSx}>{t('orderForm.additionalCosts.invoiceDate')}</TableCell>
                    <TableCell sx={tableCellSx}>{t('orderForm.additionalCosts.exchangeRate')}</TableCell>
                    <TableCell width="50px" sx={tableCellSx}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderData.additionalCostsItems.map((cost) => (
                    <TableRow key={cost.id}>
                      <TableCell>
                        <TextField
                          value={cost.description || ''}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'description', e.target.value)}
                          variant="standard"
                          fullWidth
                          placeholder="Opis kosztu"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={cost.originalValue !== undefined ? cost.originalValue : cost.value}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'value', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: cost.description === 'Rabat' ? undefined : '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <FormControl variant="standard" sx={{ minWidth: 80 }}>
                          <Select
                            value={cost.currency || 'EUR'}
                            onChange={(e) => handleAdditionalCostChange(cost.id, 'currency', e.target.value)}
                            displayEmpty
                          >
                            <MenuItem value="EUR">EUR</MenuItem>
                            <MenuItem value="PLN">PLN</MenuItem>
                            <MenuItem value="USD">USD</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="right">
                        <FormControl variant="standard" sx={{ maxWidth: 80 }}>
                          <Select
                            value={cost.vatRate || 23}
                            onChange={(e) => handleAdditionalCostChange(cost.id, 'vatRate', e.target.value)}
                            displayEmpty
                          >
                            <MenuItem value={0}>0%</MenuItem>
                            <MenuItem value={5}>5%</MenuItem>
                            <MenuItem value={8}>8%</MenuItem>
                            <MenuItem value={23}>23%</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <TextField
                          value={cost.invoiceNumber || ''}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceNumber', e.target.value)}
                          variant="standard"
                          fullWidth
                          placeholder="Nr faktury"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="date"
                          value={cost.invoiceDate || ''}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceDate', e.target.value)}
                          variant="standard"
                          inputProps={{ 
                            max: formatDateForInput ? formatDateForInput(new Date()) : new Date().toISOString().split('T')[0]
                          }}
                          sx={{ width: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          value={cost.exchangeRate || 1}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'exchangeRate', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.000001', min: '0' }}
                          sx={{ maxWidth: 100 }}
                          disabled={cost.currency === 'EUR'}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleRemoveAdditionalCost(cost.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Wiersz z podsumowaniem */}
                  <TableRow>
                    <TableCell colSpan={2} align="right" sx={{ fontWeight: 'bold' }}>
                      Suma netto (w EUR):
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      {formatCurrency(
                        orderData.additionalCostsItems.reduce(
                          (sum, cost) => sum + (parseFloat(cost.value) || 0), 
                          0
                        )
                      )}
                    </TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                  
                  {/* Informacja o kursach walut jeśli używane są różne waluty */}
                  {orderData.additionalCostsItems.some(cost => cost.currency && cost.currency !== 'EUR' && cost.exchangeRate > 0) && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ py: 1 }}>
                        <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
                          Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury: 
                          {orderData.additionalCostsItems
                            .filter(cost => cost.currency !== 'EUR' && cost.exchangeRate > 0)
                            .map(cost => ` ${cost.currency}/EUR: ${parseFloat(cost.exchangeRate).toFixed(6)}`)
                            .filter((value, index, self) => self.indexOf(value) === index) // Usunięcie duplikatów
                            .join(', ')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
        
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>{t('orderForm.sections.notes')}</Typography>
          <TextField
            name="notes"
            value={orderData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder={t('orderForm.placeholders.notes')}
            sx={inputSx}
          />
        </Paper>
        
        {/* Podsumowanie wartości zamówienia na końcu formularza */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('orderForm.sections.orderSummary')}</Typography>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">{t('orderForm.summary.productsValue')}:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateSubtotal())}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">{t('orderForm.summary.deliveryCost')}:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(parseFloat(orderData.shippingCost) || 0)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">{t('orderForm.summary.additionalCosts')}:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateAdditionalCosts())}</Typography>
              </Paper>
            </Grid>
            {calculateDiscounts() > 0 && (
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                  <Typography variant="subtitle2" color="text.secondary">{t('orderForm.summary.discounts')}:</Typography>
                  <Typography variant="h6" fontWeight="bold" color="secondary">- {formatCurrency(calculateDiscounts())}</Typography>
                </Paper>
              </Grid>
            )}
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">{t('orderForm.summary.totalOrderValue')}:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateTotal())}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        {/* Sekcja faktur */}
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <ReceiptIcon sx={{ mr: 1 }} /> {t('orderForm.sections.invoices')}
            </Typography>
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={handleAddInvoice}
              size="small"
              sx={{ borderRadius: 2 }}
            >
                              {t('orderForm.buttons.addInvoice')}
            </Button>
          </Box>
          <Divider sx={{ mb: 3 }} />
          {invoices.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
              {t('orderForm.messages.noInvoices')}
            </Typography>
          ) : (
            <TableContainer sx={{ overflow: 'auto', maxWidth: '100%' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableCellSx}>{t('orderForm.invoices.invoiceNumber')}</TableCell>
                    <TableCell sx={tableCellSx}>{t('orderForm.invoices.invoiceDate')}</TableCell>
                    <TableCell sx={tableCellSx}>{t('orderForm.invoices.status')}</TableCell>
                    <TableCell align="right" sx={tableCellSx}>{t('orderForm.invoices.amount')}</TableCell>
                    <TableCell align="right" sx={tableCellSx}>{t('orderForm.invoices.paidAmount')}</TableCell>
                    <TableCell width="50px" sx={tableCellSx}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <TextField
                          value={inv.number}
                          onChange={e => handleInvoiceChange(inv.id, 'number', e.target.value)}
                          variant="standard"
                          fullWidth
                          placeholder={t('orderForm.placeholders.invoiceNumber')}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="date"
                          value={inv.date}
                          onChange={e => handleInvoiceChange(inv.id, 'date', e.target.value)}
                          variant="standard"
                          sx={{ width: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl variant="standard" sx={{ minWidth: 120 }}>
                          <Select
                            value={inv.status}
                            onChange={e => handleInvoiceChange(inv.id, 'status', e.target.value)}
                          >
                            <MenuItem value="nieopłacona">Nieopłacona</MenuItem>
                            <MenuItem value="częściowo opłacona">Częściowo opłacona</MenuItem>
                            <MenuItem value="opłacona">Opłacona</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={inv.amount}
                          onChange={e => handleInvoiceChange(inv.id, 'amount', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={inv.paidAmount}
                          onChange={e => handleInvoiceChange(inv.id, 'paidAmount', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleRemoveInvoice(inv.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
      
      <Dialog open={isCustomerDialogOpen} onClose={handleCloseCustomerDialog} maxWidth="md" fullWidth>
        <DialogTitle>{t('orderForm.dialogs.addClient.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            Wprowadź dane nowego klienta. Klient zostanie dodany do bazy danych.
          </DialogContentText>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                name="customer_name"
                label="Nazwa klienta"
                value={orderData.customer.name || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                required
                autoFocus
                error={!orderData.customer.name}
                helperText={!orderData.customer.name ? 'Nazwa klienta jest wymagana' : ''}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_email"
                label="Email"
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_phone"
                label="Telefon"
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_vatEu"
                label="VAT-EU"
                value={orderData.customer.vatEu || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_billingAddress"
                label="Adres do faktury"
                value={orderData.customer.billingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_shippingAddress"
                label="Adres do wysyłki"
                value={orderData.customer.shippingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_notes"
                label="Notatki"
                value={orderData.customer.notes || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={handleCloseCustomerDialog} variant="outlined">{t('orderForm.buttons.cancel')}</Button>
          <Button 
            onClick={handleSaveNewCustomer} 
            variant="contained"
            disabled={!orderData.customer.name || saving}
            color="primary"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OrderForm; 