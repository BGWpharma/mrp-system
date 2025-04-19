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
  Box
} from '@mui/material';
import {
  Edit as EditIcon,
  Person as PersonIcon,
  PersonOutline as PersonOutlineIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { getAllUsers, changeUserRole } from '../../services/userService';

const UsersManagementPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [processing, setProcessing] = useState(false);
  
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
  
  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom sx={{ mt: 3 }}>
        Zarządzanie użytkownikami
      </Typography>
      
      <Paper sx={{ p: 2, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Lista użytkowników systemu</Typography>
          <Button 
            variant="outlined" 
            onClick={fetchUsers}
            disabled={loading}
          >
            Odśwież
          </Button>
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
                  <TableCell>Rola</TableCell>
                  <TableCell>Limit wiadomości AI</TableCell>
                  <TableCell>Wykorzystano</TableCell>
                  <TableCell>Data utworzenia</TableCell>
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
                      <Chip 
                        label={user.role === 'administrator' ? 'Administrator' : 'Pracownik'} 
                        color={user.role === 'administrator' ? 'primary' : 'default'}
                        variant={user.role === 'administrator' ? 'filled' : 'outlined'}
                        icon={<PersonIcon />}
                      />
                    </TableCell>
                    <TableCell>
                      {user.aiMessagesLimit || (user.role === 'administrator' ? 250 : 50)}
                    </TableCell>
                    <TableCell>
                      {user.aiMessagesUsed || 0}
                    </TableCell>
                    <TableCell>
                      {user.createdAt 
                        ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('pl-PL')
                        : 'Brak danych'}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        onClick={() => handleOpenEditDialog(user)}
                        disabled={currentUser.uid === user.id} // Nie pozwalaj na edycję własnego konta
                        title="Zmień rolę"
                      >
                        <EditIcon />
                      </IconButton>
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
    </Container>
  );
};

export default UsersManagementPage; 