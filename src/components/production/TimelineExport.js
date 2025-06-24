import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
  Grid,
  Tooltip,
  FormGroup
} from '@mui/material';
import { FileDownload as FileDownloadIcon } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, startOfDay, endOfDay } from 'date-fns';
import { pl } from 'date-fns/locale';
import * as XLSX from 'xlsx-js-style';

// Funkcja do generowania raportu Timeline w formacie XLSX
const generateTimelineReport = (tasks, workstations, customers, startDate, endDate, groupBy, filteredTasks, selectedCustomers) => {
  try {
    console.log('Rozpoczęcie generowania raportu Timeline');
    
    // Sprawdź czy są dostępne dane
    if (!filteredTasks || filteredTasks.length === 0) {
      throw new Error('Brak zadań do wygenerowania raportu');
    }

    // Funkcja do pobrania koloru statusu dla Excela
    const getStatusColorForExcel = (status) => {
      switch (status) {
        case 'Zaplanowane':
          return '#3788d8';
        case 'W trakcie':
          return '#f39c12';
        case 'Zakończone':
          return '#2ecc71';
        case 'Anulowane':
          return '#e74c3c';
        case 'Wstrzymane':
          return '#757575';
        default:
          return '#95a5a6';
      }
    };

    // Funkcja do tłumaczenia statusu
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

    // Filtruj zadania według wybranych klientów
    const tasksToExport = filteredTasks.filter(task => {
      if (!selectedCustomers || Object.keys(selectedCustomers).length === 0) {
        return true; // Jeśli nie ma filtrów klientów, pokaż wszystkie
      }

      const customerId = task.customer?.id || task.customerId;
      
      if (customerId) {
        return selectedCustomers[customerId] === true;
      } else {
        return selectedCustomers['no-customer'] === true;
      }
    });

    // Przygotuj dane zadań
    const reportTasks = tasksToExport.map(task => {
      const workstation = workstations.find(w => w.id === task.workstationId);
      const customer = customers.find(c => c.id === task.customerId);
      
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
          console.warn('Błąd formatowania daty:', error);
          return '';
        }
      };

      // Oblicz czas trwania w godzinach
      let durationHours = '';
      if (task.scheduledDate && task.endDate) {
        try {
          const start = task.scheduledDate instanceof Date ? task.scheduledDate : new Date(task.scheduledDate);
          const end = task.endDate instanceof Date ? task.endDate : new Date(task.endDate);
          const durationMs = end.getTime() - start.getTime();
          durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
        } catch (error) {
          console.warn('Błąd obliczania czasu trwania:', error);
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
        unit: task.unit || 'szt.',
        status: translateStatus(task.status),
        statusColor: getStatusColorForExcel(task.status),
        workstationName: workstation?.name || '',
        scheduledDate: formatDateForReport(task.scheduledDate),
        endDate: formatDateForReport(task.endDate),
        durationHours: durationHours,
        priority: task.priority || '',
        description: task.description || task.name || '',
        originalScheduledDate: task.scheduledDate,
        originalEndDate: task.endDate
      };
    });

    // Sortuj zadania po dacie rozpoczęcia
    reportTasks.sort((a, b) => {
      const dateA = a.scheduledDate ? new Date(a.scheduledDate.split(' ')[0].split('.').reverse().join('-')) : new Date(0);
      const dateB = b.scheduledDate ? new Date(b.scheduledDate.split(' ')[0].split('.').reverse().join('-')) : new Date(0);
      return dateA - dateB;
    });

    // Utwórz workbook
    const wb = XLSX.utils.book_new();

    // === ARKUSZ 1: SZCZEGÓŁOWY HARMONOGRAM ===
    
    const detailedHeaders = [
      'Numer MO',
      'Numer zamówienia',
      'Klient',
      'Produkt',
      'Ilość',
      'Jednostka',
      'Status',
      'Stanowisko',
      'Data rozpoczęcia',
      'Data zakończenia',
      'Czas trwania (h)',
      'Priorytet',
      'Opis'
    ];

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

    const detailedWs = XLSX.utils.aoa_to_sheet([detailedHeaders, ...detailedData]);

    // === ARKUSZ 2: TIMELINE WIZUALNY ===
    
    // Generuj kolumny dat dla osi X
    const timelineStartDate = new Date(startDate);
    const timelineEndDate = new Date(endDate);
    const totalDays = Math.ceil((timelineEndDate - timelineStartDate) / (1000 * 60 * 60 * 24));
    
    // Ogranicz liczbę dni dla lepszej wydajności Excela
    const maxDays = 120;
    const limitedDays = Math.min(totalDays, maxDays);
    
    const dateColumns = [];
    for (let i = 0; i < limitedDays; i++) {
      const currentDate = new Date(timelineStartDate);
      currentDate.setDate(timelineStartDate.getDate() + i);
      dateColumns.push(format(currentDate, 'dd.MM', { locale: pl }));
    }

    const timelineHeaders = [
      'Zadanie',
      'MO',
      'Klient',
      'Stanowisko',
      'Status',
      ...dateColumns
    ];

    const timelineData = [];
    let coloredCellsCount = 0;

    // Grupuj zadania w zależności od ustawienia groupBy
    let groupedTasks = {};
    
    if (groupBy === 'workstation') {
      workstations.forEach(workstation => {
        groupedTasks[workstation.name] = reportTasks.filter(task => task.workstationName === workstation.name);
      });
      const noWorkstationTasks = reportTasks.filter(task => !task.workstationName);
      if (noWorkstationTasks.length > 0) {
        groupedTasks['Bez stanowiska'] = noWorkstationTasks;
      }
    } else {
      const orderGroups = {};
      reportTasks.forEach(task => {
        const orderKey = task.orderNumber || 'Bez zamówienia';
        if (!orderGroups[orderKey]) {
          orderGroups[orderKey] = [];
        }
        orderGroups[orderKey].push(task);
      });
      groupedTasks = orderGroups;
    }

    // Dodaj wiersze dla każdej grupy i zadania
    Object.keys(groupedTasks).forEach(groupName => {
      const groupTasks = groupedTasks[groupName];
      
      // Dodaj nagłówek grupy jeśli jest więcej niż jedna grupa
      if (Object.keys(groupedTasks).length > 1) {
        const groupRow = [
          `=== ${groupName} ===`,
          '', '', '', '',
          ...Array(dateColumns.length).fill('')
        ];
        timelineData.push(groupRow);
      }

      // Dodaj wiersze dla zadań w grupie
      groupTasks.forEach(task => {
        const taskRow = [
          task.productName,
          task.moNumber,
          task.customerName,
          task.workstationName,
          task.status
        ];

        // Dodaj kolumny dla każdego dnia
        for (let i = 0; i < limitedDays; i++) {
          const currentDate = new Date(timelineStartDate);
          currentDate.setDate(timelineStartDate.getDate() + i);
          
          let cellValue = '';
          let shouldColorCell = false;
          
          if (task.originalScheduledDate && task.originalEndDate) {
            try {
              let taskStart, taskEnd;
              
              if (task.originalScheduledDate instanceof Date) {
                taskStart = task.originalScheduledDate;
              } else if (task.originalScheduledDate.toDate && typeof task.originalScheduledDate.toDate === 'function') {
                taskStart = task.originalScheduledDate.toDate();
              } else {
                taskStart = new Date(task.originalScheduledDate);
              }

              if (task.originalEndDate instanceof Date) {
                taskEnd = task.originalEndDate;
              } else if (task.originalEndDate.toDate && typeof task.originalEndDate.toDate === 'function') {
                taskEnd = task.originalEndDate.toDate();
              } else {
                taskEnd = new Date(task.originalEndDate);
              }

              if (!isNaN(taskStart.getTime()) && !isNaN(taskEnd.getTime())) {
                const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                const taskStartOnly = new Date(taskStart.getFullYear(), taskStart.getMonth(), taskStart.getDate());
                const taskEndOnly = new Date(taskEnd.getFullYear(), taskEnd.getMonth(), taskEnd.getDate());
                
                if (currentDateOnly >= taskStartOnly && currentDateOnly <= taskEndOnly) {
                  shouldColorCell = true;
                  cellValue = '';
                }
              }
            } catch (error) {
              console.warn('Błąd przetwarzania dat zadania:', task.moNumber, error);
            }
          }
          
          if (shouldColorCell) {
            coloredCellsCount++;
            taskRow.push({
              v: cellValue,
              s: {
                fill: {
                  patternType: 'solid',
                  fgColor: { rgb: task.statusColor.replace('#', '') }
                }
              }
            });
          } else {
            taskRow.push(cellValue);
          }
        }

        timelineData.push(taskRow);
      });

      // Dodaj pusty wiersz między grupami
      if (Object.keys(groupedTasks).length > 1) {
        timelineData.push(Array(timelineHeaders.length).fill(''));
      }
    });

    const timelineWs = XLSX.utils.aoa_to_sheet([timelineHeaders, ...timelineData]);

    // Koloruj kolumnę Status w arkuszu Timeline
    let timelineRowIndex = 1;
    Object.keys(groupedTasks).forEach(groupName => {
      const groupTasks = groupedTasks[groupName];
      
      if (Object.keys(groupedTasks).length > 1) {
        timelineRowIndex++;
      }

      groupTasks.forEach(task => {
        const statusCellAddress = XLSX.utils.encode_cell({ r: timelineRowIndex, c: 4 });
        
        if (timelineWs[statusCellAddress]) {
          timelineWs[statusCellAddress].s = {
            fill: {
              patternType: 'solid',
              fgColor: { rgb: task.statusColor.replace('#', '') }
            },
            font: {
              color: { rgb: task.statusColor === '#757575' || task.statusColor === '#95a5a6' ? '000000' : 'FFFFFF' }
            }
          };
        }
        timelineRowIndex++;
      });

      if (Object.keys(groupedTasks).length > 1) {
        timelineRowIndex++;
      }
    });

    // Dodaj arkusze do workbook
    XLSX.utils.book_append_sheet(wb, detailedWs, 'Szczegółowy harmonogram');
    XLSX.utils.book_append_sheet(wb, timelineWs, 'Timeline wizualny');

    // === FORMATOWANIE ARKUSZY ===
    
    // Szerokości kolumn dla arkusza szczegółowego
    const detailedColWidths = [
      { wch: 12 }, // Numer MO
      { wch: 15 }, // Numer zamówienia
      { wch: 20 }, // Klient
      { wch: 25 }, // Produkt
      { wch: 8 },  // Ilość
      { wch: 8 },  // Jednostka
      { wch: 12 }, // Status
      { wch: 15 }, // Stanowisko
      { wch: 16 }, // Data rozpoczęcia
      { wch: 16 }, // Data zakończenia
      { wch: 12 }, // Czas trwania
      { wch: 10 }, // Priorytet
      { wch: 30 }  // Opis
    ];
    detailedWs['!cols'] = detailedColWidths;

    // Koloruj kolumnę Status w arkuszu szczegółowym
    for (let i = 1; i <= reportTasks.length; i++) {
      const task = reportTasks[i - 1];
      const statusCellAddress = XLSX.utils.encode_cell({ r: i, c: 6 });
      
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

    // Szerokości kolumn dla arkusza Timeline
    const timelineColWidths = [
      { wch: 25 }, // Zadanie
      { wch: 12 }, // MO
      { wch: 20 }, // Klient
      { wch: 15 }, // Stanowisko
      { wch: 12 }, // Status
      ...dateColumns.map(() => ({ wch: 8 })) // Kolumny dat
    ];
    timelineWs['!cols'] = timelineColWidths;

    // === ARKUSZ 3: PODSUMOWANIE ===
    
    const summaryData = [
      ['RAPORT TIMELINE PRODUKCJI', ''],
      ['', ''],
      ['Okres raportu:', `${format(timelineStartDate, 'dd.MM.yyyy', { locale: pl })} - ${format(timelineEndDate, 'dd.MM.yyyy', { locale: pl })}`],
      ['Data generowania:', format(new Date(), 'dd.MM.yyyy HH:mm', { locale: pl })],
      ['Tryb grupowania:', groupBy === 'workstation' ? 'Według stanowisk' : 'Według zamówień'],
      ['Liczba zadań w raporcie:', reportTasks.length],
      ['', ''],
      ['STATYSTYKI:', ''],
      ['Zadania zaplanowane:', reportTasks.filter(t => t.status === 'Scheduled').length],
      ['Zadania w trakcie:', reportTasks.filter(t => t.status === 'In Progress').length],
      ['Zadania zakończone:', reportTasks.filter(t => t.status === 'Completed').length],
      ['Zadania anulowane:', reportTasks.filter(t => t.status === 'Cancelled').length],
      ['Zadania wstrzymane:', reportTasks.filter(t => t.status === 'On Hold').length],
      ['', ''],
      ['STANOWISKA:', ''],
      ...workstations.map(ws => [
        ws.name,
        reportTasks.filter(t => t.workstationName === ws.name).length + ' zadań'
      ]),
      ['', ''],
      ['KLIENCI:', ''],
      ...customers.filter(customer => selectedCustomers[customer.id]).map(customer => [
        customer.name,
        reportTasks.filter(t => t.customerName === customer.name).length + ' zadań'
      ])
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Podsumowanie');

    // Generuj nazwę pliku
    const fileName = `Timeline_produkcji_${format(timelineStartDate, 'yyyy-MM-dd', { locale: pl })}_${format(timelineEndDate, 'yyyy-MM-dd', { locale: pl })}.xlsx`;

    // Zapisz plik
    XLSX.writeFile(wb, fileName);
    
    console.log('Raport Timeline XLSX został wygenerowany:', fileName);
    return true;
    
  } catch (error) {
    console.error('Błąd podczas generowania raportu Timeline:', error);
    throw new Error('Nie udało się wygenerować raportu: ' + error.message);
  }
};

const TimelineExport = ({ 
  tasks, 
  workstations, 
  customers, 
  startDate, 
  endDate, 
  groupBy, 
  filteredTasks,
  showSuccess,
  showError 
}) => {
  const [exportDialog, setExportDialog] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    startDate: startDate ? new Date(startDate) : new Date(),
    endDate: endDate ? new Date(endDate) : new Date(),
    selectedCustomers: {}
  });

  // Inicjalizuj wybrane klientów przy pierwszym otwarciu dialogu
  React.useEffect(() => {
    if (exportDialog && customers.length > 0) {
      const initialSelectedCustomers = {};
      customers.forEach(customer => {
        initialSelectedCustomers[customer.id] = true;
      });
      initialSelectedCustomers['no-customer'] = true;
      
      setExportFilters(prev => ({
        ...prev,
        selectedCustomers: initialSelectedCustomers
      }));
    }
  }, [exportDialog, customers]);

  const handleOpenExportDialog = () => {
    // Debugowanie danych wejściowych
    console.log('TimelineExport - Debugowanie danych:', {
      tasks: tasks?.length || 0,
      filteredTasks: filteredTasks?.length || 0,
      workstations: workstations?.length || 0,
      customers: customers?.length || 0,
      startDate: startDate,
      startDateType: typeof startDate,
      endDate: endDate,
      endDateType: typeof endDate,
      groupBy: groupBy,
      filteredTasksSample: filteredTasks?.slice(0, 3).map(task => ({
        id: task.id,
        name: task.name,
        scheduledDate: task.scheduledDate,
        scheduledDateType: typeof task.scheduledDate,
        customerId: task.customerId,
        customerName: task.customerName
      }))
    });

    // Bezpieczna konwersja dat z timeline
    let convertedStartDate, convertedEndDate;
    
    try {
      // startDate może być timestamp (number) lub Date
      if (typeof startDate === 'number') {
        convertedStartDate = new Date(startDate);
      } else if (startDate instanceof Date) {
        convertedStartDate = new Date(startDate);
      } else {
        convertedStartDate = new Date();
      }
      
      // endDate może być timestamp (number) lub Date
      if (typeof endDate === 'number') {
        convertedEndDate = new Date(endDate);
      } else if (endDate instanceof Date) {
        convertedEndDate = new Date(endDate);
      } else {
        convertedEndDate = new Date();
      }
    } catch (error) {
      console.error('Błąd konwersji dat timeline:', error);
      convertedStartDate = new Date();
      convertedEndDate = new Date();
    }

    console.log('Skonwertowane daty:', {
      convertedStartDate: convertedStartDate.toISOString(),
      convertedEndDate: convertedEndDate.toISOString()
    });

    // Ustaw domyślne daty z aktualnego widoku timeline
    setExportFilters(prev => ({
      ...prev,
      startDate: convertedStartDate,
      endDate: convertedEndDate
    }));
    setExportDialog(true);
  };

  const handleCloseExportDialog = () => {
    setExportDialog(false);
  };

  const handleCustomerFilterChange = (customerId) => {
    setExportFilters(prev => ({
      ...prev,
      selectedCustomers: {
        ...prev.selectedCustomers,
        [customerId]: !prev.selectedCustomers[customerId]
      }
    }));
  };

  const handleSelectAllCustomers = (select) => {
    const newSelectedCustomers = {};
    customers.forEach(customer => {
      newSelectedCustomers[customer.id] = select;
    });
    newSelectedCustomers['no-customer'] = select;
    
    setExportFilters(prev => ({
      ...prev,
      selectedCustomers: newSelectedCustomers
    }));
  };

  const handleExport = async () => {
    try {
      // Sprawdź czy są dostępne dane
      if (!filteredTasks || filteredTasks.length === 0) {
        showError('Brak zadań do eksportu. Załaduj dane timeline.');
        return;
      }

      if (!workstations || workstations.length === 0) {
        showError('Brak danych o stanowiskach. Odśwież stronę i spróbuj ponownie.');
        return;
      }

      showSuccess('Rozpoczynanie generowania raportu Timeline...');
      
      // Debugowanie przed filtrowaniem
      console.log('Eksport - Debugowanie przed filtrowaniem:', {
        filteredTasksLength: filteredTasks.length,
        exportFiltersStartDate: exportFilters.startDate,
        exportFiltersEndDate: exportFilters.endDate,
        selectedCustomers: exportFilters.selectedCustomers,
        sampleTasks: filteredTasks.slice(0, 3).map(task => ({
          id: task.id,
          name: task.name,
          scheduledDate: task.scheduledDate,
          customerId: task.customerId
        }))
      });

      // Filtruj zadania według wybranego zakresu dat
      const filteredByDateTasks = filteredTasks.filter(task => {
        if (!task.scheduledDate) {
          console.log('Zadanie bez daty rozpoczęcia:', task.id, task.name);
          return false;
        }
        
        let taskDate;
        try {
          if (task.scheduledDate instanceof Date) {
            taskDate = task.scheduledDate;
          } else if (task.scheduledDate.toDate && typeof task.scheduledDate.toDate === 'function') {
            taskDate = task.scheduledDate.toDate();
          } else {
            taskDate = new Date(task.scheduledDate);
          }
          
          if (isNaN(taskDate.getTime())) {
            console.log('Nieprawidłowa data zadania:', task.id, task.scheduledDate);
            return false;
          }
        } catch (error) {
          console.warn('Błąd konwersji daty zadania:', task.id, error);
          return false;
        }
        
        const filterStartDate = startOfDay(exportFilters.startDate);
        const filterEndDate = endOfDay(exportFilters.endDate);
        
        const isInDateRange = taskDate >= filterStartDate && taskDate <= filterEndDate;
        
        if (!isInDateRange) {
          console.log('Zadanie poza zakresem dat:', task.id, {
            taskDate: taskDate.toISOString(),
            filterStart: filterStartDate.toISOString(),
            filterEnd: filterEndDate.toISOString()
          });
        }
        
        return isInDateRange;
      });

      console.log('Wynik filtrowania według dat:', {
        originalCount: filteredTasks.length,
        filteredByDateCount: filteredByDateTasks.length,
        filteredByDateSample: filteredByDateTasks.slice(0, 3).map(task => ({
          id: task.id,
          name: task.name,
          scheduledDate: task.scheduledDate
        }))
      });

      if (filteredByDateTasks.length === 0) {
        showError('Brak zadań w wybranym zakresie dat.');
        return;
      }

      await generateTimelineReport(
        tasks,
        workstations,
        customers,
        exportFilters.startDate,
        exportFilters.endDate,
        groupBy,
        filteredByDateTasks,
        exportFilters.selectedCustomers
      );

      showSuccess('Raport Timeline został pomyślnie wygenerowany i pobrany!');
      handleCloseExportDialog();
      
    } catch (error) {
      console.error('Błąd podczas generowania raportu Timeline:', error);
      showError('Wystąpił błąd podczas generowania raportu: ' + error.message);
    }
  };

  return (
    <>
      <Tooltip title="Eksportuj timeline do pliku Excel (XLSX)">
        <Button
          variant="outlined"
          size="small"
          onClick={handleOpenExportDialog}
          startIcon={<FileDownloadIcon />}
          disabled={!filteredTasks || filteredTasks.length === 0}
          sx={{ 
            height: 32,
            fontSize: '0.75rem',
            px: 1
          }}
        >
          Eksportuj Timeline
        </Button>
      </Tooltip>

      <Dialog
        open={exportDialog}
        onClose={handleCloseExportDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Eksportuj Timeline do Excel</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Skonfiguruj parametry eksportu timeline. Raport będzie zawierał szczegółowy harmonogram, 
            wizualny timeline oraz podsumowanie statystyk.
          </Typography>

          <Grid container spacing={3}>
            {/* Zakres dat */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Zakres dat
              </Typography>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <DatePicker
                      label="Data początkowa"
                      value={exportFilters.startDate}
                      onChange={(newValue) => {
                        if (newValue) {
                          setExportFilters(prev => ({
                            ...prev,
                            startDate: newValue
                          }));
                        }
                      }}
                      format="dd.MM.yyyy"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          size: 'small'
                        }
                      }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <DatePicker
                      label="Data końcowa"
                      value={exportFilters.endDate}
                      onChange={(newValue) => {
                        if (newValue) {
                          setExportFilters(prev => ({
                            ...prev,
                            endDate: newValue
                          }));
                        }
                      }}
                      format="dd.MM.yyyy"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          size: 'small'
                        }
                      }}
                    />
                  </Grid>
                </Grid>
              </LocalizationProvider>
            </Grid>

            {/* Filtry klientów */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Filtry klientów
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

              <Box sx={{ 
                maxHeight: 200, 
                overflow: 'auto', 
                border: '1px solid #e0e0e0', 
                borderRadius: 1, 
                p: 1 
              }}>
                <FormGroup>
                  {customers.map(customer => (
                    <FormControlLabel
                      key={customer.id}
                      control={
                        <Checkbox
                          checked={exportFilters.selectedCustomers[customer.id] || false}
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
                  
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={exportFilters.selectedCustomers['no-customer'] || false}
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
            </Grid>

            {/* Podsumowanie */}
            <Grid item xs={12}>
              <Box sx={{ 
                bgcolor: 'grey.50', 
                p: 2, 
                borderRadius: 1, 
                border: '1px solid #e0e0e0' 
              }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Podsumowanie eksportu
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Okres: {format(exportFilters.startDate, 'dd.MM.yyyy', { locale: pl })} - {format(exportFilters.endDate, 'dd.MM.yyyy', { locale: pl })}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Zadań do eksportu: {(() => {
                    if (!filteredTasks || filteredTasks.length === 0) return 0;
                    
                    return filteredTasks.filter(task => {
                      // Sprawdź datę zadania
                      if (!task.scheduledDate) return false;
                      
                      let taskDate;
                      try {
                        if (task.scheduledDate instanceof Date) {
                          taskDate = task.scheduledDate;
                        } else if (task.scheduledDate.toDate && typeof task.scheduledDate.toDate === 'function') {
                          taskDate = task.scheduledDate.toDate();
                        } else {
                          taskDate = new Date(task.scheduledDate);
                        }
                        
                        // Sprawdź czy data jest poprawna
                        if (isNaN(taskDate.getTime())) return false;
                        
                        const filterStartDate = startOfDay(exportFilters.startDate);
                        const filterEndDate = endOfDay(exportFilters.endDate);
                        
                        const isInDateRange = taskDate >= filterStartDate && taskDate <= filterEndDate;
                        if (!isInDateRange) return false;
                        
                      } catch (error) {
                        console.warn('Błąd przetwarzania daty zadania:', error);
                        return false;
                      }
                      
                      // Sprawdź filtr klientów (tylko jeśli są wybrane jakieś klienci)
                      if (exportFilters.selectedCustomers && Object.keys(exportFilters.selectedCustomers).length > 0) {
                        const customerId = task.customer?.id || task.customerId;
                        
                        if (customerId) {
                          return exportFilters.selectedCustomers[customerId] === true;
                        } else {
                          return exportFilters.selectedCustomers['no-customer'] === true;
                        }
                      }
                      
                      return true;
                    }).length;
                  })()}
                </Typography>
                <Typography variant="body2">
                  Grupowanie: {groupBy === 'workstation' ? 'Według stanowisk' : 'Według zamówień'}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseExportDialog}>
            Anuluj
          </Button>
          <Button 
            onClick={handleExport}
            variant="contained"
            color="primary"
            disabled={!filteredTasks || filteredTasks.length === 0}
          >
            Eksportuj do Excel
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TimelineExport; 