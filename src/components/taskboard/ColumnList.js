// src/components/taskboard/ColumnList.js
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  Tooltip,
  Collapse,
  useMediaQuery,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SortIcon from '@mui/icons-material/Sort';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import TaskCard from './TaskCard';
import { createTask, moveTask, updateTask, updateColumn } from '../../services/taskboardService';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';

// Komponent nagłówka kolumny z menu edycji
const ColumnHeader = React.memo(({ 
  column, 
  taskCount, 
  onDelete, 
  onRename, 
  onMoveLeft, 
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  onSortChange,
  t 
}) => {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(column.title);

  const handleMenuOpen = (event) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleOpenRenameDialog = () => {
    setNewTitle(column.title);
    setEditDialogOpen(true);
    handleMenuClose();
  };

  const handleRename = () => {
    if (newTitle.trim() && newTitle.trim() !== column.title) {
      onRename(column.id, newTitle.trim());
    }
    setEditDialogOpen(false);
  };

  const handleMoveLeft = () => {
    onMoveLeft(column.id);
    handleMenuClose();
  };

  const handleMoveRight = () => {
    onMoveRight(column.id);
    handleMenuClose();
  };

  const handleDelete = () => {
    onDelete(column.id);
    handleMenuClose();
  };

  const handleSortMenuOpen = (event) => {
    setSortMenuAnchor(event.currentTarget);
    handleMenuClose();
  };

  const handleSortMenuClose = () => {
    setSortMenuAnchor(null);
  };

  const handleSortChange = (sortBy) => {
    onSortChange(column.id, sortBy);
    handleSortMenuClose();
  };

  // Pobierz aktualną opcję sortowania
  const currentSort = column.sortBy || 'manual';

  // Funkcja zwracająca tooltip dla aktywnego sortowania
  const getSortTooltip = () => {
    if (!currentSort || currentSort === 'manual') return null;
    const sortLabels = {
      priority: t('sortByPriority'),
      dueDate: t('sortByDueDate'),
      createdDate: t('sortByCreatedDate'),
      updatedDate: t('sortByUpdatedDate'),
      titleAsc: t('sortByTitle'),
      titleDesc: t('sortByTitleDesc')
    };
    return `${t('autoSort')}: ${sortLabels[currentSort] || currentSort}`;
  };

  return (
    <>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={0.5} flex={1} minWidth={0}>
          <Typography variant="h6" fontWeight="bold" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {column.title}
          </Typography>
          {currentSort && currentSort !== 'manual' && (
            <Tooltip title={getSortTooltip()}>
              <SortIcon 
                sx={{ 
                  fontSize: 16, 
                  color: 'primary.main',
                  opacity: 0.8 
                }} 
              />
            </Tooltip>
          )}
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Typography variant="caption" color="text.secondary" mr={0.5}>
            {taskCount}
          </Typography>
          <Tooltip title={t('columnOptions')}>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              sx={{ p: 0.5 }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Menu opcji kolumny */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleOpenRenameDialog}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('renameColumn')}</ListItemText>
        </MenuItem>
        
        <Divider />
        
        <MenuItem onClick={handleMoveLeft} disabled={!canMoveLeft}>
          <ListItemIcon>
            <ArrowBackIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('moveLeft')}</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={handleMoveRight} disabled={!canMoveRight}>
          <ListItemIcon>
            <ArrowForwardIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('moveRight')}</ListItemText>
        </MenuItem>
        
        <Divider />
        
        <MenuItem onClick={handleSortMenuOpen}>
          <ListItemIcon>
            <SortIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('sortBy')}</ListItemText>
        </MenuItem>
        
        <Divider />
        
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>{t('deleteColumn')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Dialog zmiany nazwy */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2
          }
        }}
      >
        <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
          {t('renameColumn')}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            label={t('columnName')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) {
                handleRename();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ borderTop: 1, borderColor: 'divider', px: 2.5, py: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)}>{t('cancel')}</Button>
          <Button
            onClick={handleRename}
            variant="contained"
            disabled={!newTitle.trim()}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Menu sortowania */}
      <Menu
        anchorEl={sortMenuAnchor}
        open={Boolean(sortMenuAnchor)}
        onClose={handleSortMenuClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem 
          onClick={() => handleSortChange('manual')}
          selected={currentSort === 'manual'}
        >
          <ListItemText primary={t('sortByManual')} />
        </MenuItem>
        <MenuItem 
          onClick={() => handleSortChange('priority')}
          selected={currentSort === 'priority'}
        >
          <ListItemText primary={t('sortByPriority')} />
        </MenuItem>
        <MenuItem 
          onClick={() => handleSortChange('dueDate')}
          selected={currentSort === 'dueDate'}
        >
          <ListItemText primary={t('sortByDueDate')} />
        </MenuItem>
        <MenuItem 
          onClick={() => handleSortChange('createdDate')}
          selected={currentSort === 'createdDate'}
        >
          <ListItemText primary={t('sortByCreatedDate')} />
        </MenuItem>
        <MenuItem 
          onClick={() => handleSortChange('updatedDate')}
          selected={currentSort === 'updatedDate'}
        >
          <ListItemText primary={t('sortByUpdatedDate')} />
        </MenuItem>
        <MenuItem 
          onClick={() => handleSortChange('titleAsc')}
          selected={currentSort === 'titleAsc'}
        >
          <ListItemText primary={t('sortByTitle')} />
        </MenuItem>
        <MenuItem 
          onClick={() => handleSortChange('titleDesc')}
          selected={currentSort === 'titleDesc'}
        >
          <ListItemText primary={t('sortByTitleDesc')} />
        </MenuItem>
      </Menu>
    </>
  );
});

ColumnHeader.displayName = 'ColumnHeader';

// Wyodrębniony komponent AddTaskInput z własnym stanem lokalnym
// Zapobiega re-renderom całej kolumny przy wpisywaniu tekstu
const AddTaskInput = React.memo(({ columnId, onAdd, placeholder }) => {
  const [localValue, setLocalValue] = useState('');
  const inputRef = useRef(null);

  // Focus na input po montażu (opcjonalnie)
  useEffect(() => {
    // Nie ustawiamy automatycznego focusa - może być niepożądane
  }, []);

  const handleAdd = useCallback(() => {
    const trimmedValue = localValue.trim();
    if (trimmedValue) {
      onAdd(columnId, trimmedValue);
      setLocalValue('');
      // Zachowaj focus dla kolejnych zadań
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [columnId, localValue, onAdd]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  return (
    <Box display="flex" gap={1}>
      <Box
        component="input"
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyPress={handleKeyPress}
        sx={{
          flex: 1,
          padding: '8px 12px',
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'divider',
          borderRadius: '4px',
          color: 'text.primary',
          fontSize: '14px',
          outline: 'none',
          '&::placeholder': {
            color: 'text.secondary',
            opacity: 0.7,
          },
          '&:focus': {
            borderColor: 'primary.main',
          }
        }}
      />
      <Button
        variant="contained"
        size="small"
        onClick={handleAdd}
        disabled={!localValue.trim()}
        sx={{ minWidth: 'auto', px: 1.5 }}
      >
        <AddIcon fontSize="small" />
      </Button>
    </Box>
  );
});

AddTaskInput.displayName = 'AddTaskInput';

// Komponent droppable kolumny
const DroppableColumn = ({ column, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: {
      type: 'column',
      columnId: column.id
    }
  });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        mb: 2,
        pr: 0.5,
        minHeight: 100,
        backgroundColor: isOver ? 'rgba(63, 140, 255, 0.1)' : 'transparent',
        borderRadius: 1,
        transition: 'background-color 0.2s ease',
        '&::-webkit-scrollbar': {
          width: 6,
        },
        '&::-webkit-scrollbar-track': {
          backgroundColor: 'action.hover',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'action.disabled',
          borderRadius: 3,
        },
      }}
    >
      {children}
    </Box>
  );
};

const ColumnList = ({ 
  columns, 
  tasks, 
  board,
  onDeleteColumn, 
  onRefresh,
  onOptimisticTaskUpdate,
  onOptimisticTasksUpdate,
  userNamesMap = {}
}) => {
  const { t } = useTranslation('taskboard');
  const { currentUser } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [activeTask, setActiveTask] = useState(null);
  const [showCompletedTasks, setShowCompletedTasks] = useState({});
  const [columnSortOverrides, setColumnSortOverrides] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Zoptymalizowane handlery z useCallback
  const handleDragStart = useCallback((event) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    setActiveTask(task);
  }, [tasks]);

  const handleDragOver = useCallback((event) => {
    // Opcjonalnie: możesz dodać logikę podczas przeciągania
  }, []);

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;
    if (active.id === over.id) return;

    const activeTaskData = tasks.find(t => t.id === active.id);
    if (!activeTaskData) return;

    // Określ docelową kolumnę
    let targetColumnId = null;
    let overTaskData = null;
    
    // Sprawdź czy upuszczono na kolumnę (pustą)
    if (over.id.toString().startsWith('column-')) {
      targetColumnId = over.id.toString().replace('column-', '');
    } 
    // Sprawdź czy upuszczono na zadanie
    else {
      overTaskData = tasks.find(t => t.id === over.id);
      if (overTaskData) {
        targetColumnId = overTaskData.columnId;
      }
    }

    if (!targetColumnId) return;

    const sourceColumnId = activeTaskData.columnId;
    const isSameColumn = sourceColumnId === targetColumnId;

    // Pobierz zadania z kolumny źródłowej i docelowej
    const sourceColumnTasks = tasks
      .filter(t => t.columnId === sourceColumnId)
      .sort((a, b) => a.position - b.position);
    
    const targetColumnTasks = isSameColumn 
      ? sourceColumnTasks 
      : tasks.filter(t => t.columnId === targetColumnId).sort((a, b) => a.position - b.position);

    if (isSameColumn) {
      // Sortowanie w ramach tej samej kolumny
      const oldIndex = sourceColumnTasks.findIndex(t => t.id === active.id);
      const newIndex = sourceColumnTasks.findIndex(t => t.id === over.id);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      // Użyj arrayMove do zmiany kolejności
      const reorderedTasks = arrayMove(sourceColumnTasks, oldIndex, newIndex);

      // Zaktualizuj pozycje
      const updatedTasks = tasks.map(task => {
        if (task.columnId !== sourceColumnId) return task;
        
        const newPositionIndex = reorderedTasks.findIndex(t => t.id === task.id);
        return { ...task, position: newPositionIndex };
      });

      if (onOptimisticTasksUpdate) {
        onOptimisticTasksUpdate(updatedTasks);
      }

      // Zaktualizuj pozycje w Firestore
      try {
        const updatePromises = reorderedTasks.map((task, index) => 
          updateTask(task.id, { position: index })
        );
        await Promise.all(updatePromises);
      } catch (error) {
        console.error('Błąd podczas sortowania zadań:', error);
        if (onRefresh) onRefresh();
      }
    } else {
      // Przenoszenie między kolumnami
      let newPosition = targetColumnTasks.length; // Domyślnie na koniec

      // Jeśli upuszczono na zadanie, wstaw na jego pozycję
      if (overTaskData) {
        newPosition = overTaskData.position;
      }

      // Optimistic update
      const updatedTasks = tasks.map(task => {
        // Przenieś aktywne zadanie
        if (task.id === activeTaskData.id) {
          return { ...task, columnId: targetColumnId, position: newPosition };
        }
        // Przesuń pozycje w kolumnie źródłowej (zmniejsz)
        if (task.columnId === sourceColumnId && task.position > activeTaskData.position) {
          return { ...task, position: task.position - 1 };
        }
        // Przesuń pozycje w kolumnie docelowej (zwiększ)
        if (task.columnId === targetColumnId && task.position >= newPosition) {
          return { ...task, position: task.position + 1 };
        }
        return task;
      });

      if (onOptimisticTasksUpdate) {
        onOptimisticTasksUpdate(updatedTasks);
      }

      // Aktualizacja w Firestore
      try {
        await moveTask(activeTaskData.id, targetColumnId, newPosition);
        
        // Zaktualizuj pozycje pozostałych zadań w obu kolumnach
        const tasksToUpdate = updatedTasks.filter(
          t => (t.columnId === sourceColumnId || t.columnId === targetColumnId) && t.id !== activeTaskData.id
        );
        
        const updatePromises = tasksToUpdate.map(task => 
          updateTask(task.id, { position: task.position })
        );
        await Promise.all(updatePromises);
      } catch (error) {
        console.error('Błąd podczas przenoszenia zadania:', error);
        if (onRefresh) onRefresh();
      }
    }
  }, [tasks, onOptimisticTasksUpdate, onRefresh]);

  // Zoptymalizowany callback dla dodawania zadań
  const handleAddTask = useCallback(async (columnId, title) => {
    if (!title || !currentUser) return;

    try {
      const tasksInColumn = tasks.filter(t => t.columnId === columnId);
      await createTask({
        boardId: board.id,
        columnId,
        title,
        description: '',
        status: 'todo',
        position: tasksInColumn.length,
        assignedTo: [],
        subtaskLists: [],
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email
      });
    } catch (error) {
      console.error('Błąd podczas tworzenia zadania:', error);
    }
  }, [tasks, board?.id, currentUser]);

  // Funkcja sortująca zadania na podstawie wybranej opcji
  const sortTasks = useCallback((tasksToSort, sortBy) => {
    if (!sortBy || sortBy === 'manual') {
      return [...tasksToSort].sort((a, b) => a.position - b.position);
    }

    const sorted = [...tasksToSort];
    
    switch (sortBy) {
      case 'priority': {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4, undefined: 5 };
        return sorted.sort((a, b) => {
          const aPriority = a.priority || 'none';
          const bPriority = b.priority || 'none';
          const orderA = priorityOrder[aPriority] ?? priorityOrder.undefined;
          const orderB = priorityOrder[bPriority] ?? priorityOrder.undefined;
          return orderA - orderB;
        });
      }
      case 'dueDate':
        return sorted.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        });
      case 'createdDate':
        return sorted.sort((a, b) => {
          const aTime = a.createdAt?.getTime() || 0;
          const bTime = b.createdAt?.getTime() || 0;
          return bTime - aTime; // Najnowsze na górze
        });
      case 'updatedDate':
        return sorted.sort((a, b) => {
          const aTime = a.updatedAt?.getTime() || 0;
          const bTime = b.updatedAt?.getTime() || 0;
          return bTime - aTime; // Najnowsze na górze
        });
      case 'titleAsc':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pl'));
      case 'titleDesc':
        return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'pl'));
      default:
        return sorted.sort((a, b) => a.position - b.position);
    }
  }, []);

  // useMemo dla zadań w poszczególnych kolumnach - zapobiega niepotrzebnym obliczeniom
  const tasksByColumn = useMemo(() => {
    const result = {};
    columns.forEach(column => {
      const columnTasks = tasks.filter(task => task.columnId === column.id);
      const activeTasks = columnTasks.filter(task => task.status !== 'completed');
      const completedTasks = columnTasks.filter(task => task.status === 'completed');
      
      // Użyj nadpisania jeśli istnieje, w przeciwnym razie użyj wartości z kolumny
      const effectiveSortBy = columnSortOverrides[column.id] !== undefined 
        ? columnSortOverrides[column.id] 
        : column.sortBy;
      
      result[column.id] = {
        active: sortTasks(activeTasks, effectiveSortBy),
        completed: sortTasks(completedTasks, effectiveSortBy),
        effectiveSortBy // Zapisz efektywne sortowanie dla komponentów potomnych
      };
    });
    return result;
  }, [tasks, columns, columnSortOverrides, sortTasks]);

  const toggleCompletedSection = useCallback((columnId) => {
    setShowCompletedTasks(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  }, []);

  // Usuń nadpisania sortowania gdy dane z Firestore są już zsynchronizowane
  useEffect(() => {
    const newOverrides = { ...columnSortOverrides };
    let hasChanges = false;
    
    columns.forEach(column => {
      if (columnSortOverrides[column.id] !== undefined) {
        // Jeśli wartość z Firestore odpowiada nadpisaniu, usuń nadpisanie
        if (column.sortBy === columnSortOverrides[column.id]) {
          delete newOverrides[column.id];
          hasChanges = true;
        }
      }
    });
    
    if (hasChanges) {
      setColumnSortOverrides(newOverrides);
    }
  }, [columns, columnSortOverrides]);

  // Zmień nazwę kolumny
  const handleRenameColumn = useCallback(async (columnId, newTitle) => {
    try {
      await updateColumn(columnId, { title: newTitle });
    } catch (error) {
      console.error('Błąd podczas zmiany nazwy kolumny:', error);
    }
  }, []);

  // Zmień sortowanie kolumny
  const handleSortChange = useCallback(async (columnId, sortBy) => {
    // Optimistic update - natychmiastowa aktualizacja UI
    setColumnSortOverrides(prev => ({
      ...prev,
      [columnId]: sortBy
    }));
    
    try {
      await updateColumn(columnId, { sortBy });
    } catch (error) {
      console.error('Błąd podczas zmiany sortowania kolumny:', error);
      // W przypadku błędu, usuń nadpisanie
      setColumnSortOverrides(prev => {
        const newOverrides = { ...prev };
        delete newOverrides[columnId];
        return newOverrides;
      });
    }
  }, []);

  // Przesuń kolumnę w lewo
  const handleMoveColumnLeft = useCallback(async (columnId) => {
    const columnIndex = columns.findIndex(c => c.id === columnId);
    if (columnIndex <= 0) return;

    try {
      const currentColumn = columns[columnIndex];
      const leftColumn = columns[columnIndex - 1];
      
      // Zamień pozycje
      await Promise.all([
        updateColumn(currentColumn.id, { position: leftColumn.position }),
        updateColumn(leftColumn.id, { position: currentColumn.position })
      ]);
    } catch (error) {
      console.error('Błąd podczas przesuwania kolumny:', error);
    }
  }, [columns]);

  // Przesuń kolumnę w prawo
  const handleMoveColumnRight = useCallback(async (columnId) => {
    const columnIndex = columns.findIndex(c => c.id === columnId);
    if (columnIndex >= columns.length - 1) return;

    try {
      const currentColumn = columns[columnIndex];
      const rightColumn = columns[columnIndex + 1];
      
      // Zamień pozycje
      await Promise.all([
        updateColumn(currentColumn.id, { position: rightColumn.position }),
        updateColumn(rightColumn.id, { position: currentColumn.position })
      ]);
    } catch (error) {
      console.error('Błąd podczas przesuwania kolumny:', error);
    }
  }, [columns]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          pb: 2,
          minHeight: '70vh',
          WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': {
            height: 8,
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'action.hover',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'action.disabled',
            borderRadius: 4,
          },
        }}
      >
        {columns.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              p: 4
            }}
          >
            <Typography variant="body1" color="text.secondary">
              {t('noColumns')}
            </Typography>
          </Box>
        ) : (
          columns.map((column) => {
            const { active: activeTasks, completed: completedTasks, effectiveSortBy } = tasksByColumn[column.id] || { active: [], completed: [], effectiveSortBy: 'manual' };
            const allTaskIds = [...activeTasks, ...completedTasks].map(t => t.id);

            return (
              <Paper
                key={column.id}
                sx={{
                  minWidth: isMobile ? 280 : 320,
                  maxWidth: isMobile ? 280 : 320,
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'action.hover',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 2,
                  maxHeight: '75vh',
                  overflow: 'hidden'
                }}
              >
                {/* Nagłówek kolumny z menu */}
                <ColumnHeader
                  column={{ ...column, sortBy: effectiveSortBy }}
                  taskCount={activeTasks.length}
                  onDelete={onDeleteColumn}
                  onRename={handleRenameColumn}
                  onMoveLeft={handleMoveColumnLeft}
                  onMoveRight={handleMoveColumnRight}
                  onSortChange={handleSortChange}
                  canMoveLeft={columns.findIndex(c => c.id === column.id) > 0}
                  canMoveRight={columns.findIndex(c => c.id === column.id) < columns.length - 1}
                  t={t}
                />

                {/* Lista zadań - teraz jako droppable */}
                <DroppableColumn column={column}>
                  <SortableContext
                    items={allTaskIds}
                    strategy={verticalListSortingStrategy}
                    disabled={effectiveSortBy && effectiveSortBy !== 'manual'}
                  >
                    {/* Aktywne zadania */}
                    {activeTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        board={board}
                        onRefresh={onRefresh}
                        onOptimisticUpdate={onOptimisticTaskUpdate}
                        userNamesMap={userNamesMap}
                        disableDrag={effectiveSortBy && effectiveSortBy !== 'manual'}
                      />
                    ))}

                    {/* Placeholder gdy brak aktywnych zadań */}
                    {activeTasks.length === 0 && (
                      <Box
                        sx={{
                          p: 3,
                          textAlign: 'center',
                          color: 'text.secondary',
                          fontSize: '0.875rem',
                          border: 2,
                          borderStyle: 'dashed',
                          borderColor: 'divider',
                          borderRadius: 1,
                          minHeight: 80,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {effectiveSortBy && effectiveSortBy !== 'manual' 
                          ? t('noTasks')
                          : t('dragTaskHere')
                        }
                      </Box>
                    )}

                    {/* Sekcja ukończonych zadań */}
                    {completedTasks.length > 0 && (
                      <Box sx={{ mt: 1.5 }}>
                        <Box
                          onClick={() => toggleCompletedSection(column.id)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            py: 0.75,
                            px: 1,
                            borderRadius: 1,
                            mb: 0.75,
                            '&:hover': {
                              backgroundColor: 'action.hover',
                            }
                          }}
                        >
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              color: 'text.secondary',
                              fontSize: '0.7rem',
                              fontWeight: 500
                            }}
                          >
                            {t('completed')} · {completedTasks.length}
                          </Typography>
                          {showCompletedTasks[column.id] ? (
                            <ExpandLessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                          ) : (
                            <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                          )}
                        </Box>

                        <Collapse in={showCompletedTasks[column.id]}>
                          <Box>
                            {completedTasks.map((task) => (
                              <TaskCard 
                                key={task.id} 
                                task={task}
                                board={board}
                                onRefresh={onRefresh}
                                onOptimisticUpdate={onOptimisticTaskUpdate}
                                userNamesMap={userNamesMap}
                                disableDrag={effectiveSortBy && effectiveSortBy !== 'manual'}
                              />
                            ))}
                          </Box>
                        </Collapse>
                      </Box>
                    )}
                  </SortableContext>
                </DroppableColumn>

                {/* Dodawanie nowego zadania - izolowany komponent */}
                <AddTaskInput 
                  columnId={column.id} 
                  onAdd={handleAddTask}
                  placeholder={t('addTask')}
                />
              </Paper>
            );
          })
        )}
      </Box>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? (
          <Box
            sx={{
              width: isMobile ? 280 : 320,
              opacity: 0.9,
              cursor: 'grabbing'
            }}
          >
            <TaskCard
              task={activeTask}
              board={board}
              onRefresh={onRefresh}
              onOptimisticUpdate={onOptimisticTaskUpdate}
              userNamesMap={userNamesMap}
            />
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default React.memo(ColumnList);
