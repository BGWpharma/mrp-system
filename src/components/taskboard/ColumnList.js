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
  useTheme
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
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
import { createTask, moveTask, updateTask } from '../../services/taskboardService';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';

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
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyPress={handleKeyPress}
        style={{
          flex: 1,
          padding: '8px 12px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '4px',
          color: 'inherit',
          fontSize: '14px',
          outline: 'none'
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
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
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

  // useMemo dla zadań w poszczególnych kolumnach - zapobiega niepotrzebnym obliczeniom
  const tasksByColumn = useMemo(() => {
    const result = {};
    columns.forEach(column => {
      const columnTasks = tasks.filter(task => task.columnId === column.id);
      result[column.id] = {
        active: columnTasks
          .filter(task => task.status !== 'completed')
          .sort((a, b) => a.position - b.position),
        completed: columnTasks
          .filter(task => task.status === 'completed')
          .sort((a, b) => a.position - b.position)
      };
    });
    return result;
  }, [tasks, columns]);

  const toggleCompletedSection = useCallback((columnId) => {
    setShowCompletedTasks(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  }, []);

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
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
            const { active: activeTasks, completed: completedTasks } = tasksByColumn[column.id] || { active: [], completed: [] };
            const allTaskIds = [...activeTasks, ...completedTasks].map(t => t.id);

            return (
              <Paper
                key={column.id}
                sx={{
                  minWidth: isMobile ? 280 : 320,
                  maxWidth: isMobile ? 280 : 320,
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 1.5,
                  p: 2,
                  maxHeight: '75vh',
                  overflow: 'hidden'
                }}
              >
                {/* Nagłówek kolumny */}
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                  <Typography variant="h6" fontWeight="bold">
                    {column.title}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Typography variant="caption" color="text.secondary" mr={1}>
                      {activeTasks.length}
                    </Typography>
                    <Tooltip title={t('deleteColumn')}>
                      <IconButton
                        size="small"
                        onClick={() => onDeleteColumn(column.id)}
                        sx={{ p: 0.5 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>

                {/* Lista zadań - teraz jako droppable */}
                <DroppableColumn column={column}>
                  <SortableContext
                    items={allTaskIds}
                    strategy={verticalListSortingStrategy}
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
                          border: '2px dashed rgba(255, 255, 255, 0.1)',
                          borderRadius: 1,
                          minHeight: 80,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {t('dragTaskHere')}
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
                              backgroundColor: 'rgba(255, 255, 255, 0.03)',
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
