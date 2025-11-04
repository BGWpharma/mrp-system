// src/services/productionOrderSyncService.js

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Sprawdza czy zadanie produkcyjne ma powiązane zamówienie i czy ilości się różnią
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<object|null>} - Obiekt z danymi do synchronizacji lub null jeśli brak różnicy
 */
export const checkOrderQuantitySync = async (taskId) => {
  try {
    // Pobierz zadanie produkcyjne
    const taskRef = doc(db, 'productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      throw new Error('Zadanie produkcyjne nie istnieje');
    }
    
    const task = { id: taskDoc.id, ...taskDoc.data() };
    
    // Sprawdź czy zadanie ma powiązane zamówienie
    if (!task.orderId || !task.orderItemId) {
      console.log('Zadanie nie ma powiązanego zamówienia');
      return null;
    }
    
    // Pobierz zamówienie
    const orderRef = doc(db, 'orders', task.orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      console.warn(`Zamówienie ${task.orderId} nie istnieje`);
      return null;
    }
    
    const order = { id: orderDoc.id, ...orderDoc.data() };
    
    // Znajdź pozycję zamówienia
    const orderItem = order.items?.find(item => item.id === task.orderItemId);
    
    if (!orderItem) {
      console.warn(`Pozycja zamówienia ${task.orderItemId} nie znaleziona`);
      return null;
    }
    
    // Określ rzeczywistą wyprodukowaną ilość
    const producedQuantity = parseFloat(task.actualQuantity || task.quantity || 0);
    const orderQuantity = parseFloat(orderItem.quantity || 0);
    
    // Sprawdź czy ilości się różnią
    if (Math.abs(producedQuantity - orderQuantity) < 0.01) {
      console.log('Ilości są zgodne, brak potrzeby synchronizacji');
      return null;
    }
    
    return {
      taskId: task.id,
      taskNumber: task.moNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderItemId: orderItem.id,
      orderItemName: orderItem.name,
      currentOrderQuantity: orderQuantity,
      producedQuantity: producedQuantity,
      difference: producedQuantity - orderQuantity,
      unit: task.unit || orderItem.unit
    };
    
  } catch (error) {
    console.error('Błąd podczas sprawdzania synchronizacji ilości:', error);
    throw error;
  }
};

/**
 * Aktualizuje ilość w pozycji zamówienia na podstawie rzeczywistej produkcji
 * @param {string} orderId - ID zamówienia
 * @param {string} orderItemId - ID pozycji zamówienia
 * @param {number} newQuantity - Nowa ilość
 * @param {string} userId - ID użytkownika wykonującego zmianę
 * @param {string} reason - Powód zmiany
 * @returns {Promise<boolean>} - True jeśli operacja się powiodła
 */
export const updateOrderItemQuantity = async (orderId, orderItemId, newQuantity, userId, reason = '') => {
  try {
    // Pobierz zamówienie
    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const order = orderDoc.data();
    
    // Znajdź i zaktualizuj pozycję
    const items = [...(order.items || [])];
    const itemIndex = items.findIndex(item => item.id === orderItemId);
    
    if (itemIndex === -1) {
      throw new Error('Pozycja zamówienia nie znaleziona');
    }
    
    const oldQuantity = items[itemIndex].quantity;
    
    // Zaktualizuj ilość
    items[itemIndex] = {
      ...items[itemIndex],
      quantity: newQuantity,
      quantityUpdatedFromProduction: true,
      quantityUpdatedAt: new Date().toISOString(),
      quantityUpdatedBy: userId,
      quantityUpdateReason: reason,
      previousQuantity: oldQuantity
    };
    
    // Przelicz wartość pozycji (quantity * price)
    const itemPrice = parseFloat(items[itemIndex].price || 0);
    items[itemIndex].totalPrice = newQuantity * itemPrice;
    
    // Przelicz całkowitą wartość zamówienia
    const itemsTotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.totalPrice) || 0);
    }, 0);
    
    const shippingCost = parseFloat(order.shippingCost || 0);
    const additionalCosts = parseFloat(order.additionalCosts || 0);
    const discount = parseFloat(order.discount || 0);
    const totalValue = itemsTotal + shippingCost + additionalCosts - discount;
    
    // Zaktualizuj zamówienie
    await updateDoc(orderRef, {
      items: items,
      totalValue: totalValue,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log(`✅ Zaktualizowano ilość w zamówieniu ${order.orderNumber}: ${oldQuantity} → ${newQuantity}`);
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji ilości w zamówieniu:', error);
    throw error;
  }
};

/**
 * Synchronizuje ilość z zadania produkcyjnego do zamówienia
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} userId - ID użytkownika
 * @returns {Promise<object>} - Wynik operacji
 */
export const syncTaskQuantityToOrder = async (taskId, userId) => {
  try {
    // Sprawdź czy synchronizacja jest potrzebna
    const syncData = await checkOrderQuantitySync(taskId);
    
    if (!syncData) {
      return {
        success: false,
        message: 'Synchronizacja nie jest potrzebna',
        synced: false
      };
    }
    
    // Wykonaj aktualizację
    const reason = `Automatyczna synchronizacja z zadania produkcyjnego ${syncData.taskNumber}`;
    await updateOrderItemQuantity(
      syncData.orderId,
      syncData.orderItemId,
      syncData.producedQuantity,
      userId,
      reason
    );
    
    return {
      success: true,
      message: `Zaktualizowano ilość w zamówieniu ${syncData.orderNumber} z ${syncData.currentOrderQuantity} na ${syncData.producedQuantity} ${syncData.unit}`,
      synced: true,
      syncData: syncData
    };
    
  } catch (error) {
    console.error('Błąd podczas synchronizacji ilości:', error);
    throw error;
  }
};

