import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Divider
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import {
  getAvailableSidebarTabs,
  getUserHiddenSidebarTabs,
  updateUserHiddenSidebarTabs,
  getUserHiddenSidebarSubtabs,
  updateUserHiddenSidebarSubtabs
} from '../../services/userService';

/**
 * Komponent do zarządzania widocznością zakładek sidebara dla konkretnego użytkownika
 */
const SidebarTabsManager = ({ open, onClose, selectedUser }) => {
  const [availableTabs, setAvailableTabs] = useState([]);
  const [hiddenTabs, setHiddenTabs] = useState([]);
  const [hiddenSubtabs, setHiddenSubtabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  // Ładowanie danych przy otwarciu dialogu
  useEffect(() => {
    if (open && selectedUser) {
      loadUserTabsData();
    }
  }, [open, selectedUser]);
  
  const loadUserTabsData = async () => {
    setLoading(true);
    try {
      // Pobierz dostępne zakładki
      const tabs = getAvailableSidebarTabs();
      setAvailableTabs(tabs);
      
      // Pobierz ukryte zakładki użytkownika
      const userHiddenTabs = await getUserHiddenSidebarTabs(selectedUser.id);
      setHiddenTabs(userHiddenTabs);
      
      // Pobierz ukryte podzakładki użytkownika
      const userHiddenSubtabs = await getUserHiddenSidebarSubtabs(selectedUser.id);
      setHiddenSubtabs(userHiddenSubtabs);
    } catch (error) {
      console.error('Błąd podczas ładowania danych zakładek:', error);
      showError('Nie udało się załadować danych o zakładkach użytkownika');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTabToggle = (tabId) => {
    setHiddenTabs(prev => {
      if (prev.includes(tabId)) {
        // Usuń z ukrytych (pokaż zakładkę)
        return prev.filter(id => id !== tabId);
      } else {
        // Dodaj do ukrytych (ukryj zakładkę)
        return [...prev, tabId];
      }
    });
  };
  
  const handleSubtabToggle = (subtabId) => {
    setHiddenSubtabs(prev => {
      if (prev.includes(subtabId)) {
        // Usuń z ukrytych (pokaż podzakładkę)
        return prev.filter(id => id !== subtabId);
      } else {
        // Dodaj do ukrytych (ukryj podzakładkę)
        return [...prev, subtabId];
      }
    });
  };
  
  const handleSave = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      // Zapisz ukryte zakładki
      await updateUserHiddenSidebarTabs(selectedUser.id, hiddenTabs, currentUser.uid);
      
      // Zapisz ukryte podzakładki
      await updateUserHiddenSidebarSubtabs(selectedUser.id, hiddenSubtabs, currentUser.uid);
      
      showSuccess(`Zaktualizowano widoczność zakładek i podzakładek dla użytkownika ${selectedUser.displayName || selectedUser.email}`);
      onClose();
    } catch (error) {
      console.error('Błąd podczas zapisywania ustawień zakładek:', error);
      showError(error.message || 'Nie udało się zapisać ustawień zakładek');
    } finally {
      setSaving(false);
    }
  };
  
  const handleClose = () => {
    setHiddenTabs([]);
    setHiddenSubtabs([]);
    setAvailableTabs([]);
    onClose();
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <VisibilityIcon sx={{ mr: 1 }} />
          Zarządzanie zakładkami sidebara
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {selectedUser && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Użytkownik: <strong>{selectedUser.displayName || selectedUser.email}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Wybierz, które zakładki sidebara mają być ukryte dla tego użytkownika.
              Ukryte zakładki nie będą widoczne w menu nawigacyjnym.
            </Typography>
          </Box>
        )}
        
        <Divider sx={{ mb: 2 }} />
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Typography variant="h6" gutterBottom>
              Dostępne zakładki sidebara:
            </Typography>
            
            {availableTabs.length === 0 ? (
              <Alert severity="info">
                Brak dostępnych zakładek do zarządzania
              </Alert>
            ) : (
              <FormGroup>
                {availableTabs.map((tab) => {
                  const isTabHidden = hiddenTabs.includes(tab.id);
                  return (
                    <Box key={tab.id} sx={{ mb: 2 }}>
                      {/* Główna zakładka */}
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={!isTabHidden}
                            onChange={() => handleTabToggle(tab.id)}
                            icon={<VisibilityOffIcon />}
                            checkedIcon={<VisibilityIcon />}
                            color="primary"
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                              {tab.name}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              color="text.secondary" 
                              sx={{ ml: 1 }}
                            >
                              ({tab.path})
                            </Typography>
                            {isTabHidden && (
                              <Typography 
                                variant="caption" 
                                color="error" 
                                sx={{ ml: 1, fontWeight: 'bold' }}
                              >
                                - UKRYTA
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      
                      {/* Podzakładki */}
                      {tab.hasSubmenu && tab.children && tab.children.length > 0 && (
                        <Box sx={{ ml: 4, mt: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            Podzakładki:
                          </Typography>
                          <FormGroup>
                            {tab.children.map((subtab) => {
                              const isSubtabHidden = hiddenSubtabs.includes(subtab.id);
                              const isParentHidden = isTabHidden;
                              
                              return (
                                <FormControlLabel
                                  key={subtab.id}
                                  control={
                                    <Checkbox
                                      checked={!isSubtabHidden && !isParentHidden}
                                      onChange={() => handleSubtabToggle(subtab.id)}
                                      icon={<VisibilityOffIcon />}
                                      checkedIcon={<VisibilityIcon />}
                                      color="primary"
                                      disabled={isParentHidden}
                                      size="small"
                                    />
                                  }
                                  label={
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <Typography variant="body2">
                                        {subtab.name}
                                      </Typography>
                                      <Typography 
                                        variant="caption" 
                                        color="text.secondary" 
                                        sx={{ ml: 1 }}
                                      >
                                        ({subtab.path})
                                      </Typography>
                                      {(isSubtabHidden || isParentHidden) && (
                                        <Typography 
                                          variant="caption" 
                                          color="error" 
                                          sx={{ ml: 1, fontWeight: 'bold' }}
                                        >
                                          - UKRYTA
                                        </Typography>
                                      )}
                                    </Box>
                                  }
                                />
                              );
                            })}
                          </FormGroup>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </FormGroup>
            )}
            
            {(hiddenTabs.length > 0 || hiddenSubtabs.length > 0) && (
              <Box sx={{ mt: 3 }}>
                {hiddenTabs.length > 0 && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      <strong>Ukryte główne zakładki ({hiddenTabs.length}):</strong><br />
                      {availableTabs
                        .filter(tab => hiddenTabs.includes(tab.id))
                        .map(tab => tab.name)
                        .join(', ')}
                    </Typography>
                  </Alert>
                )}
                
                {hiddenSubtabs.length > 0 && (
                  <Alert severity="info">
                    <Typography variant="body2">
                      <strong>Ukryte podzakładki ({hiddenSubtabs.length}):</strong><br />
                      {availableTabs
                        .flatMap(tab => tab.children || [])
                        .filter(subtab => hiddenSubtabs.includes(subtab.id))
                        .map(subtab => subtab.name)
                        .join(', ')}
                    </Typography>
                  </Alert>
                )}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={saving}
        >
          Anuluj
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={loading || saving || !selectedUser}
        >
          {saving ? <CircularProgress size={24} /> : 'Zapisz'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SidebarTabsManager; 