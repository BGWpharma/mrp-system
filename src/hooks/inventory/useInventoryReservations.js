import { useState, useEffect } from 'react';
import { getItemTransactions, updateReservation, updateReservationTasks, cleanupDeletedTaskReservations, deleteReservation, getItemBatches } from '../../services/inventory';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useInventoryListState } from '../../contexts/InventoryListStateContext';
import { useTranslation } from '../useTranslation';
import { db } from '../../services/firebase/config';
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';

const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';

export function useInventoryReservations({ setConfirmDialog, setLoading }) {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('inventory');
  const { state: listState, actions: listActions } = useInventoryListState();

  const currentTab = listState.currentTab;
  const reservationFilter = listState.reservationFilter;
  const moFilter = listState.moFilter;

  const [selectedItem, setSelectedItem] = useState(null);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [filteredReservations, setFilteredReservations] = useState([]);
  const [sortOrder, setSortOrder] = useState('desc');
  const [sortField, setSortField] = useState('createdAt');
  const [editingReservation, setEditingReservation] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ quantity: '', batchId: '' });
  const [updatingTasks, setUpdatingTasks] = useState(false);
  const [cleaningReservations, setCleaningReservations] = useState(false);
  const [selectedItemBatches, setSelectedItemBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const [allReservations, setAllReservations] = useState([]);
  const [filteredAllReservations, setFilteredAllReservations] = useState([]);
  const [loadingAllReservations, setLoadingAllReservations] = useState(false);

  useEffect(() => {
    if (currentTab === 5) { fetchAllReservations(); }
  }, [currentTab]);

  const fetchAllReservations = async () => {
    try {
      setLoadingAllReservations(true);
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const q = query(transactionsRef, where('type', '==', 'booking'), orderBy('createdAt', 'desc'), limit(200));
      const querySnapshot = await getDocs(q);
      const reservationsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAtDate: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000) : new Date()
      }));
      const productionReservations = reservationsData.filter(reservation =>
        reservation.referenceId && (reservation.taskNumber || reservation.reason === 'Zadanie produkcyjne')
      );
      setAllReservations(productionReservations);
      setFilteredAllReservations(productionReservations);
    } catch (error) {
      console.error('Błąd podczas pobierania rezerwacji:', error);
      showError('Nie udało się pobrać listy rezerwacji');
    } finally {
      setLoadingAllReservations(false);
    }
  };

  const handleMoFilterChange = (e) => {
    const value = e.target.value;
    listActions.setMoFilter(value);
    if (!value) { setFilteredAllReservations(allReservations); return; }
    const filtered = allReservations.filter(reservation => {
      const moNumber = reservation.taskNumber || '';
      return moNumber.toLowerCase().includes(value.toLowerCase());
    });
    setFilteredAllReservations(filtered);
  };

  const filterAndSortReservations = (filterValue, field, order, data = reservations) => {
    let filtered = [...data];
    if (filterValue === 'active') {
      filtered = filtered.filter(r => !r.fulfilled);
    } else if (filterValue === 'fulfilled') {
      filtered = filtered.filter(r => r.fulfilled);
    }
    filtered.sort((a, b) => {
      let valueA, valueB;
      if (field === 'createdAt') { valueA = new Date(a.createdAt).getTime(); valueB = new Date(b.createdAt).getTime(); }
      else if (field === 'quantity') { valueA = a.quantity; valueB = b.quantity; }
      else { valueA = a[field] || ''; valueB = b[field] || ''; }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }
      return order === 'asc' ? valueA - valueB : valueB - valueA;
    });
    setFilteredReservations(filtered);
  };

  const fetchReservations = async (item) => {
    try {
      setLoading(true);
      const transactions = await getItemTransactions(item.id);
      let bookingTransactions = transactions.filter(t => t.type === 'booking');
      const taskIds = bookingTransactions.filter(t => t.referenceId).map(t => t.referenceId);
      const uniqueTaskIds = [...new Set(taskIds)];
      const existingTasksMap = {};
      const taskDataMap = {};

      if (uniqueTaskIds.length > 0) {
        const taskChunks = [];
        for (let i = 0; i < uniqueTaskIds.length; i += 30) { taskChunks.push(uniqueTaskIds.slice(i, i + 30)); }
        const taskResults = await Promise.all(
          taskChunks.map(chunk => {
            const q = query(collection(db, 'productionTasks'), where('__name__', 'in', chunk));
            return getDocs(q);
          })
        );
        taskResults.forEach(snapshot => { snapshot.docs.forEach(docSnap => { existingTasksMap[docSnap.id] = true; taskDataMap[docSnap.id] = docSnap.data(); }); });
        uniqueTaskIds.forEach(id => { if (!(id in existingTasksMap)) existingTasksMap[id] = false; });
      }

      bookingTransactions = bookingTransactions.filter(t => { if (!t.referenceId) return true; return existingTasksMap[t.referenceId] !== false; });

      const reservationsWithoutTasks = bookingTransactions.filter(
        t => !t.taskNumber && t.referenceId && existingTasksMap[t.referenceId]
      );
      if (reservationsWithoutTasks.length > 0) {
        for (const reservation of reservationsWithoutTasks) {
          try {
            const taskData = taskDataMap[reservation.referenceId];
            if (taskData) {
              const taskName = taskData.name || '';
              const taskNumber = taskData.moNumber || taskData.number || '';
              const clientName = taskData.clientName || '';
              const clientId = taskData.clientId || '';
              if (taskNumber) {
                const transactionRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservation.id);
                await updateDoc(transactionRef, { taskName, taskNumber, clientName, clientId, updatedAt: serverTimestamp() });
                reservation.taskName = taskName;
                reservation.taskNumber = taskNumber;
                reservation.clientName = clientName;
                reservation.clientId = clientId;
              }
            }
          } catch (error) {
            console.error(`Błąd podczas aktualizacji rezerwacji ${reservation.id}:`, error);
          }
        }
      }

      setReservations(bookingTransactions);
      filterAndSortReservations(reservationFilter, sortField, sortOrder, bookingTransactions);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching reservations:', error);
      showError('Błąd podczas pobierania rezerwacji');
      setLoading(false);
    }
  };

  const handleFilterChange = (event) => { listActions.setReservationFilter(event.target.value); };
  const handleSort = (field) => {
    const newSortOrder = field === sortField && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newSortOrder);
    setSortField(field);
    filterAndSortReservations(reservationFilter, field, newSortOrder);
  };

  const handleShowReservations = async (item) => {
    setSelectedItem(item);
    await fetchReservations(item);
    setReservationDialogOpen(true);
  };

  const handleCloseReservationDialog = () => {
    setReservationDialogOpen(false);
    setSelectedItem(null);
    setReservations([]);
    setFilteredReservations([]);
    listActions.setReservationFilter('all');
    setSortField('createdAt');
    setSortOrder('desc');
  };

  const handleEditReservation = async (reservation) => {
    setEditingReservation(reservation);
    setEditDialogOpen(true);
    try {
      setLoadingBatches(true);
      const batches = await getItemBatches(selectedItem?.id || reservation.itemId);
      setSelectedItemBatches(batches);
      setEditForm({ quantity: reservation.quantity, batchId: reservation.batchId || '' });
    } catch (error) {
      console.error('Błąd podczas pobierania partii:', error);
      showError('Nie udało się pobrać listy partii');
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleSaveReservation = async () => {
    try {
      await updateReservation(editingReservation.id, selectedItem?.id || editingReservation.itemId, Number(editForm.quantity), editForm.batchId, currentUser.uid);
      showSuccess('Rezerwacja została zaktualizowana');
      setEditDialogOpen(false);
      if (selectedItem) await fetchReservations(selectedItem);
    } catch (error) {
      console.error('Błąd podczas aktualizacji rezerwacji:', error);
      showError(error.message);
    }
  };

  const handleDeleteReservation = async (reservationId) => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: 'Czy na pewno chcesz usunąć tę rezerwację? Ta operacja jest nieodwracalna.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await deleteReservation(reservationId, currentUser.uid);
          showSuccess('Rezerwacja została usunięta');
          if (selectedItem) await fetchReservations(selectedItem);
        } catch (error) {
          console.error('Błąd podczas usuwania rezerwacji:', error);
          showError(error.message);
        }
      }
    });
  };

  const handleUpdateReservationTasks = async () => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie',
      message: 'Czy na pewno chcesz zaktualizować dane zadań we wszystkich rezerwacjach? To może zająć dłuższą chwilę.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setUpdatingTasks(true);
        try {
          const result = await updateReservationTasks();
          showSuccess(`Zaktualizowano ${result.updated.length} rezerwacji. ${result.notUpdated.length} rezerwacji nie ma przypisanych zadań.`);
          if (selectedItem) await fetchReservations(selectedItem);
        } catch (error) {
          console.error('Błąd podczas aktualizacji rezerwacji:', error);
          showError('Wystąpił błąd podczas aktualizacji rezerwacji');
        } finally {
          setUpdatingTasks(false);
        }
      }
    });
  };

  const handleCleanupDeletedTaskReservations = async () => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: 'Czy na pewno chcesz usunąć wszystkie rezerwacje dla usuniętych zadań produkcyjnych? Ta operacja jest nieodwracalna.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setCleaningReservations(true);
        try {
          const result = await cleanupDeletedTaskReservations();
          if (result.count > 0) { showSuccess(`Usunięto ${result.count} rezerwacji z usuniętych zadań produkcyjnych.`); }
          else { showSuccess(t('inventory:states.reservationsTab.noReservationsToClean')); }
          if (selectedItem) await fetchReservations(selectedItem);
        } catch (error) {
          console.error('Błąd podczas czyszczenia rezerwacji:', error);
          showError('Wystąpił błąd podczas czyszczenia rezerwacji');
        } finally {
          setCleaningReservations(false);
        }
      }
    });
  };

  return {
    selectedItem, setSelectedItem,
    reservationDialogOpen, reservations, filteredReservations,
    sortOrder, sortField,
    editingReservation, editDialogOpen, setEditDialogOpen,
    editForm, setEditForm,
    updatingTasks, cleaningReservations,
    selectedItemBatches, loadingBatches,
    allReservations, filteredAllReservations, loadingAllReservations,
    moFilter,
    fetchAllReservations, handleMoFilterChange,
    fetchReservations, handleFilterChange, handleSort,
    handleShowReservations, handleCloseReservationDialog,
    handleEditReservation, handleSaveReservation,
    handleDeleteReservation, handleUpdateReservationTasks,
    handleCleanupDeletedTaskReservations
  };
}
