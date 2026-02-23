// src/pages/Taskboard/BoardDetail.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  useMediaQuery,
  useTheme
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import WorkIcon from '@mui/icons-material/Work';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DashboardIcon from '@mui/icons-material/Dashboard';
import StarIcon from '@mui/icons-material/Star';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CodeIcon from '@mui/icons-material/Code';
import BugReportIcon from '@mui/icons-material/BugReport';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import BuildIcon from '@mui/icons-material/Build';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import SettingsIcon from '@mui/icons-material/Settings';
import LockIcon from '@mui/icons-material/Lock';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import BackButton from '../../components/common/BackButton';
import ROUTES from '../../constants/routes';
import {
  getBoard,
  getBoardColumns,
  getBoardTasks,
  createColumn,
  deleteColumn
} from '../../services/taskboardService';
import { getUsersDisplayNames } from '../../services/userService';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import ColumnList from '../../components/taskboard/ColumnList';
import BoardSettingsDialog from '../../components/taskboard/BoardSettingsDialog';

const BOARD_ICONS = [
  { name: 'Folder', icon: FolderIcon },
  { name: 'Work', icon: WorkIcon },
  { name: 'Assignment', icon: AssignmentIcon },
  { name: 'Dashboard', icon: DashboardIcon },
  { name: 'Star', icon: StarIcon },
  { name: 'Lightbulb', icon: LightbulbIcon },
  { name: 'RocketLaunch', icon: RocketLaunchIcon },
  { name: 'Code', icon: CodeIcon },
  { name: 'BugReport', icon: BugReportIcon },
  { name: 'DesignServices', icon: DesignServicesIcon },
  { name: 'Build', icon: BuildIcon },
  { name: 'ViewKanban', icon: ViewKanbanIcon },
];

const getIconComponent = (iconName) => {
  const iconData = BOARD_ICONS.find(i => i.name === iconName);
  return iconData ? iconData.icon : FolderIcon;
};

const BoardDetail = ({ 
  boardId: propBoardId, 
  embedded = false,
  boardTitle,
  isMainBoard = false,
  onOpenBoardsDrawer,
  otherBoardsCount = 0
}) => {
  const { t } = useTranslation('taskboard');
  const { boardId: paramBoardId } = useParams();
  const boardId = propBoardId || paramBoardId;
  
  const { currentUser } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [userNamesMap, setUserNamesMap] = useState({});
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  // Pobierz nazwy użytkowników dla wszystkich przypisanych osób (zoptymalizowane)
  useEffect(() => {
    let cancelled = false;
    const fetchUserNames = async () => {
      const allUserIds = new Set();
      tasks.forEach(task => {
        if (task.assignedTo) {
          task.assignedTo.forEach(userId => allUserIds.add(userId));
        }
      });
      
      if (allUserIds.size === 0) return;
      
      const missingUserIds = [...allUserIds].filter(id => !userNamesMap[id]);
      
      if (missingUserIds.length === 0) return;
      
      try {
        const names = await getUsersDisplayNames(missingUserIds);
        if (cancelled) return;
        setUserNamesMap(prev => ({ ...prev, ...names }));
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania nazw użytkowników:', error);
      }
    };

    fetchUserNames();
    return () => { cancelled = true; };
  }, [tasks]);

  // Refs dla debounce timeouts
  const boardTimeoutRef = useRef(null);
  const columnsTimeoutRef = useRef(null);
  const tasksTimeoutRef = useRef(null);

  // Debounce delay - dłuższy dla mobile
  const debounceDelay = useMemo(() => isMobile ? 400 : 250, [isMobile]);

  // Real-time synchronizacja z debounce - nasłuchiwanie zmian w Firestore
  useEffect(() => {
    if (!boardId) return;

    setLoading(true);

    // Handler dla board z debounce
    const handleBoardUpdate = (snapshot) => {
      if (boardTimeoutRef.current) clearTimeout(boardTimeoutRef.current);
      
      boardTimeoutRef.current = setTimeout(() => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          setBoard({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date()
          });
          setLoading(false);
        }
      }, debounceDelay);
    };

    // Handler dla kolumn z debounce
    const handleColumnsUpdate = (snapshot) => {
      if (columnsTimeoutRef.current) clearTimeout(columnsTimeoutRef.current);
      
      columnsTimeoutRef.current = setTimeout(() => {
        const updatedColumns = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            boardId: data.boardId,
            title: data.title,
            position: data.position,
            sortBy: data.sortBy || 'manual',
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date()
          };
        });
        setColumns(updatedColumns);
      }, debounceDelay);
    };

    // Handler dla zadań z debounce
    const handleTasksUpdate = (snapshot) => {
      if (tasksTimeoutRef.current) clearTimeout(tasksTimeoutRef.current);
      
      tasksTimeoutRef.current = setTimeout(() => {
        const updatedTasks = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            boardId: data.boardId,
            columnId: data.columnId,
            title: data.title,
            description: data.description || '',
            status: data.status,
            priority: data.priority || undefined,
            position: data.position,
            dueDate: data.dueDate?.toDate(),
            assignedTo: data.assignedTo || [],
            subtaskLists: data.subtaskLists || [],
            attachments: data.attachments || [],
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            completedAt: data.completedAt?.toDate(),
            workSessionId: data.workSessionId,
            workStartTime: data.workStartTime?.toDate(),
            workEndTime: data.workEndTime?.toDate(),
            totalWorkTime: data.totalWorkTime || 0,
            isWorkInProgress: data.isWorkInProgress || false,
            createdBy: data.createdBy,
            createdByName: data.createdByName,
            updatedBy: data.updatedBy,
            updatedByName: data.updatedByName
          };
        });
        setTasks(updatedTasks);
      }, debounceDelay);
    };

    // Real-time listener dla board
    const unsubscribeBoard = onSnapshot(
      query(collection(db, 'boards'), where('__name__', '==', boardId)),
      handleBoardUpdate,
      (error) => {
        console.error('Błąd real-time listener dla board:', error);
        setLoading(false);
      }
    );

    // Real-time listener dla kolumn
    const unsubscribeColumns = onSnapshot(
      query(
        collection(db, 'columns'),
        where('boardId', '==', boardId),
        orderBy('position', 'asc')
      ),
      handleColumnsUpdate,
      (error) => {
        console.error('Błąd real-time listener dla kolumn:', error);
      }
    );

    // Real-time listener dla zadań
    const unsubscribeTasks = onSnapshot(
      query(
        collection(db, 'tasks'),
        where('boardId', '==', boardId),
        orderBy('position', 'asc')
      ),
      handleTasksUpdate,
      (error) => {
        console.error('Błąd real-time listener dla zadań:', error);
      }
    );

    // Cleanup
    return () => {
      unsubscribeBoard();
      unsubscribeColumns();
      unsubscribeTasks();
      if (boardTimeoutRef.current) clearTimeout(boardTimeoutRef.current);
      if (columnsTimeoutRef.current) clearTimeout(columnsTimeoutRef.current);
      if (tasksTimeoutRef.current) clearTimeout(tasksTimeoutRef.current);
    };
  }, [boardId, debounceDelay]);

  const handleAddColumn = useCallback(async () => {
    if (!boardId || !newColumnTitle.trim()) return;

    try {
      await createColumn({
        boardId,
        title: newColumnTitle,
        position: columns.length
      });
      
      setColumnDialogOpen(false);
      setNewColumnTitle('');
    } catch (error) {
      console.error('Błąd podczas tworzenia kolumny:', error);
    }
  }, [boardId, newColumnTitle, columns.length]);

  const handleDeleteColumn = useCallback(async (columnId) => {
    const columnTasks = tasks.filter(t => t.columnId === columnId);
    const taskCount = columnTasks.length;
    const confirmMessage = taskCount > 0
      ? t('deleteColumnWithTasks', { count: taskCount })
      : t('deleteColumnConfirm');

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteColumn(columnId);
    } catch (error) {
      console.error('Błąd podczas usuwania kolumny:', error);
    }
  }, [tasks, t]);

  // Optimistic update dla zadań
  const handleOptimisticTaskUpdate = useCallback((taskId, updates) => {
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.id === taskId 
          ? { ...task, ...updates, updatedAt: new Date() }
          : task
      )
    );
  }, []);

  // Optimistic update dla wielu zadań (drag & drop)
  const handleOptimisticTasksUpdate = useCallback((updatedTasks) => {
    setTasks(updatedTasks);
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!board) {
    return (
      <Container>
        <Typography variant="h5" color="error">
          {t('boardNotFound')}
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: isMobile ? 1.5 : (embedded ? 2 : 4), px: isMobile ? 1.5 : 3 }}>
      {/* Nagłówek tablicy */}
      <Box 
        display="flex" 
        flexDirection={isMobile ? 'column' : 'row'}
        alignItems={isMobile ? 'flex-start' : 'center'} 
        mb={isMobile ? 2 : 3} 
        gap={isMobile ? 1.5 : 2}
      >
        <Box display="flex" alignItems="center" flex={1} width="100%">
          {/* Przycisk wstecz tylko w trybie standalone */}
          {!embedded && (
            <BackButton 
              to={ROUTES.TASKBOARD} 
              iconOnly 
              sx={{ mr: isMobile ? 1 : 2 }}
              size={isMobile ? 'small' : 'medium'}
            />
          )}
          
          <Box
            sx={{
              width: isMobile ? 40 : 48,
              height: isMobile ? 40 : 48,
              borderRadius: 2,
              bgcolor: board.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 2,
            }}
          >
            {React.createElement(getIconComponent(board.icon), { 
              sx: { color: 'white', fontSize: isMobile ? 24 : 28 } 
            })}
          </Box>
          
          <Box flex={1} minWidth={0}>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography 
                variant={isMobile ? "h5" : "h4"} 
                fontWeight="bold"
                noWrap
                color={isMainBoard ? 'primary.main' : 'text.primary'}
              >
                {board.title}
              </Typography>
              {board.isPrivate && (
                <LockIcon sx={{ color: 'warning.main', fontSize: isMobile ? 20 : 24 }} />
              )}
            </Box>
            {board.description && !isMobile && (
              <Typography 
                variant="body2" 
                color="text.secondary"
                noWrap
              >
                {board.description}
              </Typography>
            )}
          </Box>
        </Box>
        
        {/* Przyciski akcji */}
        <Box display="flex" gap={1} width={isMobile ? '100%' : 'auto'}>
          {/* Przycisk ustawień - tylko dla właściciela i tablic nie-głównych */}
          {!board.isMainBoard && board.createdBy === currentUser?.uid && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<SettingsIcon />}
              onClick={() => setSettingsDialogOpen(true)}
              size={isMobile ? "small" : "medium"}
              sx={{ flexShrink: 0 }}
            >
              {isMobile ? '' : t('settings')}
            </Button>
          )}
          {embedded && onOpenBoardsDrawer && (
            <Button
              variant="outlined"
              startIcon={<ViewKanbanIcon />}
              onClick={onOpenBoardsDrawer}
              size={isMobile ? "small" : "medium"}
              sx={{ flexShrink: 0 }}
            >
              {otherBoardsCount > 0 ? t('otherBoardsCount', { count: otherBoardsCount }) : t('otherBoards')}
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setColumnDialogOpen(true)}
            size={isMobile ? "small" : "medium"}
            sx={{ flex: isMobile ? 1 : 'none' }}
          >
            {t('newColumn')}
          </Button>
        </Box>
      </Box>

      {/* Lista kolumn */}
      <Box sx={{ pb: 0 }}>
        <ColumnList
          columns={columns}
          tasks={tasks}
          board={board}
          onDeleteColumn={handleDeleteColumn}
          onRefresh={() => {}} // Pusta funkcja - real-time listeners automatycznie aktualizują UI
          onOptimisticTaskUpdate={handleOptimisticTaskUpdate}
          onOptimisticTasksUpdate={handleOptimisticTasksUpdate}
          userNamesMap={userNamesMap}
        />
      </Box>

      {/* Dialog dodawania kolumny */}
      <Dialog 
        open={columnDialogOpen} 
        onClose={() => setColumnDialogOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 2,
          }
        }}
      >
        <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
          {t('newColumn')}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            label={t('columnName')}
            fullWidth
            variant="outlined"
            value={newColumnTitle}
            onChange={(e) => setNewColumnTitle(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ borderTop: 1, borderColor: 'divider', px: 2.5, py: 2 }}>
          <Button onClick={() => setColumnDialogOpen(false)}>{t('cancel')}</Button>
          <Button
            onClick={handleAddColumn}
            variant="contained"
            disabled={!newColumnTitle.trim()}
          >
            {t('addColumn')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog ustawień tablicy */}
      <BoardSettingsDialog
        open={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
        board={board}
        onBoardUpdated={() => {
          // Board zostanie automatycznie zaktualizowany przez real-time listener
        }}
      />
    </Container>
  );
};

export default BoardDetail;
