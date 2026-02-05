// src/components/taskboard/TaskCard.js
import React, { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Checkbox,
  Menu,
  MenuItem,
  Chip,
  Avatar,
  Tooltip,
  useMediaQuery,
  useTheme
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import WarningIcon from '@mui/icons-material/Warning';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { updateTask, deleteTask } from '../../services/taskboardService';
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import TaskDetailsDialog from './TaskDetailsDialog';
import MentionText from './MentionText';
import { useTranslation } from 'react-i18next';

const TaskCard = ({ task, board, onRefresh, onOptimisticUpdate, userNamesMap = {}, disableDrag = false }) => {
  const { t } = useTranslation('taskboard');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  // Drag & Drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    disabled: disableDrag
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priorityConfig = {
    low: { color: '#4CAF50', label: t('priorityLow'), bgColor: 'rgba(76, 175, 80, 0.1)' },
    medium: { color: '#FFA726', label: t('priorityMedium'), bgColor: 'rgba(255, 167, 38, 0.1)' },
    high: { color: '#FF5722', label: t('priorityHigh'), bgColor: 'rgba(255, 87, 34, 0.1)' },
    urgent: { color: '#D32F2F', label: t('priorityUrgent'), bgColor: 'rgba(211, 47, 47, 0.15)' }
  };

  // Formatowanie terminu z kolorami
  const getDueDateInfo = useMemo(() => {
    if (!task.dueDate) return null;
    
    const dueDate = task.dueDate;
    const now = new Date();
    
    if (task.status === 'completed') {
      return {
        label: format(dueDate, 'dd MMM', { locale: pl }),
        color: 'default',
        bgColor: undefined,
        isOverdue: false
      };
    }
    
    if (isPast(dueDate) && !isToday(dueDate)) {
      const daysOverdue = differenceInDays(now, dueDate);
      return {
        label: t('daysAgo', { count: daysOverdue }),
        color: 'error',
        bgColor: 'rgba(211, 47, 47, 0.15)',
        isOverdue: true
      };
    }
    
    if (isToday(dueDate)) {
      return {
        label: t('today'),
        color: 'warning',
        bgColor: 'rgba(255, 167, 38, 0.15)',
        isOverdue: false
      };
    }
    
    if (isTomorrow(dueDate)) {
      return {
        label: t('tomorrow'),
        color: 'info',
        bgColor: 'rgba(33, 150, 243, 0.1)',
        isOverdue: false
      };
    }
    
    const daysUntil = differenceInDays(dueDate, now);
    if (daysUntil <= 7) {
      return {
        label: format(dueDate, 'EEEE', { locale: pl }),
        color: 'default',
        bgColor: undefined,
        isOverdue: false
      };
    }
    
    return {
      label: format(dueDate, 'dd MMM', { locale: pl }),
      color: 'default',
      bgColor: undefined,
      isOverdue: false
    };
  }, [task.dueDate, task.status, t]);

  const handleToggleComplete = async () => {
    try {
      const newStatus = task.status === 'completed' ? 'todo' : 'completed';
      const updates = {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date() : undefined
      };
      
      if (onOptimisticUpdate) {
        onOptimisticUpdate(task.id, updates);
      }
      
      updateTask(task.id, updates).catch(error => {
        console.error('Błąd podczas aktualizacji zadania:', error);
        if (onRefresh) onRefresh();
      });
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
    }
  };

  const handleMenuOpen = (event) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleDeleteTask = async () => {
    if (!window.confirm(t('deleteTaskConfirm'))) {
      return;
    }

    try {
      await deleteTask(task.id);
      handleMenuClose();
    } catch (error) {
      console.error('Błąd podczas usuwania zadania:', error);
    }
  };

  // Oblicz statystyki podzadań
  const totalSubtasks = task.subtaskLists?.reduce((sum, list) => sum + list.subtasks.length, 0) || 0;
  const completedSubtasks = task.subtaskLists?.reduce(
    (sum, list) => sum + list.subtasks.filter(st => st.completed).length,
    0
  ) || 0;

  // Określ czy zadanie ma wysoki priorytet
  const isHighPriority = task.priority === 'high' || task.priority === 'urgent';

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...(!disableDrag ? listeners : {})}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          mb: isMobile ? 0.75 : 1,
          backgroundColor: isHighPriority && task.status !== 'completed'
            ? priorityConfig[task.priority].bgColor
            : 'rgba(255, 255, 255, 0.02)',
          borderRadius: isMobile ? 1 : 1.5,
          touchAction: 'pan-y',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          borderLeft: task.priority 
            ? `3px solid ${priorityConfig[task.priority].color}` 
            : '3px solid transparent',
          border: getDueDateInfo?.isOverdue
            ? '1px solid rgba(211, 47, 47, 0.5)'
            : '1px solid rgba(255, 255, 255, 0.06)',
          opacity: task.status === 'completed' ? 0.6 : 1,
          transition: 'all 0.2s ease',
          cursor: disableDrag ? 'pointer' : (isDragging ? 'grabbing' : (isMobile ? 'pointer' : 'grab')),
          position: 'relative',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderColor: getDueDateInfo?.isOverdue 
              ? 'rgba(211, 47, 47, 0.7)' 
              : 'rgba(255, 255, 255, 0.15)',
            transform: isDragging ? 'none' : 'translateY(-1px)',
            boxShadow: isDragging ? 'none' : '0 4px 12px rgba(0, 0, 0, 0.2)'
          }
        }}
        onClick={(e) => {
          if (!isDragging) {
            handleOpenDialog();
          }
        }}
      >
        <CardContent sx={{ p: isMobile ? 1 : 1.5, '&:last-child': { pb: isMobile ? 1 : 1.5 } }}>
          <Box display="flex" alignItems="flex-start" gap={0.5}>
            {/* Checkbox */}
            <Box
              sx={{
                opacity: isHovered || task.status === 'completed' ? 1 : 0,
                transition: 'opacity 0.2s',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Checkbox
                checked={task.status === 'completed'}
                icon={<CheckBoxOutlineBlankIcon sx={{ fontSize: isMobile ? '1.3rem' : '1.1rem' }} />}
                checkedIcon={<CheckBoxIcon sx={{ fontSize: isMobile ? '1.3rem' : '1.1rem' }} />}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggleComplete();
                }}
                size="small"
                color="success"
                sx={{ 
                  p: isMobile ? 0.5 : 0,
                  '&:hover': { bgcolor: 'transparent' }
                }}
              />
            </Box>

            {/* Główna treść */}
            <Box flex={1} sx={{ minWidth: 0 }}>
              {/* Tytuł */}
              <Typography
                variant="body2"
                sx={{
                  textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                  color: task.status === 'completed' ? 'text.disabled' : 'text.primary',
                  fontWeight: 500,
                  fontSize: isMobile ? '0.85rem' : '0.875rem',
                  lineHeight: 1.4,
                  mb: (!!task.assignedTo?.length || totalSubtasks > 0 || !!task.dueDate || !!task.description) ? 0.75 : 0
                }}
              >
                {task.title}
              </Typography>

              {/* Opis (skrócony) z obsługą mentions */}
              {task.description && task.status !== 'completed' && (
                <Box
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    color: 'text.secondary',
                    fontSize: '0.7rem',
                    mb: 0.5,
                    opacity: 0.8
                  }}
                >
                  <MentionText 
                    text={task.description} 
                    variant="inline"
                    truncate={true}
                    maxLength={60}
                  />
                </Box>
              )}

              {/* Metadata */}
              {(!!task.priority || !!task.assignedTo?.length || totalSubtasks > 0 || !!task.dueDate || !!task.attachments?.length) && (
                <Box display="flex" alignItems="center" gap={isMobile ? 0.4 : 0.5} flexWrap="wrap">
                  {/* Priorytet jako kropka */}
                  {task.priority && (
                    <Tooltip title={priorityConfig[task.priority].label} arrow>
                      <Box
                        sx={{
                          width: isMobile ? 6 : 8,
                          height: isMobile ? 6 : 8,
                          borderRadius: '50%',
                          backgroundColor: priorityConfig[task.priority].color,
                          flexShrink: 0,
                          boxShadow: isHighPriority ? `0 0 4px ${priorityConfig[task.priority].color}` : 'none'
                        }}
                      />
                    </Tooltip>
                  )}

                  {/* Avatary przypisanych użytkowników */}
                  {task.assignedTo && task.assignedTo.length > 0 && (
                    <Box display="flex" alignItems="center" gap={0.25} sx={{ flexShrink: 0 }}>
                      {task.assignedTo.slice(0, 2).map(userId => {
                        const userName = userNamesMap[userId] || 'Użytkownik';
                        return (
                          <Tooltip key={userId} title={userName} arrow>
                            <Avatar
                              sx={{
                                width: isMobile ? 16 : 18,
                                height: isMobile ? 16 : 18,
                                fontSize: isMobile ? '0.55rem' : '0.6rem',
                                bgcolor: 'primary.main',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                              }}
                            >
                              {userName.charAt(0).toUpperCase()}
                            </Avatar>
                          </Tooltip>
                        );
                      })}
                      {task.assignedTo.length > 2 && (
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            fontSize: '0.6rem', 
                            color: 'text.secondary',
                            ml: 0.25 
                          }}
                        >
                          +{task.assignedTo.length - 2}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Termin */}
                  {getDueDateInfo && (
                    <Chip
                      icon={getDueDateInfo.isOverdue 
                        ? <WarningIcon sx={{ fontSize: isMobile ? '0.65rem' : '0.7rem' }} />
                        : <CalendarTodayIcon sx={{ fontSize: isMobile ? '0.65rem' : '0.7rem' }} />
                      }
                      label={getDueDateInfo.label}
                      size="small"
                      color={getDueDateInfo.color}
                      sx={{
                        height: isMobile ? 16 : 18,
                        fontSize: isMobile ? '0.6rem' : '0.65rem',
                        flexShrink: 0,
                        fontWeight: getDueDateInfo.isOverdue ? 600 : 400,
                        '& .MuiChip-icon': {
                          fontSize: '0.7rem',
                          ml: 0.5
                        },
                        '& .MuiChip-label': {
                          px: 0.5
                        }
                      }}
                    />
                  )}

                  {/* Podzadania */}
                  {totalSubtasks > 0 && (
                    <Chip
                      icon={<CheckBoxOutlineBlankIcon sx={{ fontSize: isMobile ? '0.65rem' : '0.7rem' }} />}
                      label={`${completedSubtasks}/${totalSubtasks}`}
                      size="small"
                      color={completedSubtasks === totalSubtasks ? 'success' : 'default'}
                      sx={{
                        height: isMobile ? 16 : 18,
                        fontSize: isMobile ? '0.6rem' : '0.65rem',
                        flexShrink: 0,
                        '& .MuiChip-icon': {
                          fontSize: isMobile ? '0.65rem' : '0.7rem',
                          ml: 0.5
                        },
                        '& .MuiChip-label': {
                          px: 0.5
                        }
                      }}
                    />
                  )}

                  {/* Załączniki */}
                  {task.attachments && task.attachments.length > 0 && (
                    <Tooltip title={`${task.attachments.length} załącznik${task.attachments.length === 1 ? '' : task.attachments.length < 5 ? 'i' : 'ów'}`} arrow>
                      <Chip
                        icon={<AttachFileIcon sx={{ fontSize: isMobile ? '0.65rem' : '0.7rem' }} />}
                        label={task.attachments.length}
                        size="small"
                        sx={{
                          height: isMobile ? 16 : 18,
                          fontSize: isMobile ? '0.6rem' : '0.65rem',
                          flexShrink: 0,
                          '& .MuiChip-icon': {
                            fontSize: isMobile ? '0.65rem' : '0.7rem',
                            ml: 0.5
                          },
                          '& .MuiChip-label': {
                            px: 0.5
                          }
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
              )}
            </Box>

            {/* Menu akcji */}
            <Box 
              sx={{
                opacity: (isHovered || isMobile) ? 1 : 0,
                transition: 'opacity 0.2s'
              }}
            >
              <IconButton
                size="small"
                onClick={handleMenuOpen}
                sx={{ p: 0.5 }}
              >
                <MoreVertIcon sx={{ fontSize: isMobile ? '1.2rem' : '1rem' }} />
              </IconButton>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { handleOpenDialog(); handleMenuClose(); }}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          {t('edit')}
        </MenuItem>
        <MenuItem onClick={handleDeleteTask} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          {t('delete')}
        </MenuItem>
      </Menu>

      {/* Dialog szczegółów zadania */}
      <TaskDetailsDialog
        task={task}
        board={board}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={onRefresh}
      />
    </>
  );
};

export default React.memo(TaskCard, (prevProps, nextProps) => {
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.title === nextProps.task.title &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.priority === nextProps.task.priority &&
    prevProps.task.columnId === nextProps.task.columnId &&
    prevProps.task.position === nextProps.task.position &&
    prevProps.task.description === nextProps.task.description &&
    JSON.stringify(prevProps.task.dueDate) === JSON.stringify(nextProps.task.dueDate) &&
    JSON.stringify(prevProps.task.assignedTo) === JSON.stringify(nextProps.task.assignedTo) &&
    JSON.stringify(prevProps.task.subtaskLists) === JSON.stringify(nextProps.task.subtaskLists) &&
    JSON.stringify(prevProps.task.attachments) === JSON.stringify(nextProps.task.attachments) &&
    JSON.stringify(prevProps.userNamesMap) === JSON.stringify(nextProps.userNamesMap)
  );
});
