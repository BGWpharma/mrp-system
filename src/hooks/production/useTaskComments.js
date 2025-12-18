/**
 * Hook do zarządzania komentarzami zadania produkcyjnego
 * Obsługuje ładowanie, dodawanie i usuwanie komentarzy
 */

import { useState, useCallback } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useNotification } from '../useNotification';

export const useTaskComments = (taskId) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [deletingComment, setDeletingComment] = useState(false);
  const { showSuccess, showError } = useNotification();

  // ✅ Otwórz drawer z komentarzami
  const openCommentsDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  // ✅ Zamknij drawer z komentarzami
  const closeCommentsDrawer = useCallback(() => {
    setDrawerOpen(false);
    setNewComment('');
  }, []);

  // ✅ Dodaj komentarz do zadania
  const addComment = useCallback(async (userId, userName) => {
    if (!taskId || !newComment.trim()) {
      showError('Komentarz nie może być pusty');
      return false;
    }

    try {
      setAddingComment(true);
      
      const commentData = {
        id: `comment_${Date.now()}`,
        text: newComment.trim(),
        createdBy: userId,
        createdByName: userName || 'Nieznany użytkownik',
        createdAt: new Date().toISOString(),
        readBy: [userId] // Autor komentarza automatycznie ma go jako przeczytany
      };

      const taskRef = doc(db, 'productionTasks', taskId);
      await updateDoc(taskRef, {
        comments: arrayUnion(commentData),
        updatedAt: serverTimestamp()
      });

      setNewComment('');
      showSuccess('Komentarz został dodany');
      return true;
    } catch (error) {
      console.error('Błąd podczas dodawania komentarza:', error);
      showError('Błąd podczas dodawania komentarza: ' + error.message);
      return false;
    } finally {
      setAddingComment(false);
    }
  }, [taskId, newComment, showSuccess, showError]);

  // ✅ Usuń komentarz z zadania
  const deleteComment = useCallback(async (comment) => {
    if (!taskId || !comment) {
      return false;
    }

    try {
      setDeletingComment(true);
      
      const taskRef = doc(db, 'productionTasks', taskId);
      await updateDoc(taskRef, {
        comments: arrayRemove(comment),
        updatedAt: serverTimestamp()
      });

      showSuccess('Komentarz został usunięty');
      return true;
    } catch (error) {
      console.error('Błąd podczas usuwania komentarza:', error);
      showError('Błąd podczas usuwania komentarza: ' + error.message);
      return false;
    } finally {
      setDeletingComment(false);
    }
  }, [taskId, showSuccess, showError]);

  // ✅ Oznacz komentarze jako przeczytane
  const markCommentsAsRead = useCallback(async (comments, userId) => {
    if (!taskId || !comments || comments.length === 0) {
      return;
    }

    try {
      // Oznacz tylko nieprzeczytane komentarze innych użytkowników
      const unreadComments = comments.filter(c => {
        const readBy = c.readBy || [];
        const authorId = c.createdBy || c.userId;
        return !readBy.includes(userId) && authorId !== userId;
      });
      
      if (unreadComments.length === 0) {
        return;
      }

      const updatedComments = comments.map(comment => {
        const readBy = comment.readBy || [];
        const authorId = comment.createdBy || comment.userId;
        if (!readBy.includes(userId) && authorId !== userId) {
          return { ...comment, readBy: [...readBy, userId] };
        }
        return comment;
      });

      const taskRef = doc(db, 'productionTasks', taskId);
      await updateDoc(taskRef, {
        comments: updatedComments
      });
    } catch (error) {
      console.error('Błąd podczas oznaczania komentarzy jako przeczytane:', error);
    }
  }, [taskId]);

  // ✅ Policz nieprzeczytane komentarze
  const getUnreadCount = useCallback((comments, userId) => {
    if (!comments || comments.length === 0) {
      return 0;
    }
    return comments.filter(c => {
      const readBy = c.readBy || [];
      const authorId = c.createdBy || c.userId;
      return !readBy.includes(userId) && authorId !== userId;
    }).length;
  }, []);

  return {
    // Stan
    drawerOpen,
    newComment,
    addingComment,
    deletingComment,
    
    // Settery
    setNewComment,
    
    // Akcje
    openCommentsDrawer,
    closeCommentsDrawer,
    addComment,
    deleteComment,
    markCommentsAsRead,
    getUnreadCount
  };
};

