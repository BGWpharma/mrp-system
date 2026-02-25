import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  Person as PersonIcon,
  PersonOutline as PersonOutlineIcon,
  Visibility as VisibilityIcon,
  AccountBox as AccountBoxIcon,
  Security as SecurityIcon,
  PersonAdd as PersonAddIcon,
  Storefront as KioskIcon,
  Delete as DeleteIcon,
  Google as GoogleIcon
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
  AVAILABLE_PERMISSIONS 
} from '../../services/userService';
import SidebarTabsManager from '../../components/admin/SidebarTabsManager';
import UserProfileEditor from '../../components/admin/UserProfileEditor';
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
  
  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom sx={{ mt: 3 }}>
        Zarządzanie użytkownikami
      </Typography>
      
      <Paper sx={{ p: 2, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Lista użytkowników systemu</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="contained" 
              startIcon={<PersonAddIcon />}
              onClick={handleOpenCreateDialog}
              color="success"
            >
              Dodaj pracownika
            </Button>
            <Button 
              variant="outlined" 
              onClick={fetchUsers}
              disabled={loading}
            >
              Odśwież
            </Button>
          </Box>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Użytkownik</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>ID pracownika</TableCell>
                  <TableCell>Stanowisko</TableCell>
                  <TableCell>Dział</TableCell>
                  <TableCell>Typ konta</TableCell>
                  <TableCell>Rola</TableCell>
                  <TableCell>Limit AI</TableCell>
                  <TableCell>Wykorzystano</TableCell>
                  <TableCell>Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {user.photoURL ? (
                          <img 
                            src={user.photoURL} 
                            alt={user.displayName} 
                            style={{ width: 30, height: 30, borderRadius: '50%', marginRight: 10 }}
                          />
                        ) : (
                          <PersonOutlineIcon sx={{ mr: 1 }} />
                        )}
                        {user.displayName || 'Brak nazwy'}
                      </Box>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.employeeId ? (
                        <Chip 
                          label={user.employeeId} 
                          size="small" 
                          color="info" 
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          Brak
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {user.position || 'Nie określono'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {user.department || 'Nie określono'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {user.accountType === 'kiosk' ? (
                        <Chip 
                          label="Kiosk" 
                          size="small" 
                          color="warning" 
                          variant="outlined"
                          icon={<KioskIcon />}
                        />
                      ) : (
                        <Chip 
                          label="Google" 
                          size="small" 
                          color="info" 
                          variant="outlined"
                          icon={<GoogleIcon />}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={user.role === 'administrator' ? 'Administrator' : 'Pracownik'} 
                        color={user.role === 'administrator' ? 'primary' : 'default'}
                        variant={user.role === 'administrator' ? 'filled' : 'outlined'}
                        icon={<PersonIcon />}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {user.aiMessagesLimit || (user.role === 'administrator' ? 250 : 50)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {user.aiMessagesUsed || 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        onClick={() => handleOpenProfileEditor(user)}
                        title={t('editUserData')}
                        color="primary"
                        sx={{ mr: 0.5 }}
                      >
                        <AccountBoxIcon />
                      </IconButton>
                      <IconButton 
                        onClick={() => handleOpenEditDialog(user)}
                        disabled={currentUser.uid === user.id} // Nie pozwalaj na edycję własnego konta
                        title={t('changeRole')}
                        sx={{ mr: 0.5 }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        onClick={() => handleOpenPermissionsDialog(user)}
                        title={t('managePermissions')}
                        color="warning"
                        sx={{ mr: 0.5 }}
                      >
                        <SecurityIcon />
                      </IconButton>
                      {user.accountType !== 'kiosk' && (
                        <IconButton 
                          onClick={() => handleOpenSidebarTabsDialog(user)}
                          title={t('manageSidebarTabs')}
                          color="secondary"
                          sx={{ mr: 0.5 }}
                        >
                          <VisibilityIcon />
                        </IconButton>
                      )}
                      {user.accountType === 'kiosk' && (
                        <Tooltip title={t('deleteKioskEmployee')}>
                          <IconButton 
                            onClick={() => handleOpenDeleteDialog(user)}
                            color="error"
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      
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
    </Container>
  );
};

export default UsersManagementPage; 