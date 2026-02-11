// src/pages/Analytics/MOConsumptionPage.js
import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  useMediaQuery,
  useTheme,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  LocalDining as ConsumptionIcon,
  Download as DownloadIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  ExpandMore as ExpandMoreIcon,
  TableChart as TableChartIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import plLocale from 'date-fns/locale/pl';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getAllTasks } from '../../services/productionService';
import { getAllOrders } from '../../services/orderService';
import { getAllCustomers } from '../../services/customerService';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { exportToCSV, exportToExcel, formatDateForExport } from '../../utils/exportUtils';

const MOConsumptionPage = () => {
  const { t } = useTranslation('analytics');
  const { showError, showSuccess } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDarkMode = theme.palette.mode === 'dark';
  
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [consumptionData, setConsumptionData] = useState([]);
  const [filteredConsumption, setFilteredConsumption] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState('all');
  const [materialsList, setMaterialsList] = useState([]);
  const [ordersList, setOrdersList] = useState([]);
  const [sortField, setSortField] = useState('consumptionDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [expandedMo, setExpandedMo] = useState(null); // taskId of expanded MO

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (tasks.length > 0) {
      processConsumptionData();
    }
  }, [tasks, startDate, endDate, selectedMaterial, selectedOrder, sortField, sortDirection]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [fetchedTasks, fetchedOrders, fetchedCustomers] = await Promise.all([
        getAllTasks(),
        getAllOrders(),
        getAllCustomers()
      ]);
      
      setTasks(fetchedTasks);
      setOrders(fetchedOrders);
      setCustomers(fetchedCustomers);
      
      // Wyciągnij listę materiałów
      const materials = [];
      const materialSet = new Set();
      fetchedTasks.forEach(task => {
        if (task.consumedMaterials && task.consumedMaterials.length > 0) {
          task.consumedMaterials.forEach(consumed => {
            const materialId = consumed.materialId;
            const material = task.materials?.find(m => 
              (m.inventoryItemId || m.id) === materialId
            );
            const materialName = material?.name || consumed.materialName || t('moConsumptionReport.unknownMaterial');
            
            if (!materialSet.has(materialId)) {
              materialSet.add(materialId);
              materials.push({ id: materialId, name: materialName });
            }
          });
        }
      });
      setMaterialsList(materials.sort((a, b) => a.name.localeCompare(b.name)));
      
      // Wyciągnij listę zamówień
      const ordersSet = new Set();
      const ordersData = [];
      fetchedTasks.forEach(task => {
        if (task.consumedMaterials && task.consumedMaterials.length > 0 && task.orderId && task.orderNumber) {
          const orderKey = `${task.orderId}_${task.orderNumber}`;
          if (!ordersSet.has(orderKey)) {
            ordersSet.add(orderKey);
            ordersData.push({
              id: task.orderId,
              number: task.orderNumber,
              customer: task.customer
            });
          }
        }
      });
      setOrdersList(ordersData.sort((a, b) => a.number.localeCompare(b.number)));
      
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError(t('common.errors.fetchData'));
    } finally {
      setLoading(false);
    }
  };

  const processConsumptionData = () => {
    const aggregatedData = [];
    const materialSummary = {};
    
    let filteredTasks = tasks;
    if (selectedOrder !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.orderId === selectedOrder);
    }

    filteredTasks.forEach(task => {
      if (task.consumedMaterials && task.consumedMaterials.length > 0) {
        task.consumedMaterials.forEach(consumed => {
          const materialId = consumed.materialId;
          const material = task.materials?.find(m => 
            (m.inventoryItemId || m.id) === materialId
          );
          
          const materialName = material?.name || consumed.materialName || t('moConsumptionReport.unknownMaterial');
          const materialUnit = material?.unit || consumed.unit || 'szt';
          const batchNumber = consumed.batchNumber || consumed.batchId || t('moConsumptionReport.noBatchNumber');
          const quantity = Number(consumed.quantity) || 0;
          const unitPrice = Number(consumed.unitPrice) || 0;
          const totalCost = quantity * unitPrice;
          
          let consumptionDate = null;
          if (consumed.timestamp?.toDate) {
            consumptionDate = consumed.timestamp.toDate();
          } else if (consumed.timestamp) {
            consumptionDate = new Date(consumed.timestamp);
          } else if (consumed.date?.toDate) {
            consumptionDate = consumed.date.toDate();
          } else if (consumed.date) {
            consumptionDate = new Date(consumed.date);
          } else if (task.updatedAt?.toDate) {
            consumptionDate = task.updatedAt.toDate();
          }
          
          const isInDateRange = consumptionDate 
            ? (consumptionDate >= startDate && consumptionDate <= endDate)
            : true;
          
          if (isInDateRange) {
            aggregatedData.push({
              taskId: task.id,
              taskName: task.name,
              moNumber: task.moNumber,
              productName: task.productName,
              materialId,
              materialName,
              batchNumber,
              quantity,
              unit: materialUnit,
              unitPrice,
              totalCost,
              consumptionDate: consumptionDate || new Date(),
              userName: consumed.userName || t('moConsumptionReport.unknownUser'),
              includeInCosts: consumed.includeInCosts !== false
            });

            if (!materialSummary[materialId]) {
              materialSummary[materialId] = {
                materialName,
                unit: materialUnit,
                totalQuantity: 0,
                totalCost: 0,
                batchCount: 0,
                taskCount: new Set(),
                avgUnitPrice: 0
              };
            }

            materialSummary[materialId].totalQuantity += quantity;
            materialSummary[materialId].totalCost += totalCost;
            materialSummary[materialId].batchCount += 1;
            materialSummary[materialId].taskCount.add(task.id);
          }
        });
      }
    });

    Object.values(materialSummary).forEach(material => {
      material.avgUnitPrice = material.totalQuantity > 0 
        ? material.totalCost / material.totalQuantity 
        : 0;
      material.taskCount = material.taskCount.size;
    });

    const filtered = selectedMaterial === 'all' 
      ? aggregatedData 
      : aggregatedData.filter(item => item.materialId === selectedMaterial);
    
    const sortedData = sortConsumptionData(filtered);
    
    setConsumptionData(Object.values(materialSummary));
    setFilteredConsumption(sortedData);
  };

  // Zadania produkcyjne (MO) z zestawieniem materiałów: planowana vs konsumpcja
  const getTasksWithMaterialsBreakdown = () => {
    let filteredTasks = tasks;
    if (selectedOrder !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.orderId === selectedOrder);
    }

    return filteredTasks
      .filter(task => (task.consumedMaterials?.length > 0 || task.materials?.length > 0))
      .filter(task => {
        // Sprawdź czy ma jakąkolwiek konsumpcję w zakresie dat
        const hasConsumptionInRange = task.consumedMaterials?.some(consumed => {
          let consumptionDate = null;
          if (consumed.timestamp?.toDate) consumptionDate = consumed.timestamp.toDate();
          else if (consumed.timestamp) consumptionDate = new Date(consumed.timestamp);
          else if (consumed.date?.toDate) consumptionDate = consumed.date.toDate();
          else if (consumed.date) consumptionDate = new Date(consumed.date);
          else if (task.updatedAt?.toDate) consumptionDate = task.updatedAt.toDate();
          return consumptionDate ? (consumptionDate >= startDate && consumptionDate <= endDate) : false;
        });
        return hasConsumptionInRange;
      })
      .map(task => {
        const materialIds = new Set();
        const materialsMap = {};

        // Załaduj planowane materiały z task.materials
        // material.quantity = "Oryginalna ilość" (całkowita przeliczona z receptury przy tworzeniu)
        // actualMaterialUsage[material.id] = nadpisana ilość gdy użytkownik zmienił w szczegółach zadania
        const actualUsage = task.actualMaterialUsage || {};
        (task.materials || []).forEach(material => {
          const materialId = material.inventoryItemId || material.id;
          const basePlanned = parseFloat(material.quantity) || 0;
          const plannedQty = actualUsage[material.id] !== undefined
            ? parseFloat(actualUsage[material.id]) || 0
            : basePlanned;
          materialIds.add(materialId);
          materialsMap[materialId] = {
            materialId,
            materialName: material.name || t('moConsumptionReport.unknownMaterial'),
            unit: material.unit || 'szt',
            plannedQuantity: plannedQty,
            consumedQuantity: 0
          };
        });

        // Dodaj konsumpcję z consumedMaterials
        (task.consumedMaterials || []).forEach(consumed => {
          const materialId = consumed.materialId;
          const material = task.materials?.find(m => (m.inventoryItemId || m.id) === materialId);
          const materialName = material?.name || consumed.materialName || t('moConsumptionReport.unknownMaterial');
          const materialUnit = material?.unit || consumed.unit || 'szt';
          const qty = parseFloat(consumed.quantity) || 0;

          materialIds.add(materialId);
          if (!materialsMap[materialId]) {
            materialsMap[materialId] = {
              materialId,
              materialName,
              unit: materialUnit,
              plannedQuantity: 0,
              consumedQuantity: 0
            };
          }
          materialsMap[materialId].consumedQuantity += qty;
        });

        const materialsBreakdown = Array.from(materialIds).map(id => ({
          ...materialsMap[id],
          difference: (materialsMap[id].consumedQuantity || 0) - (materialsMap[id].plannedQuantity || 0)
        }));

        return {
          ...task,
          materialsBreakdown
        };
      })
      .sort((a, b) => (a.moNumber || '').localeCompare(b.moNumber || ''));
  };

  const tasksWithMaterialsBreakdown = getTasksWithMaterialsBreakdown();

  const sortConsumptionData = (data) => {
    return [...data].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'consumptionDate':
          aValue = a.consumptionDate ? new Date(a.consumptionDate).getTime() : 0;
          bValue = b.consumptionDate ? new Date(b.consumptionDate).getTime() : 0;
          break;
        case 'materialName':
          aValue = (a.materialName || '').toLowerCase();
          bValue = (b.materialName || '').toLowerCase();
          break;
        case 'quantity':
          aValue = Number(a.quantity) || 0;
          bValue = Number(b.quantity) || 0;
          break;
        case 'totalCost':
          aValue = Number(a.totalCost) || 0;
          bValue = Number(b.totalCost) || 0;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleSort = (field) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatQuantity = (value, precision = 3) => {
    return Number(value).toFixed(precision);
  };

  const handleExportCSV = () => {
    try {
      // Export Summary
      const summaryData = consumptionData.map(material => ({
        materialName: material.materialName,
        totalQuantity: formatQuantity(material.totalQuantity),
        unit: material.unit,
        avgUnitPrice: material.avgUnitPrice.toFixed(2),
        totalCost: material.totalCost.toFixed(2),
        batchCount: material.batchCount,
        taskCount: material.taskCount
      }));

      const summaryHeaders = [
        { label: 'Material', key: 'materialName' },
        { label: 'Total Quantity', key: 'totalQuantity' },
        { label: 'Unit', key: 'unit' },
        { label: 'Avg Unit Price (EUR)', key: 'avgUnitPrice' },
        { label: 'Total Cost (EUR)', key: 'totalCost' },
        { label: 'Batch Count', key: 'batchCount' },
        { label: 'Task Count', key: 'taskCount' }
      ];

      // Export Details
      const detailsData = filteredConsumption.map(item => ({
        consumptionDate: item.consumptionDate ? format(item.consumptionDate, 'yyyy-MM-dd HH:mm:ss') : '',
        taskName: item.taskName,
        moNumber: item.moNumber || '',
        productName: item.productName,
        materialName: item.materialName,
        batchNumber: item.batchNumber,
        quantity: formatQuantity(item.quantity),
        unit: item.unit,
        unitPrice: item.unitPrice.toFixed(2),
        totalCost: item.totalCost.toFixed(2),
        userName: item.userName,
        includeInCosts: item.includeInCosts ? 'Yes' : 'No'
      }));

      const detailsHeaders = [
        { label: 'Consumption Date', key: 'consumptionDate' },
        { label: 'Task Name', key: 'taskName' },
        { label: 'MO Number', key: 'moNumber' },
        { label: 'Product Name', key: 'productName' },
        { label: 'Material Name', key: 'materialName' },
        { label: 'Batch Number', key: 'batchNumber' },
        { label: 'Quantity', key: 'quantity' },
        { label: 'Unit', key: 'unit' },
        { label: 'Unit Price (EUR)', key: 'unitPrice' },
        { label: 'Total Cost (EUR)', key: 'totalCost' },
        { label: 'User', key: 'userName' },
        { label: 'Include In Costs', key: 'includeInCosts' }
      ];

      // Filename with date range
      const startDateStr = formatDateForExport(startDate, 'yyyyMMdd');
      const endDateStr = formatDateForExport(endDate, 'yyyyMMdd');
      const filename = `mo_consumption_report_${startDateStr}_${endDateStr}`;

      // Export both summary and details
      const summarySuccess = exportToCSV(summaryData, summaryHeaders, `${filename}_summary`);
      const detailsSuccess = exportToCSV(detailsData, detailsHeaders, `${filename}_details`);

      if (summarySuccess && detailsSuccess) {
        showSuccess(t('moConsumptionReport.export.success') || 'Dane zostały wyeksportowane do pliku CSV');
      } else {
        showError(t('moConsumptionReport.export.error') || 'Błąd podczas eksportowania danych');
      }
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError(t('moConsumptionReport.export.error') || 'Błąd podczas eksportowania danych');
    }
  };

  const handleExportExcel = () => {
    try {
      const startDateStr = formatDateForExport(startDate, 'yyyyMMdd');
      const endDateStr = formatDateForExport(endDate, 'yyyyMMdd');
      const filename = `mo_consumption_report_${startDateStr}_${endDateStr}`;

      const worksheets = [];

      // Arkusz 1: Podsumowanie
      if (consumptionData.length > 0) {
        worksheets.push({
          name: t('moConsumptionReport.export.summarySheet') || 'Podsumowanie',
          data: consumptionData.map(m => ({
            materialName: m.materialName,
            totalQuantity: formatQuantity(m.totalQuantity),
            unit: m.unit,
            avgUnitPrice: m.avgUnitPrice.toFixed(2),
            totalCost: m.totalCost.toFixed(2),
            batchCount: m.batchCount,
            taskCount: m.taskCount
          })),
          headers: [
            { label: t('moConsumptionReport.table.material'), key: 'materialName' },
            { label: t('moConsumptionReport.table.totalQuantity'), key: 'totalQuantity' },
            { label: t('moConsumptionReport.table.unit'), key: 'unit' },
            { label: t('moConsumptionReport.table.avgUnitPrice'), key: 'avgUnitPrice' },
            { label: t('moConsumptionReport.table.totalCost'), key: 'totalCost' },
            { label: t('moConsumptionReport.table.batchCount'), key: 'batchCount' },
            { label: t('moConsumptionReport.table.taskCount'), key: 'taskCount' }
          ]
        });
      }

      // Arkusz 2: Szczegóły
      if (filteredConsumption.length > 0) {
        worksheets.push({
          name: t('moConsumptionReport.export.detailsSheet') || 'Szczegóły',
          data: filteredConsumption.map(item => ({
            consumptionDate: item.consumptionDate ? format(item.consumptionDate, 'yyyy-MM-dd HH:mm:ss') : '',
            taskName: item.taskName,
            moNumber: item.moNumber || '',
            productName: item.productName,
            materialName: item.materialName,
            batchNumber: item.batchNumber,
            quantity: formatQuantity(item.quantity),
            unit: item.unit,
            unitPrice: item.unitPrice.toFixed(2),
            totalCost: item.totalCost.toFixed(2),
            userName: item.userName
          })),
          headers: [
            { label: t('moConsumptionReport.details.date'), key: 'consumptionDate' },
            { label: t('moConsumptionReport.details.task'), key: 'taskName' },
            { label: t('moConsumptionReport.details.moNumber'), key: 'moNumber' },
            { label: t('moConsumptionReport.details.product'), key: 'productName' },
            { label: t('moConsumptionReport.table.material'), key: 'materialName' },
            { label: t('moConsumptionReport.details.batch'), key: 'batchNumber' },
            { label: t('moConsumptionReport.details.quantity'), key: 'quantity' },
            { label: t('moConsumptionReport.details.unitShort'), key: 'unit' },
            { label: t('moConsumptionReport.details.cost'), key: 'totalCost' },
            { label: t('moConsumptionReport.details.user'), key: 'userName' }
          ]
        });
      }

      // Arkusze per MO z zestawieniem materiałów
      tasksWithMaterialsBreakdown.forEach(task => {
        const sheetName = (task.moNumber || task.name || task.id || 'MO').replace(/[[\]\\\/\?\*\:]/g, '_').substring(0, 31);
        worksheets.push({
          name: sheetName,
          data: task.materialsBreakdown.map(m => ({
            materialName: m.materialName,
            plannedQuantity: formatQuantity(m.plannedQuantity),
            consumedQuantity: formatQuantity(m.consumedQuantity),
            unit: m.unit,
            difference: formatQuantity(m.difference)
          })),
          headers: [
            { label: t('moConsumptionReport.moSection.material'), key: 'materialName' },
            { label: t('moConsumptionReport.moSection.plannedQuantity'), key: 'plannedQuantity' },
            { label: t('moConsumptionReport.moSection.consumedQuantity'), key: 'consumedQuantity' },
            { label: t('moConsumptionReport.moSection.unit'), key: 'unit' },
            { label: t('moConsumptionReport.moSection.difference'), key: 'difference' }
          ]
        });
      });

      if (worksheets.length > 0 && exportToExcel(worksheets, filename)) {
        showSuccess(t('moConsumptionReport.export.excelSuccess') || 'Dane zostały wyeksportowane do pliku Excel');
      } else {
        showError(t('moConsumptionReport.export.error') || 'Błąd podczas eksportowania danych');
      }
    } catch (error) {
      console.error('Błąd podczas eksportu Excel:', error);
      showError(t('moConsumptionReport.export.error') || 'Błąd podczas eksportowania danych');
    }
  };

  const SortableTableCell = ({ field, children, align = 'left', ...props }) => {
    const isActive = sortField === field;
    const isDesc = sortDirection === 'desc';
    
    return (
      <TableCell 
        {...props}
        align={align}
        sx={{ 
          cursor: 'pointer', 
          userSelect: 'none',
          '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          fontWeight: isActive ? 'bold' : 'medium'
        }}
        onClick={() => handleSort(field)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          {children}
          <Box sx={{ ml: 0.5, opacity: isActive ? 1 : 0.3 }}>
            {isActive && isDesc ? (
              <ArrowDownwardIcon sx={{ fontSize: '0.8rem' }} />
            ) : (
              <ArrowUpwardIcon sx={{ fontSize: '0.8rem' }} />
            )}
          </Box>
        </Box>
      </TableCell>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', pb: 4 }}>
      {/* Nagłówek */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          background: isDarkMode
            ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
            : 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          color: 'white',
          borderRadius: 3
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mr: 2
              }}
            >
              <ConsumptionIcon sx={{ fontSize: 24, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                {t('analyticsDashboard.tiles.moConsumption.title')}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('analyticsDashboard.tiles.moConsumption.description')}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('moConsumptionReport.export.excel') || 'Eksportuj Excel (z arkuszami per MO)'}>
              <IconButton 
                onClick={handleExportExcel} 
                sx={{ color: 'white' }}
                disabled={loading || (consumptionData.length === 0 && filteredConsumption.length === 0 && tasksWithMaterialsBreakdown.length === 0)}
              >
                <TableChartIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('moConsumptionReport.export.csv') || 'Eksportuj CSV'}>
              <IconButton 
                onClick={handleExportCSV} 
                sx={{ color: 'white' }}
                disabled={loading || (consumptionData.length === 0 && filteredConsumption.length === 0)}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Filtry */}
      <Paper sx={{ p: isMobile ? 1.5 : 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('common.filters.title')}</Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label={t('common.filters.startDate')}
                value={startDate}
                onChange={setStartDate}
                slotProps={{ textField: { fullWidth: true, size: "small" } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label={t('common.filters.endDate')}
                value={endDate}
                onChange={setEndDate}
                slotProps={{ textField: { fullWidth: true, size: "small" } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('moConsumptionReport.filters.order')}</InputLabel>
              <Select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                label={t('moConsumptionReport.filters.order')}
              >
                <MenuItem value="all">{t('moConsumptionReport.filters.allOrders')}</MenuItem>
                {ordersList.map(order => (
                  <MenuItem key={order.id} value={order.id}>
                    CO #{order.number}
                    {order.customer && ` - ${order.customer.name || order.customer}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('moConsumptionReport.filters.material')}</InputLabel>
              <Select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                label={t('moConsumptionReport.filters.material')}
              >
                <MenuItem value="all">{t('moConsumptionReport.filters.allMaterials')}</MenuItem>
                {materialsList.map(material => (
                  <MenuItem key={material.id} value={material.id}>
                    {material.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Podsumowanie konsumpcji */}
      <Paper sx={{ p: isMobile ? 1.5 : 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('moConsumptionReport.summary.title')}</Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t('common.period')}: {format(startDate, 'dd.MM.yyyy')} - {format(endDate, 'dd.MM.yyyy')}
        </Typography>
        
        {consumptionData.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary">
              {t('moConsumptionReport.summary.noData')}
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('moConsumptionReport.table.material')}</TableCell>
                  <TableCell align="right">{t('moConsumptionReport.table.totalQuantity')}</TableCell>
                  <TableCell>{t('moConsumptionReport.table.unit')}</TableCell>
                  <TableCell align="right">{t('moConsumptionReport.table.avgUnitPrice')}</TableCell>
                  <TableCell align="right">{t('moConsumptionReport.table.totalCost')}</TableCell>
                  <TableCell align="center">{t('moConsumptionReport.table.batchCount')}</TableCell>
                  <TableCell align="center">{t('moConsumptionReport.table.taskCount')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consumptionData.map((material, index) => (
                  <TableRow key={index} hover>
                    <TableCell sx={{ fontWeight: 'medium' }}>{material.materialName}</TableCell>
                    <TableCell align="right">{formatQuantity(material.totalQuantity)}</TableCell>
                    <TableCell>{material.unit}</TableCell>
                    <TableCell align="right">{formatCurrency(material.avgUnitPrice)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(material.totalCost)}</TableCell>
                    <TableCell align="center">
                      <Chip label={material.batchCount} size="small" color="primary" variant="outlined" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={material.taskCount} size="small" color="secondary" variant="outlined" />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'rgba(0, 0, 0, 0.04)' } }}>
                  <TableCell>{t('moConsumptionReport.table.sum')}</TableCell>
                  <TableCell align="right">-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell align="right">-</TableCell>
                  <TableCell align="right">
                    {formatCurrency(consumptionData.reduce((sum, m) => sum + m.totalCost, 0))}
                  </TableCell>
                  <TableCell align="center">{consumptionData.reduce((sum, m) => sum + m.batchCount, 0)}</TableCell>
                  <TableCell align="center">-</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Zadania produkcyjne (MO) z zestawieniem materiałów */}
      <Paper sx={{ p: isMobile ? 1.5 : 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('moConsumptionReport.moSection.title')}</Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t('moConsumptionReport.moSection.description')}
        </Typography>
        
        {tasksWithMaterialsBreakdown.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body1" color="text.secondary">
              {t('moConsumptionReport.moSection.noData')}
            </Typography>
          </Box>
        ) : (
          <Box>
            {tasksWithMaterialsBreakdown.map((task) => (
              <Accordion
                key={task.id}
                expanded={expandedMo === task.id}
                onChange={() => setExpandedMo(expandedMo === task.id ? null : task.id)}
                sx={{
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  border: '1px solid',
                  borderColor: 'divider',
                  mb: 1,
                  '&:last-of-type': { mb: 0 }
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {task.moNumber || task.name || t('moConsumptionReport.moSection.unnamedMO')}
                    </Typography>
                    <Chip label={task.productName || '-'} size="small" variant="outlined" />
                    {task.orderNumber && (
                      <Typography variant="caption" color="text.secondary">
                        CO #{task.orderNumber}
                      </Typography>
                    )}
                    <Chip 
                      label={`${task.materialsBreakdown?.length || 0} ${t('moConsumptionReport.moSection.materials')}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('moConsumptionReport.moSection.material')}</TableCell>
                          <TableCell align="right">{t('moConsumptionReport.moSection.plannedQuantity')}</TableCell>
                          <TableCell align="right">{t('moConsumptionReport.moSection.consumedQuantity')}</TableCell>
                          <TableCell>{t('moConsumptionReport.moSection.unit')}</TableCell>
                          <TableCell align="right">{t('moConsumptionReport.moSection.difference')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {task.materialsBreakdown?.map((m, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell sx={{ fontWeight: 'medium' }}>{m.materialName}</TableCell>
                            <TableCell align="right">{formatQuantity(m.plannedQuantity)}</TableCell>
                            <TableCell align="right">{formatQuantity(m.consumedQuantity)}</TableCell>
                            <TableCell>{m.unit}</TableCell>
                            <TableCell 
                              align="right" 
                              sx={{ 
                                fontWeight: 'bold',
                                color: m.difference > 0 ? 'error.main' : m.difference < 0 ? 'success.main' : 'text.secondary'
                              }}
                            >
                              {m.difference > 0 ? '+' : ''}{formatQuantity(m.difference)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}
      </Paper>

      {/* Szczegółowa lista */}
      <Paper sx={{ p: isMobile ? 1.5 : 3 }}>
        <Typography variant="h6" gutterBottom>{t('moConsumptionReport.details.title')}</Typography>
        
        {filteredConsumption.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary">
              {t('moConsumptionReport.details.noData')}
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 500 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <SortableTableCell field="consumptionDate">{t('moConsumptionReport.details.date')}</SortableTableCell>
                  <TableCell>{t('moConsumptionReport.details.task')}</TableCell>
                  <TableCell>{t('moConsumptionReport.details.product')}</TableCell>
                  <SortableTableCell field="materialName">{t('moConsumptionReport.table.material')}</SortableTableCell>
                  <TableCell>{t('moConsumptionReport.details.batch')}</TableCell>
                  <SortableTableCell field="quantity" align="right">{t('moConsumptionReport.details.quantity')}</SortableTableCell>
                  <TableCell>{t('moConsumptionReport.details.unitShort')}</TableCell>
                  <SortableTableCell field="totalCost" align="right">{t('moConsumptionReport.details.cost')}</SortableTableCell>
                  <TableCell>{t('moConsumptionReport.details.user')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredConsumption.map((item, index) => (
                  <TableRow key={index} hover>
                    <TableCell>
                      {item.consumptionDate ? format(item.consumptionDate, 'dd.MM.yyyy HH:mm') : '-'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{item.taskName}</Typography>
                      <Typography variant="caption" color="text.secondary">MO: {item.moNumber || '-'}</Typography>
                    </TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell sx={{ fontWeight: 'medium' }}>{item.materialName}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{item.batchNumber}</TableCell>
                    <TableCell align="right">{formatQuantity(item.quantity)}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(item.totalCost)}</TableCell>
                    <TableCell>{item.userName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default MOConsumptionPage;
