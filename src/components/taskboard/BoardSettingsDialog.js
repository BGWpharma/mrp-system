// src/components/taskboard/BoardSettingsDialog.js
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  TextField,
  Autocomplete,
  Chip,
  Alert,
  CircularProgress
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import PublicIcon from '@mui/icons-material/Public';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';
import { getAllActiveUsers } from '../../services/userService';
import {
  setBoardPrivacy,
  addUserToBoard,
  removeUserFromBoard,
  getBoardAllowedUsers
} from '../../services/taskboardService';

const BoardSettingsDialog = ({ open, onClose, board, onBoardUpdated }) => {
  const { t } = useTranslation('taskboard');
  const { currentUser } = useAuth();
  
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [error, setError] = useState('');

  // Załaduj dane przy otwarciu dialogu
  useEffect(() => {
    if (!open || !board) return;
    let cancelled = false;
    setIsPrivate(board.isPrivate || false);
    (async () => {
      setLoading(true);
      setError('');
      try {
        const users = await getAllActiveUsers();
        if (cancelled) return;
        const filteredUsers = users.filter(u => u.id !== board.createdBy);
        setAllUsers(filteredUsers);
        const allowed = await getBoardAllowedUsers(board.id);
        if (cancelled) return;
        const allowedWithDetails = allowed.map(userId => {
          const user = users.find(u => u.id === userId);
          return user || { id: userId, displayName: userId, email: '' };
        });
        setAllowedUsers(allowedWithDetails);
      } catch (err) {
        if (cancelled) return;
        console.error('Błąd podczas ładowania danych:', err);
        setError(t('errorLoadingData'));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, board]);

  const loadData = async () => {
    if (!board) return;
    
    setLoading(true);
    setError('');
    
    try {
      const users = await getAllActiveUsers();
      const filteredUsers = users.filter(u => u.id !== board.createdBy);
      setAllUsers(filteredUsers);
      const allowed = await getBoardAllowedUsers(board.id);
      const allowedWithDetails = allowed.map(userId => {
        const user = users.find(u => u.id === userId);
        return user || { id: userId, displayName: userId, email: '' };
      });
      setAllowedUsers(allowedWithDetails);
    } catch (err) {
      console.error('Błąd podczas ładowania danych:', err);
      setError(t('errorLoadingData'));
    } finally {
      setLoading(false);
    }
  };

  const handlePrivacyChange = async (event) => {
    const newIsPrivate = event.target.checked;
    setSavingPrivacy(true);
    setError('');
    
    try {
      await setBoardPrivacy(board.id, newIsPrivate, currentUser.uid);
      setIsPrivate(newIsPrivate);
      onBoardUpdated?.();
    } catch (err) {
      console.error('Błąd podczas zmiany prywatności:', err);
      setError(err.message || t('errorChangingPrivacy'));
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleAddUser = async () => {
    if (!selectedUser) return;
    
    setAddingUser(true);
    setError('');
    
    try {
      await addUserToBoard(board.id, selectedUser.id, currentUser.uid);
      setAllowedUsers(prev => [...prev, selectedUser]);
      setSelectedUser(null);
      onBoardUpdated?.();
    } catch (err) {
      console.error('Błąd podczas dodawania użytkownika:', err);
      setError(err.message || t('errorAddingUser'));
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    setError('');
    
    try {
      await removeUserFromBoard(board.id, userId, currentUser.uid);
      setAllowedUsers(prev => prev.filter(u => u.id !== userId));
      onBoardUpdated?.();
    } catch (err) {
      console.error('Błąd podczas usuwania użytkownika:', err);
      setError(err.message || t('errorRemovingUser'));
    }
  };

  const getInitials = (user) => {
    if (user.displayName) {
      return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user.email ? user.email[0].toUpperCase() : '?';
  };

  const getAvatarColor = (userId) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const index = userId.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Filtruj użytkowników którzy jeszcze nie mają dostępu
  const availableUsers = allUsers.filter(
    user => !allowedUsers.some(allowed => allowed.id === user.id)
  );

  if (!board) return null;

  const isOwner = board.createdBy === currentUser?.uid;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
        {t('boardSettings')}
      </DialogTitle>
      
      <DialogContent sx={{ pt: 3 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {/* Sekcja prywatności */}
            <Box mb={3}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {t('privacySettings')}
              </Typography>
              
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={isPrivate}
                      onChange={handlePrivacyChange}
                      disabled={!isOwner || savingPrivacy || board.isMainBoard}
                      color="warning"
                    />
                  }
                  label={
                    <Box display="flex" alignItems="center" gap={1}>
                      {isPrivate ? (
                        <LockIcon sx={{ color: 'warning.main' }} />
                      ) : (
                        <PublicIcon sx={{ color: 'success.main' }} />
                      )}
                      <Box>
                        <Typography variant="body1">
                          {isPrivate ? t('privateBoard') : t('publicBoard')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {isPrivate ? t('privateBoardDescription') : t('publicBoardDescription')}
                        </Typography>
                      </Box>
                    </Box>
                  }
                  sx={{ m: 0, width: '100%' }}
                />
                
                {!isOwner && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {t('onlyOwnerCanChangePrivacy')}
                  </Typography>
                )}
                
                {board.isMainBoard && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {t('mainBoardAlwaysPublic')}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Sekcja zarządzania dostępem (tylko dla prywatnych tablic) */}
            {isPrivate && (
              <>
                <Divider sx={{ my: 2 }} />
                
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    {t('accessManagement')}
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {t('accessManagementDescription')}
                  </Typography>

                  {/* Dodawanie użytkownika */}
                  {isOwner && (
                    <Box display="flex" gap={1} mb={2}>
                      <Autocomplete
                        size="small"
                        options={availableUsers}
                        getOptionLabel={(option) => option.displayName || option.email || option.id}
                        value={selectedUser}
                        onChange={(_, newValue) => setSelectedUser(newValue)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder={t('selectUserToAdd')}
                            variant="outlined"
                          />
                        )}
                        renderOption={(props, option) => (
                          <li {...props}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Avatar
                                sx={{
                                  width: 28,
                                  height: 28,
                                  fontSize: 12,
                                  bgcolor: getAvatarColor(option.id)
                                }}
                              >
                                {getInitials(option)}
                              </Avatar>
                              <Box>
                                <Typography variant="body2">
                                  {option.displayName || t('noName')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {option.email}
                                </Typography>
                              </Box>
                            </Box>
                          </li>
                        )}
                        sx={{ flex: 1 }}
                        disabled={addingUser}
                      />
                      <Button
                        variant="contained"
                        startIcon={addingUser ? <CircularProgress size={16} /> : <PersonAddIcon />}
                        onClick={handleAddUser}
                        disabled={!selectedUser || addingUser}
                        size="small"
                      >
                        {t('add')}
                      </Button>
                    </Box>
                  )}

                  {/* Lista użytkowników z dostępem */}
                  <Box
                    sx={{
                      maxHeight: 300,
                      overflow: 'auto',
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                    }}
                  >
                    {/* Właściciel (zawsze na górze) */}
                    <ListItem
                      sx={{
                        bgcolor: 'rgba(78, 205, 196, 0.1)',
                        borderBottom: 1,
                        borderColor: 'divider',
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: '#4ECDC4' }}>
                          <PersonIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2">
                              {board.createdByName || t('owner')}
                            </Typography>
                            <Chip label={t('owner')} size="small" color="primary" />
                          </Box>
                        }
                        secondary={t('alwaysHasAccess')}
                      />
                    </ListItem>

                    {/* Lista użytkowników z dostępem */}
                    {allowedUsers.length === 0 ? (
                      <ListItem>
                        <ListItemText
                          primary={t('noUsersWithAccess')}
                          secondary={t('addUsersToGrantAccess')}
                          sx={{ textAlign: 'center', py: 2 }}
                        />
                      </ListItem>
                    ) : (
                      <List disablePadding>
                        {allowedUsers.map((user) => (
                          <ListItem
                            key={user.id}
                            sx={{
                              borderBottom: 1,
                              borderColor: 'divider',
                              '&:last-child': { borderBottom: 'none' }
                            }}
                          >
                            <ListItemAvatar>
                              <Avatar sx={{ bgcolor: getAvatarColor(user.id) }}>
                                {getInitials(user)}
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={user.displayName || t('noName')}
                              secondary={user.email}
                            />
                            {isOwner && (
                              <ListItemSecondaryAction>
                                <IconButton
                                  edge="end"
                                  color="error"
                                  onClick={() => handleRemoveUser(user.id)}
                                  size="small"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </ListItemSecondaryAction>
                            )}
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                </Box>
              </>
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions sx={{ borderTop: 1, borderColor: 'divider', px: 2.5, py: 2 }}>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BoardSettingsDialog;
