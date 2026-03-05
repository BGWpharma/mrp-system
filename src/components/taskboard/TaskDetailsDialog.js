// src/components/taskboard/TaskDetailsDialog.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
  Chip,
  Avatar,
  Autocomplete,
  CircularProgress,
  LinearProgress,
  Alert,
  Tooltip,
  Popover
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import { updateTask, getTaskUpdatedAt } from '../../services/taskboard';
import { getAllActiveUsers } from '../../services/userService';
import { 
  uploadTaskAttachment, 
  deleteTaskAttachment, 
  validateFile,
  formatFileSize 
} from '../../services/taskboard';
import PersonIcon from '@mui/icons-material/Person';
import { nanoid } from 'nanoid';
import { useTranslation } from '../../hooks/useTranslation';
import MentionTextarea from './MentionTextarea';

// Helper do rozpoznawania typu pliku po URL lub type
const getAttachmentIcon = (url, type) => {
  if (type === 'image' || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)) {
    return ImageIcon;
  }
  if (type === 'pdf' || /\.pdf$/i.test(url)) {
    return PictureAsPdfIcon;
  }
  if (type === 'document' || /\.(doc|docx|txt|rtf|odt|xls|xlsx|csv)$/i.test(url)) {
    return DescriptionIcon;
  }
  if (type === 'archive' || /\.(zip|rar|7z)$/i.test(url)) {
    return FolderZipIcon;
  }
  return InsertDriveFileIcon;
};

const TaskDetailsDialog = ({ task, board, open, onClose, onSave }) => {
  const { t } = useTranslation('taskboard');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: undefined,
    dueDate: null,
    assignedTo: [],
    subtaskLists: [],
    attachments: []
  });

  const [originalData, setOriginalData] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const openedUpdatedAtRef = useRef(null);

  const isDirty = useMemo(() => {
    if (!originalData) return false;
    return JSON.stringify(formData) !== JSON.stringify(originalData);
  }, [formData, originalData]);

  const isDirtyRef = useRef(false);
  isDirtyRef.current = isDirty;

  const [newSubtaskListTitle, setNewSubtaskListTitle] = useState('');
  const [newSubtasks, setNewSubtasks] = useState({});
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [subtaskAssignAnchor, setSubtaskAssignAnchor] = useState(null);
  const [assigningSubtask, setAssigningSubtask] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });
  
  // Stany dla uploadu plików
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Pobierz listę wszystkich aktywnych użytkowników
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingUsers(true);
      try {
        const users = await getAllActiveUsers();
        if (cancelled) return;
        setAllUsers(users);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania użytkowników:', error);
      } finally {
        if (!cancelled) {
          setLoadingUsers(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (task && open) {
      const newData = {
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || undefined,
        dueDate: task.dueDate || null,
        assignedTo: task.assignedTo || [],
        subtaskLists: task.subtaskLists || [],
        attachments: task.attachments || []
      };

      if (isDirtyRef.current) {
        setExternalChangeDetected(true);
      } else {
        setFormData(newData);
        setOriginalData(newData);
        openedUpdatedAtRef.current = task.updatedAt || null;
        setConflict(false);
        setExternalChangeDetected(false);
        setNewAttachment({ name: '', url: '' });
      }
    }

    if (!open) {
      setOriginalData(null);
      setConflict(false);
      setExternalChangeDetected(false);
    }
  }, [task, open]);

  const handleRefreshData = () => {
    if (!task) return;
    const newData = {
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || undefined,
      dueDate: task.dueDate || null,
      assignedTo: task.assignedTo || [],
      subtaskLists: task.subtaskLists || [],
      attachments: task.attachments || []
    };
    setFormData(newData);
    setOriginalData(newData);
    openedUpdatedAtRef.current = task.updatedAt || null;
    setConflict(false);
    setExternalChangeDetected(false);
  };

  const handleSave = async (forceOverwrite = false) => {
    if (!task || !formData.title.trim()) return;

    try {
      if (!forceOverwrite && openedUpdatedAtRef.current) {
        const currentUpdatedAt = await getTaskUpdatedAt(task.id);
        if (currentUpdatedAt && currentUpdatedAt.getTime() > openedUpdatedAtRef.current.getTime()) {
          setConflict(true);
          return;
        }
      }

      await updateTask(task.id, {
        title: formData.title,
        description: formData.description,
        priority: formData.priority || null,
        dueDate: formData.dueDate,
        assignedTo: formData.assignedTo,
        subtaskLists: formData.subtaskLists,
        attachments: formData.attachments
      });

      setConflict(false);
      setExternalChangeDetected(false);
      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error('Błąd podczas zapisywania zadania:', error);
    }
  };

  const handleDialogClose = async (event, reason) => {
    if (task && formData.title.trim() && isDirtyRef.current) {
      await handleSave();
    } else {
      onClose();
    }
  };

  // Obsługa załączników - dodawanie linku URL
  const handleAddAttachment = () => {
    if (!newAttachment.url.trim()) return;
    
    // Automatycznie ustaw nazwę jeśli nie podano
    let name = newAttachment.name.trim();
    if (!name) {
      try {
        const url = new URL(newAttachment.url);
        name = url.pathname.split('/').pop() || url.hostname;
      } catch {
        name = 'Załącznik';
      }
    }

    const attachment = {
      id: nanoid(),
      name,
      url: newAttachment.url.trim(),
      isUploaded: false, // To jest link, nie uploadowany plik
      addedAt: new Date().toISOString()
    };

    setFormData({
      ...formData,
      attachments: [...formData.attachments, attachment]
    });
    setNewAttachment({ name: '', url: '' });
  };

  // Obsługa uploadu pliku
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !task) return;

    // Walidacja
    const validation = validateFile(file);
    if (!validation.valid) {
      setUploadError(validation.errors.join(', '));
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const attachment = await uploadTaskAttachment(
        file, 
        task.id, 
        (progress) => setUploadProgress(progress)
      );

      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, attachment]
      }));
    } catch (error) {
      console.error('Błąd uploadu:', error);
      setUploadError(error.message || 'Nie udało się przesłać pliku');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      // Reset input file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Usuwanie załącznika (z Firebase Storage jeśli był uploadowany)
  const handleDeleteAttachment = async (attachmentId) => {
    const attachment = formData.attachments.find(a => a.id === attachmentId);
    
    // Jeśli to uploadowany plik, usuń z Firebase Storage
    if (attachment?.isUploaded && attachment?.storagePath) {
      try {
        await deleteTaskAttachment(attachment.storagePath);
      } catch (error) {
        console.error('Błąd podczas usuwania pliku ze Storage:', error);
        // Kontynuuj usuwanie z formData nawet jeśli błąd
      }
    }

    setFormData({
      ...formData,
      attachments: formData.attachments.filter(a => a.id !== attachmentId)
    });
  };

  const handleAddSubtaskList = () => {
    if (!newSubtaskListTitle.trim()) return;

    const newList = {
      id: nanoid(),
      title: newSubtaskListTitle,
      subtasks: []
    };

    setFormData({
      ...formData,
      subtaskLists: [...formData.subtaskLists, newList]
    });
    setNewSubtaskListTitle('');
  };

  const handleDeleteSubtaskList = (listId) => {
    setFormData({
      ...formData,
      subtaskLists: formData.subtaskLists.filter(list => list.id !== listId)
    });
  };

  const handleAddSubtask = (listId) => {
    const subtaskTitle = newSubtasks[listId]?.trim();
    if (!subtaskTitle) return;

    const updatedLists = formData.subtaskLists.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          subtasks: [
            ...list.subtasks,
            {
              id: nanoid(),
              title: subtaskTitle,
              completed: false,
              assignedTo: null
            }
          ]
        };
      }
      return list;
    });

    setFormData({ ...formData, subtaskLists: updatedLists });
    setNewSubtasks({ ...newSubtasks, [listId]: '' });
  };

  const handleToggleSubtask = (listId, subtaskId) => {
    const updatedLists = formData.subtaskLists.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          subtasks: list.subtasks.map(subtask => {
            if (subtask.id === subtaskId) {
              return { ...subtask, completed: !subtask.completed };
            }
            return subtask;
          })
        };
      }
      return list;
    });

    setFormData({ ...formData, subtaskLists: updatedLists });
  };

  const handleDeleteSubtask = (listId, subtaskId) => {
    const updatedLists = formData.subtaskLists.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          subtasks: list.subtasks.filter(subtask => subtask.id !== subtaskId)
        };
      }
      return list;
    });

    setFormData({ ...formData, subtaskLists: updatedLists });
  };

  const handleEditSubtask = (listId, subtaskId, newTitle) => {
    if (!newTitle?.trim()) {
      setEditingSubtask(null);
      return;
    }
    const updatedLists = formData.subtaskLists.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          subtasks: list.subtasks.map(subtask => {
            if (subtask.id === subtaskId) {
              return { ...subtask, title: newTitle.trim() };
            }
            return subtask;
          })
        };
      }
      return list;
    });
    setFormData({ ...formData, subtaskLists: updatedLists });
    setEditingSubtask(null);
  };

  const handleAssignSubtask = (listId, subtaskId, userId) => {
    const updatedLists = formData.subtaskLists.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          subtasks: list.subtasks.map(subtask => {
            if (subtask.id === subtaskId) {
              return { ...subtask, assignedTo: userId || null };
            }
            return subtask;
          })
        };
      }
      return list;
    });
    setFormData({ ...formData, subtaskLists: updatedLists });
    setSubtaskAssignAnchor(null);
    setAssigningSubtask(null);
  };

  const priorityOptions = [
    { value: undefined, label: t('priorityNone') },
    { value: 'low', label: t('priorityLow') },
    { value: 'medium', label: t('priorityMedium') },
    { value: 'high', label: t('priorityHigh') },
    { value: 'urgent', label: t('priorityUrgent') }
  ];

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
        {t('taskDetails')}
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {conflict && (
          <Alert
            severity="warning"
            sx={{ mb: 2, mt: 1 }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" color="inherit" onClick={handleRefreshData}>
                  {t('refreshData')}
                </Button>
                <Button size="small" color="inherit" onClick={() => handleSave(true)}>
                  {t('overwrite')}
                </Button>
              </Box>
            }
          >
            {t('conflictDetected')}
          </Alert>
        )}
        {externalChangeDetected && !conflict && (
          <Alert
            severity="info"
            sx={{ mb: 2, mt: 1 }}
            action={
              <Button size="small" color="inherit" onClick={handleRefreshData}>
                {t('refreshData')}
              </Button>
            }
            onClose={() => setExternalChangeDetected(false)}
          >
            {t('externalChangeDetected')}
          </Alert>
        )}

        {/* Tytuł */}
        <TextField
          autoFocus
          margin="dense"
          label={t('taskTitle')}
          fullWidth
          variant="outlined"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          sx={{ mb: 2, mt: 1 }}
        />

        {/* Opis z obsługą @mentions */}
        <Box sx={{ mb: 2 }}>
          <MentionTextarea
            label={t('taskDescription')}
            placeholder={t('descriptionPlaceholder')}
            value={formData.description}
            onChange={(newValue) => setFormData({ ...formData, description: newValue })}
            rows={4}
          />
        </Box>

        {/* Priorytet i termin w jednym rzędzie */}
        <Box display="flex" gap={2} mb={2}>
          <FormControl fullWidth>
            <InputLabel>{t('priority')}</InputLabel>
            <Select
              value={formData.priority || ''}
              label={t('priority')}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value || undefined })}
            >
              {priorityOptions.map(option => (
                <MenuItem key={option.value || 'none'} value={option.value || ''}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <DatePicker
              label={t('dueDate')}
              value={formData.dueDate}
              onChange={(newValue) => setFormData({ ...formData, dueDate: newValue })}
              slotProps={{
                textField: {
                  fullWidth: true,
                  variant: 'outlined'
                }
              }}
            />
          </LocalizationProvider>
        </Box>

        {/* Przypisani użytkownicy */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon fontSize="small" />
            {t('assignedUsers')}
          </Typography>
          
          <Autocomplete
            multiple
            options={allUsers}
            value={allUsers.filter(user => formData.assignedTo.includes(user.id))}
            onChange={(event, newValue) => {
              setFormData({
                ...formData,
                assignedTo: newValue.map(user => user.id)
              });
            }}
            getOptionLabel={(option) => option.displayName || option.email || t('noName')}
            loading={loadingUsers}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={t('selectUsers')}
                variant="outlined"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingUsers ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            renderOption={(props, option) => {
              const { key, ...otherProps } = props;
              return (
                <Box component="li" key={key} {...otherProps} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar 
                    sx={{ 
                      width: 28, 
                      height: 28, 
                      fontSize: '0.75rem',
                      bgcolor: 'primary.main'
                    }}
                  >
                    {(option.displayName || option.email || '?').charAt(0).toUpperCase()}
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
              );
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option.id}
                  avatar={
                    <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                      {(option.displayName || option.email || '?').charAt(0).toUpperCase()}
                    </Avatar>
                  }
                  label={option.displayName || option.email}
                  size="small"
                />
              ))
            }
            isOptionEqualToValue={(option, value) => option.id === value.id}
            sx={{ mb: 1 }}
          />
          
          {formData.assignedTo.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {t('assignedCount', { count: formData.assignedTo.length })} {formData.assignedTo.length === 1 ? t('person') : t('people')}
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Załączniki */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AttachFileIcon fontSize="small" />
            {t('attachments')}
          </Typography>
          
          {/* Błąd uploadu */}
          {uploadError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadError(null)}>
              {uploadError}
            </Alert>
          )}

          {/* Pasek postępu uploadu */}
          {uploading && (
            <Box sx={{ mb: 2 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">
                  {t('uploadingFile')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {uploadProgress}%
                </Typography>
              </Box>
              <LinearProgress variant="determinate" value={uploadProgress} />
            </Box>
          )}

          {/* Lista załączników */}
          {formData.attachments.length > 0 && (
            <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1, mb: 2 }}>
              {formData.attachments.map((attachment) => {
                const IconComponent = getAttachmentIcon(attachment.url, attachment.type);
                return (
                  <ListItem
                    key={attachment.id}
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => window.open(attachment.url, '_blank')}
                          sx={{ color: 'primary.main' }}
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    }
                    sx={{
                      borderBottom: 1,
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' }
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 1,
                          bgcolor: attachment.isUploaded 
                            ? 'rgba(76, 175, 80, 0.15)' 
                            : 'rgba(63, 140, 255, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <IconComponent sx={{ 
                          fontSize: 18, 
                          color: attachment.isUploaded ? 'success.main' : 'primary.main' 
                        }} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Typography variant="body2" noWrap fontWeight={500}>
                            {attachment.name}
                          </Typography>
                          {attachment.isUploaded && (
                            <Chip 
                              label={t('file')} 
                              size="small" 
                              color="success"
                              sx={{ 
                                height: 16, 
                                fontSize: '0.6rem',
                                '& .MuiChip-label': { px: 0.75 }
                              }} 
                            />
                          )}
                        </Box>
                        <Typography 
                          variant="caption" 
                          color="text.secondary" 
                          noWrap 
                          sx={{ 
                            display: 'block',
                            maxWidth: '100%'
                          }}
                        >
                          {attachment.isUploaded && attachment.size 
                            ? formatFileSize(attachment.size)
                            : attachment.url
                          }
                        </Typography>
                      </Box>
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          )}

          {/* Formularz dodawania załącznika */}
          <Box sx={{ 
            p: 2, 
            bgcolor: 'action.hover', 
            borderRadius: 1,
            border: 1,
            borderStyle: 'dashed',
            borderColor: 'divider',
          }}>
            {/* Upload pliku */}
            <Box sx={{ mb: 2 }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar,.7z"
              />
              <Button
                variant="outlined"
                fullWidth
                startIcon={<CloudUploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !task}
                sx={{ mb: 1 }}
              >
                {uploading ? t('uploading') : t('uploadFile')}
              </Button>
              <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
                {t('uploadFileTypes')}
              </Typography>
            </Box>

            <Divider sx={{ my: 1.5 }}>
              <Typography variant="caption" color="text.secondary">{t('orAddLink')}</Typography>
            </Divider>

            {/* Dodawanie linku */}
            <Box display="flex" gap={1} mb={1}>
              <TextField
                size="small"
                fullWidth
                placeholder={t('linkPlaceholder')}
                value={newAttachment.url}
                onChange={(e) => setNewAttachment({ ...newAttachment, url: e.target.value })}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newAttachment.url.trim()) {
                    handleAddAttachment();
                  }
                }}
                InputProps={{
                  startAdornment: <LinkIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                }}
              />
            </Box>
            <Box display="flex" gap={1}>
              <TextField
                size="small"
                fullWidth
                placeholder={t('namePlaceholder')}
                value={newAttachment.name}
                onChange={(e) => setNewAttachment({ ...newAttachment, name: e.target.value })}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newAttachment.url.trim()) {
                    handleAddAttachment();
                  }
                }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={handleAddAttachment}
                disabled={!newAttachment.url.trim()}
                startIcon={<AddIcon />}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {t('add')}
              </Button>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Podzadania */}
        <Typography variant="h6" gutterBottom>
          {t('subtasks')}
        </Typography>

        {/* Lista podzadań */}
        {formData.subtaskLists.map((list) => (
          <Box key={list.id} sx={{ mb: 3 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle2" fontWeight="bold">
                {list.title}
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleDeleteSubtaskList(list.id)}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>

            <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1, mb: 1 }}>
              {list.subtasks.map((subtask) => {
                const isEditing = editingSubtask?.listId === list.id && editingSubtask?.subtaskId === subtask.id;
                const assignedUser = subtask.assignedTo ? allUsers.find(u => u.id === subtask.assignedTo) : null;

                return (
                  <ListItem
                    key={subtask.id}
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center' }}>
                        <Tooltip title={assignedUser ? (assignedUser.displayName || assignedUser.email) : t('assignSubtaskUser')}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              setAssigningSubtask({ listId: list.id, subtaskId: subtask.id });
                              setSubtaskAssignAnchor(e.currentTarget);
                            }}
                          >
                            {assignedUser ? (
                              <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', bgcolor: 'primary.main' }}>
                                {(assignedUser.displayName || assignedUser.email || '?').charAt(0).toUpperCase()}
                              </Avatar>
                            ) : (
                              <PersonIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                            )}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('editSubtask')}>
                          <IconButton
                            size="small"
                            onClick={() => setEditingSubtask({ listId: list.id, subtaskId: subtask.id, title: subtask.title })}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDeleteSubtask(list.id, subtask.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    }
                    disablePadding
                    sx={{ pl: 1 }}
                  >
                    <Checkbox
                      edge="start"
                      checked={subtask.completed}
                      onChange={() => handleToggleSubtask(list.id, subtask.id)}
                      tabIndex={-1}
                      disableRipple
                      icon={<CheckBoxOutlineBlankIcon />}
                      checkedIcon={<CheckBoxIcon />}
                      size="small"
                    />
                    {isEditing ? (
                      <TextField
                        size="small"
                        fullWidth
                        value={editingSubtask.title}
                        onChange={(e) => setEditingSubtask({ ...editingSubtask, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleEditSubtask(list.id, subtask.id, editingSubtask.title);
                          }
                          if (e.key === 'Escape') {
                            setEditingSubtask(null);
                          }
                        }}
                        onBlur={() => handleEditSubtask(list.id, subtask.id, editingSubtask.title)}
                        autoFocus
                        sx={{ mr: 1 }}
                      />
                    ) : (
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                textDecoration: subtask.completed ? 'line-through' : 'none',
                                color: subtask.completed ? 'text.disabled' : 'text.primary'
                              }}
                            >
                              {subtask.title}
                            </Typography>
                            {assignedUser && (
                              <Chip
                                size="small"
                                avatar={
                                  <Avatar sx={{ width: 18, height: 18, fontSize: '0.6rem' }}>
                                    {(assignedUser.displayName || assignedUser.email || '?').charAt(0).toUpperCase()}
                                  </Avatar>
                                }
                                label={assignedUser.displayName || assignedUser.email}
                                sx={{ height: 20, fontSize: '0.7rem', '& .MuiChip-label': { px: 0.5 } }}
                              />
                            )}
                          </Box>
                        }
                      />
                    )}
                  </ListItem>
                );
              })}
            </List>

            {/* Dodaj podzadanie */}
            <Box display="flex" gap={1}>
              <TextField
                size="small"
                fullWidth
                placeholder={t('addSubtask')}
                value={newSubtasks[list.id] || ''}
                onChange={(e) => setNewSubtasks({ ...newSubtasks, [list.id]: e.target.value })}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddSubtask(list.id);
                  }
                }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleAddSubtask(list.id)}
                disabled={!newSubtasks[list.id]?.trim()}
              >
                <AddIcon fontSize="small" />
              </Button>
            </Box>
          </Box>
        ))}

        {/* Dodaj nową listę podzadań */}
        <Box display="flex" gap={1} mt={2}>
          <TextField
            size="small"
            fullWidth
            placeholder={t('newSubtaskList')}
            value={newSubtaskListTitle}
            onChange={(e) => setNewSubtaskListTitle(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleAddSubtaskList();
              }
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleAddSubtaskList}
            disabled={!newSubtaskListTitle.trim()}
            startIcon={<AddIcon />}
          >
            {t('newList')}
          </Button>
        </Box>
        {/* Popover do przypisywania użytkownika do podzadania */}
        <Popover
          open={Boolean(subtaskAssignAnchor)}
          anchorEl={subtaskAssignAnchor}
          onClose={() => {
            setSubtaskAssignAnchor(null);
            setAssigningSubtask(null);
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          <Box sx={{ minWidth: 220, maxHeight: 320, overflow: 'auto' }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', fontWeight: 600 }}>
              {t('assignSubtaskUser')}
            </Typography>
            <MenuItem
              dense
              onClick={() => assigningSubtask && handleAssignSubtask(assigningSubtask.listId, assigningSubtask.subtaskId, null)}
            >
              <PersonIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} />
              <Typography variant="body2" color="text.secondary">{t('unassign')}</Typography>
            </MenuItem>
            <Divider />
            {allUsers.map(user => {
              const currentSubtask = assigningSubtask 
                ? formData.subtaskLists
                    .find(l => l.id === assigningSubtask.listId)
                    ?.subtasks.find(s => s.id === assigningSubtask.subtaskId) 
                : null;
              const isSelected = currentSubtask?.assignedTo === user.id;

              return (
                <MenuItem
                  key={user.id}
                  dense
                  selected={isSelected}
                  onClick={() => assigningSubtask && handleAssignSubtask(assigningSubtask.listId, assigningSubtask.subtaskId, user.id)}
                >
                  <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', bgcolor: 'primary.main', mr: 1 }}>
                    {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="body2">{user.displayName || t('noName')}</Typography>
                    <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                  </Box>
                </MenuItem>
              );
            })}
          </Box>
        </Popover>
      </DialogContent>
      <DialogActions sx={{ borderTop: 1, borderColor: 'divider', px: 2.5, py: 2 }}>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!formData.title.trim()}
        >
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TaskDetailsDialog;
