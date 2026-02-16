// src/hooks/useUserNames.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { getUsersDisplayNames } from '../services/userService';

/**
 * Hook do zarządzania nazwami użytkowników
 * Automatycznie pobiera nazwy użytkowników na podstawie listy ID
 * Cachuje wyniki aby uniknąć wielokrotnych zapytań
 * 
 * OPTYMALIZACJA: userNamesRef zamiast userNames w deps useCallback
 * — stabilna referencja fetchUserNames, brak nieskończonych pętli
 */
export const useUserNames = (initialUserIds = []) => {
  const [userNames, setUserNames] = useState({});
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(new Set());
  const userNamesRef = useRef({});

  // Stabilna referencja — nie zależy od userNames state
  const fetchUserNames = useCallback(async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    
    const uniqueUserIds = [...new Set(userIds.filter(id => id && typeof id === 'string'))];
    
    // Sprawdź ref zamiast state — unika re-kreacji callbacka
    const missingUserIds = uniqueUserIds.filter(id => 
      !userNamesRef.current[id] && !loadingRef.current.has(id)
    );
    
    if (missingUserIds.length === 0) return;
    
    // Dodaj do listy ładowanych
    missingUserIds.forEach(id => loadingRef.current.add(id));
    
    try {
      setLoading(true);
      const names = await getUsersDisplayNames(missingUserIds);
      
      // Aktualizuj ref I state
      userNamesRef.current = { ...userNamesRef.current, ...names };
      setUserNames(prev => ({ ...prev, ...names }));
    } catch (error) {
      console.error('Błąd podczas pobierania nazw użytkowników:', error);
      
      // W przypadku błędu, ustaw fallback nazwy
      const fallbackNames = {};
      missingUserIds.forEach(id => {
        fallbackNames[id] = id.length > 10 ? 
          `${id.substring(0, 5)}...${id.substring(id.length - 4)}` : 
          id;
      });
      
      userNamesRef.current = { ...userNamesRef.current, ...fallbackNames };
      setUserNames(prev => ({ ...prev, ...fallbackNames }));
    } finally {
      setLoading(false);
      // Usuń z listy ładowanych
      missingUserIds.forEach(id => loadingRef.current.delete(id));
    }
  }, []); // Pusta tablica deps — stabilna referencja

  // Automatyczne pobieranie przy zmianie listy ID
  useEffect(() => {
    if (initialUserIds && initialUserIds.length > 0) {
      fetchUserNames(initialUserIds);
    }
  }, [initialUserIds, fetchUserNames]);

  // Funkcja pomocnicza do uzyskania nazwy użytkownika
  const getUserName = useCallback((userId) => {
    if (!userId) return 'System';
    
    // Sprawdź ref (zawsze aktualne dane)
    if (userNamesRef.current[userId]) {
      return userNamesRef.current[userId];
    }
    
    // Jeśli ID jest w trakcie ładowania, pokaż skróconą wersję
    if (loadingRef.current.has(userId)) {
      return userId.length > 10 ? 
        `${userId.substring(0, 5)}...${userId.substring(userId.length - 4)}` : 
        userId;
    }
    
    // Automatycznie pobierz nazwę użytkownika jeśli jej nie ma
    if (userId.length > 10) {
      // Uruchom pobieranie w tle (nie blokuje renderowania)
      setTimeout(() => fetchUserNames([userId]), 0);
      
      // Tymczasowo zwróć skróconą wersję
      return `${userId.substring(0, 5)}...${userId.substring(userId.length - 4)}`;
    }
    
    return userId;
  }, [fetchUserNames]);

  // Funkcja do ręcznego dodania nazwy użytkownika (przydatne gdy mamy już dane)
  const setUserName = useCallback((userId, userName) => {
    userNamesRef.current[userId] = userName;
    setUserNames(prev => ({
      ...prev,
      [userId]: userName
    }));
  }, []);

  // Funkcja do wyczyśnienia cache
  const clearUserNames = useCallback(() => {
    userNamesRef.current = {};
    setUserNames({});
    loadingRef.current.clear();
  }, []);

  return { 
    userNames, 
    getUserName, 
    fetchUserNames, 
    setUserName,
    clearUserNames,
    loading 
  };
};

export default useUserNames;
