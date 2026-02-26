import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Box,
  Checkbox,
  TextField,
  Grid,
  Divider,
  Alert,
  Tooltip,
  Tabs,
  Tab,
  Avatar,
  LinearProgress,
  Stack,
  useTheme as useMuiTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  AccountBox as AccountBoxIcon,
  Security as SecurityIcon,
  PersonAdd as PersonAddIcon,
  Storefront as KioskIcon,
  Delete as DeleteIcon,
  Google as GoogleIcon,
  AccessTime as AccessTimeIcon,
  Group as GroupIcon,
  Refresh as RefreshIcon,
  Badge as BadgeIcon,
  SmartToy as AiIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  InventoryOutlined as ArchiveFilterIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { 
  getAllUsers, 
  changeUserRole, 
  getRawUserPermissions, 
  updateUserPermissions,
  createKioskUser,
  deleteKioskUser,
  archiveUser,
  unarchiveUser,
  AVAILABLE_PERMISSIONS 
} from '../../services/userService';
import SidebarTabsManager from '../../components/admin/SidebarTabsManager';
import UserProfileEditor from '../../components/admin/UserProfileEditor';
import WorkTimeAdminTab from '../../components/admin/WorkTimeAdminTab';
import WorkTimeUserDialog from '../../components/admin/WorkTimeUserDialog';
import { useTranslation } from '../../hooks/useTranslation';
import { usePermissions } from '../../hooks/usePermissions';

const UsersManagementPage = () => {
  const { t } = useTranslation('users');
  const { refreshPermissions } = usePermissions();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sidebarTabsDialogOpen, setSidebarTabsDialogOpen] = useState(false);
  const [selectedUserForTabs, setSelectedUserForTabs] = useState(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState(null);
  const [userPermissions, setUserPermissions] = useState({});
  
  // Dialog tworzenia pracownika kioskowego
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKioskUser, setNewKioskUser] = useState({
    displayName: '',
    employeeId: '',
    position: '',
    department: '',
    phone: ''
  });
  const [createErrors, setCreateErrors] = useState({});
  const [creating, setCreating] = useState(false);

  // Dialog usuwania
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Archiwizacja
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [userToArchive, setUserToArchive] = useState(null);
  const [archiving, setArchiving] = useState(false);

  // Zakładki i czas pracy
  const [activeTab, setActiveTab] = useState(0);
  const [workTimeUserDialogOpen, setWorkTimeUserDialogOpen] = useState(false);
  const [selectedUserForWorkTime, setSelectedUserForWorkTime] = useState(null);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  useEffect(() => {
    fetchUsers();
  }, []);
  
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersData = await getAllUsers();
      setUsers(usersData);
    } catch (error) {
      console.error('Błąd podczas pobierania listy użytkowników:', error);
      showError('Nie udało się pobrać listy użytkowników');
    } finally {
      setLoading(false);
    }
  };
  
  const handleOpenEditDialog = (user) => {
    setSelectedUser(user);
    setNewRole(user.role || 'pracownik');
    setEditDialogOpen(true);
  };
  
  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setSelectedUser(null);
  };
  
  const handleOpenSidebarTabsDialog = (user) => {
    setSelectedUserForTabs(user);
    setSidebarTabsDialogOpen(true);
  };
  
  const handleCloseSidebarTabsDialog = () => {
    setSidebarTabsDialogOpen(false);
    setSelectedUserForTabs(null);
  };
  
  const handleOpenProfileEditor = (user) => {
    setSelectedUserForProfile(user);
    setProfileEditorOpen(true);
  };
  
  const handleCloseProfileEditor = () => {
    setProfileEditorOpen(false);
    setSelectedUserForProfile(null);
  };
  
  const handleUserUpdated = () => {
    fetchUsers(); // Odśwież listę użytkowników po edycji
  };
  
  const handleOpenPermissionsDialog = async (user) => {
    try {
      setSelectedUserForPermissions(user);
      setProcessing(true);
      
      // Pobierz surowe uprawnienia z Firestore (bez logiki admin=all)
      const permissions = await getRawUserPermissions(user.id);
      setUserPermissions(permissions);
      
      setPermissionsDialogOpen(true);
    } catch (error) {
      console.error('Błąd podczas pobierania uprawnień użytkownika:', error);
      showError('Nie udało się pobrać uprawnień użytkownika');
    } finally {
      setProcessing(false);
    }
  };
  
  const handleClosePermissionsDialog = () => {
    setPermissionsDialogOpen(false);
    setSelectedUserForPermissions(null);
    setUserPermissions({});
  };
  
  const handlePermissionChange = (permissionKey) => {
    setUserPermissions(prev => ({
      ...prev,
      [permissionKey]: !prev[permissionKey]
    }));
  };
  
  const handleSavePermissions = async () => {
    if (!selectedUserForPermissions) return;
    
    try {
      setProcessing(true);
      await updateUserPermissions(selectedUserForPermissions.id, userPermissions, currentUser.uid);
      
      showSuccess(`Uprawnienia użytkownika ${selectedUserForPermissions.displayName || selectedUserForPermissions.email} zostały zaktualizowane`);
      handleClosePermissionsDialog();
      fetchUsers();
      refreshPermissions();
    } catch (error) {
      console.error('Błąd podczas aktualizacji uprawnień użytkownika:', error);
      showError(error.message || 'Nie udało się zaktualizować uprawnień użytkownika');
    } finally {
      setProcessing(false);
    }
  };
  
  const handleChangeRole = async () => {
    if (!selectedUser || !newRole) return;
    
    try {
      setProcessing(true);
      await changeUserRole(selectedUser.id, newRole, currentUser.uid);
      
      // Aktualizuj lokalną listę użytkowników
      setUsers(users.map(user => 
        user.id === selectedUser.id 
          ? { ...user, role: newRole } 
          : user
      ));
      
      showSuccess(`Rola użytkownika ${selectedUser.displayName || selectedUser.email} została zmieniona na ${newRole}`);
      handleCloseEditDialog();
    } catch (error) {
      console.error('Błąd podczas zmiany roli użytkownika:', error);
      showError(error.message || 'Nie udało się zmienić roli użytkownika');
    } finally {
      setProcessing(false);
    }
  };

  // ===== Tworzenie pracownika kioskowego =====
  const handleOpenCreateDialog = () => {
    setNewKioskUser({
      displayName: '',
      employeeId: '',
      position: '',
      department: '',
      phone: ''
    });
    setCreateErrors({});
    setCreateDialogOpen(true);
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewKioskUser({ displayName: '', employeeId: '', position: '', department: '', phone: '' });
    setCreateErrors({});
  };

  const handleCreateInputChange = (field) => (e) => {
    let value = e.target.value;
    if (field === 'employeeId') value = value.toUpperCase();
    setNewKioskUser(prev => ({ ...prev, [field]: value }));
    if (createErrors[field]) {
      setCreateErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateCreateForm = () => {
    const errors = {};
    if (!newKioskUser.displayName.trim()) errors.displayName = 'Imię i nazwisko jest wymagane';
    if (!newKioskUser.employeeId.trim()) errors.employeeId = 'ID pracownika jest wymagane';
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateKioskUser = async () => {
    if (!validateCreateForm()) return;

    setCreating(true);
    try {
      await createKioskUser(newKioskUser, currentUser.uid);
      showSuccess(`Pracownik "${newKioskUser.displayName}" (${newKioskUser.employeeId}) został utworzony`);
      handleCloseCreateDialog();
      fetchUsers();
    } catch (error) {
      console.error('Błąd tworzenia pracownika kioskowego:', error);
      showError(error.message || 'Nie udało się utworzyć pracownika');
    } finally {
      setCreating(false);
    }
  };

  // ===== Usuwanie pracownika kioskowego =====
  const handleOpenDeleteDialog = (user) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleDeleteKioskUser = async () => {
    if (!userToDelete) return;

    setDeleting(true);
    try {
      await deleteKioskUser(userToDelete.id, currentUser.uid);
      showSuccess(`Pracownik "${userToDelete.displayName}" został usunięty`);
      handleCloseDeleteDialog();
      fetchUsers();
    } catch (error) {
      console.error('Błąd usuwania pracownika:', error);
      showError(error.message || 'Nie udało się usunąć pracownika');
    } finally {
      setDeleting(false);
    }
  };
  
  // ===== Archiwizacja kont =====
  const handleOpenArchiveDialog = (user) => {
    setUserToArchive(user);
    setArchiveDialogOpen(true);
  };

  const handleCloseArchiveDialog = () => {
    setArchiveDialogOpen(false);
    setUserToArchive(null);
  };

  const handleToggleArchive = async () => {
    if (!userToArchive) return;

    setArchiving(true);
    try {
      const isCurrentlyArchived = userToArchive.archived;
      if (isCurrentlyArchived) {
        await unarchiveUser(userToArchive.id, currentUser.uid);
        showSuccess(t('archive.successUnarchive', { name: userToArchive.displayName }));
      } else {
        await archiveUser(userToArchive.id, currentUser.uid);
        showSuccess(t('archive.successArchive', { name: userToArchive.displayName }));
      }
      handleCloseArchiveDialog();
      fetchUsers();
    } catch (error) {
      console.error('Błąd archiwizacji/przywracania:', error);
      showError(error.message || (userToArchive.archived ? t('archive.errorUnarchive') : t('archive.errorArchive')));
    } finally {
      setArchiving(false);
    }
  };

  const activeUsers = users.filter(u => !u.archived);
  const archivedUsers = users.filter(u => u.archived);
  const displayedUsers = showArchived ? users : activeUsers;

  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name) => {
    if (!name) return muiTheme.palette.grey[500];
    const colors = [
      '#2563eb', '#7c3aed', '#db2777', '#ea580c', 
      '#059669', '#0891b2', '#4f46e5', '#c026d3',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getUserAiLimit = (user) => user.aiMessagesLimit || (user.role === 'administrator' ? 250 : 50);
  const getUserAiUsed = (user) => user.aiMessagesUsed || 0;

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 3 }}>
        <Typography variant="h4" component="h1" fontWeight={700}>
          Zarządzanie użytkownikami
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Zarządzaj kontami, rolami i uprawnieniami w systemie
        </Typography>
      </Box>

      <Paper sx={{ mb: 3, overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          sx={{
            px: 2,
            '& .MuiTab-root': {
              minHeight: 52,
            },
          }}
        >
          <Tab icon={<GroupIcon />} iconPosition="start" label="Użytkownicy" />
          <Tab icon={<AccessTimeIcon />} iconPosition="start" label="Czas pracy" />
        </Tabs>
      </Paper>

      {activeTab === 1 && (
        <WorkTimeAdminTab users={users} adminUser={currentUser} />
      )}

      {activeTab === 0 && (
      <>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography variant="h6" fontWeight={600}>
              Lista użytkowników
            </Typography>
            {!loading && (
              <Chip
                label={activeUsers.length}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  height: 24,
                  minWidth: 24,
                  bgcolor: alpha(muiTheme.palette.primary.main, 0.1),
                  color: muiTheme.palette.primary.main,
                }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {!loading && archivedUsers.length > 0 && (
              <Tooltip title={showArchived ? t('archive.hideArchived') : `${t('archive.showArchived')} (${archivedUsers.length})`} arrow>
                <Button
                  variant={showArchived ? 'contained' : 'outlined'}
                  size="small"
                  color={showArchived ? 'warning' : 'inherit'}
                  startIcon={<ArchiveFilterIcon />}
                  onClick={() => setShowArchived(prev => !prev)}
                  sx={{
                    ...(!showArchived && {
                      borderColor: 'divider',
                      color: 'text.secondary',
                    }),
                  }}
                >
                  {showArchived ? t('archive.hideArchived') : archivedUsers.length}
                </Button>
              </Tooltip>
            )}
            <Button 
              variant="contained" 
              startIcon={<PersonAddIcon />}
              onClick={handleOpenCreateDialog}
              color="success"
              size="small"
            >
              Dodaj pracownika
            </Button>
            <Tooltip title="Odśwież listę">
              <IconButton
                onClick={fetchUsers}
                disabled={loading}
                size="small"
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
        
        {loading ? (
          <Paper sx={{ p: 8, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Stack alignItems="center" spacing={2}>
              <CircularProgress size={36} />
              <Typography variant="body2" color="text.secondary">Ładowanie użytkowników...</Typography>
            </Stack>
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {displayedUsers.map((user) => {
              const aiLimit = getUserAiLimit(user);
              const aiUsed = getUserAiUsed(user);
              const aiPercent = aiLimit > 0 ? Math.min((aiUsed / aiLimit) * 100, 100) : 0;
              const aiColor = aiPercent > 80 ? 'error' : aiPercent > 50 ? 'warning' : 'primary';

              return (
                <Paper
                  key={user.id}
                  sx={{
                    p: 2.5,
                    transition: 'all 0.2s ease',
                    border: '1px solid',
                    borderColor: user.archived ? alpha(muiTheme.palette.warning.main, 0.3) : 'divider',
                    opacity: user.archived ? 0.7 : 1,
                    '&:hover': {
                      opacity: 1,
                      borderColor: user.archived
                        ? alpha(muiTheme.palette.warning.main, 0.5)
                        : alpha(muiTheme.palette.primary.main, 0.3),
                      boxShadow: `0 4px 20px ${alpha(muiTheme.palette.primary.main, 0.08)}`,
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
                    {/* Avatar */}
                    <Avatar
                      src={user.photoURL}
                      alt={user.displayName}
                      sx={{
                        width: 48,
                        height: 48,
                        bgcolor: user.photoURL ? 'transparent' : getAvatarColor(user.displayName),
                        fontSize: '1rem',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {!user.photoURL && getInitials(user.displayName)}
                    </Avatar>

                    {/* Główne info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" fontWeight={600} noWrap>
                          {user.displayName || 'Brak nazwy'}
                        </Typography>
                        
                        <Chip
                          label={user.role === 'administrator' ? 'Admin' : 'Pracownik'}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            ...(user.role === 'administrator' ? {
                              bgcolor: alpha(muiTheme.palette.primary.main, 0.12),
                              color: muiTheme.palette.primary.main,
                              border: `1px solid ${alpha(muiTheme.palette.primary.main, 0.3)}`,
                            } : {
                              bgcolor: alpha(muiTheme.palette.text.secondary, 0.08),
                              color: muiTheme.palette.text.secondary,
                              border: `1px solid ${alpha(muiTheme.palette.text.secondary, 0.15)}`,
                            }),
                          }}
                        />

                        {user.accountType === 'kiosk' ? (
                          <Chip
                            icon={<KioskIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label="Kiosk"
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 500,
                              bgcolor: alpha(muiTheme.palette.warning.main, 0.1),
                              color: muiTheme.palette.warning.main,
                              border: `1px solid ${alpha(muiTheme.palette.warning.main, 0.25)}`,
                              '& .MuiChip-icon': { color: 'inherit' },
                            }}
                          />
                        ) : (
                          <Chip
                            icon={<GoogleIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label="Google"
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 500,
                              bgcolor: alpha(muiTheme.palette.info.main, 0.1),
                              color: muiTheme.palette.info.main,
                              border: `1px solid ${alpha(muiTheme.palette.info.main, 0.25)}`,
                              '& .MuiChip-icon': { color: 'inherit' },
                            }}
                          />
                        )}

                        {user.archived && (
                          <Chip
                            icon={<ArchiveIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label={t('archive.archivedLabel')}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              bgcolor: alpha(muiTheme.palette.error.main, 0.1),
                              color: muiTheme.palette.error.main,
                              border: `1px solid ${alpha(muiTheme.palette.error.main, 0.25)}`,
                              '& .MuiChip-icon': { color: 'inherit' },
                            }}
                          />
                        )}
                      </Box>

                      <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                        {user.email && (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {user.email}
                          </Typography>
                        )}
                        {user.employeeId && (
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <BadgeIcon sx={{ fontSize: '0.8rem', color: 'text.disabled' }} />
                            <Typography variant="caption" color="text.secondary" fontWeight={500}>
                              {user.employeeId}
                            </Typography>
                          </Stack>
                        )}
                        {user.position && (
                          <Typography variant="caption" color="text.disabled" sx={{ display: { xs: 'none', md: 'block' } }}>
                            {user.position}
                          </Typography>
                        )}
                        {user.department && (
                          <Typography variant="caption" color="text.disabled" sx={{ display: { xs: 'none', lg: 'block' } }}>
                            {user.department}
                          </Typography>
                        )}
                      </Stack>
                    </Box>

                    {/* AI Usage */}
                    <Box sx={{
                      minWidth: 130,
                      maxWidth: 150,
                      flexShrink: 0,
                      display: { xs: 'none', md: 'block' },
                    }}>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                        <AiIcon sx={{ fontSize: '0.85rem', color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary" fontWeight={500}>
                          {aiUsed} / {aiLimit}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={aiPercent}
                        color={aiColor}
                        sx={{
                          height: 5,
                          borderRadius: 3,
                          bgcolor: alpha(muiTheme.palette.text.primary, 0.06),
                        }}
                      />
                    </Box>

                    {/* Akcje */}
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                      <Tooltip title={t('editUserData')} arrow>
                        <IconButton
                          onClick={() => handleOpenProfileEditor(user)}
                          size="small"
                          sx={{
                            bgcolor: alpha(muiTheme.palette.primary.main, 0.08),
                            color: muiTheme.palette.primary.main,
                            '&:hover': { bgcolor: alpha(muiTheme.palette.primary.main, 0.16) },
                          }}
                        >
                          <AccountBoxIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title={t('changeRole')} arrow>
                        <span>
                          <IconButton
                            onClick={() => handleOpenEditDialog(user)}
                            disabled={currentUser.uid === user.id}
                            size="small"
                            sx={{
                              bgcolor: alpha(muiTheme.palette.text.primary, 0.05),
                              '&:hover': { bgcolor: alpha(muiTheme.palette.text.primary, 0.1) },
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title={t('managePermissions')} arrow>
                        <IconButton
                          onClick={() => handleOpenPermissionsDialog(user)}
                          size="small"
                          sx={{
                            bgcolor: alpha(muiTheme.palette.warning.main, 0.08),
                            color: muiTheme.palette.warning.main,
                            '&:hover': { bgcolor: alpha(muiTheme.palette.warning.main, 0.16) },
                          }}
                        >
                          <SecurityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>

                      {user.accountType !== 'kiosk' && (
                        <Tooltip title={t('manageSidebarTabs')} arrow>
                          <IconButton
                            onClick={() => handleOpenSidebarTabsDialog(user)}
                            size="small"
                            sx={{
                              bgcolor: alpha(muiTheme.palette.secondary.main, 0.08),
                              color: muiTheme.palette.secondary.main,
                              '&:hover': { bgcolor: alpha(muiTheme.palette.secondary.main, 0.16) },
                            }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}

                      {user.employeeId && (
                        <Tooltip title="Czas pracy" arrow>
                          <IconButton
                            onClick={() => { setSelectedUserForWorkTime(user); setWorkTimeUserDialogOpen(true); }}
                            size="small"
                            sx={{
                              bgcolor: alpha(muiTheme.palette.info.main, 0.08),
                              color: muiTheme.palette.info.main,
                              '&:hover': { bgcolor: alpha(muiTheme.palette.info.main, 0.16) },
                            }}
                          >
                            <AccessTimeIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}

                      {user.accountType === 'kiosk' && (
                        <Tooltip title={t('deleteKioskEmployee')} arrow>
                          <IconButton
                            onClick={() => handleOpenDeleteDialog(user)}
                            size="small"
                            sx={{
                              bgcolor: alpha(muiTheme.palette.error.main, 0.08),
                              color: muiTheme.palette.error.main,
                              '&:hover': { bgcolor: alpha(muiTheme.palette.error.main, 0.16) },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}

                      {currentUser.uid !== user.id && (
                        <Tooltip title={user.archived ? t('archive.unarchiveUser') : t('archive.archiveUser')} arrow>
                          <IconButton
                            onClick={() => handleOpenArchiveDialog(user)}
                            size="small"
                            sx={{
                              bgcolor: alpha(
                                user.archived ? muiTheme.palette.success.main : muiTheme.palette.text.disabled,
                                0.08
                              ),
                              color: user.archived ? muiTheme.palette.success.main : muiTheme.palette.text.disabled,
                              '&:hover': {
                                bgcolor: alpha(
                                  user.archived ? muiTheme.palette.success.main : muiTheme.palette.text.disabled,
                                  0.16
                                ),
                              },
                            }}
                          >
                            {user.archived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        )}
      </>
      )}

      {/* Dialog do edycji roli użytkownika */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog}>
        <DialogTitle>Zmień rolę użytkownika</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Zmieniasz rolę dla użytkownika: {selectedUser?.displayName || selectedUser?.email}
          </DialogContentText>
          <DialogContentText variant="caption" sx={{ mt: 1, mb: 2 }}>
            Administrator: limit 250 wiadomości AI miesięcznie<br />
            Pracownik: limit 50 wiadomości AI miesięcznie
          </DialogContentText>
          <FormControl fullWidth margin="dense">
            <InputLabel id="role-select-label">Rola</InputLabel>
            <Select
              labelId="role-select-label"
              value={newRole}
              label="Rola"
              onChange={(e) => setNewRole(e.target.value)}
            >
              <MenuItem value="pracownik">Pracownik</MenuItem>
              <MenuItem value="administrator">Administrator</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog} disabled={processing}>
            Anuluj
          </Button>
          <Button 
            onClick={handleChangeRole} 
            color="primary" 
            disabled={processing || newRole === selectedUser?.role}
          >
            {processing ? <CircularProgress size={24} /> : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog do zarządzania zakładkami sidebara */}
      <SidebarTabsManager
        open={sidebarTabsDialogOpen}
        onClose={handleCloseSidebarTabsDialog}
        selectedUser={selectedUserForTabs}
      />
      
      {/* Dialog do edycji profilu użytkownika */}
      <UserProfileEditor
        open={profileEditorOpen}
        onClose={handleCloseProfileEditor}
        selectedUser={selectedUserForProfile}
        onUserUpdated={handleUserUpdated}
      />
      
      {/* Dialog do zarządzania uprawnieniami */}
      <Dialog 
        open={permissionsDialogOpen} 
        onClose={handleClosePermissionsDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Zarządzanie uprawnieniami użytkownika</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Zarządzasz uprawnieniami dla użytkownika: {selectedUserForPermissions?.displayName || selectedUserForPermissions?.email}
          </DialogContentText>
          <DialogContentText variant="caption" sx={{ mt: 1, mb: 2, color: 'info.main' }}>
            Administratorzy automatycznie mają wszystkie uprawnienia. Uprawnienia można konfigurować tylko dla pracowników.
          </DialogContentText>
          
          <Box sx={{ mt: 2 }}>
            {/* Dostęp do modułów */}
            <Typography variant="subtitle2" color="primary" sx={{ mb: 1, mt: 2, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('permissionCategories.module', 'Dostęp do modułów')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {Object.values(AVAILABLE_PERMISSIONS).filter(p => p.category === 'module').map((permission) => (
              <Box key={permission.id} sx={{ mb: 1, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <FormControl component="fieldset" sx={{ width: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {permission.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {permission.description}
                      </Typography>
                    </Box>
                    <Checkbox
                      checked={userPermissions[permission.id] === true}
                      onChange={() => handlePermissionChange(permission.id)}
                      color="primary"
                    />
                  </Box>
                </FormControl>
              </Box>
            ))}

            {/* Uprawnienia operacyjne */}
            <Typography variant="subtitle2" color="primary" sx={{ mb: 1, mt: 3, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('permissionCategories.operational', 'Uprawnienia operacyjne')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {Object.values(AVAILABLE_PERMISSIONS).filter(p => p.category === 'operational').map((permission) => (
              <Box key={permission.id} sx={{ mb: 1, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <FormControl component="fieldset" sx={{ width: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {permission.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {permission.description}
                      </Typography>
                    </Box>
                    <Checkbox
                      checked={userPermissions[permission.id] === true}
                      onChange={() => handlePermissionChange(permission.id)}
                      color="primary"
                    />
                  </Box>
                </FormControl>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePermissionsDialog} disabled={processing}>
            Anuluj
          </Button>
          <Button 
            onClick={handleSavePermissions} 
            color="primary" 
            variant="contained"
            disabled={processing}
          >
            {processing ? <CircularProgress size={24} /> : 'Zapisz uprawnienia'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog tworzenia pracownika kioskowego */}
      <Dialog 
        open={createDialogOpen} 
        onClose={handleCloseCreateDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon color="success" />
            Dodaj pracownika (konto kioskowe)
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3, mt: 1 }}>
            Konto kioskowe nie wymaga adresu email ani logowania przez Google. 
            Pracownik będzie mógł korzystać z systemu wyłącznie przez swoje <strong>ID pracownika</strong> — 
            w panelach <strong>Czas pracy</strong> i <strong>Grafik</strong>.
          </Alert>

          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('fullName')}
                value={newKioskUser.displayName}
                onChange={handleCreateInputChange('displayName')}
                error={!!createErrors.displayName}
                helperText={createErrors.displayName}
                required
                autoFocus
                placeholder="np. Jan Kowalski"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="ID pracownika"
                value={newKioskUser.employeeId}
                onChange={handleCreateInputChange('employeeId')}
                error={!!createErrors.employeeId}
                helperText={createErrors.employeeId || 'Unikalny identyfikator (np. BGW-001)'}
                required
                placeholder="np. BGW-001"
                InputProps={{
                  style: { textTransform: 'uppercase' }
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Stanowisko"
                value={newKioskUser.position}
                onChange={handleCreateInputChange('position')}
                placeholder="np. Operator produkcji"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('department')}
                value={newKioskUser.department}
                onChange={handleCreateInputChange('department')}
                placeholder="np. Produkcja"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Telefon (opcjonalnie)"
                value={newKioskUser.phone}
                onChange={handleCreateInputChange('phone')}
                placeholder="+48 123 456 789"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateDialog} disabled={creating}>
            Anuluj
          </Button>
          <Button 
            onClick={handleCreateKioskUser} 
            variant="contained" 
            color="success"
            disabled={creating}
            startIcon={creating ? <CircularProgress size={20} color="inherit" /> : <PersonAddIcon />}
          >
            {creating ? 'Tworzenie...' : 'Utwórz pracownika'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć pracownika kioskowego <strong>{userToDelete?.displayName}</strong> ({userToDelete?.employeeId})?
          </DialogContentText>
          <DialogContentText sx={{ mt: 1, color: 'error.main' }}>
            Ta operacja jest nieodwracalna. Wpisy czasu pracy i wnioski powiązane z tym pracownikiem zostaną zachowane.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={deleting}>
            Anuluj
          </Button>
          <Button 
            onClick={handleDeleteKioskUser} 
            color="error" 
            variant="contained"
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={24} color="inherit" /> : 'Usuń'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia archiwizacji / przywrócenia */}
      <Dialog
        open={archiveDialogOpen}
        onClose={handleCloseArchiveDialog}
      >
        <DialogTitle>
          {userToArchive?.archived ? t('archive.confirmUnarchiveTitle') : t('archive.confirmTitle')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {userToArchive?.archived
              ? t('archive.confirmUnarchiveText', { name: userToArchive?.displayName || userToArchive?.email })
              : t('archive.confirmText', { name: userToArchive?.displayName || userToArchive?.email })
            }
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseArchiveDialog} disabled={archiving}>
            Anuluj
          </Button>
          <Button
            onClick={handleToggleArchive}
            color={userToArchive?.archived ? 'success' : 'warning'}
            variant="contained"
            disabled={archiving}
            startIcon={archiving ? <CircularProgress size={18} color="inherit" /> : (userToArchive?.archived ? <UnarchiveIcon /> : <ArchiveIcon />)}
          >
            {userToArchive?.archived ? t('archive.unarchiveUser') : t('archive.archiveUser')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog czasu pracy per-user */}
      <WorkTimeUserDialog
        open={workTimeUserDialogOpen}
        onClose={() => { setWorkTimeUserDialogOpen(false); setSelectedUserForWorkTime(null); }}
        user={selectedUserForWorkTime}
        users={users}
        adminUser={currentUser}
      />
    </Container>
  );
};

export default UsersManagementPage; 