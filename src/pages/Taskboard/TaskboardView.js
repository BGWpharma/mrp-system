// src/pages/Taskboard/TaskboardView.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Card,
  CardContent,
  CardActions,
  CircularProgress,
  Tooltip,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme,
  Fab,
  Badge,
  Grid
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
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
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import PublicIcon from '@mui/icons-material/Public';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { getAccessibleBoards, createBoard, updateBoard, deleteBoard, getOrCreateMainBoard } from '../../services/taskboardService';
import BoardDetail from './BoardDetail';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const BOARD_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
  '#F8B739', '#52B788', '#E63946', '#A8DADC'
];

const BOARD_ICONS = [
  { name: 'Folder', icon: FolderIcon, label: 'Folder' },
  { name: 'Work', icon: WorkIcon, label: 'Praca' },
  { name: 'Assignment', icon: AssignmentIcon, label: 'Zadania' },
  { name: 'Dashboard', icon: DashboardIcon, label: 'Dashboard' },
  { name: 'Star', icon: StarIcon, label: 'Gwiazda' },
  { name: 'Lightbulb', icon: LightbulbIcon, label: 'Pomysł' },
  { name: 'RocketLaunch', icon: RocketLaunchIcon, label: 'Rakieta' },
  { name: 'Code', icon: CodeIcon, label: 'Kod' },
  { name: 'BugReport', icon: BugReportIcon, label: 'Bug' },
  { name: 'DesignServices', icon: DesignServicesIcon, label: 'Design' },
  { name: 'Build', icon: BuildIcon, label: 'Narzędzia' },
  { name: 'ViewKanban', icon: ViewKanbanIcon, label: 'Kanban' },
];

const getIconComponent = (iconName) => {
  const iconData = BOARD_ICONS.find(i => i.name === iconName);
  return iconData ? iconData.icon : FolderIcon;
};

const TaskboardView = () => {
  const { t } = useTranslation('taskboard');
  const { currentUser } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [mainBoard, setMainBoard] = useState(null);
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    color: BOARD_COLORS[0],
    icon: 'Folder'
  });

  // Funkcja do ładowania tablic
  const loadBoards = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      
      // Pobierz/utwórz główną tablicę
      const mainBoardData = await getOrCreateMainBoard();
      setMainBoard(mainBoardData);
      
      // Ustaw główną tablicę jako wybraną jeśli nie ma jeszcze wybranej
      if (!selectedBoard) {
        setSelectedBoard(mainBoardData);
      }
      
      // Pobierz tablice dostępne dla użytkownika (bez głównej)
      const boardsData = await getAccessibleBoards(currentUser.uid);
      const otherBoards = boardsData.filter(board => !board.isMainBoard);
      setBoards(otherBoards);
    } catch (error) {
      console.error('Błąd podczas ładowania tablic:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoards();
  }, [currentUser]);

  const handleOpenDialog = (board) => {
    if (board) {
      setEditingBoard(board);
      setFormData({
        title: board.title,
        description: board.description || '',
        color: board.color,
        icon: board.icon || 'Folder'
      });
    } else {
      setEditingBoard(null);
      setFormData({
        title: '',
        description: '',
        color: BOARD_COLORS[Math.floor(Math.random() * BOARD_COLORS.length)],
        icon: 'Folder'
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingBoard(null);
    setFormData({ title: '', description: '', color: BOARD_COLORS[0], icon: 'Folder' });
  };

  const handleSaveBoard = async () => {
    if (!currentUser || !formData.title.trim()) return;

    try {
      if (editingBoard) {
        await updateBoard(editingBoard.id, {
          title: formData.title,
          description: formData.description,
          color: formData.color,
          icon: formData.icon
        });
      } else {
        await createBoard({
          title: formData.title,
          description: formData.description,
          color: formData.color,
          icon: formData.icon,
          createdBy: currentUser.uid,
          createdByName: currentUser.displayName || currentUser.email
        });
      }
      
      handleCloseDialog();
      loadBoards();
    } catch (error) {
      console.error('Błąd podczas zapisywania tablicy:', error);
    }
  };

  const handleDeleteBoard = async (boardId) => {
    if (!window.confirm(t('deleteBoardConfirm'))) {
      return;
    }

    try {
      await deleteBoard(boardId);
      
      // Jeśli usunięto aktualnie wybraną tablicę, wróć do głównej
      if (selectedBoard?.id === boardId) {
        setSelectedBoard(mainBoard);
      }
      
      loadBoards();
    } catch (error) {
      console.error('Błąd podczas usuwania tablicy:', error);
    }
  };

  const handleSelectBoard = (board) => {
    setSelectedBoard(board);
    setDrawerOpen(false);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', minHeight: '100%' }}>
      {/* Główna zawartość - BoardDetail */}
      {selectedBoard && (
        <BoardDetail 
          boardId={selectedBoard.id} 
          embedded={true}
          boardTitle={selectedBoard.title}
          isMainBoard={selectedBoard.isMainBoard}
          onOpenBoardsDrawer={() => setDrawerOpen(true)}
          otherBoardsCount={boards.length}
        />
      )}


      {/* Drawer z listą tablic */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: isMobile ? '100%' : 380,
            backgroundColor: 'background.paper',
          }
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight="bold">
            {t('allBoards')}
          </Typography>
          <IconButton onClick={() => setDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        
        <Divider />

        {/* Główna tablica */}
        {mainBoard && (
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {t('mainBoard').toUpperCase()}
            </Typography>
            <Card
              sx={{
                cursor: 'pointer',
                backgroundColor: selectedBoard?.id === mainBoard.id 
                  ? 'rgba(78, 205, 196, 0.15)' 
                  : 'rgba(255, 255, 255, 0.03)',
                border: selectedBoard?.id === mainBoard.id 
                  ? '2px solid rgba(78, 205, 196, 0.5)' 
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderLeft: `4px solid ${mainBoard.color}`,
                '&:hover': {
                  backgroundColor: 'rgba(78, 205, 196, 0.1)',
                }
              }}
              onClick={() => handleSelectBoard(mainBoard)}
            >
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1,
                      bgcolor: mainBoard.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {React.createElement(getIconComponent(mainBoard.icon), { 
                      sx: { color: 'white', fontSize: 20 } 
                    })}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {mainBoard.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('sharedSpace')}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}

        <Divider />

        {/* Lista innych tablic */}
        <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="caption" color="text.secondary">
              {t('otherBoards').toUpperCase()} ({boards.length})
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              {t('newBoard')}
            </Button>
          </Box>

          {boards.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {t('noBoardsYet')}
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {boards.map((board) => (
                <Card
                  key={board.id}
                  sx={{
                    mb: 1,
                    cursor: 'pointer',
                    backgroundColor: selectedBoard?.id === board.id 
                      ? 'rgba(63, 140, 255, 0.15)' 
                      : 'rgba(255, 255, 255, 0.03)',
                    border: selectedBoard?.id === board.id 
                      ? '2px solid rgba(63, 140, 255, 0.5)' 
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    borderLeft: `4px solid ${board.color}`,
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    }
                  }}
                  onClick={() => handleSelectBoard(board)}
                >
                  <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 1,
                          bgcolor: board.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {React.createElement(getIconComponent(board.icon), { 
                          sx: { color: 'white', fontSize: 18 } 
                        })}
                      </Box>
                      <Box flex={1} sx={{ minWidth: 0 }}>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Typography variant="body2" fontWeight="bold" noWrap>
                            {board.title}
                          </Typography>
                          {board.isPrivate && (
                            <Tooltip title={t('privateBoard')}>
                              <LockIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                            </Tooltip>
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {board.isPrivate 
                            ? (board.createdBy === currentUser?.uid ? t('yourPrivateBoard') : t('sharedWithYou'))
                            : board.description || t('publicBoard')
                          }
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDialog(board);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBoard(board.id);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </List>
          )}
        </Box>
      </Drawer>

      {/* Dialog tworzenia/edycji tablicy */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: '#1a1a2e',
            backgroundImage: 'none',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }
        }}
      >
        <DialogTitle sx={{ borderBottom: '1px solid rgba(255, 255, 255, 0.12)', pb: 2 }}>
          {editingBoard ? t('editBoard') : t('newBoard')}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            label={t('boardName')}
            fullWidth
            variant="outlined"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
          />
          
          <TextField
            margin="dense"
            label={t('boardDescription')}
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            sx={{ mb: 2 }}
          />
          
          <Typography variant="subtitle2" gutterBottom>
            {t('selectIcon')}
          </Typography>
          
          <Box display="flex" flexWrap="wrap" gap={1} mb={3}>
            {BOARD_ICONS.map((iconItem) => {
              const IconComponent = iconItem.icon;
              const isSelected = formData.icon === iconItem.name;
              return (
                <Tooltip key={iconItem.name} title={iconItem.label}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      bgcolor: isSelected ? formData.color : 'rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      border: isSelected ? '2px solid white' : '2px solid rgba(255, 255, 255, 0.1)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:hover': {
                        transform: 'scale(1.1)',
                        bgcolor: isSelected ? formData.color : 'rgba(255, 255, 255, 0.1)'
                      }
                    }}
                    onClick={() => setFormData({ ...formData, icon: iconItem.name })}
                  >
                    <IconComponent sx={{ color: 'white', fontSize: 24 }} />
                  </Box>
                </Tooltip>
              );
            })}
          </Box>

          <Typography variant="subtitle2" gutterBottom>
            {t('selectColor')}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {BOARD_COLORS.map((color) => (
              <Box
                key={color}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1,
                  bgcolor: color,
                  cursor: 'pointer',
                  border: formData.color === color ? '3px solid white' : '3px solid transparent',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'scale(1.1)'
                  }
                }}
                onClick={() => setFormData({ ...formData, color })}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid rgba(255, 255, 255, 0.12)', px: 2.5, py: 2 }}>
          <Button onClick={handleCloseDialog}>{t('cancel')}</Button>
          <Button
            onClick={handleSaveBoard}
            variant="contained"
            disabled={!formData.title.trim()}
          >
            {editingBoard ? t('saveBoard') : t('createBoard')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TaskboardView;
