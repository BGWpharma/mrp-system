import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Tooltip,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
  FormControlLabel,
  Switch,
  useMediaQuery,
  useTheme,
  IconButton,
  Collapse,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Checkbox,
  FormGroup
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  ViewDay as DayIcon,
  ViewWeek as WeekIcon,
  ViewModule as MonthIcon,
  BarChart as GanttIcon,
  ArrowDropDown as ArrowDropDownIcon,
  FilterList as FilterListIcon,
  Business as BusinessIcon,
  Work as WorkIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Settings as SettingsIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Info as InfoIcon,
  Edit as EditIcon,
  ZoomOut as ZoomOutIcon,
  ZoomIn as ZoomInIcon,
  CenterFocusStrong as ZoomNormalIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  People as PeopleIcon,
  FileDownload as FileDownloadIcon
} from '@mui/icons-material';
import { format, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, startOfDay, endOfDay, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import interactionPlugin from '@fullcalendar/interaction';
import plLocale from '@fullcalendar/core/locales/pl';
import * as XLSX from 'xlsx-js-style'; // Changed from 'xlsx' to 'xlsx-js-style'
import { 
  getTasksByDateRange, 
  updateTask,
  getTasksByDateRangeOptimizedNew
} from '../../services/productionService';
import { getAllWorkstations } from '../../services/workstationService';
import { getAllCustomers } from '../../services/customerService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { formatDate } from '../../utils/formatters';
// At the beginning of the file, add CSS import
import '../../styles/calendar.css';

// Constants for caching mechanism
const CACHE_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
// Maximum number of days for hourly view
const MAX_DAYS_FOR_HOURLY_VIEW = 30;

// Function to generate Gantt report in XLSX format
const generateGanttReport = (tasks, workstations, customers, startDate, endDate, ganttGroupBy) => {
  try {
    console.log('Starting Gantt report XLSX generation');
    console.log('Input parameters:', {
      tasksCount: tasks?.length || 0,
      workstationsCount: workstations?.length || 0,
      customersCount: customers?.length || 0,
      startDate,
      endDate,
      ganttGroupBy
    });
    
    // Check if we have tasks
    if (!tasks || tasks.length === 0) {
      console.warn('No tasks for export');
      throw new Error('No tasks available for Gantt report export');
    }
    
    // Function to get status color for Excel (copy from main component)
    const getStatusColorForExcel = (status) => {
      switch (status) {
        case 'Zaplanowane':
          return '#3788d8'; // blue
        case 'W trakcie':
          return '#f39c12'; // orange
        case 'Zakończone':
          return '#2ecc71'; // green
        case 'Anulowane':
          return '#e74c3c'; // red
        case 'Wstrzymane':
          return '#757575'; // gray
        default:
          return '#95a5a6'; // gray
      }
    };

    // Function to translate status to English
    const translateStatus = (status) => {
      switch (status) {
        case 'Zaplanowane':
          return 'Scheduled';
        case 'W trakcie':
          return 'In Progress';
        case 'Zakończone':
          return 'Completed';
        case 'Anulowane':
          return 'Cancelled';
        case 'Wstrzymane':
          return 'On Hold';
        default:
          return status || 'Unknown';
      }
    };

    // Prepare task data with full information
    const reportTasks = tasks.map(task => {
      const workstation = workstations.find(w => w.id === task.workstationId);
      const customer = customers.find(c => c.id === task.customerId);
      
      // NOWA LOGIKA: Wyznacz daty na podstawie statusu zadania
      let reportStartDate = task.scheduledDate;
      let reportEndDate = task.endDate;
      
      // Dla zadań zakończonych używaj dat z historii produkcji
      if (task.status === 'Zakończone' && task.productionSessions && task.productionSessions.length > 0) {
        console.log(`[RAPORT] Zadanie ${task.moNumber} ma historię produkcji:`, task.productionSessions);
        const sessions = task.productionSessions;
        
        // Znajdź najwcześniejszą datę rozpoczęcia z wszystkich sesji
        let earliestStart = null;
        let latestEnd = null;
        
        sessions.forEach(session => {
          if (session.startDate) {
            const sessionStart = new Date(session.startDate);
            if (!earliestStart || sessionStart < earliestStart) {
              earliestStart = sessionStart;
            }
          }
          
          if (session.endDate) {
            const sessionEnd = new Date(session.endDate);
            if (!latestEnd || sessionEnd > latestEnd) {
              latestEnd = sessionEnd;
            }
          }
        });
        
        console.log(`[RAPORT] Znalezione daty dla ${task.moNumber}:`, {
          earliestStart,
          latestEnd
        });
        
        // Użyj rzeczywistych dat z historii produkcji
        if (earliestStart) {
          reportStartDate = earliestStart;
        }
        if (latestEnd) {
          reportEndDate = latestEnd;
        }
      }
      
      // Format dates
      const formatDateForReport = (date) => {
        if (!date) return '';
        try {
          if (date instanceof Date) {
            return format(date, 'dd.MM.yyyy HH:mm', { locale: pl });
          } else if (typeof date === 'string') {
            return format(new Date(date), 'dd.MM.yyyy HH:mm', { locale: pl });
          } else if (date.toDate && typeof date.toDate === 'function') {
            return format(date.toDate(), 'dd.MM.yyyy HH:mm', { locale: pl });
          }
          return format(new Date(date), 'dd.MM.yyyy HH:mm', { locale: pl });
        } catch (error) {
          console.warn('Date formatting error:', error);
          return '';
        }
      };

      // Calculate duration in hours using the determined dates
      let durationHours = '';
      if (reportStartDate && reportEndDate) {
        try {
          const start = reportStartDate instanceof Date ? reportStartDate : new Date(reportStartDate);
          const end = reportEndDate instanceof Date ? reportEndDate : new Date(reportEndDate);
          const durationMs = end.getTime() - start.getTime();
          durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
        } catch (error) {
          console.warn('Duration calculation error:', error);
          durationHours = task.estimatedDuration ? Math.round((task.estimatedDuration / 60) * 100) / 100 : '';
        }
      } else if (task.estimatedDuration) {
        durationHours = Math.round((task.estimatedDuration / 60) * 100) / 100;
      }

      return {
        id: task.id,
        moNumber: task.moNumber || '',
        orderNumber: task.orderNumber || task.orderId || '',
        customerName: customer?.name || task.customerName || '',
        productName: task.productName || '',
        quantity: task.quantity || 0,
        unit: task.unit || 'pcs.',
        status: translateStatus(task.status), // Use translated status
        statusColor: getStatusColorForExcel(task.status), // Add status color
        workstationName: workstation?.name || '',
        scheduledDate: formatDateForReport(reportStartDate),
        endDate: formatDateForReport(reportEndDate),
        durationHours: durationHours,
        priority: task.priority || '',
        description: task.description || task.name || '',
        // Add object with determined dates for comparisons
        originalScheduledDate: reportStartDate,
        originalEndDate: reportEndDate
      };
    });

    // Sort tasks by start date
    reportTasks.sort((a, b) => {
      const dateA = a.scheduledDate ? new Date(a.scheduledDate.split(' ')[0].split('.').reverse().join('-')) : new Date(0);
      const dateB = b.scheduledDate ? new Date(b.scheduledDate.split(' ')[0].split('.').reverse().join('-')) : new Date(0);
      return dateA - dateB;
    });

    // Debug processed tasks
    console.log('Processed tasks:', {
      totalTasks: reportTasks.length,
      tasksWithDates: reportTasks.filter(t => t.originalScheduledDate && t.originalEndDate).length,
      tasksWithoutDates: reportTasks.filter(t => !t.originalScheduledDate || !t.originalEndDate).length,
      sampleTask: reportTasks[0] // Show first task as example
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // === SHEET 1: DETAILED SCHEDULE ===
    
    // Prepare headers for detailed sheet (in English)
    const detailedHeaders = [
      'MO Number',
      'Order Number',
      'Customer',
      'Product',
      'Quantity',
      'Unit',
      'Status',
      'Workstation',
      'Start Date',
      'End Date',
      'Duration (h)',
      'Priority',
      'Description'
    ];

    // Prepare data for detailed sheet
    const detailedData = reportTasks.map(task => [
      task.moNumber,
      task.orderNumber,
      task.customerName,
      task.productName,
      task.quantity,
      task.unit,
      task.status,
      task.workstationName,
      task.scheduledDate,
      task.endDate,
      task.durationHours,
      task.priority,
      task.description
    ]);

    // Create detailed sheet
    const detailedWs = XLSX.utils.aoa_to_sheet([detailedHeaders, ...detailedData]);

    // === SHEET 2: VISUAL GANTT CHART ===
    
    // Generate dates for X axis (columns)
    const ganttStartDate = new Date(startDate);
    const ganttEndDate = new Date(endDate);
    const totalDays = Math.ceil((ganttEndDate - ganttStartDate) / (1000 * 60 * 60 * 24));
    
    // Limit number of days so Excel doesn't become too large
    const maxDays = 120; // Maximum 4 months
    const limitedDays = Math.min(totalDays, maxDays);
    
    // Generate date columns
    const dateColumns = [];
    for (let i = 0; i < limitedDays; i++) {
      const currentDate = new Date(ganttStartDate);
      currentDate.setDate(ganttStartDate.getDate() + i);
      dateColumns.push(format(currentDate, 'dd.MM', { locale: pl }));
    }

    // Prepare headers for Gantt chart (in English)
    const ganttHeaders = [
      'Task',
      'MO',
      'Customer',
      'Workstation',
      'Status',
      ...dateColumns
    ];

    // Prepare data for Gantt chart with coloring
    const ganttData = [];
    let coloredCellsCount = 0; // Counter for colored cells
    
    // Group tasks by selected grouping mode
    let groupedTasks = {};
    
    if (ganttGroupBy === 'workstation') {
      // Group by workstations
      workstations.forEach(workstation => {
        groupedTasks[workstation.name] = reportTasks.filter(task => task.workstationName === workstation.name);
      });
      // Add tasks without assigned workstation
      const noWorkstationTasks = reportTasks.filter(task => !task.workstationName);
      if (noWorkstationTasks.length > 0) {
        groupedTasks['No workstation'] = noWorkstationTasks;
      }
    } else {
      // Group by orders
      const orderGroups = {};
      reportTasks.forEach(task => {
        const orderKey = task.orderNumber || 'No order';
        if (!orderGroups[orderKey]) {
          orderGroups[orderKey] = [];
        }
        orderGroups[orderKey].push(task);
      });
      groupedTasks = orderGroups;
    }

    let currentRowIndex = 1; // Row index for tracking position in sheet (starting from 1 because row 0 is headers)

    // Add rows for each group and task
    Object.keys(groupedTasks).forEach(groupName => {
      const groupTasks = groupedTasks[groupName];
      
      // Add group header row if more than one group
      if (Object.keys(groupedTasks).length > 1) {
        const groupRow = [
          `=== ${groupName} ===`,
          '', '', '', '',
          ...Array(dateColumns.length).fill('')
        ];
        ganttData.push(groupRow);
        currentRowIndex++;
      }

      // Add rows for tasks in group
      groupTasks.forEach(task => {
        console.log(`Processing task: ${task.moNumber}`, {
          originalScheduledDate: task.originalScheduledDate,
          originalEndDate: task.originalEndDate,
          hasValidDates: !!(task.originalScheduledDate && task.originalEndDate)
        });
        
        const taskRow = [
          task.productName,
          task.moNumber,
          task.customerName,
          task.workstationName,
          task.status
        ];

        // Add columns for each day
        for (let i = 0; i < limitedDays; i++) {
          const currentDate = new Date(ganttStartDate);
          currentDate.setDate(ganttStartDate.getDate() + i);
          
          // Check if task is active on this day
          let cellValue = '';
          let shouldColorCell = false;
          
          if (task.originalScheduledDate && task.originalEndDate) {
            try {
              let taskStart, taskEnd;
              
              // Convert task dates to Date objects
              if (task.originalScheduledDate instanceof Date) {
                taskStart = task.originalScheduledDate;
              } else if (task.originalScheduledDate.toDate && typeof task.originalScheduledDate.toDate === 'function') {
                taskStart = task.originalScheduledDate.toDate();
              } else if (typeof task.originalScheduledDate === 'string') {
                taskStart = new Date(task.originalScheduledDate);
              } else {
                taskStart = new Date(task.originalScheduledDate);
              }

              if (task.originalEndDate instanceof Date) {
                taskEnd = task.originalEndDate;
              } else if (task.originalEndDate.toDate && typeof task.originalEndDate.toDate === 'function') {
                taskEnd = task.originalEndDate.toDate();
              } else if (typeof task.originalEndDate === 'string') {
                taskEnd = new Date(task.originalEndDate);
              } else {
                taskEnd = new Date(task.originalEndDate);
              }

              // Check if dates are valid
              if (!isNaN(taskStart.getTime()) && !isNaN(taskEnd.getTime())) {
                // Compare only dates (without time) for better accuracy
                const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                const taskStartOnly = new Date(taskStart.getFullYear(), taskStart.getMonth(), taskStart.getDate());
                const taskEndOnly = new Date(taskEnd.getFullYear(), taskEnd.getMonth(), taskEnd.getDate());
                
                // Check if current day is within task date range
                if (currentDateOnly >= taskStartOnly && currentDateOnly <= taskEndOnly) {
                  shouldColorCell = true;
                  // Don't add any symbols - just color the cells
                  cellValue = ''; // Empty cell with background color
                }
              } else {
                console.warn('Invalid dates for task:', task.moNumber, {
                  originalScheduledDate: task.originalScheduledDate,
                  originalEndDate: task.originalEndDate,
                  taskStart,
                  taskEnd
                });
              }
            } catch (error) {
              console.warn('Error processing task dates:', task.moNumber, error);
            }
          } else {
            console.warn('No dates for task:', task.moNumber, {
              originalScheduledDate: task.originalScheduledDate,
              originalEndDate: task.originalEndDate
            });
          }
          
          // Create cell object with appropriate style if it should be colored
          if (shouldColorCell) {
            coloredCellsCount++;
            console.log(`Colored cell for task ${task.moNumber} on day ${format(currentDate, 'dd.MM', { locale: pl })}`);
            // Cell with style for xlsx-js-style
            taskRow.push({
              v: cellValue, // cell value
              s: { // cell style
                fill: {
                  patternType: 'solid',
                  fgColor: { rgb: task.statusColor.replace('#', '') } // remove # from hex color
                }
              }
            });
          } else {
            // Regular cell without style
            taskRow.push(cellValue);
          }
        }

        ganttData.push(taskRow);
        currentRowIndex++;
      });

      // Add empty row between groups
      if (Object.keys(groupedTasks).length > 1) {
        ganttData.push(Array(ganttHeaders.length).fill(''));
        currentRowIndex++;
      }
    });

    // Create Gantt sheet
    const ganttWs = XLSX.utils.aoa_to_sheet([ganttHeaders, ...ganttData]);

    // Debug generation results
    console.log('Gantt chart generation summary:', {
      totalDataRows: ganttData.length,
      coloredCells: coloredCellsCount,
      dateRange: `${format(ganttStartDate, 'dd.MM.yyyy', { locale: pl })} - ${format(ganttEndDate, 'dd.MM.yyyy', { locale: pl })}`,
      totalDays: limitedDays
    });

    // No need to manually apply styles - xlsx-js-style will do it automatically

    // Color Status column in Gantt sheet
    let ganttRowIndex = 1;
    Object.keys(groupedTasks).forEach(groupName => {
      const groupTasks = groupedTasks[groupName];
      
      // Skip group header row if exists
      if (Object.keys(groupedTasks).length > 1) {
        ganttRowIndex++;
      }

      groupTasks.forEach(task => {
        const statusCellAddress = XLSX.utils.encode_cell({ r: ganttRowIndex, c: 4 }); // Status column in Gantt (index 4)
        
        if (ganttWs[statusCellAddress]) {
          ganttWs[statusCellAddress].s = {
            fill: {
              patternType: 'solid',
              fgColor: { rgb: task.statusColor.replace('#', '') }
            },
            font: {
              color: { rgb: task.statusColor === '#757575' || task.statusColor === '#95a5a6' ? '000000' : 'FFFFFF' }
            }
          };
        }
        ganttRowIndex++;
      });

      // Skip empty row between groups
      if (Object.keys(groupedTasks).length > 1) {
        ganttRowIndex++;
      }
    });

    // Add sheets to workbook
    XLSX.utils.book_append_sheet(wb, detailedWs, 'Detailed schedule');
    XLSX.utils.book_append_sheet(wb, ganttWs, 'Gantt chart');

    // === FORMAT SHEETS ===
    
    // Set column widths for detailed sheet
    const detailedColWidths = [
      { wch: 12 }, // MO Number
      { wch: 15 }, // Order Number
      { wch: 20 }, // Customer
      { wch: 25 }, // Product
      { wch: 8 },  // Quantity
      { wch: 8 },  // Unit
      { wch: 12 }, // Status
      { wch: 15 }, // Workstation
      { wch: 16 }, // Start Date
      { wch: 16 }, // End Date
      { wch: 12 }, // Duration
      { wch: 10 }, // Priority
      { wch: 30 }  // Description
    ];
    detailedWs['!cols'] = detailedColWidths;

    // Add Status column coloring in detailed sheet
    for (let i = 1; i <= reportTasks.length; i++) {
      const task = reportTasks[i - 1];
      const statusCellAddress = XLSX.utils.encode_cell({ r: i, c: 6 }); // Status column (index 6)
      
      if (detailedWs[statusCellAddress]) {
        detailedWs[statusCellAddress].s = {
          fill: {
            patternType: 'solid',
            fgColor: { rgb: task.statusColor.replace('#', '') }
          },
          font: {
            color: { rgb: task.statusColor === '#757575' || task.statusColor === '#95a5a6' ? '000000' : 'FFFFFF' }
          }
        };
      }
    }

    // Set column widths for Gantt sheet
    const ganttColWidths = [
      { wch: 25 }, // Task
      { wch: 12 }, // MO
      { wch: 20 }, // Customer
      { wch: 15 }, // Workstation
      { wch: 12 }, // Status
      ...dateColumns.map(() => ({ wch: 8 })) // Date columns - increased width from 4 to 8
    ];
    ganttWs['!cols'] = ganttColWidths;

    // === ADD STATUS LEGEND TO GANTT SHEET ===
    
    // Find the last row with data
    const lastDataRow = ganttData.length + 1; // +1 because row 0 is headers
    const legendStartRow = lastDataRow + 2; // Leave one empty row before legend
    
    // Status definitions with English translations
    const statusLegend = [
      { status: 'Scheduled', color: '#3788d8' },
      { status: 'In Progress', color: '#f39c12' },
      { status: 'Completed', color: '#2ecc71' },
      { status: 'Cancelled', color: '#e74c3c' },
      { status: 'On Hold', color: '#757575' }
    ];
    
    // Add legend header
    const legendHeaderCell = XLSX.utils.encode_cell({ r: legendStartRow, c: 0 });
    ganttWs[legendHeaderCell] = { v: 'STATUS LEGEND:', t: 's' };
    if (!ganttWs[legendHeaderCell].s) ganttWs[legendHeaderCell].s = {};
    ganttWs[legendHeaderCell].s.font = { bold: true, sz: 12 };
    
    // Add each status with its color
    statusLegend.forEach((legendItem, index) => {
      const row = legendStartRow + 1 + index;
      
      // Status name cell
      const statusCell = XLSX.utils.encode_cell({ r: row, c: 0 });
      ganttWs[statusCell] = { v: legendItem.status, t: 's' };
      
      // Color cell (next column)
      const colorCell = XLSX.utils.encode_cell({ r: row, c: 1 });
      ganttWs[colorCell] = { v: '■■■', t: 's' }; // Use square symbols to show color
      
      // Apply styling to color cell
      if (!ganttWs[colorCell].s) ganttWs[colorCell].s = {};
      ganttWs[colorCell].s = {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: legendItem.color.replace('#', '') }
        },
        font: {
          color: { rgb: legendItem.color === '#757575' || legendItem.color === '#95a5a6' ? '000000' : 'FFFFFF' },
          bold: true
        }
      };
    });
    
    // Add instruction text
    const instructionRow = legendStartRow + statusLegend.length + 2;
    const instructionCell = XLSX.utils.encode_cell({ r: instructionRow, c: 0 });
    ganttWs[instructionCell] = { v: 'Color coded cells in the timeline represent task periods', t: 's' };
    if (!ganttWs[instructionCell].s) ganttWs[instructionCell].s = {};
    ganttWs[instructionCell].s.font = { italic: true, sz: 10 };

    // === SHEET 3: SUMMARY ===
    
    // Prepare summary data
    const summaryData = [
      ['PRODUCTION SCHEDULE REPORT', ''],
      ['', ''],
      ['Report period:', `${format(ganttStartDate, 'dd.MM.yyyy', { locale: pl })} - ${format(ganttEndDate, 'dd.MM.yyyy', { locale: pl })}`],
      ['Report generation date:', format(new Date(), 'dd.MM.yyyy HH:mm', { locale: pl })],
      ['Grouping mode:', ganttGroupBy === 'workstation' ? 'By workstations' : 'By orders'],
      ['', ''],
      ['STATISTICS:', ''],
      ['Total tasks:', reportTasks.length],
      ['Scheduled tasks:', reportTasks.filter(t => t.status === 'Scheduled').length],
      ['In progress tasks:', reportTasks.filter(t => t.status === 'In Progress').length],
      ['Completed tasks:', reportTasks.filter(t => t.status === 'Completed').length],
      ['Cancelled tasks:', reportTasks.filter(t => t.status === 'Cancelled').length],
      ['On hold tasks:', reportTasks.filter(t => t.status === 'On Hold').length],
      ['', ''],
      ['WORKSTATIONS:', ''],
      ...workstations.map(ws => [
        ws.name,
        reportTasks.filter(t => t.workstationName === ws.name).length + ' tasks'
      ]),
      ['', ''],
      ['CUSTOMERS:', ''],
      ...customers.map(customer => [
        customer.name,
        reportTasks.filter(t => t.customerName === customer.name).length + ' tasks'
      ])
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Generate file name
    const fileName = `Production_schedule_${format(ganttStartDate, 'yyyy-MM-dd', { locale: pl })}_${format(ganttEndDate, 'yyyy-MM-dd', { locale: pl })}.xlsx`;

    // Save file
    XLSX.writeFile(wb, fileName);
    
    console.log('Gantt XLSX report generated:', fileName);
    return true;
    
  } catch (error) {
    console.error('Error generating Gantt XLSX report:', error);
    throw new Error('Failed to generate report: ' + error.message);
  }
};

const ProductionCalendar = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('resourceTimelineWeek');
  const [ganttView, setGanttView] = useState('resourceTimelineWeek');
  const [ganttMenuAnchor, setGanttMenuAnchor] = useState(null);
  const [editable, setEditable] = useState(true);
  const [workstations, setWorkstations] = useState([]);
  const [useWorkstationColors, setUseWorkstationColors] = useState(false);
  const [selectedWorkstations, setSelectedWorkstations] = useState({});
  // NOWE: Stany dla filtrowania po klientach
  const [customers, setCustomers] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState({});
  const [customerMenuAnchor, setCustomerMenuAnchor] = useState(null);
  
  // Funkcje do obsługi cache zakresu dat
  const CALENDAR_CACHE_KEY = 'production-calendar-date-range';
  
  const saveDateRangeToCache = useCallback((customRange, start, end) => {
    try {
      const cacheData = {
        customDateRange: customRange,
        startDate: start ? start.toISOString() : null,
        endDate: end ? end.toISOString() : null,
        timestamp: Date.now()
      };
      localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(cacheData));
      console.log('Zapisano zakres dat do cache:', cacheData);
    } catch (error) {
      console.error('Błąd podczas zapisywania zakresu dat do cache:', error);
    }
  }, []);
  
  const loadDateRangeFromCache = useCallback(() => {
    try {
      const cachedData = localStorage.getItem(CALENDAR_CACHE_KEY);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        // Sprawdź czy cache nie jest starszy niż 1 godzina
        const maxAge =  60 * 60 * 1000; // 1 godzina w milisekundach
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < maxAge) {
          console.log('Odczytano zakres dat z cache:', parsed);
          return {
            customDateRange: parsed.customDateRange,
            startDate: parsed.startDate ? new Date(parsed.startDate) : null,
            endDate: parsed.endDate ? new Date(parsed.endDate) : null
          };
        } else {
          // Usuń stary cache
          localStorage.removeItem(CALENDAR_CACHE_KEY);
          console.log('Cache zakresu dat wygasł - usunięto');
        }
      }
    } catch (error) {
      console.error('Błąd podczas odczytywania zakresu dat z cache:', error);
      localStorage.removeItem(CALENDAR_CACHE_KEY);
    }
    return null;
  }, []);
  
  // Inicjalizacja stanów z cache lub wartości domyślnych
  const initializeDateRange = useCallback(() => {
    const cachedRange = loadDateRangeFromCache();
    if (cachedRange && cachedRange.customDateRange && cachedRange.startDate && cachedRange.endDate) {
      return {
        customDateRange: true,
        startDate: cachedRange.startDate,
        endDate: cachedRange.endDate
      };
    }
    return {
      customDateRange: false,
      startDate: startOfMonth(new Date()),
      endDate: endOfMonth(new Date())
    };
  }, [loadDateRangeFromCache]);
  
  const initialDateRange = initializeDateRange();
  const [customDateRange, setCustomDateRange] = useState(initialDateRange.customDateRange);
  const [startDate, setStartDate] = useState(initialDateRange.startDate);
  const [endDate, setEndDate] = useState(initialDateRange.endDate);
  
  const [dateRangeMenuAnchor, setDateRangeMenuAnchor] = useState(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);
  const [ganttDetail, setGanttDetail] = useState('day');
  const [detailMenuAnchor, setDetailMenuAnchor] = useState(null);
  const [ganttGroupBy, setGanttGroupBy] = useState('workstation');
  // Dodaję nowy stan do kontrolowania skali wykresu Gantta
  const [scaleLevel, setScaleLevel] = useState(1); // 1 = normalna, 0.7 = kompaktowa, 1.3 = powiększona
  // Stan do przełączania metody optymalizacji
  const [useOptimizedQueries, setUseOptimizedQueries] = useState(true);
  // Stany do śledzenia wydajności
  const [loadingStats, setLoadingStats] = useState({
    lastLoadTime: 0,
    tasksCount: 0,
    queryMethod: 'optymalizowana'
  });
  const calendarRef = useRef(null);
  const navigate = useNavigate();
  const { showError, showSuccess } = useNotification();
  const { currentUser } = useAuth();
  const [eventResizableFromStart, setEventResizableFromStart] = useState(true);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  // Dodaję nowy stan do kontrolowania widoczności legendy
  const [showLegend, setShowLegend] = useState(true);
  
  // Referencja do przechowywania aktywnych tooltipów
  const activeTooltipsRef = useRef([]);
  
  // Dodaję stan do śledzenia zmodyfikowanych zadań
  const [modifiedTasks, setModifiedTasks] = useState({});
  
  // Stany dla menu kontekstowego
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  // Stany dla dialogu edycji dat
  const [editDateDialog, setEditDateDialog] = useState(false);
  const [editDateForm, setEditDateForm] = useState({
    scheduledDate: null,
    endDate: null
  });
  
  // Stan do przechowywania cache'u zadań
  const [tasksCache, setTasksCache] = useState({});
  
  // Funkcja do generowania klucza cache'u na podstawie zakresu dat
  const generateCacheKey = useCallback((startDate, endDate) => {
    // Format: "START_DATE-END_DATE"
    return `${new Date(startDate).toISOString()}-${new Date(endDate).toISOString()}`;
  }, []);
  
  // Funkcja do sprawdzania, czy cache jest nadal ważny
  const isCacheValid = useCallback((cacheEntry) => {
    if (!cacheEntry || !cacheEntry.timestamp) {
      return false;
    }
    
    const now = Date.now();
    return (now - cacheEntry.timestamp) < CACHE_EXPIRY_TIME;
  }, []);
  
  // Funkcja do czyszczenia wszystkich aktywnych tooltipów
  const clearAllTooltips = useCallback(() => {
    if (activeTooltipsRef.current.length > 0) {
      activeTooltipsRef.current.forEach(tooltip => {
        if (tooltip && tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      });
      activeTooltipsRef.current = [];
    }
  }, []);
  
  // Efekt do aktualizacji widoku kalendarza po zmianie stanu view
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.changeView(view);
      
      // Wyczyść wszystkie tooltipów przy zmianie widoku
      clearAllTooltips();
    }
  }, [view, clearAllTooltips]);
  
  // Nowy efekt do oznaczania wierszy, które mają wydarzenia
  useEffect(() => {
    if (calendarRef.current && tasks.length > 0 && view.startsWith('resourceTimeline')) {
      // Opóźnienie, aby dać czas na renderowanie wydarzeń
      setTimeout(() => {
        const resourceLanes = document.querySelectorAll('.fc-timeline-lane-frame');
        resourceLanes.forEach(lane => {
          // Usuń klasę jeśli była wcześniej
          lane.classList.remove('fc-has-events');
          
          // Dodaj klasę tylko jeśli wiersz zawiera wydarzenia
          const events = lane.querySelectorAll('.fc-timeline-event');
          if (events.length > 0) {
            lane.classList.add('fc-has-events');
          }
        });
      }, 100);
    }
  }, [tasks, view]);
  
  useEffect(() => {
    fetchWorkstations();
    fetchCustomers();
  }, []);
  
  // Efekt do zastosowania zakresu dat z cache po inicjalizacji komponentu
  useEffect(() => {
    if (customDateRange && startDate && endDate && calendarRef.current) {
      console.log('Zastosowanie zakresu dat z cache przy inicjalizacji');
      // Opóźnienie aby dać czas na pełne załadowanie kalendarza
      setTimeout(() => {
        showSuccess(`Przywrócono zakres dat z ostatniej sesji: ${format(startDate, 'dd.MM.yyyy', { locale: pl })} - ${format(endDate, 'dd.MM.yyyy', { locale: pl })}`);
        applyCustomDateRange();
      }, 500);
    }
  }, []); // Uruchom tylko raz przy mount
  
  const fetchWorkstations = async () => {
    try {
      const data = await getAllWorkstations();
      setWorkstations(data);
      
      const initialSelectedWorkstations = {};
      data.forEach(workstation => {
        initialSelectedWorkstations[workstation.id] = true;
      });
      setSelectedWorkstations(initialSelectedWorkstations);
    } catch (error) {
      console.error('Błąd podczas pobierania stanowisk:', error);
      showError('Błąd podczas pobierania stanowisk: ' + error.message);
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await getAllCustomers();
      setCustomers(data);
      
      // Domyślnie zaznacz wszystkich klientów
      const initialSelectedCustomers = {};
      data.forEach(customer => {
        initialSelectedCustomers[customer.id] = true;
      });
      // Dodaj też opcję dla zadań bez klienta
      initialSelectedCustomers['no-customer'] = true;
      setSelectedCustomers(initialSelectedCustomers);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
      showError('Błąd podczas pobierania klientów: ' + error.message);
    }
  };

  const fetchTasks = async (info, forceParams = false) => {
    // Jeśli już trwa ładowanie, nie uruchamiaj kolejnego zapytania
    if (loading) return;
    
    try {
      setLoading(true);
      
      // Weryfikacja parametrów
      if (!info || (!info.startStr && !info.endStr && !customDateRange)) {
        console.error('Brakujące parametry w fetchTasks', info);
        return;
      }
      
      // Bezpieczne pobieranie zakresu dat
      let rangeStartDate, rangeEndDate;
      
      // Jeśli forceParams jest true, użyj parametrów z info nawet w trybie customDateRange
      if (forceParams && info && info.startStr && info.endStr) {
        rangeStartDate = info.startStr;
        rangeEndDate = info.endStr;
        console.log('Wymuszenie użycia parametrów z info:', rangeStartDate, rangeEndDate);
      } else if (customDateRange) {
        rangeStartDate = startDate.toISOString();
        rangeEndDate = endDate.toISOString();
      } else if (info) {
        rangeStartDate = info.startStr;
        rangeEndDate = info.endStr;
      } else {
        // Awaryjnie użyj dzisiejszej daty i miesiąca do przodu
        const today = new Date();
        rangeStartDate = today.toISOString();
        rangeEndDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()).toISOString();
      }
      
      // Generuj klucz cache'u
      const cacheKey = generateCacheKey(rangeStartDate, rangeEndDate);
      
      // WYŁĄCZ CACHE CZASOWO DO DEBUGOWANIA
      console.log('🔄 WYŁĄCZAM CACHE DO DEBUGOWANIA');
      
      console.log('Pobieranie zadań dla zakresu dat:', rangeStartDate, '-', rangeEndDate);
      
      // Dodajemy timeout, żeby React miał czas na aktualizację stanu
      setTimeout(async () => {
        try {
          const startTime = performance.now(); // Pomiar czasu rozpoczęcia
          
          // OPTYMALIZACJA: Wybór metody pobierania danych
          const fetchedTasks = useOptimizedQueries 
            ? await getTasksByDateRangeOptimizedNew(rangeStartDate, rangeEndDate, 1000)
            : await getTasksByDateRange(rangeStartDate, rangeEndDate);
          
          const endTime = performance.now(); // Pomiar czasu zakończenia
          const loadTime = endTime - startTime;
          
          console.log('Pobrano zadania:', fetchedTasks);
          console.log(`Czas ładowania: ${loadTime.toFixed(2)}ms dla ${fetchedTasks.length} zadań`);
          
          // DODATKOWE LOGOWANIE DLA ZADAŃ ZAKOŃCZONYCH
          const completedTasks = fetchedTasks.filter(task => task.status === 'Zakończone');
          console.log('🎯 ZADANIA ZAKOŃCZONE:', completedTasks);
          completedTasks.forEach(task => {
            console.log(`📋 Zadanie: ${task.moNumber}`, {
              status: task.status,
              hasProductionSessions: !!task.productionSessions,
              productionSessionsCount: task.productionSessions?.length || 0,
              productionSessions: task.productionSessions,
              scheduledDate: task.scheduledDate,
              endDate: task.endDate,
              fullTaskObject: task
            });
          });
          
          // Aktualizuj statystyki wydajności
          setLoadingStats({
            lastLoadTime: loadTime,
            tasksCount: fetchedTasks.length,
            queryMethod: useOptimizedQueries ? 'optymalizowana' : 'standardowa'
          });
          
          // Zapisz dane w cache z aktualnym timestampem
          setTasksCache(prevCache => ({
            ...prevCache,
            [cacheKey]: {
              data: fetchedTasks,
              timestamp: Date.now()
            }
          }));
          
          setTasks(fetchedTasks);
          
          // Automatyczna aktualizacja widoku kalendarza po załadowaniu
          if (calendarRef.current) {
            try {
              const calendarApi = calendarRef.current.getApi();
              calendarApi.updateSize();
              
              if (customDateRange) {
                calendarApi.setOption('visibleRange', {
                  start: startDate,
                  end: endDate
                });
              }
            } catch (error) {
              console.error("Błąd podczas aktualizacji kalendarza:", error);
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania zadań:', error);
          showError('Błąd podczas ładowania zadań: ' + error.message);
        } finally {
          setLoading(false);
        }
      }, 50);
    } catch (error) {
      console.error('Błąd podczas pobierania zadań:', error);
      showError('Błąd podczas ładowania zadań: ' + error.message);
      setLoading(false);
    }
  };

  const handleViewChange = (event, newView) => {
    if (newView !== null) {
      try {
        // Wyczyść wszystkie tooltipów przed zmianą widoku
        clearAllTooltips();
        
        // Jeśli wybrano widok Gantta, użyj aktualnie wybranego widoku Gantta
        const viewToUse = newView === 'gantt' ? ganttView : newView;
        
        // Aktualizuj stan widoku
        setView(viewToUse);
        
        // Jeśli mamy referencję do kalendarza, zaktualizuj widok
        if (calendarRef.current) {
          const calendarApi = calendarRef.current.getApi();
          
          // Daj czas na aktualizację stanu
          setTimeout(() => {
            try {
              calendarApi.changeView(viewToUse);
            } catch (error) {
              console.error('Błąd podczas zmiany widoku:', error);
            }
          }, 0);
          
          // Jeśli mamy niestandardowy zakres dat, przejdź do daty początkowej
          if (customDateRange) {
            calendarApi.gotoDate(startDate);
            
            // Pobierz zadania dla ustawionego zakresu dat
            fetchTasks({
              startStr: startDate.toISOString(),
              endStr: endDate.toISOString()
            });
          }
        }
      } catch (error) {
        console.error('Błąd podczas zmiany widoku:', error);
        showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
      }
    }
  };

  // Obsługa zdarzenia FullCalendar datesSet - wywołuje się przy zmianie wyświetlanego zakresu dat
  const handleDatesSet = (dateInfo) => {
    console.log("datesSet wywołany:", dateInfo.start, dateInfo.end, "isCustomDateRange:", customDateRange);
    
    // Jeśli nie mamy niestandardowego zakresu, po prostu pobierz zadania dla widocznego zakresu
    if (!customDateRange) {
      fetchTasks(dateInfo);
    } else {
      // W trybie customDateRange sprawdź czy nowy zakres różni się od aktualnego
      // To może się zdarzyć podczas nawigacji strzałkami
      const newStart = dateInfo.start;
      const newEnd = dateInfo.end;
      const currentStart = startDate;
      const currentEnd = endDate;
      
      // Sprawdź czy daty się różnią (z tolerancją na różnice w czasie)
      const startDiff = Math.abs(newStart.getTime() - currentStart.getTime());
      const endDiff = Math.abs(newEnd.getTime() - currentEnd.getTime());
      
      // Jeśli różnica jest większa niż 1 dzień (86400000 ms), to prawdopodobnie użytkownik nawigował
      if (startDiff > 86400000 || endDiff > 86400000) {
        console.log("Wykryto nawigację w trybie customDateRange - aktualizuję zadania");
        fetchTasks(dateInfo, true); // forceParams = true
      } else {
        console.log("Ignoruję automatyczną zmianę zakresu - używam customDateRange");
      }
    }
    // Nie wykonuj żadnych innych operacji, które mogłyby zmieniać stan komponentu
    // i powodować zapętlenie renderowania
  };

  const handleGanttMenuClick = (event) => {
    setGanttMenuAnchor(event.currentTarget);
  };

  const handleGanttMenuClose = () => {
    setGanttMenuAnchor(null);
  };

  const handleGanttViewChange = (newGanttView) => {
    try {
      // Wyczyść wszystkie tooltipów przed zmianą widoku Gantt
      clearAllTooltips();
      
      // Zamknij menu Gantta
      handleGanttMenuClose();
      
      // Aktualizuj stan widoku Gantta i ogólnego widoku
      setGanttView(newGanttView);
      setView(newGanttView);
      
      // Aktualizuj również poziom szczegółowości na podstawie wybranego widoku
      if (newGanttView === 'resourceTimelineDay') {
        // Dla widoku dziennego używamy szczegółowości godzinowej
        setGanttDetail('hour');
      } else if (newGanttView === 'resourceTimelineWeek') {
        // Pozostaw aktualną szczegółowość, chyba że jest tygodniowa (week)
        if (ganttDetail === 'week') {
          setGanttDetail('day');
        }
      } else if (newGanttView === 'resourceTimelineMonth') {
        // Dla widoku miesięcznego, jeśli szczegółowość jest godzinowa, zmień na dzienną
        if (ganttDetail === 'hour') {
          setGanttDetail('day');
        }
      } else if (newGanttView === 'resourceTimelineYear') {
        // Dla widoku rocznego używamy szczegółowości tygodniowej
        setGanttDetail('week');
      }
      
      // Jeśli mamy referencję do kalendarza, zaktualizuj widok
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        
        // Daj czas na aktualizację stanu
        setTimeout(() => {
          try {
            calendarApi.changeView(newGanttView);
          } catch (error) {
            console.error('Błąd podczas zmiany widoku Gantta:', error);
          }
        }, 0);
        
        // Jeśli mamy niestandardowy zakres dat, przejdź do daty początkowej
        if (customDateRange) {
          calendarApi.gotoDate(startDate);
          
          // Pobierz zadania dla ustawionego zakresu dat
          fetchTasks({
            startStr: startDate.toISOString(),
            endStr: endDate.toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Błąd podczas zmiany widoku Gantta:', error);
      showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
    }
  };

  // Obsługa kliknięcia w zdarzenie - pokazuje menu kontekstowe
  const handleEventClick = (info) => {
    info.jsEvent.preventDefault();
    
    // Wyczyść wszystkie tooltipów przed pokazaniem menu
    clearAllTooltips();
    
    setSelectedEvent(info.event);
    setContextMenu({
      mouseX: info.jsEvent.clientX - 2,
      mouseY: info.jsEvent.clientY - 4,
    });
  };

  // Zamknięcie menu kontekstowego
  const handleCloseContextMenu = () => {
    setContextMenu(null);
    setSelectedEvent(null);
  };

  // Przejście do szczegółów MO
  const handleViewMODetails = () => {
    if (selectedEvent) {
      navigate(`/production/tasks/${selectedEvent.id}`);
      // Wyczyść selectedEvent po nawigacji
      setSelectedEvent(null);
      setContextMenu(null);
    }
  };

  // Otworzenie dialogu edycji dat
  const handleEditDates = () => {
    if (selectedEvent) {
      console.log('Otwieranie dialogu edycji dla zadania:', selectedEvent.id, {
        start: selectedEvent.start,
        end: selectedEvent.end,
        task: selectedEvent.extendedProps.task
      });
      
      setEditDateForm({
        scheduledDate: selectedEvent.start ? new Date(selectedEvent.start) : null,
        endDate: selectedEvent.end ? new Date(selectedEvent.end) : null
      });
      setEditDateDialog(true);
    }
    // Zamknij tylko menu kontekstowe, ale zostaw selectedEvent
    setContextMenu(null);
  };

  // Zamknięcie dialogu edycji dat
  const handleCloseEditDateDialog = () => {
    setEditDateDialog(false);
    setEditDateForm({
      scheduledDate: null,
      endDate: null
    });
    // Wyczyść selectedEvent po zamknięciu dialogu
    setSelectedEvent(null);
  };

  // Zapisanie zmian dat
  const handleSaveEditedDates = async () => {
    console.log('Próba zapisania dat:', {
      selectedEvent: selectedEvent?.id,
      scheduledDate: editDateForm.scheduledDate,
      scheduledDateType: typeof editDateForm.scheduledDate,
      scheduledDateValid: editDateForm.scheduledDate instanceof Date,
      endDate: editDateForm.endDate,
      endDateType: typeof editDateForm.endDate,
      endDateValid: editDateForm.endDate instanceof Date,
      currentUser: currentUser?.uid
    });

    if (!selectedEvent) {
      showError('Nie wybrano zamówienia produkcyjnego');
      return;
    }

    if (!editDateForm.scheduledDate || !(editDateForm.scheduledDate instanceof Date)) {
      showError('Data rozpoczęcia jest wymagana i musi być prawidłową datą');
      return;
    }

    if (editDateForm.endDate && !(editDateForm.endDate instanceof Date)) {
      showError('Data zakończenia musi być prawidłową datą');
      return;
    }

    if (!currentUser?.uid) {
      showError('Nie jesteś zalogowany');
      return;
    }

    try {
      // Wyczyść wszystkie tooltipów przed operacją - tak jak w handleEventDrop
      clearAllTooltips();
      
      setLoading(true);
      
      // Zapisz aktualną pozycję suwaka przed operacją
      const currentScrollLeft = calendarRef.current?.getApi().view.el?.querySelector('.fc-scroller-harness')?.scrollLeft || 0;
      
      const taskId = selectedEvent.id;
      const task = selectedEvent.extendedProps.task;
      
      // Oblicz czas trwania w minutach na podstawie różnicy między datami
      let durationInMinutes = '';
      if (editDateForm.scheduledDate && editDateForm.endDate) {
        durationInMinutes = Math.round((editDateForm.endDate - editDateForm.scheduledDate) / (1000 * 60));
      }
      
      // Przygotuj dane do aktualizacji - tak jak w handleEventDrop
      const updatedData = {
        scheduledDate: editDateForm.scheduledDate,
        endDate: editDateForm.endDate || editDateForm.scheduledDate,
        estimatedDuration: durationInMinutes || task.estimatedDuration
      };

      console.log('Aktualizacja zadania:', taskId, updatedData);

      // Aktualizuj stan modifiedTasks - to jest kluczowe dla tooltipów, tak jak w handleEventDrop
      setModifiedTasks(prev => ({
        ...prev,
        [taskId]: {
          id: taskId,
          // Zachowaj wszystkie inne właściwości z oryginalnego zadania
          ...task,
          // Ale upewnij się, że daty i czas trwania są zaktualizowane
          scheduledDate: editDateForm.scheduledDate,
          endDate: editDateForm.endDate || editDateForm.scheduledDate,
          estimatedDuration: durationInMinutes || task.estimatedDuration,
          lastModified: new Date()
        }
      }));

      await updateTask(taskId, updatedData, currentUser.uid);
      
      showSuccess('Daty zamówienia produkcyjnego zostały zaktualizowane');
      handleCloseEditDateDialog();
      
      // Odświeżenie widoku - używając dokładnie tego samego podejścia co w handleEventDrop
      const updatedTasks = await getTasksByDateRange(
        calendarRef.current.getApi().view.activeStart.toISOString(),
        calendarRef.current.getApi().view.activeEnd.toISOString()
      );
      setTasks(updatedTasks);
      
      // ZMIENIONE PODEJŚCIE: Delikatne odświeżenie bez resetowania pozycji suwaka
      try {
        if (calendarRef.current) {
          const api = calendarRef.current.getApi();
          
          // Krótka pauza przed refreshem
          setTimeout(() => {
            // Tylko delikatne odświeżenie eventów bez pełnego przeładowania
            api.refetchEvents();
            
            // Przywróć pozycję suwaka po odświeżeniu
            setTimeout(() => {
              const scrollContainer = api.view.el?.querySelector('.fc-scroller-harness');
              if (scrollContainer && currentScrollLeft > 0) {
                scrollContainer.scrollLeft = currentScrollLeft;
              }
            }, 50);
          }, 100);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania kalendarza:', error);
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji dat:', error);
      showError('Wystąpił błąd podczas aktualizacji dat: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  // Funkcja obsługująca kliknięcie w pusty obszar kalendarza - została wyłączona
  const handleDateClick = (info) => {
    // Funkcjonalność dodawania nowego zadania została wyłączona
    // navigate(`/production/new-task?date=${info.dateStr}`);
  };
  
  const handleFilterMenuClick = (event) => {
    setFilterMenuAnchor(event.currentTarget);
  };

  const handleFilterMenuClose = () => {
    setFilterMenuAnchor(null);
  };

  const handleWorkstationFilterChange = (workstationId) => {
    setSelectedWorkstations(prev => ({
      ...prev,
      [workstationId]: !prev[workstationId]
    }));
  };
  
  const handleSelectAllWorkstations = (select) => {
    const newSelectedWorkstations = {};
    workstations.forEach(workstation => {
      newSelectedWorkstations[workstation.id] = select;
    });
    setSelectedWorkstations(newSelectedWorkstations);
  };

  // NOWE: Funkcje do obsługi filtrów klientów
  const handleCustomerMenuClick = (event) => {
    setCustomerMenuAnchor(event.currentTarget);
  };

  const handleCustomerMenuClose = () => {
    setCustomerMenuAnchor(null);
  };

  const handleCustomerFilterChange = (customerId) => {
    setSelectedCustomers(prev => ({
      ...prev,
      [customerId]: !prev[customerId]
    }));
  };
  
  const handleSelectAllCustomers = (select) => {
    const newSelectedCustomers = {};
    customers.forEach(customer => {
      newSelectedCustomers[customer.id] = select;
    });
    // Dodaj też opcję dla zadań bez klienta
    newSelectedCustomers['no-customer'] = select;
    setSelectedCustomers(newSelectedCustomers);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
        return '#3788d8'; // niebieski
      case 'W trakcie':
        return '#f39c12'; // pomarańczowy
      case 'Zakończone':
        return '#2ecc71'; // zielony
      case 'Anulowane':
        return '#e74c3c'; // czerwony
      case 'Wstrzymane':
        return '#757575'; // szary
      default:
        return '#95a5a6'; // szary
    }
  };
  
  const getTaskColor = (task) => {
    // Sprawdź, czy używamy kolorów stanowisk
    if (useWorkstationColors) {
      // Jeśli zadanie ma przypisane stanowisko i stanowisko ma określony kolor
      if (task.workstationId && workstations.find(w => w.id === task.workstationId)?.color) {
        return workstations.find(w => w.id === task.workstationId)?.color;
      }
      // Jeśli zadanie nie ma przypisanego stanowiska lub stanowisko nie ma określonego koloru,
      // to i tak użyj koloru statusu, a nie domyślnego szarego
      return getStatusColor(task.status);
    }
    
    // Jeśli nie używamy kolorów stanowisk, użyj koloru statusu
    return getStatusColor(task.status);
  };

  // Główna funkcja renderowania wydarzeń - aktualizuje również oryginalne zadanie w extendedProps
  const getCalendarEvents = () => {
    if (!tasks || tasks.length === 0) {
      return [];
    }
    
    // NOWE: Filtrowanie zadań po klientach
    const filteredTasks = tasks.filter(task => {
      // Sprawdź czy zadanie ma przypisanego klienta
      const customerId = task.customer?.id || task.customerId;
      
      if (customerId) {
        // Zadanie ma klienta - sprawdź czy klient jest zaznaczony
        return selectedCustomers[customerId] === true;
      } else {
        // Zadanie nie ma klienta - sprawdź czy opcja "bez klienta" jest zaznaczona
        return selectedCustomers['no-customer'] === true;
      }
    });
    
    return filteredTasks.map(task => {
      // Sprawdź czy zadanie ma przypisane stanowisko
      const workstationId = task.workstationId;
      
      // Wyznacz kolor w zależności od statusu lub stanowiska
      const color = useWorkstationColors && workstationId
        ? getTaskColor(task)
        : getStatusColor(task.status);
      
      // Przygotuj szczegóły zadania
      const title = task.name || `${task.productName} (${task.moNumber})`;
      
      // Daty rozpoczęcia i zakończenia zadania
      let startDate = task.scheduledDate;
      let endDate = task.endDate || task.estimatedEndDate;
      
      // NOWA LOGIKA: Dla zadań zakończonych używaj dat z historii produkcji
      console.log(`Sprawdzanie zadania ${task.moNumber}:`, {
        status: task.status,
        hasProductionSessions: !!task.productionSessions,
        productionSessionsLength: task.productionSessions?.length || 0,
        productionSessions: task.productionSessions
      });
      
      if (task.status === 'Zakończone' && task.productionSessions && task.productionSessions.length > 0) {
        console.log(`✅ Zadanie ${task.moNumber} spełnia warunki dla historii produkcji`);
        const sessions = task.productionSessions;
        
        // Znajdź najwcześniejszą datę rozpoczęcia z wszystkich sesji
        let earliestStart = null;
        let latestEnd = null;
        
        sessions.forEach((session, index) => {
          console.log(`Sesja ${index + 1}:`, {
            startDate: session.startDate,
            endDate: session.endDate
          });
          
          if (session.startDate) {
            const sessionStart = new Date(session.startDate);
            if (!earliestStart || sessionStart < earliestStart) {
              earliestStart = sessionStart;
            }
          }
          
          if (session.endDate) {
            const sessionEnd = new Date(session.endDate);
            if (!latestEnd || sessionEnd > latestEnd) {
              latestEnd = sessionEnd;
            }
          }
        });
        
        console.log(`Znalezione daty dla ${task.moNumber}:`, {
          earliestStart: earliestStart?.toISOString(),
          latestEnd: latestEnd?.toISOString(),
          originalStart: startDate,
          originalEnd: endDate
        });
        
        // Użyj rzeczywistych dat z historii produkcji
        if (earliestStart) {
          startDate = earliestStart.toISOString();
        }
        if (latestEnd) {
          endDate = latestEnd.toISOString();
        }
        
        console.log(`Zaktualizowane daty dla ${task.moNumber}:`, {
          newStartDate: startDate,
          newEndDate: endDate
        });
      } else {
        // Dla zadań niebędących w statusie "Zakończone" - zachowaj oryginalną logikę
        
        // Konwersja dat do formatu ISO String (jeśli są to obiekty date)
        if (startDate && typeof startDate !== 'string') {
          if (startDate.toDate) {
            startDate = startDate.toDate().toISOString();
          } else if (startDate instanceof Date) {
            startDate = startDate.toISOString();
          }
        }
        
        if (endDate && typeof endDate !== 'string') {
          if (endDate.toDate) {
            endDate = endDate.toDate().toISOString();
          } else if (endDate instanceof Date) {
            endDate = endDate.toISOString();
          }
        }
        
        // Jeśli endDate nie jest ustawione, oblicz go na podstawie scheduledDate i estimatedDuration
        if (!endDate && startDate && task.estimatedDuration) {
          const start = new Date(startDate);
          const durationMs = task.estimatedDuration * 60 * 1000; // konwersja minut na milisekundy
          const calculatedEnd = new Date(start.getTime() + durationMs);
          endDate = calculatedEnd.toISOString();
        }
      }
      
      // Określ zasób, do którego przypisane jest zadanie, w zależności od trybu grupowania
      let resourceId;
      
      if (ganttGroupBy === 'workstation') {
        // Gdy grupujemy według stanowisk, przypisz do wybranego stanowiska
        resourceId = workstationId;
      } else if (ganttGroupBy === 'order') {
        // Gdy grupujemy według zamówień, przypisz do odpowiedniego zamówienia
        resourceId = task.orderId || 'no-order';
      }
      
      // Tworzenie unikalnego ID dla zadania, uwzględniając MO w ramach jednego CO
      const uniqueId = task.id;
      
      // Sprawdź, czy mamy zmodyfikowane dane dla tego zadania
      const modifiedTask = modifiedTasks[uniqueId];
      if (modifiedTask) {
        console.log(`Używam zmodyfikowanych danych podczas renderowania zdarzenia: ${uniqueId}`, {
          original: { startDate, endDate },
          modified: {
            startDate: modifiedTask.scheduledDate instanceof Date 
              ? modifiedTask.scheduledDate.toISOString()
              : modifiedTask.scheduledDate,
            endDate: modifiedTask.endDate instanceof Date
              ? modifiedTask.endDate.toISOString()
              : modifiedTask.endDate
          }
        });
        
        // Użyj zmodyfikowanych danych dla dat
        if (modifiedTask.scheduledDate) {
          startDate = modifiedTask.scheduledDate instanceof Date 
            ? modifiedTask.scheduledDate.toISOString()
            : modifiedTask.scheduledDate;
        }
        
        if (modifiedTask.endDate) {
          endDate = modifiedTask.endDate instanceof Date
            ? modifiedTask.endDate.toISOString()
            : modifiedTask.endDate;
        }
      }
      
      // Zapis aktualnych danych do LocalStorage dla synchronizacji tooltipów
      // Używamy ID zadania jako klucza dla łatwego dostępu
      try {
        localStorage.setItem(`task_${uniqueId}`, JSON.stringify({
          id: uniqueId,
          moNumber: task.moNumber,
          name: task.name,
          productName: task.productName,
          quantity: task.quantity,
          unit: task.unit,
          status: task.status,
          workstationId: task.workstationId,
          workstationName: workstations.find(w => w.id === workstationId)?.name,
          scheduledDate: startDate,
          endDate: endDate,
          estimatedDuration: task.estimatedDuration,
          lastUpdated: Date.now()
        }));
      } catch (error) {
        console.warn('Nie można zapisać danych zadania do LocalStorage:', error);
      }
      
      // Zwróć obiekt zdarzenia
      return {
        id: uniqueId,
        title: title,
        start: startDate,
        end: endDate,
        backgroundColor: color,
        borderColor: color,
        textColor: getContrastYIQ(color),
        extendedProps: {
          task: task,
          moNumber: task.moNumber, // Dodajemy numer MO do extendedProps
          orderId: task.orderId,   // Dodajemy ID zamówienia do extendedProps
          productName: task.productName,
          quantity: task.quantity,
          unit: task.unit,
          status: task.status,
          workstationId: task.workstationId,
          estimatedDuration: task.estimatedDuration
        },
        resourceId: resourceId,
        editable: canEditTask(task) && editable
        // Usunięto groupId, które powodowało grupowe przemieszczanie zleceń z tego samego zamówienia
      };
    }).filter(event => {
      // Filtruj zdarzenia, które nie mają resourceId, jeśli jesteśmy w widoku zasobów
      if (view.includes('resourceTimeline')) {
        return event.resourceId !== undefined;
      }
      return true;
    });
  };

  // Przygotowanie zasobów dla wykresu Gantta
  const getResources = () => {
    // Jeśli brak workstations lub tasks, zwróć pustą tablicę
    if (!workstations || workstations.length === 0) {
      return [];
    }
    
    // Jeśli grupujemy według stanowisk
    if (ganttGroupBy === 'workstation') {
      const resources = [];
      
      // Dodaj stanowiska według zaznaczonych w filtrze
      workstations
        .filter(workstation => selectedWorkstations[workstation.id])
        .forEach(workstation => {
          resources.push({
            id: workstation.id,
            title: workstation.name,
            businessHours: workstation.businessHours || {
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Wszystkie dni tygodnia
              startTime: '00:00',
              endTime: '23:59'
            }
          });
        });
      
      // Sprawdź czy są zadania bez przypisanego stanowiska
      const hasTasksWithoutWorkstation = tasks.some(task => !task.workstationId);
      if (hasTasksWithoutWorkstation) {
        resources.push({
          id: 'no-workstation',
          title: 'No workstation assigned',
          businessHours: {
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            startTime: '00:00',
            endTime: '23:59'
          }
        });
      }
      
      return resources;
    } 
    // Jeśli grupujemy według zamówień
    else if (ganttGroupBy === 'order') {
      // Pobierz unikalne zamówienia z zadań
      const uniqueOrders = new Map();
      
      tasks.forEach(task => {
        // Sprawdź czy zadanie ma przypisany numer zamówienia
        if (task.orderId) {
          // Jeśli zamówienie nie było jeszcze dodane, dodaj je
          if (!uniqueOrders.has(task.orderId)) {
            uniqueOrders.set(task.orderId, {
              id: task.orderId,
              title: task.orderNumber || task.orderId, // Tylko numer zamówienia bez "Zamówienie"
              // Możemy dodać więcej informacji o zamówieniu, jeśli są dostępne
              customerId: task.customerId,
              customerName: task.customerName
            });
          }
        }
      });
      
      // Jeśli nie ma zamówień lub wszystkie zadania są bez zamówień, 
      // dodaj kategorię "Bez zamówienia"
      if (uniqueOrders.size === 0 || tasks.some(task => !task.orderId)) {
        uniqueOrders.set('no-order', {
          id: 'no-order',
          title: 'No order'
        });
      }
      
      // Zwróć listę zamówień jako zasoby
      return Array.from(uniqueOrders.values());
    }
    
    // Domyślnie, jeśli wartość ganttGroupBy jest nieprawidłowa
    return [];
  };

  // Komponent renderujący zawartość zdarzenia w kalendarzu
  const renderEventContent = (eventInfo) => {
    const duration = eventInfo.event.end 
      ? Math.round((eventInfo.event.end - eventInfo.event.start) / (1000 * 60)) 
      : eventInfo.event.extendedProps.estimatedDuration || '';
    
    const durationText = duration ? `(${duration} min)` : '';
    
    const workstationId = eventInfo.event.extendedProps.workstationId;
    const workstationName = workstationId ? 
      workstations.find(w => w.id === workstationId)?.name || 'Unknown workstation' : 
      'No assigned workstation';
    
    // Różny sposób wyświetlania dla widoku Gantta i zwykłego kalendarza
    if (view.startsWith('resourceTimeline')) {
      // W widoku Gantta pokazujemy więcej szczegółów w zależności od dostępnej przestrzeni
      // Używamy mniejszych rozmiarów czcionek dla kompaktowego wyświetlania
      const baseFontSize = scaleLevel < 0.8 ? '9px' : scaleLevel > 1.2 ? '12px' : '11px';
      const secondaryFontSize = scaleLevel < 0.8 ? '8px' : scaleLevel > 1.2 ? '11px' : '10px';
      const statusFontSize = scaleLevel < 0.8 ? '8px' : scaleLevel > 1.2 ? '10px' : '9px';
      
      return (
        <Box sx={{ 
          overflow: 'hidden', 
          width: '100%', 
          height: '100%',
          fontSize: baseFontSize,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '1px 2px'
        }}>
          <Box sx={{ 
            fontWeight: 'bold', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            fontSize: baseFontSize,
            lineHeight: 1.1
          }}>
            {eventInfo.event.title}
          </Box>
          {/* Pokazuj dodatkowe informacje tylko jeśli jest wystarczająco miejsca i skala > 0.8 */}
          {!isMobile && scaleLevel > 0.8 && (
            <>
              {eventInfo.event.extendedProps.orderNumber && (
                <Box sx={{ 
                  fontSize: secondaryFontSize, 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  lineHeight: 1.1
                }}>
                  Order: {eventInfo.event.extendedProps.orderNumber}
                </Box>
              )}
              {eventInfo.event.extendedProps.moNumber && (
                <Box sx={{ 
                  fontSize: secondaryFontSize, 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  lineHeight: 1.1
                }}>
                  MO: {eventInfo.event.extendedProps.moNumber}
                </Box>
              )}
            </>
          )}
          {/* Zawsze pokazuj status, ale z odpowiednim rozmiarem czcionki */}
          <Box sx={{ 
            fontSize: statusFontSize, 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            opacity: 0.8,
            lineHeight: 1.1
          }}>
            {eventInfo.event.extendedProps.status}
          </Box>
        </Box>
      );
    } else if (eventInfo.view.type === 'dayGridMonth') {
      // Dla widoku miesięcznego - bardzo kompaktowy wygląd
      return (
        <Box sx={{ 
          overflow: 'hidden', 
          width: '100%', 
          fontSize: isMobile ? '10px' : '11px'
        }}>
          <Box 
            sx={{ 
              fontWeight: 'bold', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              lineHeight: 1.2
            }}
          >
            {eventInfo.event.title}
          </Box>
          {!isMobile && workstationName && (
            <Box 
              sx={{ 
                fontSize: '9px', 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                mt: 0.5,
                lineHeight: 1.1
              }}
            >
              {workstationName}
            </Box>
          )}
        </Box>
      );
    } else {
      // Dla pozostałych widoków (dzień/tydzień)
      return (
        <Box sx={{ overflow: 'hidden', width: '100%', fontSize: isMobile ? '11px' : '12px' }}>
          <Box sx={{ 
            fontWeight: 'bold', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            lineHeight: 1.2
          }}>
            {eventInfo.event.title}
          </Box>
          {workstationName && (
            <Box sx={{ 
              fontSize: isMobile ? '10px' : '11px', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              lineHeight: 1.1
            }}>
              {workstationName}
            </Box>
          )}
          {!isMobile && eventInfo.event.extendedProps.moNumber && (
            <Box sx={{ 
              fontSize: '10px', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              lineHeight: 1.1
            }}>
              MO: {eventInfo.event.extendedProps.moNumber}
            </Box>
          )}
          {durationText && (
            <Box sx={{ 
              fontSize: isMobile ? '9px' : '10px', 
              opacity: 0.8, 
              whiteSpace: 'nowrap',
              lineHeight: 1.1
            }}>
              {durationText}
            </Box>
          )}
        </Box>
      );
    }
  };

  // Funkcja pomocnicza zwracająca etykietę dla aktualnego widoku Gantta
  const getGanttViewLabel = () => {
    switch (ganttView) {
      case 'resourceTimelineDay':
        return 'Day';
      case 'resourceTimelineWeek':
        return 'Week';
      case 'resourceTimelineMonth':
        return 'Month';
      case 'resourceTimelineYear':
        return 'Year';
      default:
        return 'Month';
    }
  };

  // Efekt inicjalizujący kalendarz przy pierwszym renderowaniu
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      
      // Pobierz aktualny zakres dat widoczny w kalendarzu
      const currentView = calendarApi.view;
      const viewStart = currentView.activeStart;
      const viewEnd = currentView.activeEnd;
      
      console.log('Inicjalizacja kalendarza - zakres dat:', viewStart, viewEnd);
      
      // Sprawdź, czy to widok Gantta
      if (view.startsWith('resourceTimeline')) {
        // Ustaw odpowiedni widok Gantta w zależności od liczby dni
        const diffInDays = Math.ceil((viewEnd - viewStart) / (1000 * 60 * 60 * 24));
        
        let ganttViewToUse = 'resourceTimelineWeek';
        if (diffInDays <= 1) {
          ganttViewToUse = 'resourceTimelineDay';
        } else if (diffInDays <= 7) {
          ganttViewToUse = 'resourceTimelineWeek';
        } else if (diffInDays <= 31) {
          ganttViewToUse = 'resourceTimelineMonth';
        } else {
          ganttViewToUse = 'resourceTimelineYear';
        }
        
        // Zmień widok jeśli potrzeba
        if (ganttViewToUse !== view) {
          setGanttView(ganttViewToUse);
          setView(ganttViewToUse);
          calendarApi.changeView(ganttViewToUse);
        }
      }
      
      // Ręczne wywołanie pobrania zadań
      const fetchInitialTasks = async () => {
        try {
          setLoading(true);
          console.log('Pobieranie początkowych zadań...');
          const startStr = viewStart.toISOString();
          const endStr = viewEnd.toISOString();
          const fetchedTasks = await getTasksByDateRange(startStr, endStr);
          console.log('Pobrano początkowe zadania:', fetchedTasks);
          setTasks(fetchedTasks);
        } catch (error) {
          console.error('Błąd podczas pobierania początkowych zadań:', error);
          showError('Błąd podczas pobierania zadań: ' + error.message);
        } finally {
          setLoading(false);
        }
      };
      
      fetchInitialTasks();
    }
  }, []);
  
  const handleDateRangeMenuClick = (event) => {
    setDateRangeMenuAnchor(event.currentTarget);
  };

  const handleDateRangeMenuClose = () => {
    setDateRangeMenuAnchor(null);
  };

  // Kompletnie przepisana funkcja do zastosowania zakresu dat
  const applyCustomDateRange = () => {
    try {
      // Wyczyść wszystkie tooltipów przed aplikowaniem nowego zakresu dat
      clearAllTooltips();
      
      // Najpierw zamknij menu
      handleDateRangeMenuClose();
      
      // Pokazujemy loader
      setLoading(true);
      
      // Walidacja dat
      if (!startDate || !endDate) {
        showError('Wybierz prawidłowy zakres dat');
        setLoading(false);
        return;
      }
      
      if (startDate.getTime() > endDate.getTime()) {
        showError('Data początkowa nie może być późniejsza niż końcowa');
        setLoading(false);
        return;
      }
      
      // Ustawienie końca dnia dla daty końcowej, aby zawierała cały dzień
      const adjustedEndDate = new Date(endDate.getTime());
      adjustedEndDate.setHours(23, 59, 59, 999);
      
      // Aktualizuj stany dat dla kolejnych zapytań
      setEndDate(adjustedEndDate);
      
      // Oblicz liczbę dni w wybranym zakresie
      const diffInDays = Math.ceil((adjustedEndDate - startDate) / (1000 * 60 * 60 * 24));
      
      // Sprawdź czy nie trzeba dostosować szczegółowości do długości zakresu dat
      let currentGanttDetail = ganttDetail;
      if (ganttDetail === 'hour' && diffInDays > MAX_DAYS_FOR_HOURLY_VIEW) {
        // Automatycznie zmień szczegółowość na dzienną
        currentGanttDetail = 'day';
        setGanttDetail('day');
        
        // Pokaż powiadomienie
        showSuccess(`Automatycznie zmieniono szczegółowość na dzienną, ponieważ wybrany zakres (${diffInDays} dni) przekracza limit ${MAX_DAYS_FOR_HOURLY_VIEW} dni dla widoku godzinowego.`);
      }
      
      // Logging
      console.log("Zastosowanie zakresu dat:", format(startDate, 'dd.MM.yyyy'), "-", format(adjustedEndDate, 'dd.MM.yyyy'));
      console.log("Daty ISO:", startDate.toISOString(), "-", adjustedEndDate.toISOString());
      console.log("Zakres dat zostanie zapisany do cache przeglądarki");
      
      // Najprostsze rozwiązanie - całkowite zniszczenie i odbudowa komponentu
      // bez zależności od wszystkich opcji konfiguracyjnych
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        
        // Aktualny stan
        console.log("Aktualna widoczność kalendarza przed resetem:", 
          calendarApi.view.activeStart, 
          calendarApi.view.activeEnd,
          "Typ widoku:", calendarApi.view.type
        );
        
              // Włącz flagę customDateRange
      setCustomDateRange(true);
      
      // Zapisz zakres dat do cache
      saveDateRangeToCache(true, startDate, adjustedEndDate);
      
      // Oblicz długość trwania w dniach (+1, aby uwzględnić dzień końcowy)
        const durationDays = Math.ceil((adjustedEndDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        console.log("Długość trwania w dniach:", durationDays);
        
        // Wybór odpowiedniego widoku na podstawie wybranej szczegółowości i długości trwania
        let targetView = 'resourceTimelineMonth';
        
        // Respektuj aktualną szczegółowość
        if (currentGanttDetail === 'hour') {
          // Jeśli wybrano szczegółowość godzinową, dla każdego zakresu dat używamy specjalnego widoku
          // Dla większej liczby dni niż 1, używamy widoku tygodniowego z wymuszonym ustawieniem slotDuration na godziny
          targetView = durationDays > 3 ? 'resourceTimelineWeek' : 'resourceTimelineDay';
        } else {
          // Dla innych szczegółowości, wybierz odpowiedni widok na podstawie długości zakresu
          if (durationDays <= 1) {
            targetView = 'resourceTimelineDay';
          } else if (durationDays <= 7) {
            targetView = 'resourceTimelineWeek';
          } else {
            targetView = 'resourceTimelineMonth';
          }
        }
        
        // KOMPLETNY RESET KALENDARZA - znacznie radykalniejsze podejście
        try {
          // 1. Usuń wszystkie wydarzenia
          calendarApi.removeAllEvents();
          
          // 2. Ustaw nowy widok i opcje
          setView(targetView);
          calendarApi.changeView(targetView);
          
          // 3. Ustaw domyślną durationę dla widoku (unikając konfliktu z slotDuration)
          calendarApi.setOption('duration', { days: durationDays });
          
          // 4. KLUCZOWE: Ustaw dokładny zakres dat (visibleRange jest nadrzędny wobec duration)
          calendarApi.setOption('visibleRange', {
            start: startDate,
            end: adjustedEndDate
          });
          
          // 5. Przejdź do daty początkowej
          calendarApi.gotoDate(startDate);
          
          // 6. Jeśli wybrano widok godzinowy, upewnij się że slotDuration jest ustawione na godziny
          if (currentGanttDetail === 'hour') {
            calendarApi.setOption('slotDuration', { hours: 1 });
            // Dla widoku godzinowego z wieloma dniami, ustaw slotLabelFormat aby pokazywał też datę
            if (durationDays > 1) {
              calendarApi.setOption('slotLabelFormat', [
                { day: 'numeric', month: 'short' }, // Pierwszy poziom - data (dzień, miesiąc)
                { hour: '2-digit', minute: '2-digit', hour12: false } // Drugi poziom - godzina
              ]);
            }
          } else {
            calendarApi.setOption('slotDuration', { days: 1 });
          }
          
          // 7. Zaktualizuj widok
          calendarApi.updateSize();
          
          // 8. Pobierz dane dla dokładnego zakresu
          console.log("Pobieranie zadań dla wybranego zakresu:", startDate.toISOString(), "-", adjustedEndDate.toISOString());
          fetchTasks({
            startStr: startDate.toISOString(),
            endStr: adjustedEndDate.toISOString()
          });
          
          // Sprawdź końcowy stan po wszystkich zmianach
          setTimeout(() => {
            if (calendarRef.current) {
              const api = calendarRef.current.getApi();
              console.log("KOŃCOWY stan kalendarza:", 
                api.view.activeStart, 
                api.view.activeEnd,
                "Widok:", api.view.type
              );
            }
            
            // Wyłącz loader
            setLoading(false);
          }, 250);
        } catch (error) {
          console.error("Błąd podczas resetowania kalendarza:", error);
          setLoading(false);
        }
      } else {
        console.error("Brak referencji do kalendarza");
        setLoading(false);
      }
    } catch (error) {
      console.error('Błąd podczas stosowania niestandardowego zakresu dat:', error);
      showError('Wystąpił błąd podczas zmiany zakresu dat: ' + error.message);
      setLoading(false);
    }
  };

  // Modyfikuję handleEventDrop z wymuszonym pełnym odświeżeniem kalendarza
  const handleEventDrop = async (info) => {
    try {
      // Wyczyść wszystkie tooltipów przed operacją
      clearAllTooltips();
      
      setLoading(true);
      const { event } = info;
      const taskId = event.id;
      
      // Zapisz aktualną pozycję suwaka przed operacją
      const currentScrollLeft = calendarRef.current?.getApi().view.el?.querySelector('.fc-scroller-harness')?.scrollLeft || 0;
      
      // Oblicz czas trwania w minutach na podstawie różnicy między datami
      const startTime = new Date(event.start);
      const endTime = new Date(event.end);
      const durationInMinutes = Math.round((endTime - startTime) / (1000 * 60));
      
      // Przygotowanie danych do aktualizacji
      const updateData = {
        scheduledDate: event.start,
        endDate: event.end,
        estimatedDuration: durationInMinutes
      };
      
      console.log(`Zadanie przeciągnięte: ${taskId}`, updateData);
      
      // Aktualizuj stan modifiedTasks - to jest kluczowe dla tooltipów
      setModifiedTasks(prev => ({
        ...prev,
        [taskId]: {
          id: taskId,
          scheduledDate: event.start,
          endDate: event.end,
          estimatedDuration: durationInMinutes,
          lastModified: new Date(),
          // Zachowaj wszystkie inne właściwości z oryginalnego zadania
          ...event.extendedProps.task,
          // Ale upewnij się, że daty i czas trwania są zaktualizowane
          scheduledDate: event.start,
          endDate: event.end
        }
      }));
      
      // Aktualizacja zadania w bazie danych
      await updateTask(taskId, updateData, 'system');
      showSuccess('Zadanie zostało zaktualizowane pomyślnie');
      
      // Delikatne odświeżenie danych bez resetowania pozycji
      const updatedTasks = await getTasksByDateRange(
        calendarRef.current.getApi().view.activeStart.toISOString(),
        calendarRef.current.getApi().view.activeEnd.toISOString()
      );
      setTasks(updatedTasks);
      
      // ZMIENIONE PODEJŚCIE: Delikatne odświeżenie bez resetowania pozycji suwaka
      try {
        if (calendarRef.current) {
          const api = calendarRef.current.getApi();
          
          // Krótka pauza przed refreshem
          setTimeout(() => {
            // Tylko delikatne odświeżenie eventów bez pełnego przeładowania
            api.refetchEvents();
            
            // Przywróć pozycję suwaka po odświeżeniu
            setTimeout(() => {
              const scrollContainer = api.view.el?.querySelector('.fc-scroller-harness');
              if (scrollContainer && currentScrollLeft > 0) {
                scrollContainer.scrollLeft = currentScrollLeft;
              }
            }, 50);
          }, 100);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania kalendarza:', error);
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
      showError('Błąd podczas aktualizacji zadania: ' + error.message);
      info.revert(); // Cofnij zmianę wizualnie
    } finally {
      setLoading(false);
    }
  };

  // Podobnie modyfikuję handleEventResize
  const handleEventResize = async (info) => {
    try {
      // Wyczyść wszystkie tooltipów przed operacją
      clearAllTooltips();
      
      setLoading(true);
      const { event } = info;
      const taskId = event.id;
      const taskData = event.extendedProps.task;
      
      // Zapisz aktualną pozycję suwaka przed operacją
      const currentScrollLeft = calendarRef.current?.getApi().view.el?.querySelector('.fc-scroller-harness')?.scrollLeft || 0;
      
      // Oblicz czas trwania w minutach na podstawie różnicy między datami
      const startTime = new Date(event.start);
      const endTime = new Date(event.end);
      const durationInMinutes = Math.round((endTime - startTime) / (1000 * 60));
    
      // Przygotowanie danych do aktualizacji
      const updateData = {
        endDate: event.end,
        estimatedDuration: durationInMinutes
      };
      
      // Jeśli rozciąganie od początku jest włączone i zmienił się początek wydarzenia
      if (eventResizableFromStart && info.startDelta && (info.startDelta.days !== 0 || info.startDelta.milliseconds !== 0)) {
        updateData.scheduledDate = event.start;
      }
      
      console.log(`Zmieniono rozmiar zadania: ${taskId}`, updateData);
      
      // Aktualizuj stan modifiedTasks - to jest kluczowe dla tooltipów
      setModifiedTasks(prev => ({
        ...prev,
        [taskId]: {
          id: taskId,
          // Zachowaj wszystkie inne właściwości z oryginalnego zadania
          ...event.extendedProps.task,
          // Ale upewnij się, że daty i czas trwania są zaktualizowane
          scheduledDate: updateData.scheduledDate || event.start,
          endDate: event.end,
          estimatedDuration: durationInMinutes,
          lastModified: new Date()
        }
      }));
      
      // Sprawdź czy zadanie jest częścią zamówienia i ma przypisany orderId
      const orderId = taskData.orderId;
      console.log(`Zadanie należy do zamówienia: ${orderId || 'brak'}`);
      
      // Aktualizacja zadania w bazie danych
      await updateTask(taskId, updateData, 'system');
      showSuccess('Czas trwania zadania został zaktualizowany pomyślnie');
      
      // Delikatne odświeżenie danych bez resetowania pozycji
      const updatedTasks = await getTasksByDateRange(
        calendarRef.current.getApi().view.activeStart.toISOString(),
        calendarRef.current.getApi().view.activeEnd.toISOString()
      );
      setTasks(updatedTasks);
      
      // ZMIENIONE PODEJŚCIE: Delikatne odświeżenie bez resetowania pozycji suwaka
      try {
        if (calendarRef.current) {
          const api = calendarRef.current.getApi();
          
          // Krótka pauza przed refreshem
          setTimeout(() => {
            // Tylko delikatne odświeżenie eventów bez pełnego przeładowania
            api.refetchEvents();
            
            // Przywróć pozycję suwaka po odświeżeniu
            setTimeout(() => {
              const scrollContainer = api.view.el?.querySelector('.fc-scroller-harness');
              if (scrollContainer && currentScrollLeft > 0) {
                scrollContainer.scrollLeft = currentScrollLeft;
              }
            }, 50);
          }, 100);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania kalendarza:', error);
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji czasu trwania zadania:', error);
      showError('Błąd podczas aktualizacji zadania: ' + error.message);
      info.revert(); // Cofnij zmianę wizualnie
    } finally {
      setLoading(false);
    }
  };

  // Funkcja pomocnicza określająca, czy zadanie może być edytowane
  const canEditTask = (task) => {
    // Sprawdź czy zadanie ma status, który pozwala na edycję
    // Na przykład, nie pozwalaj na edycję zakończonych lub anulowanych zadań
    return task.status !== 'Zakończone' && task.status !== 'Anulowane';
  };

  // Obsługa kliknięcia w przełącznik edycji
  const handleEditableToggle = (event) => {
    setEditable(event.target.checked);
  };

  // Funkcja do obsługi nawigacji kalendarza (prev, next, today buttons)
  const handleNavigation = (action) => {
    if (calendarRef.current) {
      // Wyczyść wszystkie tooltipów przed nawigacją
      clearAllTooltips();
      
      // Pokazujemy loader
      setLoading(true);
      
      const calendarApi = calendarRef.current.getApi();
      
      // Wykonaj akcję nawigacji
      if (action === 'prev') {
        calendarApi.prev();
      } else if (action === 'next') {
        calendarApi.next();
      } else if (action === 'today') {
        calendarApi.today();
        // Dla "today" resetujemy customDateRange, aby wrócić do normalnego trybu
        setCustomDateRange(false);
      }
      
      // Aktualizuj daty po nawigacji
      setTimeout(() => {
        const viewStart = calendarApi.view.activeStart;
        const viewEnd = calendarApi.view.activeEnd;
        
        // Aktualizuj stan dat
        setStartDate(viewStart);
        setEndDate(viewEnd);
        
        // Jeśli jesteśmy w trybie customDateRange, tymczasowo go wyłącz dla tej nawigacji
        if (customDateRange) {
          console.log('Nawigacja w trybie customDateRange - pobieranie zadań dla nowego zakresu:', viewStart, viewEnd);
          
          // Pobierz zadania dla nowego zakresu bezpośrednio, wymuszając użycie nowych parametrów
          fetchTasks({
            startStr: viewStart.toISOString(),
            endStr: viewEnd.toISOString()
          }, true); // forceParams = true
        } else {
          // Normalny tryb - pobierz zadania dla nowego zakresu
          fetchTasks({
            startStr: viewStart.toISOString(),
            endStr: viewEnd.toISOString()
          });
        }
        
        setLoading(false);
      }, 100);
    }
  };

  // Aktualizacja tytułu kalendarza na podstawie zakresu dat
  const getCalendarTitle = () => {
    if (calendarRef.current) {
      try {
        const calendarApi = calendarRef.current.getApi();
        
        // Dla widoku Gantt, jeśli mamy niestandardowy zakres dat,
        // zwróć formatowany zakres dat zamiast automatycznego tytułu
        if (view.includes('resourceTimeline') && customDateRange) {
          return `${format(startDate, 'd MMMM yyyy', { locale: pl })} – ${format(endDate, 'd MMMM yyyy', { locale: pl })}`;
        }
        
        return calendarApi.view.title;
      } catch (error) {
        console.error('Błąd podczas pobierania tytułu kalendarza:', error);
        return customDateRange 
          ? `${format(startDate, 'dd.MM.yyyy', { locale: pl })} - ${format(endDate, 'dd.MM.yyyy', { locale: pl })}`
          : '31 mar – 6 kwi 2025';
      }
    } else {
      return customDateRange 
        ? `${format(startDate, 'dd.MM.yyyy', { locale: pl })} - ${format(endDate, 'dd.MM.yyyy', { locale: pl })}`
        : '31 mar – 6 kwi 2025';
    }
  };

  // Prostszy efekt do aktualizacji kalendarza po zmianie zakresu dat
  useEffect(() => {
    if (customDateRange && calendarRef.current) {
      try {
        // Pobierz zadania dla wybranego zakresu
        fetchTasks({
          startStr: startDate.toISOString(),
          endStr: endDate.toISOString()
        });
      } catch (error) {
        console.error('Błąd podczas aktualizacji kalendarza:', error);
        showError('Błąd podczas aktualizacji widoku kalendarza: ' + error.message);
      }
    }
  }, [customDateRange]);

  const handleDetailMenuClick = (event) => {
    setDetailMenuAnchor(event.currentTarget);
  };

  const handleDetailMenuClose = () => {
    setDetailMenuAnchor(null);
  };

  const handleGanttDetailChange = (detail) => {
    handleDetailMenuClose();
    
    // Oblicz liczbę dni w aktualnym zakresie dat
    const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Sprawdź czy nie przekroczono maksymalnego zakresu dla widoku godzinowego
    if (detail === 'hour' && diffInDays > MAX_DAYS_FOR_HOURLY_VIEW) {
      // Wyświetl ostrzeżenie
      showError(`Widok godzinowy jest dostępny tylko dla zakresów do ${MAX_DAYS_FOR_HOURLY_VIEW} dni. Wybierz mniejszy zakres dat lub inną szczegółowość.`);
      
      // Jeśli zakres jest zbyt duży, automatycznie ogranicz go
      if (customDateRange) {
        // Oblicz nową datę końcową - MAX_DAYS_FOR_HOURLY_VIEW dni od daty początkowej
        const newEndDate = new Date(startDate);
        newEndDate.setDate(newEndDate.getDate() + MAX_DAYS_FOR_HOURLY_VIEW);
        
        // Zaktualizuj datę końcową
        setEndDate(newEndDate);
        showSuccess(`Automatycznie ograniczono zakres dat do ${MAX_DAYS_FOR_HOURLY_VIEW} dni dla widoku godzinowego.`);
        
        // Flaga do wymuszenia aktualizacji po zmianie daty
        const forceDateUpdate = true;
        
        // Ustaw szczegółowość
        setGanttDetail(detail);
        
        // Zaktualizuj widok kalendarza z nowym zakresem dat
        setTimeout(() => {
          if (calendarRef.current) {
            const api = calendarRef.current.getApi();
            api.setOption('visibleRange', {
              start: startDate,
              end: newEndDate
            });
            
            // Pobierz dane dla nowego zakresu
            fetchTasks({
              startStr: startDate.toISOString(),
              endStr: newEndDate.toISOString()
            });
          }
        }, 100);
        
        return;
      }
    }
    
    // Najpierw tylko ustawiam szczegółowość
    setGanttDetail(detail);
    
    // Używam requestAnimationFrame, aby oddzielić aktualizacje stanu React od manipulacji DOM-em
    requestAnimationFrame(() => {
      if (calendarRef.current) {
        try {
          const calendarApi = calendarRef.current.getApi();
          
          // Dostosuj widok Gantta do wybranej szczegółowości
          let viewToUse = ganttView;
          
          // Aktualizuj widok odpowiednio do wybranej szczegółowości
          if (detail === 'hour') {
            // Dla widoku godzinowego:
            // - jeśli aktualny widok to dzień, pozostaw go
            // - jeśli aktualny widok to miesiąc, zmień na tydzień (bo miesiąc z godzinami byłby nieczytelny)
            // - dla innych przypadków, użyj widoku tygodnia
            if (ganttView === 'resourceTimelineDay') {
              viewToUse = 'resourceTimelineDay';
            } else if (ganttView === 'resourceTimelineMonth') {
              viewToUse = 'resourceTimelineWeek'; // Zmiana z miesiąca na tydzień
            } else {
              viewToUse = 'resourceTimelineWeek';
            }
          } else if (detail === 'day') {
            // Dla widoku dziennego używamy widoku tygodnia lub miesiąca,
            // w zależności od długości wybranego zakresu dat
            const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            if (diffInDays <= 7) {
              viewToUse = 'resourceTimelineWeek';
            } else {
              viewToUse = 'resourceTimelineMonth';
            }
          } else if (detail === 'week') {
            // Dla widoku tygodniowego używamy widoku miesiąca lub roku
            viewToUse = 'resourceTimelineYear';
          }
          
          // Ustaw stan, tylko jeśli widok się zmienił
          if (viewToUse !== view) {
            setGanttView(viewToUse);
            setView(viewToUse);
            
            // Oddzielamy aktualizację widoku od aktualizacji stanu
            // Używamy setTimeout z większym opóźnieniem, aby dać czas React na zakończenie renderowania
            setTimeout(() => {
              try {
                if (!calendarRef.current) return;
                const api = calendarRef.current.getApi();
                
                // Najpierw zmieniamy widok
                api.changeView(viewToUse);
                api.updateSize();
                
                // Następnie pobieramy zadania
                setTimeout(() => {
                  if (!calendarRef.current) return;
                  const updatedApi = calendarRef.current.getApi();
                  fetchTasks({
                    startStr: updatedApi.view.activeStart.toISOString(),
                    endStr: updatedApi.view.activeEnd.toISOString()
                  });
                }, 50);
              } catch (error) {
                console.error('Błąd podczas zmiany szczegółowości widoku:', error);
                showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
              }
            }, 100);
          }
        } catch (error) {
          console.error('Błąd podczas zmiany szczegółowości widoku:', error);
          showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
        }
      }
    });
  };

  // Funkcja do przełączania grupowania Gantta
  const handleGanttGroupByChange = () => {
    // Wyczyść wszystkie tooltipów przed zmianą grupowania
    clearAllTooltips();
    
    // Przełącz między 'workstation' a 'order'
    const newGroupBy = ganttGroupBy === 'workstation' ? 'order' : 'workstation';
    
    // Zapisz aktualną pozycję suwaka przed operacją
    const currentScrollLeft = calendarRef.current?.getApi().view.el?.querySelector('.fc-scroller-harness')?.scrollLeft || 0;
    
    setGanttGroupBy(newGroupBy);
    
    // Odśwież widok kalendarza, jeśli jest to widok Gantta
    if (view.includes('resourceTimeline') && calendarRef.current) {
      // Użyj setTimeout dla lepszego timing'u aktualizacji
      setTimeout(() => {
        try {
          const calendarApi = calendarRef.current.getApi();
          
          // Odśwież zasoby i wydarzenia
          calendarApi.refetchResources();
          calendarApi.refetchEvents();
          
          // Wymuś aktualizację rozmiaru dla lepszego layoutu
          calendarApi.updateSize();
          
          // Przywróć pozycję suwaka po aktualizacji
          setTimeout(() => {
            const scrollContainer = calendarApi.view.el?.querySelector('.fc-scroller-harness');
            if (scrollContainer && currentScrollLeft > 0) {
              scrollContainer.scrollLeft = currentScrollLeft;
            }
          }, 100);
          
        } catch (error) {
          console.error('Błąd podczas odświeżania zasobów po zmianie grupowania:', error);
        }
      }, 50);
    }
  };

  // Funkcje do obsługi skali wykresu Gantta
  const handleScaleChange = (newScale) => {
    setScaleLevel(newScale);
    
    // Jeśli aktualnie jesteśmy w widoku Gantta, odśwież kalendarz
    if (view.includes('resourceTimeline') && calendarRef.current) {
      setTimeout(() => {
        try {
          const calendarApi = calendarRef.current.getApi();
          calendarApi.updateSize();
        } catch (error) {
          console.error('Błąd podczas aktualizacji rozmiaru kalendarza:', error);
        }
      }, 100);
    }
  };

  const getScaledSlotWidth = (baseWidth) => {
    // Zmniejszamy bazową szerokość kolumn o 30% dla bardziej kompaktowego widoku
    return Math.max(15, Math.floor(baseWidth * scaleLevel * 0.7));
  };

  // Funkcja dostosowująca widok kalendarza do długiego zakresu dat
  const adjustViewForDateRange = (rangeStartDate, rangeEndDate) => {
    if (!calendarRef.current) return;
    
    try {
      const diffInDays = Math.ceil((rangeEndDate - rangeStartDate) / (1000 * 60 * 60 * 24));
      let viewToUse = view;
      
      // Wybierz odpowiedni widok na podstawie różnicy w dniach
      if (diffInDays <= 1) {
        viewToUse = 'resourceTimelineDay';
      } else if (diffInDays <= 7) {
        viewToUse = 'resourceTimelineWeek';
      } else {
        viewToUse = 'resourceTimelineMonth'; // Używamy widoku miesięcznego nawet dla dłuższych okresów
      }
      
      // Jeśli widok się zmienił, zaktualizuj stan i widok kalendarza
      if (viewToUse !== view) {
        setGanttView(viewToUse);
        setView(viewToUse);
        
        setTimeout(() => {
          try {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.changeView(viewToUse);
            
            // Ustaw dokładny zakres dat dla widoku - to jest kluczowe dla pokazania całego zakresu
            calendarApi.setOption('visibleRange', {
              start: rangeStartDate,
              end: rangeEndDate
            });
            
            // Dla widoków z dłuższymi zakresami, dostosuj szerokość slotu - bardziej kompaktowe wartości
            if (diffInDays > 31) {
              calendarApi.setOption('slotMinWidth', Math.max(20, Math.min(50, Math.floor(800 / diffInDays))));
            }
            
            // Wymuś renderowanie kalendarza
            calendarApi.updateSize();
            calendarApi.render();
          } catch (error) {
            console.error('Błąd podczas zmiany widoku kalendarza:', error);
          }
        }, 0);
      } else {
        // Nawet jeśli widok się nie zmienił, upewnij się, że zakres dat jest poprawnie ustawiony
        setTimeout(() => {
          try {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.setOption('visibleRange', {
              start: rangeStartDate,
              end: rangeEndDate
            });
            
            // Wymuś renderowanie kalendarza
            calendarApi.updateSize();
            calendarApi.render();
          } catch (error) {
            console.error('Błąd podczas ustawiania zakresu dat:', error);
          }
        }, 0);
      }
    } catch (error) {
      console.error('Błąd podczas dostosowywania widoku do zakresu dat:', error);
    }
  };

  // Funkcja do określania koloru stanowiska
  const getWorkstationColor = (workstationId) => {
    // Znajdź stanowisko o podanym ID
    const workstation = workstations.find(w => w.id === workstationId);
    
    // Jeśli znaleziono stanowisko i ma określony kolor, użyj go
    if (workstation && workstation.color) {
      return workstation.color;
    }
    
    // Domyślne kolory dla stanowisk, jeśli nie mają określonego koloru
    const defaultColors = {
      'WCT00003': '#2196f3', // Powder
      'WCT00006': '#4caf50', // Pills
      'WCT00009': '#f50057', // Contract Line
      'WCT00012': '#ff9800', // Filling
      'WCT00015': '#9c27b0'  // Packaging
    };
    
    // Jeśli istnieje domyślny kolor dla danego stanowiska, użyj go
    if (defaultColors[workstationId]) {
      return defaultColors[workstationId];
    }
    
    // Domyślny kolor, jeśli nie znaleziono żadnego dopasowania
    return '#7986cb';
  };
  
  // Funkcja do określania koloru tekstu na podstawie koloru tła
  const getContrastYIQ = (hexcolor) => {
    // Usuń # z początku kodu koloru, jeśli istnieje
    hexcolor = hexcolor.replace('#', '');
    
    // Konwertuj 3-cyfrowy kod koloru na 6-cyfrowy
    if (hexcolor.length === 3) {
      hexcolor = hexcolor[0] + hexcolor[0] + hexcolor[1] + hexcolor[1] + hexcolor[2] + hexcolor[2];
    }
    
    // Konwertuj kolor hex na RGB
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    
    // Oblicz jasność koloru używając YIQ
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // Zwróć biały dla ciemnych kolorów, czarny dla jasnych
    return (yiq >= 128) ? '#000000' : '#ffffff';
  };

  // Dodajemy nową funkcję do bezpiecznego resetowania i ponownego inicjalizacji kalendarza
  const resetCalendar = () => {
    try {
      // Reset wszystkich stanów do wartości domyślnych
      setView('dayGridMonth');
      setGanttView('resourceTimelineWeek');
      setCustomDateRange(false);
      const newStartDate = startOfMonth(new Date());
      const newEndDate = endOfMonth(new Date());
      setStartDate(newStartDate);
      setEndDate(newEndDate);
      
      // Zapisz reset do cache
      saveDateRangeToCache(false, newStartDate, newEndDate);
      setUseWorkstationColors(false);
      setEditable(true);
      setGanttDetail('day');
      setGanttGroupBy('workstation');
      setScaleLevel(1); // Resetuj skalę do normalnej
      
      // Resetuj także wybrane stanowiska do wszystkich
      const allSelected = {};
      workstations.forEach(ws => {
        allSelected[ws.id] = true;
      });
      setSelectedWorkstations(allSelected);
      
      // NOWE: Resetuj także wybrane klientów do wszystkich
      const allSelectedCustomers = {};
      customers.forEach(customer => {
        allSelectedCustomers[customer.id] = true;
      });
      allSelectedCustomers['no-customer'] = true;
      setSelectedCustomers(allSelectedCustomers);
      
      // Jeśli mamy kalendarz, zresetuj widok
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.changeView('dayGridMonth');
        calendarApi.today();
      }
      
      showSuccess('Kalendarz został zresetowany do ustawień domyślnych');
    } catch (error) {
      console.error('Błąd podczas resetowania kalendarza:', error);
      showError('Wystąpił błąd podczas resetowania kalendarza');
    }
  };

  // Function to toggle options visibility
  const toggleOptions = () => {
    setOptionsExpanded(!optionsExpanded);
  };

  // Function to toggle legend visibility
  const toggleLegend = () => {
    setLegendExpanded(!legendExpanded);
  };

  // Funkcja do przełączania widoczności legendy
  const toggleLegendVisibility = () => {
    setShowLegend(!showLegend);
  };

  // Dodaj czyszczenie tooltipów po odmontowaniu komponentu
  useEffect(() => {
    return () => {
      clearAllTooltips();
    };
  }, [clearAllTooltips]);

  // Memoizacja kalendarza - unikamy zbędnych przeliczeń
  const memoizedCalendarEvents = useMemo(() => getCalendarEvents(), [tasks, ganttGroupBy, useWorkstationColors, workstations, modifiedTasks, selectedCustomers]);
  
  // Memoizacja zasobów dla widoku Gantt
  const memoizedResources = useMemo(() => getResources(), [workstations, selectedWorkstations, ganttGroupBy, tasks]);

  // Funkcja do ręcznego odświeżania cache'u
  const refreshCache = useCallback(() => {
    console.log('Ręczne odświeżanie cache zadań');
    
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      const currentView = calendarApi.view;
      
      // Pobierz aktualny zakres dat z widoku kalendarza
      fetchTasks({
        startStr: currentView.activeStart.toISOString(),
        endStr: currentView.activeEnd.toISOString()
      });
    }
  }, []);

  // Efekt do dynamicznego ustawiania atrybutu data-group-by dla stylowania CSS
  useEffect(() => {
    if (calendarRef.current && view.startsWith('resourceTimeline')) {
      const calendarEl = calendarRef.current.getApi().el;
      if (calendarEl) {
        // Znajdź element resource-timeline
        const resourceTimelineEl = calendarEl.querySelector('.fc-resource-timeline');
        if (resourceTimelineEl) {
          resourceTimelineEl.setAttribute('data-group-by', ganttGroupBy);
        }
      }
    }
  }, [ganttGroupBy, view]);

  // Funkcja obsługująca generowanie raportu Gantta
  const handleGenerateGanttReport = async () => {
    try {
      // Sprawdź czy są dostępne dane
      if (!tasks || tasks.length === 0) {
        showError('Brak zadań do wygenerowania raportu. Załaduj dane kalendarza.');
        return;
      }

      if (!workstations || workstations.length === 0) {
        showError('Brak danych o stanowiskach. Odśwież stronę i spróbuj ponownie.');
        return;
      }

      showSuccess('Rozpoczynanie generowania raportu Gantta...');
      
      // Użyj aktualnego zakresu dat lub domyślnego
      const reportStartDate = customDateRange ? startDate : (calendarRef.current ? calendarRef.current.getApi().view.activeStart : startDate);
      const reportEndDate = customDateRange ? endDate : (calendarRef.current ? calendarRef.current.getApi().view.activeEnd : endDate);

      // Wywołaj funkcję generowania raportu
      await generateGanttReport(
        tasks,
        workstations,
        customers,
        reportStartDate,
        reportEndDate,
        ganttGroupBy
      );

      showSuccess('Raport Gantta został pomyślnie wygenerowany i pobrany!');
      
    } catch (error) {
      console.error('Błąd podczas generowania raportu Gantta:', error);
      showError('Wystąpił błąd podczas generowania raportu: ' + error.message);
    }
  };

  return (
    <Paper sx={{ 
      p: isMobile ? 1 : 2, 
      height: 'calc(100vh - 80px)', 
      display: 'flex', 
      flexDirection: 'column', 
      maxWidth: '100%',
      overflow: 'hidden'
    }}>
      {/* Nagłówek kalendarza */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: isMobile ? 1 : 2,
        flexWrap: 'wrap'
      }}>
        <Typography 
          variant={isMobile ? "subtitle1" : "h6"} 
          sx={{ 
            display: 'flex', 
            alignItems: 'center',
            fontSize: isMobile ? '1.1rem' : '1.25rem',
            mb: isMobile ? 1 : 0
          }}
        >
          <CalendarIcon sx={{ mr: 1, fontSize: isMobile ? '1.2rem' : '1.5rem' }} />
          Kalendarz produkcji
          
          {/* Wyświetlanie statystyk wydajności */}
          {loadingStats.lastLoadTime > 0 && (
            <Chip
              label={`${loadingStats.tasksCount} zadań | ${loadingStats.lastLoadTime.toFixed(0)}ms | ${loadingStats.queryMethod}`}
              size="small"
              color={loadingStats.queryMethod === 'optymalizowana' ? 'success' : 'default'}
              sx={{ 
                ml: 2, 
                fontSize: '0.7rem',
                height: 24,
                display: isMobile ? 'none' : 'flex'
              }}
            />
          )}
        </Typography>
        
        {/* Toggle button for options - only on mobile */}
        {isMobile && (
          <IconButton 
            size="small" 
            onClick={toggleOptions} 
            sx={{ ml: 'auto' }}
            aria-label="Opcje kalendarza"
          >
            <SettingsIcon />
            {optionsExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>
      
      {/* Pasek narzędziowy - podzielony na logiczne sekcje */}
      <Collapse in={!isMobile || optionsExpanded}>
        <Box sx={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: isMobile ? 0.5 : 0.75, 
          mb: isMobile ? 0.5 : 1, 
          pb: isMobile ? 0.5 : 1, 
          borderBottom: '1px solid #e0e0e0',
          justifyContent: isMobile ? 'center' : 'space-between'
        }}>
          {/* Grupa 1: Nawigacja i zakres dat */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5,
            mb: isMobile ? 0.5 : 0,
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'center' : 'flex-start'
          }}>
            <Button 
              variant="outlined" 
              size="small" 
              onClick={() => handleNavigation('prev')}
              sx={{ minWidth: 28, height: 32, px: isMobile ? 0.5 : 1, fontSize: '0.75rem' }}
            >
              &lt;
            </Button>
            <Button 
              variant="outlined" 
              size="small" 
              onClick={() => handleNavigation('next')}
              sx={{ minWidth: 28, height: 32, px: isMobile ? 0.5 : 1, fontSize: '0.75rem' }}
            >
              &gt;
            </Button>
            <Button 
              variant="contained" 
              size="small" 
              onClick={() => handleNavigation('today')}
              sx={{ mx: 0.5, height: 32, px: isMobile ? 1 : 1.5, fontSize: '0.75rem' }}
            >
              Dziś
            </Button>
            
            <Button
              variant="outlined"
              onClick={handleDateRangeMenuClick}
              sx={{ 
                height: 32, 
                fontSize: '0.75rem',
                px: isMobile ? 0.75 : 1.5
              }}
              startIcon={<CalendarIcon sx={{ fontSize: '1rem' }} />}
              size="small"
            >
              {isMobile ? 'Zakres' : (customDateRange 
                ? `${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`
                : 'Wybierz zakres dat')}
            </Button>
          </Box>

          {/* Grupa 2: Zmiana widoku */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5,
            mb: isMobile ? 0.5 : 0,
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'center' : 'flex-start'
          }}>
            <Typography 
              variant="caption" 
              sx={{ 
                mr: 0.5, 
                display: isMobile ? 'none' : 'block',
                fontSize: '0.7rem'
              }}
            >
              Widok:
            </Typography>
            <ToggleButtonGroup
              value={view.includes('resourceTimeline') ? 'gantt' : view}
              exclusive
              onChange={handleViewChange}
              aria-label="widok kalendarza"
              size="small"
              sx={{ height: 32 }}
            >
              <ToggleButton value="timeGridDay" aria-label="dzień" sx={{ px: isMobile ? 0.5 : 1, minWidth: 32 }}>
                <Tooltip title="Dzień">
                  <DayIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="timeGridWeek" aria-label="tydzień" sx={{ px: isMobile ? 0.5 : 1, minWidth: 32 }}>
                <Tooltip title="Tydzień">
                  <WeekIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="dayGridMonth" aria-label="miesiąc" sx={{ px: isMobile ? 0.5 : 1, minWidth: 32 }}>
                <Tooltip title="Miesiąc">
                  <MonthIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton 
                value="gantt" 
                aria-label="gantt"
                onClick={handleGanttMenuClick}
                sx={{ px: isMobile ? 0.5 : 1, minWidth: 40 }}
              >
                <Tooltip title="Wykres Gantta">
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <GanttIcon fontSize="small" />
                    <ArrowDropDownIcon fontSize="small" />
                  </Box>
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Grupa 3: Filtry i opcje */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            flexWrap: 'wrap', 
            gap: 0.5,
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'center' : 'flex-start'
          }}>
            {!isMobile && (
              <FormControlLabel
                control={
                  <Switch
                    checked={useWorkstationColors}
                    onChange={(e) => setUseWorkstationColors(e.target.checked)}
                    color="primary"
                    size="small"
                  />
                }
                label={<Typography variant="caption" sx={{ fontSize: '0.7rem' }}>Kolory stanowisk</Typography>}
                sx={{ mr: 0.5 }}
              />
            )}

            {isMobile && (
              <Button
                variant="outlined"
                size="small"
                onClick={(e) => setUseWorkstationColors(!useWorkstationColors)}
                sx={{ height: 32, fontSize: '0.7rem', px: 1 }}
              >
                {useWorkstationColors ? 'Stanowiska' : 'Status'}
              </Button>
            )}
            
            {/* Przycisk do pokazywania/ukrywania legendy - tylko dla widoków Gantta */}
            {view.includes('resourceTimeline') && (
              <Tooltip title={showLegend ? "Ukryj legendę" : "Pokaż legendę"}>
                <IconButton 
                  size="small" 
                  onClick={toggleLegendVisibility}
                  color={showLegend ? "primary" : "default"}
                  sx={{ width: 32, height: 32 }}
                >
                  {showLegend ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            )}
            
            {view.startsWith('resourceTimeline') && (
              <Button
                variant="outlined"
                onClick={handleDetailMenuClick}
                sx={{ 
                  height: 32, 
                  fontSize: '0.7rem',
                  px: isMobile ? 0.75 : 1
                }}
                size="small"
              >
                {isMobile ? 'Szczeg.' : 'Szczegółowość'}: {ganttDetail === 'hour' ? 'Godz.' : ganttDetail === 'day' ? 'Dzień' : 'Tydz.'}
              </Button>
            )}
          
            {/* Przycisk przełączający tryb widoku Gantt */}
            {view.includes('resourceTimeline') && (
              <Button
                variant="outlined"
                size="small"
                sx={{ 
                  height: 32, 
                  fontSize: '0.7rem',
                  px: isMobile ? 0.75 : 1
                }}
                onClick={handleGanttGroupByChange}
                startIcon={ganttGroupBy === 'workstation' ? <BusinessIcon fontSize="small" /> : <WorkIcon fontSize="small" />}
              >
                {isMobile ? (ganttGroupBy === 'workstation' ? 'Stanow.' : 'Zamów.') : (ganttGroupBy === 'workstation' ? 'Stanowiska' : 'Zamówienia')}
              </Button>
            )}

            {/* Kontrolki skali dla widoku Gantta */}
            {view.includes('resourceTimeline') && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title="Skala kompaktowa">
                  <Button
                    variant={scaleLevel === 0.7 ? "contained" : "outlined"}
                    size="small"
                    sx={{ minWidth: 32, height: 32, p: 0 }}
                    onClick={() => handleScaleChange(0.7)}
                  >
                    <ZoomOutIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Skala normalna">
                  <Button
                    variant={scaleLevel === 1 ? "contained" : "outlined"}
                    size="small"
                    sx={{ minWidth: 32, height: 32, p: 0 }}
                    onClick={() => handleScaleChange(1)}
                  >
                    <ZoomNormalIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Skala powiększona">
                  <Button
                    variant={scaleLevel === 1.3 ? "contained" : "outlined"}
                    size="small"
                    sx={{ minWidth: 32, height: 32, p: 0 }}
                    onClick={() => handleScaleChange(1.3)}
                  >
                    <ZoomInIcon fontSize="small" />
                  </Button>
                </Tooltip>
              </Box>
            )}
            
            {/* NOWE: Przycisk filtrów klientów */}
            <Tooltip title="Filtruj według klientów">
              <Button
                variant="outlined"
                size="small"
                sx={{ 
                  height: 32, 
                  fontSize: '0.7rem',
                  px: isMobile ? 0.75 : 1
                }}
                onClick={handleCustomerMenuClick}
                startIcon={<PeopleIcon fontSize="small" />}
              >
                {isMobile ? 'Klienci' : 'Filtruj klientów'}
              </Button>
            </Tooltip>
            
            {/* Przycisk do generowania raportu Gantta XLSX */}
            {view.includes('resourceTimeline') && (
              <Tooltip title="Eksportuj harmonogram do pliku Excel (XLSX)">
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ 
                    height: 32, 
                    fontSize: '0.7rem',
                    px: isMobile ? 0.75 : 1
                  }}
                  onClick={handleGenerateGanttReport}
                  startIcon={<FileDownloadIcon fontSize="small" />}
                  disabled={!tasks || tasks.length === 0}
                >
                  {isMobile ? 'XLSX' : 'Eksportuj Gantt'}
                </Button>
              </Tooltip>
            )}
            
            {/* Toggle optymalizacji zapytań */}
            <Tooltip title={`Optymalizacja zapytań: ${useOptimizedQueries ? 'Włączona' : 'Wyłączona'}`}>
              <Button
                variant={useOptimizedQueries ? "contained" : "outlined"}
                size="small"
                color={useOptimizedQueries ? "success" : "default"}
                sx={{ 
                  height: 32, 
                  fontSize: '0.7rem',
                  px: isMobile ? 0.75 : 1,
                  minWidth: isMobile ? 40 : 80
                }}
                onClick={() => {
                  setUseOptimizedQueries(!useOptimizedQueries);
                  // Wyczyść cache gdy zmieniamy metodę
                  setTasksCache({});
                  // Pobierz dane ponownie
                  if (calendarRef.current) {
                    const calendarApi = calendarRef.current.getApi();
                    const currentView = calendarApi.view;
                    fetchTasks({
                      startStr: currentView.activeStart.toISOString(),
                      endStr: currentView.activeEnd.toISOString()
                    });
                  }
                }}
                startIcon={useOptimizedQueries ? <SpeedIcon fontSize="small" /> : <WarningIcon fontSize="small" />}
              >
                {isMobile ? 'OPT' : (useOptimizedQueries ? 'Szybkie' : 'Standardowe')}
              </Button>
            </Tooltip>
          </Box>
        </Box>
      </Collapse>
      
      {/* Przycisk toggle legendy dla urządzeń mobilnych */}
      {isMobile && showLegend && view.includes('resourceTimeline') && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          mb: 0.5 
        }}>
          <Button 
            size="small" 
            onClick={toggleLegend}
            endIcon={legendExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            sx={{ fontSize: '0.7rem', height: 28, px: 1 }}
          >
            Legenda
          </Button>
        </Box>
      )}
      
      {/* Legenda statusów - dostępna tylko dla widoków Gantta */}
      <Collapse in={showLegend && view.includes('resourceTimeline') && ((!isMobile) || (isMobile && legendExpanded))}>
        <Box 
          sx={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: isMobile ? 0.5 : 0.75, 
            mb: isMobile ? 0.5 : 1,
            justifyContent: isMobile ? 'center' : 'flex-start',
            alignItems: 'center'
          }}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              mr: 0.5, 
              display: isMobile ? 'none' : 'block',
              fontSize: '0.7rem',
              fontWeight: 'medium'
            }}
          >
            {useWorkstationColors ? 'Legenda stanowisk:' : 'Legenda statusów:'}
          </Typography>
          
          {useWorkstationColors ? (
            // Legenda dla kolorów stanowisk
            workstations.map(workstation => (
              <Chip 
                key={workstation.id}
                size="small"
                label={workstation.name} 
                sx={{ 
                  bgcolor: workstation.color || getWorkstationColor(workstation.id), 
                  color: getContrastYIQ(workstation.color || getWorkstationColor(workstation.id)), 
                  fontSize: '0.65rem',
                  height: 24,
                  '& .MuiChip-label': {
                    px: 1
                  }
                }} 
              />
            ))
          ) : (
            // Legenda dla statusów
            <>
              <Chip 
                size="small"
                label="Zaplanowane" 
                sx={{ 
                  bgcolor: '#3788d8', 
                  color: 'white', 
                  fontSize: '0.65rem',
                  height: 24,
                  '& .MuiChip-label': { px: 1 }
                }} 
              />
              <Chip 
                size="small"
                label="W trakcie" 
                sx={{ 
                  bgcolor: '#f39c12', 
                  color: 'white', 
                  fontSize: '0.65rem',
                  height: 24,
                  '& .MuiChip-label': { px: 1 }
                }} 
              />
              <Chip 
                size="small"
                label="Zakończone" 
                sx={{ 
                  bgcolor: '#2ecc71', 
                  color: 'white', 
                  fontSize: '0.65rem',
                  height: 24,
                  '& .MuiChip-label': { px: 1 }
                }} 
              />
              <Chip 
                size="small"
                label="Anulowane" 
                sx={{ 
                  bgcolor: '#e74c3c', 
                  color: 'white', 
                  fontSize: '0.65rem',
                  height: 24,
                  '& .MuiChip-label': { px: 1 }
                }} 
              />
              <Chip 
                size="small"
                label="Wstrzymane" 
                sx={{ 
                  bgcolor: '#757575', 
                  color: 'white', 
                  fontSize: '0.65rem',
                  height: 24,
                  '& .MuiChip-label': { px: 1 }
                }} 
              />
            </>
          )}
        </Box>
      </Collapse>
      
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, bgcolor: 'rgba(255,255,255,0.7)' }}>
          <CircularProgress />
        </Box>
      )}
      
      <Box sx={{ 
        flex: '1 1 auto', 
        position: 'relative', 
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {getCalendarTitle()}
          </Typography>
        </Box>
        <style>
          {`
            .fc-scrollgrid-section-header {
              background-color: inherit !important;
            }
            .fc-theme-standard th {
              background-color: inherit !important;
            }
            .fc .fc-view-harness {
              background-color: inherit !important;
              height: 100% !important;
            }
            .fc-view-harness-active {
              height: 100% !important;
            }
            .fc-scroller {
              overflow: auto !important;
            }
            .fc-resource-timeline-divider {
              width: 3px !important;
            }
            .fc-resource-timeline .fc-resource-group {
              font-weight: bold;
            }
            .fc-resource-area {
              width: 25% !important;
            }
            .fc-timeline-slot {
              min-width: 80px;
            }
            .fc-resource-timeline-divider tbody .fc-cell-shaded {
              background: #f5f5f5;
            }
            .fc-timeline-event {
              border-radius: 3px;
              padding: 2px 4px;
              font-size: 13px;
            }
            .fc-resource-timeline-header-cell {
              font-weight: bold;
            }
            .fc-daygrid-day-number {
              font-weight: bold;
            }
            .fc-col-header-cell {
              background-color: #f9f9f9 !important;
            }
            .fc-timeline-header .fc-cell-shaded {
              background: #f9f9f9;
            }
            .fc-timeline-lane-frame {
              border-bottom: 1px solid #ddd;
            }
            .fc-timeline-slot-label {
              text-transform: capitalize;
            }
            .fc-timeline-slot-label-frame {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .fc-timeline-slot-label-cushion {
              font-weight: bold;
            }
            
            /* Style dla różnych poziomów szczegółowości */
            .fc-resourceTimelineDay-view .fc-timeline-slot-label-frame {
              padding: 2px 0;
            }
            
            .fc-resourceTimelineWeek-view .fc-timeline-slot-label-frame,
            .fc-resourceTimelineMonth-view .fc-timeline-slot-label-frame {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 4px 0;
            }
            
            .fc-resourceTimelineYear-view .fc-timeline-slot-label-frame {
              padding: 4px 0;
            }
            
            /* Usunięcie duplikowanych nagłówków kolumn/sekcji */
            .fc-col-header, .fc-scrollgrid-section-header th[role="columnheader"] {
              display: none;
            }
            
            /* Wyjątek dla pierwszego nagłówka */
            .fc-col-header-cell:first-child, 
            .fc-scrollgrid-section-header th[role="columnheader"]:first-child {
              display: table-cell;
            }
            
            /* Zwiększenie szerokości dla kolumn dnia */
            .fc-resourceTimelineMonth-view .fc-timeline-slot {
              min-width: 60px !important;
            }
            
            /* Style dla widoku godzinowego */
            .fc-resourceTimelineDay-view .fc-timeline-slot {
              min-width: 80px !important;
            }

            .fc-resourceTimelineDay-view .fc-timeline-slot-label-cushion {
              font-size: 12px;
            }
            
            .fc-day-sat .fc-timeline-slot-label-frame,
            .fc-day-sun .fc-timeline-slot-label-frame {
              background-color: #f5f5f5;
            }
            .fc-timeline-slot-frame {
              border-right: 1px solid #ddd;
            }
            .fc-day-today {
              background: rgba(33, 150, 243, 0.05) !important;
            }
            .fc-day-today .fc-daygrid-day-number {
              color: #2196f3;
              font-weight: bold;
            }
            .fc-timegrid-now-indicator-line {
              border-color: #f44336;
            }
            .fc-timegrid-now-indicator-arrow {
              border-color: #f44336;
              color: #f44336;
            }
            .fc-event {
              cursor: pointer;
            }
            .fc-event.task-completed {
              opacity: 0.7;
              cursor: default;
            }
            .fc-event-resizer {
              display: block;
              width: 8px;
              height: 8px;
            }
            .fc-event-resizer-start {
              left: -4px;
            }
            .fc-event-resizer-end {
              right: -4px;
            }
            .fc-timeline-event .fc-event-resizer {
              top: 0;
              bottom: 0;
              width: 8px;
              height: 100%;
            }
            .fc-timeline-event .fc-event-resizer-start {
              left: -4px;
              cursor: w-resize;
            }
            .fc-timeline-event .fc-event-resizer-end {
              right: -4px;
              cursor: e-resize;
            }
            /* Dostosowania dla widoku z wieloma miesiącami */
            .fc-resource-timeline-divider {
              width: 3px !important;
            }
            
            .fc-col-header-cell {
              text-align: center;
            }
            
            .fc-timeline-slot-frame {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 40px;
            }
            
            .fc-scrollgrid-section-header {
              z-index: 10;
            }
            
            .fc-timeline-slot-cushion {
              text-align: center;
              width: 100%;
            }
            
            /* Dodatkowe style dla nagłówków kolumn */
            .fc-timeline-slot.fc-day-sun .fc-timeline-slot-frame,
            .fc-timeline-slot.fc-day-sat .fc-timeline-slot-frame {
              background-color: rgba(0,0,0,0.03);
            }
            
            /* Oznaczenie pierwszego dnia miesiąca */
            .fc-timeline-slot.fc-day-1 .fc-timeline-slot-frame {
              border-left: 2px solid #2196f3;
              background-color: rgba(33, 150, 243, 0.05);
            }
            
            /* Zwiększenie kontrastu między komórkami */
            .fc-timeline-slot {
              border-right: 1px solid #ddd;
            }
            
            /* Poprawka dla nagłówków miesiąca */
            .fc-timeline-slot.fc-day-1 .fc-timeline-slot-cushion,
            .fc-timeline-slot:first-child .fc-timeline-slot-cushion {
              font-weight: bold;
              color: #2196f3;
            }
          `}
        </style>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, resourceTimelinePlugin]}
          initialView={view}
          headerToolbar={false}
          events={memoizedCalendarEvents}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          selectable={true}
          datesSet={(dateInfo) => {
            console.log("datesSet wywołany:", dateInfo.start, dateInfo.end, "isCustomDateRange:", customDateRange);
            if (!customDateRange) {
              handleDatesSet(dateInfo);
            } else {
              console.log("Ignoruję automatyczną zmianę zakresu - używam customDateRange");
            }
          }}
          locale={plLocale}
          height="100%"
          allDaySlot={true}
          slotMinTime="00:00:00"
          slotMaxTime="23:59:59"
          slotDuration={ganttDetail === 'hour' || view === 'resourceTimelineDay' ? { hours: 1 } : { days: 1 }}
          businessHours={{
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Wszystkie dni tygodnia (0=niedziela, 6=sobota)
            startTime: '00:00',
            endTime: '23:59',
          }}
          weekends={true}
          selectConstraint={false} // Umożliwia zaznaczanie w weekendy
          eventConstraint={false} // Umożliwia przenoszenie wydarzeń w weekendy  
          businessHoursOnly={false} // Wyłącza ograniczenia do godzin roboczych
          nowIndicator={true}
          schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
          resourceAreaWidth={isMobile ? '60px' : (view.startsWith('resourceTimeline') ? '10%' : '8%')}
          editable={editable}
          eventDurationEditable={editable}
          eventStartEditable={editable}
          eventResourceEditable={false}
          eventResizableFromStart={eventResizableFromStart}
          droppable={editable}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventOverlap={true}
          slotEventOverlap={true}
          eventOrderStrict={false}
          snapDuration={ganttDetail === 'hour' ? "00:15:00" : "01:00:00"}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          themeName="standard"
          eventBorderColor="transparent"
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          resourceAreaHeaderContent={ganttGroupBy === 'workstation' ? 'Workstation' : 'CO'}
          resourcesInitiallyExpanded={true}
          stickyHeaderDates={true}
          stickyResourceAreaHeaderContent={true}
          expandRows={false}
          visibleRange={customDateRange ? {
            start: startDate,
            end: endDate
          } : null}
          duration={customDateRange ? {
            days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
          } : undefined}
          fixedWeekCount={false}
          navLinks={false}
          slotMinWidth={getScaledSlotWidth(customDateRange && (endDate - startDate) / (1000 * 60 * 60 * 24) > 31 ? 25 : 35)}
          resources={memoizedResources}
          eventContent={renderEventContent}
          dayMaxEvents={isMobile ? 2 : true}
          eventDidMount={(info) => {
            if (info.event.extendedProps.status === 'Completed') {
              info.el.style.opacity = '0.7';
            }
            
            // NOWE: Dodaj style dla lepszego wyrównania pionowego w widoku Gantta
            if (view.startsWith('resourceTimeline')) {
              // Ustaw event jako blokowy element dla lepszego układania
              info.el.style.display = 'block';
              info.el.style.position = 'relative';
              info.el.style.verticalAlign = 'top';
              info.el.style.marginBottom = '2px';
              
              // Zapewnij, że event nie ma stałej pozycji top
              info.el.style.top = 'auto';
              
              // Dodaj klasę dla identyfikacji
              info.el.classList.add('gantt-event');
              
              // Jeśli to widok kompaktowy, zmniejsz marginesy
              if (scaleLevel < 0.8) {
                info.el.style.marginBottom = '1px';
              } else if (scaleLevel > 1.2) {
                info.el.style.marginBottom = '3px';
              }
            }
            
            // Dostosuj style dla urządzeń mobilnych
            if (isMobile) {
              // Zmniejsz padding dla lepszego wykorzystania przestrzeni
              if (info.view.type === 'dayGridMonth') {
                info.el.style.padding = '1px 2px';
              }
              
              // Dla widoku Gantta na mobile
              if (view.startsWith('resourceTimeline')) {
                info.el.style.marginBottom = '1px';
              }
            }
            
            // Dodaj tooltip z podsumowaniem informacji o MO
            if (info.event) {
              // Funkcja do dynamicznego tworzenia treści tooltipa
              // Ta funkcja będzie wywoływana za każdym razem, gdy pokazujemy tooltip
              // dzięki czemu zawsze będziemy mieć aktualne dane
              const createTooltipContent = () => {
                const tooltipContent = document.createElement('div');
                tooltipContent.className = 'mo-tooltip';
                
                // Pobierz ID zadania
                const taskId = info.event.id;
                
                // KLUCZOWA ZMIANA: Pobierz najświeższe dane wydarzenia z kalendarza
                let currentEvent = null;
                if (calendarRef.current) {
                  try {
                    const calendarApi = calendarRef.current.getApi();
                    currentEvent = calendarApi.getEventById(taskId);
                  } catch (error) {
                    console.warn('Nie można pobrać aktualnego wydarzenia z kalendarza:', error);
                  }
                }
                
                // Użyj aktualnego wydarzenia jeśli dostępne, w przeciwnym razie użyj oryginalnego
                const eventToUse = currentEvent || info.event;
                
                // Sprawdź, czy zadanie było zmodyfikowane (najpierw sprawdź w stan komponentu)
                const modifiedTask = modifiedTasks[taskId];
                
                // Podstawowe dane z wydarzenia - używaj najświeższych danych
                const eventData = {
                  id: taskId,
                  title: eventToUse.title,
                  start: eventToUse.start,
                  end: eventToUse.end,
                  extendedProps: eventToUse.extendedProps
                };
                
                // Pobierz aktualne dane o zadaniu z najlepszego dostępnego źródła
                let taskData;
                
                if (modifiedTask) {
                  // Jeśli zadanie było modyfikowane, użyj tych danych jako podstawy
                  taskData = {
                    ...modifiedTask,
                    // Ale zawsze aktualizuj daty z aktualnego widoku wydarzenia
                    scheduledDate: eventToUse.start || modifiedTask.scheduledDate,
                    endDate: eventToUse.end || modifiedTask.endDate
                  };
                  
                  console.log('Używam zmodyfikowanych danych dla zadania:', taskId, {
                    'eventToUse.start': eventToUse.start,
                    'eventToUse.end': eventToUse.end,
                    'modifiedTask.scheduledDate': modifiedTask.scheduledDate,
                    'modifiedTask.endDate': modifiedTask.endDate
                  });
                } else {
                  // W przeciwnym razie użyj danych z wydarzenia i extendedProps
                  const task = eventToUse.extendedProps.task || {};
                  
                  taskData = {
                    id: taskId,
                    name: eventToUse.title || task.name,
                    moNumber: task.moNumber,
                    productName: task.productName,
                    quantity: task.quantity,
                    unit: task.unit,
                    status: task.status,
                    workstationId: task.workstationId,
                    workstationName: task.workstationName || workstations.find(w => w.id === task.workstationId)?.name,
                    scheduledDate: eventToUse.start,
                    endDate: eventToUse.end,
                    estimatedDuration: task.estimatedDuration
                  };
                  
                  console.log('Używam danych z wydarzenia dla zadania:', taskId, {
                    'eventToUse.start': eventToUse.start,
                    'eventToUse.end': eventToUse.end
                  });
                }
                
                // Bezpieczne formatowanie dat
                const formatDateSafe = (dateValue) => {
                  try {
                    if (!dateValue) return '';
                    
                    // Obsługa różnych typów dat
                    let date;
                    
                    // Jeśli dateValue jest już obiektem Date
                    if (dateValue instanceof Date) {
                      date = dateValue;
                    } 
                    // Jeśli to string (ISO)
                    else if (typeof dateValue === 'string') {
                      date = new Date(dateValue);
                    }
                    // Jeśli to obiekt Firebase Timestamp (ma metodę toDate)
                    else if (dateValue && typeof dateValue.toDate === 'function') {
                      date = dateValue.toDate();
                    }
                    // Inne przypadki
                    else {
                      date = new Date(dateValue);
                    }
                    
                    // Sprawdź czy data jest poprawna
                    if (isNaN(date.getTime())) {
                      console.warn('Nieprawidłowa data:', dateValue);
                      return 'Invalid date';
                    }
                    
                    return format(date, 'dd.MM.yyyy HH:mm');
                  } catch (error) {
                    console.error('Błąd podczas formatowania daty:', error, 'Wartość:', dateValue);
                    return 'Invalid date';
                  }
                };
                
                // Formatujemy daty zawsze używając aktualnych danych
                const scheduledDate = taskData.scheduledDate || eventToUse.start;
                const endDate = taskData.endDate || eventToUse.end;
                
                const scheduledDateFormatted = scheduledDate ? formatDateSafe(scheduledDate) : '';
                const endDateFormatted = endDate ? formatDateSafe(endDate) : '';
                
                // Oblicz aktualny czas trwania na podstawie dat
                let durationInMinutes = '';
                if (scheduledDate && endDate) {
                  // Konwertuj do dat jeśli są stringami
                  const start = typeof scheduledDate === 'string' ? new Date(scheduledDate) : scheduledDate;
                  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
                  
                  if (start instanceof Date && end instanceof Date) {
                    durationInMinutes = Math.round((end - start) / (1000 * 60));
                  }
                }
                
                if (!durationInMinutes && taskData.estimatedDuration) {
                  durationInMinutes = taskData.estimatedDuration;
                }
                
                // Diagnoza - wypisz informacje o datach do konsoli
                console.log('Tooltip info dla zadania:', taskId, {
                  'eventToUse.start': eventToUse.start,
                  'eventToUse.end': eventToUse.end,
                  'taskData.scheduledDate': taskData.scheduledDate,
                  'taskData.endDate': taskData.endDate,
                  'używane daty': {
                    scheduledDate,
                    endDate,
                    scheduledDateFormatted,
                    endDateFormatted,
                    durationInMinutes
                  }
                });
                
                // Określ etykiety na podstawie statusu zadania
                const isCompleted = taskData.status === 'Zakończone';
                const startLabel = isCompleted ? 'Start' : 'Planned start';
                const endLabel = isCompleted ? 'End' : 'Planned end';
                const timeLabel = isCompleted ? 'Actual time' : 'Estimated time';
                
                // Ustaw treść tooltipa
                tooltipContent.innerHTML = `
                  <div class="mo-tooltip-content" style="border-radius: 4px; padding: 8px; max-width: 300px; z-index: 10000;">
                    <div class="mo-tooltip-title" style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">${taskData.name || 'Production order'}</div>
                    <div style="font-size: 12px; margin-bottom: 2px;"><b>MO:</b> ${taskData.moNumber || 'None'}</div>
                    ${taskData.productName ? `<div style="font-size: 12px; margin-bottom: 2px;"><b>Product:</b> ${taskData.productName}</div>` : ''}
                    ${taskData.quantity ? `<div style="font-size: 12px; margin-bottom: 2px;"><b>Quantity:</b> ${taskData.quantity} ${taskData.unit || ''}</div>` : ''}
                    ${taskData.workstationName ? `<div style="font-size: 12px; margin-bottom: 2px;"><b>Workstation:</b> ${taskData.workstationName}</div>` : ''}
                    ${taskData.status ? `<div style="font-size: 12px; margin-bottom: 2px;"><b>Status:</b> ${taskData.status}</div>` : ''}
                    ${scheduledDateFormatted ? `<div style="font-size: 12px; margin-bottom: 2px;"><b>${startLabel}:</b> ${scheduledDateFormatted}</div>` : ''}
                    ${endDateFormatted ? `<div style="font-size: 12px; margin-bottom: 2px;"><b>${endLabel}:</b> ${endDateFormatted}</div>` : ''}
                    ${durationInMinutes ? `<div style="font-size: 12px;"><b>${timeLabel}:</b> ${durationInMinutes} min</div>` : ''}
                  </div>
                `;
                
                // Dodaj unikalne ID
                tooltipContent.id = 'tooltip-' + eventToUse.id + '-' + Date.now();
                
                return tooltipContent;
              };
              
              // Funkcja do pokazywania tooltipa
              const showTooltip = () => {
                // Najpierw wyczyść wszystkie inne tooltipów
                clearAllTooltips();
                
                // Dynamicznie utwórz tooltip z najnowszymi danymi
                const tooltipContent = createTooltipContent();
                
                // Dodaj tooltip do ciała dokumentu
                document.body.appendChild(tooltipContent);
                
                // Dodaj tooltip do listy aktywnych tooltipów
                activeTooltipsRef.current.push(tooltipContent);
                
                // Funkcja do pozycjonowania tooltipa przy kursorze
                const positionTooltip = (e) => {
                  if (tooltipContent.parentNode) {
                    tooltipContent.style.position = 'absolute';
                    tooltipContent.style.left = `${e.pageX + 10}px`;
                    tooltipContent.style.top = `${e.pageY + 10}px`;
                    tooltipContent.style.zIndex = '10000'; // Zapewnienie najwyższego z-index
                  }
                };
                
                // Dodaj pierwszy raz pozycjonowanie
                const initialMouseEvent = window.event;
                if (initialMouseEvent) {
                  positionTooltip(initialMouseEvent);
                }
                
                // Nasłuchiwanie ruchu myszy dla aktualizacji pozycji
                document.addEventListener('mousemove', positionTooltip);
                
                // Funkcja do ukrywania tooltipa
                const hideTooltip = () => {
                  document.removeEventListener('mousemove', positionTooltip);
                  
                  if (tooltipContent.parentNode) {
                    tooltipContent.parentNode.removeChild(tooltipContent);
                    
                    // Usuń tooltip z listy aktywnych tooltipów
                    activeTooltipsRef.current = activeTooltipsRef.current.filter(t => t !== tooltipContent);
                  }
                };
                
                // Usuń tooltip po opuszczeniu elementu
                info.el.addEventListener('mouseleave', hideTooltip, { once: true });
                
                // Dodaj obsługę globalnego kliknięcia
                document.addEventListener('click', (e) => {
                  if (!info.el.contains(e.target) && !tooltipContent.contains(e.target)) {
                    hideTooltip();
                  }
                }, { once: true });
                
                // Obsługa usunięcia elementu
                info.el.addEventListener('remove', hideTooltip, { once: true });
              };
              
              // Dodajemy nasłuchiwanie zdarzenia mouseenter
              info.el.addEventListener('mouseenter', showTooltip);
              
              // Dla urządzeń dotykowych - touch
              info.el.addEventListener('touchstart', showTooltip);
            }
          }}
          slotLabelContent={(args) => {
            if (view.startsWith('resourceTimeline')) {
              const date = args.date;
              const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
              const isHourViewAllowed = ganttDetail === 'hour' && diffInDays <= MAX_DAYS_FOR_HOURLY_VIEW;
              
              // Dla widoku dziennego (godziny) lub szczegółowości godzinowej z dopuszczalnym zakresem dat
              if (view === 'resourceTimelineDay' || (isHourViewAllowed && args.level === 1)) {
                // Jeśli mamy poziom 1 (drugi wiersz) w widoku godzinowym lub jesteśmy w widoku dziennym
                const hour = date.getHours();
                const minute = date.getMinutes();
                
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
                      {`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                    </Typography>
                  </Box>
                );
              }
              
              // Dla pierwszego poziomu nagłówków w widoku godzinowym (dzień/data)
              if (isHourViewAllowed && args.level === 0) {
                const day = date.getDate();
                const weekday = new Intl.DateTimeFormat('pl', { weekday: 'short' }).format(date);
                const month = new Intl.DateTimeFormat('pl', { month: 'short' }).format(date);
                
                return (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    fontSize: isMobile ? '0.65rem' : '0.75rem'
                  }}>
                    <Typography variant="caption" sx={{ 
                      color: 'primary.main', 
                      fontWeight: 'bold',
                      fontSize: 'inherit'
                    }}>
                      {month}
                    </Typography>
                    <Typography variant="body2" sx={{ 
                      fontWeight: 'bold',
                      fontSize: 'inherit'
                    }}>
                      {day}
                    </Typography>
                    {!isMobile && (
                      <Typography variant="caption" sx={{ 
                        textTransform: 'uppercase',
                        fontSize: 'inherit'
                      }}>
                        {weekday}
                      </Typography>
                    )}
                  </Box>
                );
              }
              
              // Dla widoku tygodniowego lub miesięcznego (dni)
              if ((view === 'resourceTimelineWeek' || view === 'resourceTimelineMonth') && (!isHourViewAllowed || ganttDetail !== 'hour')) {
                // Standardowy widok dla dni (dla miesięcznego lub tygodniowego bez godzin)
                const day = date.getDate();
                const weekday = new Intl.DateTimeFormat('pl', { weekday: 'short' }).format(date);
                const month = new Intl.DateTimeFormat('pl', { month: 'short' }).format(date);
                
                // Dla pierwszego dnia miesiąca lub początku widoku, pokaż nazwę miesiąca
                if (day === 1 || (day <= 3 && args.isLabeled)) {
                  return (
                    <Box sx={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      fontSize: isMobile ? '0.65rem' : '0.75rem'
                    }}>
                      <Typography variant="caption" sx={{ 
                        color: 'primary.main', 
                        fontWeight: 'bold',
                        fontSize: 'inherit'
                      }}>
                        {month}
                      </Typography>
                      <Typography variant="body2" sx={{ 
                        fontWeight: 'bold',
                        fontSize: 'inherit'
                      }}>
                        {day}
                      </Typography>
                      {!isMobile && (
                        <Typography variant="caption" sx={{ 
                          textTransform: 'uppercase',
                          fontSize: 'inherit'
                        }}>
                          {weekday}
                        </Typography>
                      )}
                    </Box>
                  );
                }
                
                // Dla pozostałych dni
                return (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    fontSize: isMobile ? '0.65rem' : '0.75rem'
                  }}>
                    <Typography variant="body2" sx={{ 
                      fontWeight: 'bold',
                      fontSize: 'inherit'
                    }}>
                      {day}
                    </Typography>
                    {!isMobile && (
                      <Typography variant="caption" sx={{ 
                        textTransform: 'uppercase',
                        fontSize: 'inherit'
                      }}>
                        {weekday}
                      </Typography>
                    )}
                  </Box>
                );
              }
            }
            return null;
          }}
          dayCellDidMount={(arg) => {
            // Dodaj oznaczenie miesiąca dla pierwszego dnia miesiąca
            if (arg.date.getDate() === 1) {
              const cellEl = arg.el;
              cellEl.style.borderLeft = '2px solid #2196f3';
              cellEl.style.backgroundColor = 'rgba(33, 150, 243, 0.05)';
            }
            
            // Dostosuj styl komórek dla urządzeń mobilnych
            if (isMobile) {
              const cellEl = arg.el;
              if (arg.view.type === 'dayGridMonth') {
                cellEl.style.padding = '2px';
              }
            }
          }}
          viewClassNames={`custom-timeline-view ${scaleLevel < 0.8 ? 'scale-compact' : scaleLevel > 1.2 ? 'scale-large' : ''} ${ganttDetail === 'hour' ? 'hour-scale' : ''} ${ganttDetail === 'hour' && Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) > MAX_DAYS_FOR_HOURLY_VIEW ? 'hour-scale-limited' : ''}`}
          dayHeaders={true}
          datesAboveResources={true}
          firstDay={1}
          customButtons={{
            groupBy: {
              text: ganttGroupBy === 'workstation' ? 'Workstations' : 'Orders',
              click: handleGanttGroupByChange
            }
          }}
          views={{
            timeGridDay: {
              dayHeaderFormat: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
            },
            timeGridWeek: {
              dayHeaderFormat: isMobile ? { weekday: 'short' } : { weekday: 'short', day: 'numeric', month: 'numeric' }
            },
            dayGridMonth: {
              dayHeaderFormat: { weekday: 'short' },
              dayMaxEventRows: isMobile ? 2 : 6
            },
            resourceTimelineDay: {
              slotDuration: { hours: 1 },
              slotLabelInterval: { hours: 1 },
              slotLabelFormat: [
                { hour: '2-digit', minute: '2-digit', hour12: false }
              ],
              visibleRange: customDateRange ? { start: startDate, end: endDate } : null,
              slotMinWidth: getScaledSlotWidth(isMobile ? 30 : 45),
              duration: customDateRange 
                ? { days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) } 
                : { days: 1 }
            },
            resourceTimelineWeek: {
              duration: customDateRange 
                ? { days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) } 
                : { days: 7 },
              slotDuration: (() => {
                // Sprawdź czy szczegółowość to godziny, a zakres dat nie jest zbyt duży
                if (ganttDetail === 'hour') {
                  const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                  return diffInDays <= MAX_DAYS_FOR_HOURLY_VIEW ? { hours: 1 } : { days: 1 };
                }
                return { days: 1 };
              })(),
              slotLabelInterval: (() => {
                // Synchronizuj z slotDuration
                if (ganttDetail === 'hour') {
                  const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                  return diffInDays <= MAX_DAYS_FOR_HOURLY_VIEW ? { hours: 1 } : { days: 1 };
                }
                return { days: 1 };
              })(),
              slotLabelFormat: (() => {
                // Dostosuj format etykiet w zależności od slotDuration
                if (ganttDetail === 'hour') {
                  const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                  if (diffInDays <= MAX_DAYS_FOR_HOURLY_VIEW) {
                    return [
                      { day: 'numeric', month: 'short', weekday: 'short' }, // Pierwszy poziom - data z dniem tygodnia
                      { hour: '2-digit', minute: '2-digit', hour12: false } // Drugi poziom - godzina
                    ];
                  }
                }
                return [{ weekday: 'short', day: 'numeric', month: 'short' }];
              })(),
              visibleRange: customDateRange ? { start: startDate, end: endDate } : null,
              slotMinWidth: getScaledSlotWidth(ganttDetail === 'hour' ? 30 : (isMobile ? 25 : 35))
            },
            resourceTimelineMonth: {
              duration: customDateRange 
                ? { days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 } 
                : { days: 30 },
              slotDuration: (() => {
                // Sprawdź czy szczegółowość to godziny, a zakres dat nie jest zbyt duży
                if (ganttDetail === 'hour') {
                  const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                  return diffInDays <= MAX_DAYS_FOR_HOURLY_VIEW ? { hours: 1 } : { days: 1 };
                }
                return { days: 1 };
              })(),
              slotLabelInterval: (() => {
                // Synchronizuj z slotDuration
                if (ganttDetail === 'hour') {
                  const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                  return diffInDays <= MAX_DAYS_FOR_HOURLY_VIEW ? { hours: 1 } : { days: 1 };
                }
                return { days: 1 };
              })(),
              slotLabelFormat: (() => {
                // Dostosuj format etykiet w zależności od slotDuration
                if (ganttDetail === 'hour') {
                  const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                  if (diffInDays <= MAX_DAYS_FOR_HOURLY_VIEW) {
                    return [
                      { day: 'numeric', month: 'short', weekday: 'short' }, // Pierwszy poziom - data z dniem tygodnia
                      { hour: '2-digit', minute: '2-digit', hour12: false } // Drugi poziom - godzina
                    ];
                  }
                }
                return [{ day: 'numeric', weekday: 'short' }];
              })(),
              visibleRange: customDateRange ? { start: startDate, end: endDate } : null,
              slotMinWidth: getScaledSlotWidth(ganttDetail === 'hour' ? 30 : (isMobile ? 20 : 30))
            }
          }}
          dayHeaderClassNames="custom-day-header"
        />
      </Box>
      
      {/* Date Range Menu */}
      <Menu
        anchorEl={dateRangeMenuAnchor}
        open={Boolean(dateRangeMenuAnchor)}
        onClose={handleDateRangeMenuClose}
      >
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 250 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            Wybierz zakres dat
          </Typography>
          
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <DatePicker
              label="Data początkowa"
              value={startDate}
              onChange={(newValue) => {
                if (newValue) {
                  setStartDate(newValue);
                }
              }}
              format="dd.MM.yyyy"
            />
            
            <DatePicker
              label="Data końcowa"
              value={endDate}
              onChange={(newValue) => {
                if (newValue) {
                  setEndDate(newValue);
                }
              }}
              format="dd.MM.yyyy"
            />
          </LocalizationProvider>
          
          <Button
            variant="contained"
            onClick={applyCustomDateRange}
            fullWidth
          >
            Zastosuj
          </Button>
        </Box>
      </Menu>
      
      {/* Detail Level Menu */}
      <Menu
        anchorEl={detailMenuAnchor}
        open={Boolean(detailMenuAnchor)}
        onClose={handleDetailMenuClose}
      >
        <MenuItem onClick={() => handleGanttDetailChange('hour')}>
          <ListItemText primary="Godzina" />
        </MenuItem>
        <MenuItem onClick={() => handleGanttDetailChange('day')}>
          <ListItemText primary="Dzień" />
        </MenuItem>
      </Menu>
      
      {/* Gantt View Menu */}
      <Menu
        anchorEl={ganttMenuAnchor}
        open={Boolean(ganttMenuAnchor)}
        onClose={handleGanttMenuClose}
      >
        <MenuItem onClick={() => handleGanttViewChange('resourceTimelineDay')}>
          <ListItemText primary="Dzień" />
        </MenuItem>
        <MenuItem onClick={() => handleGanttViewChange('resourceTimelineWeek')}>
          <ListItemText primary="Tydzień" />
        </MenuItem>
        <MenuItem onClick={() => handleGanttViewChange('resourceTimelineMonth')}>
          <ListItemText primary="Miesiąc" />
        </MenuItem>
      </Menu>

      {/* Menu kontekstowe dla kafelków MO */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleViewMODetails}>
          <ListItemIcon>
            <InfoIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Szczegóły MO</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleEditDates}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edytuj daty</ListItemText>
        </MenuItem>
      </Menu>

      {/* Dialog edycji dat MO */}
      <Dialog
        open={editDateDialog}
        onClose={handleCloseEditDateDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edytuj daty zamówienia produkcyjnego</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Zmień daty rozpoczęcia i zakończenia zamówienia produkcyjnego.
          </DialogContentText>
          
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <DateTimePicker
                  label="Data i godzina rozpoczęcia"
                  value={editDateForm.scheduledDate}
                  onChange={(newValue) => {
                    console.log('Zmiana daty rozpoczęcia:', newValue);
                    setEditDateForm(prev => ({
                      ...prev,
                      scheduledDate: newValue
                    }));
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true,
                      error: !editDateForm.scheduledDate,
                      helperText: !editDateForm.scheduledDate ? 'Data rozpoczęcia jest wymagana' : ''
                    }
                  }}
                  format="dd.MM.yyyy HH:mm"
                />
              </Grid>
              <Grid item xs={12}>
                <DateTimePicker
                  label="Data i godzina zakończenia"
                  value={editDateForm.endDate}
                  onChange={(newValue) => {
                    console.log('Zmiana daty zakończenia:', newValue);
                    setEditDateForm(prev => ({
                      ...prev,
                      endDate: newValue
                    }));
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true
                    }
                  }}
                  format="dd.MM.yyyy HH:mm"
                />
              </Grid>
            </Grid>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDateDialog}>
            Anuluj
          </Button>
          <Button 
            onClick={handleSaveEditedDates}
            variant="contained"
            color="primary"
          >
            Zapisz zmiany
          </Button>
        </DialogActions>
      </Dialog>

      {/* NOWE: Menu filtrów klientów */}
      <Menu
        anchorEl={customerMenuAnchor}
        open={Boolean(customerMenuAnchor)}
        onClose={handleCustomerMenuClose}
        PaperProps={{
          style: {
            maxHeight: 400,
            width: '300px',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Filtruj według klientów
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button 
              size="small" 
              onClick={() => handleSelectAllCustomers(true)}
              variant="outlined"
            >
              Zaznacz wszystkich
            </Button>
            <Button 
              size="small" 
              onClick={() => handleSelectAllCustomers(false)}
              variant="outlined"
            >
              Odznacz wszystkich
            </Button>
          </Box>
          
          <FormGroup>
            {customers.map(customer => (
              <FormControlLabel
                key={customer.id}
                control={
                  <Checkbox
                    checked={selectedCustomers[customer.id] || false}
                    onChange={() => handleCustomerFilterChange(customer.id)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                    {customer.name}
                  </Typography>
                }
              />
            ))}
            
            {/* Opcja dla zadań bez klienta */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedCustomers['no-customer'] || false}
                  onChange={() => handleCustomerFilterChange('no-customer')}
                  size="small"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Bez przypisanego klienta
                </Typography>
              }
            />
          </FormGroup>
        </Box>
      </Menu>
    </Paper>
  );
};

// Eksportujemy zmemoizowany komponent dla lepszej wydajności
export default memo(ProductionCalendar);