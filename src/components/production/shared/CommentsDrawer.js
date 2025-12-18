/**
 * Drawer do wyświetlania i zarządzania komentarzami zadania
 * Wydzielony z TaskDetailsPage.js dla lepszej organizacji kodu
 */

import React, { memo, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { formatDateTime } from '../../../utils/formatters';

const CommentsDrawer = memo(({
  open,
  onClose,
  comments = [],
  newComment,
  onNewCommentChange,
  onAddComment,
  onDeleteComment,
  addingComment = false,
  currentUserId,
  t = (key) => key
}) => {
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    onAddComment();
  }, [onAddComment]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 400 } }
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider'
        }}>
          <Typography variant="h6">
            Komentarze ({comments.length})
          </Typography>
          <IconButton onClick={onClose} edge="end">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Lista komentarzy */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 0 }}>
          {comments.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="textSecondary">
                Brak komentarzy
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                Dodaj pierwszy komentarz poniżej
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {comments.map((comment, index) => (
                <React.Fragment key={comment.id || index}>
                  <ListItem 
                    alignItems="flex-start"
                    sx={{
                      bgcolor: (comment.createdBy || comment.userId) === currentUserId 
                        ? 'action.hover' 
                        : 'transparent',
                      '&:hover': {
                        bgcolor: 'action.selected'
                      }
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="subtitle2" component="span">
                            {comment.createdByName || comment.userName || 'Nieznany użytkownik'}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {comment.createdAt ? formatDateTime(comment.createdAt) : ''}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography
                          variant="body2"
                          color="textPrimary"
                          sx={{ 
                            mt: 0.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {comment.text}
                        </Typography>
                      }
                    />
                    {(comment.createdBy || comment.userId) === currentUserId && (
                      <ListItemSecondaryAction>
                        <IconButton 
                          edge="end" 
                          size="small"
                          onClick={() => onDeleteComment(comment)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    )}
                  </ListItem>
                  {index < comments.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        {/* Formularz nowego komentarza */}
        <Box 
          component="form" 
          onSubmit={handleSubmit}
          sx={{ 
            p: 2, 
            borderTop: 1, 
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <TextField
            fullWidth
            multiline
            rows={2}
            placeholder="Napisz komentarz..."
            value={newComment}
            onChange={(e) => onNewCommentChange(e.target.value)}
            disabled={addingComment}
            variant="outlined"
            size="small"
            sx={{ mb: 1 }}
          />
          <Button
            fullWidth
            variant="contained"
            type="submit"
            disabled={!newComment?.trim() || addingComment}
            startIcon={addingComment ? <CircularProgress size={20} /> : <SendIcon />}
          >
            {addingComment ? 'Wysyłanie...' : 'Wyślij komentarz'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
});

CommentsDrawer.displayName = 'CommentsDrawer';

export default CommentsDrawer;

