// src/services/inventory/utils/debugHelpers.js

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  query,
  where 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../config/constants.js';
import { validateId, ValidationError } from './validators.js';

/**
 * 🚨 MODUŁ FUNKCJI DEBUGOWANIA
 * 
 * ⚠️  UWAGA: Te funkcje są przeznaczone TYLKO dla środowiska deweloperskiego!
 * 
 * Zawiera funkcje pomocnicze do debugowania problemów z:
 * - Rezerwacjami partii
 * - MaterialBatches w zadaniach produkcyjnych
 * - Duplikatami wpisów
 * - Czyszczeniem duplikowanych rezerwacji
 * 
 * 🔒 W środowisku produkcyjnym te funkcje powinny być wyłączone
 * lub dostępne tylko dla administratorów systemu.
 */

/**
 * 🔍 Debuguje rezerwacje dla konkretnej partii
 * @param {string} batchId - ID partii do sprawdzenia
 * @returns {Promise<Object>} - Raport z analizą rezerwacji
 * @throws {ValidationError} - Gdy ID partii jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas analizy
 */
export const debugReservationTransfer = async (batchId) => {
  try {
    // Walidacja parametrów
    const validatedBatchId = validateId(batchId, 'batchId');
    
    console.log('🔍 [DEBUG] Sprawdzam rezerwacje dla partii:', validatedBatchId);
    
    // Pobierz rezerwacje dla partii
    const transactionsRef = collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS);
    const reservationsQuery = query(
      transactionsRef,
      where('batchId', '==', validatedBatchId),
      where('type', '==', 'booking')
    );
    
    const querySnapshot = await getDocs(reservationsQuery);
    const reservations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log('📋 [DEBUG] Znalezione rezerwacje:', reservations);
    
    if (reservations.length > 0) {
      console.log('📊 [DEBUG] Szczegóły rezerwacji:');
      reservations.forEach((res, index) => {
        console.log(`  ${index + 1}. ID: ${res.id}, Ilość: ${res.quantity}, Task: ${res.taskId || res.referenceId}, MO: ${res.taskNumber}`);
      });
    }
    
    return {
      batchId: validatedBatchId,
      reservationsCount: reservations.length,
      reservations: reservations.map(res => ({
        id: res.id,
        quantity: res.quantity,
        taskId: res.taskId || res.referenceId,
        moNumber: res.taskNumber,
        itemId: res.itemId,
        createdAt: res.createdAt
      }))
    };
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('❌ [DEBUG] Błąd podczas debugowania rezerwacji:', error);
    throw new Error(`Błąd debugowania rezerwacji: ${error.message}`);
  }
};

/**
 * 🔍 Debuguje materialBatches w zadaniach produkcyjnych dla konkretnej partii
 * @param {string} batchId - ID partii do sprawdzenia
 * @returns {Promise<Object>} - Raport z analizą materialBatches
 * @throws {ValidationError} - Gdy ID partii jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas analizy
 */
export const debugMaterialBatches = async (batchId) => {
  try {
    // Walidacja parametrów
    const validatedBatchId = validateId(batchId, 'batchId');
    
    console.log('🔍 [DEBUG] Sprawdzam materialBatches dla partii:', validatedBatchId);
    
    // Pobierz wszystkie zadania produkcyjne
    const tasksRef = collection(db, 'productionTasks');
    const tasksSnapshot = await getDocs(tasksRef);
    
    const foundTasks = [];
    
    tasksSnapshot.docs.forEach(doc => {
      const taskData = doc.data();
      if (taskData.materialBatches) {
        Object.entries(taskData.materialBatches).forEach(([materialId, batches]) => {
          const relevantBatches = batches.filter(batch => batch.batchId === validatedBatchId);
          if (relevantBatches.length > 0) {
            foundTasks.push({
              taskId: doc.id,
              moNumber: taskData.moNumber,
              materialId,
              batches: relevantBatches.map(batch => ({
                batchId: batch.batchId,
                quantity: batch.quantity,
                batchNumber: batch.batchNumber
              }))
            });
          }
        });
      }
    });
    
    console.log(`📋 [DEBUG] Znaleziono ${foundTasks.length} zadań MO z partią ${validatedBatchId}:`, foundTasks);
    
    return {
      batchId: validatedBatchId,
      tasksCount: foundTasks.length,
      tasks: foundTasks
    };
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('❌ [DEBUG] Błąd podczas sprawdzania materialBatches:', error);
    throw new Error(`Błąd debugowania materialBatches: ${error.message}`);
  }
};

/**
 * 🔍 Sprawdza duplikaty w materialBatches dla konkretnego zadania
 * @param {string} taskId - ID zadania do sprawdzenia
 * @returns {Promise<Object>} - Raport z analizą duplikatów
 * @throws {ValidationError} - Gdy ID zadania jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas analizy
 */
export const debugDuplicateBatches = async (taskId) => {
  try {
    // Walidacja parametrów
    const validatedTaskId = validateId(taskId, 'taskId');
    
    console.log('🔍 [DEBUG] Sprawdzam duplikaty w materialBatches dla zadania:', validatedTaskId);
    
    const taskRef = doc(db, 'productionTasks', validatedTaskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      throw new ValidationError('Zadanie nie istnieje', 'taskId');
    }
    
    const taskData = taskDoc.data();
    if (!taskData.materialBatches) {
      return { 
        message: 'Brak materialBatches',
        taskId: validatedTaskId,
        moNumber: taskData.moNumber 
      };
    }
    
    const duplicates = {};
    
    Object.entries(taskData.materialBatches).forEach(([materialId, batches]) => {
      const batchIdCounts = {};
      
      batches.forEach((batch, index) => {
        const batchId = batch.batchId;
        if (!batchIdCounts[batchId]) {
          batchIdCounts[batchId] = [];
        }
        batchIdCounts[batchId].push({ index, batch });
      });
      
      // Znajdź duplikaty
      Object.entries(batchIdCounts).forEach(([batchId, entries]) => {
        if (entries.length > 1) {
          if (!duplicates[materialId]) {
            duplicates[materialId] = [];
          }
          duplicates[materialId].push({
            batchId,
            count: entries.length,
            entries: entries.map(e => ({ 
              quantity: e.batch.quantity, 
              index: e.index,
              batchNumber: e.batch.batchNumber 
            })),
            totalQuantity: entries.reduce((sum, e) => sum + parseFloat(e.batch.quantity || 0), 0)
          });
        }
      });
    });
    
    console.log('📋 [DEBUG] Znalezione duplikaty:', duplicates);
    
    return {
      taskId: validatedTaskId,
      moNumber: taskData.moNumber,
      duplicates,
      hasDuplicates: Object.keys(duplicates).length > 0
    };
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('❌ [DEBUG] Błąd podczas sprawdzania duplikatów:', error);
    throw new Error(`Błąd debugowania duplikatów: ${error.message}`);
  }
};

/**
 * 🔍 Sprawdza i analizuje duplikowane rezerwacje dla partii
 * @param {string} batchId - ID partii do sprawdzenia
 * @returns {Promise<Object>} - Raport z analizą duplikatów rezerwacji
 * @throws {ValidationError} - Gdy ID partii jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas analizy
 */
export const debugAndCleanDuplicateReservations = async (batchId) => {
  try {
    // Walidacja parametrów
    const validatedBatchId = validateId(batchId, 'batchId');
    
    console.log('🔍 [DEBUG] Sprawdzam duplikowane rezerwacje dla partii:', validatedBatchId);
    
    // Pobierz wszystkie rezerwacje dla partii (używamy debugReservationTransfer)
    const reservationData = await debugReservationTransfer(validatedBatchId);
    const reservations = reservationData.reservations;
    
    console.log(`📋 Znaleziono ${reservations.length} rezerwacji`);
    
    if (reservations.length <= 1) {
      return { 
        message: 'Brak duplikatów', 
        batchId: validatedBatchId,
        reservations 
      };
    }
    
    // Grupuj według klucza (taskId + itemId)
    const groups = {};
    reservations.forEach(res => {
      const key = `${res.taskId}_${res.itemId}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(res);
    });
    
    const duplicates = {};
    Object.entries(groups).forEach(([key, group]) => {
      if (group.length > 1) {
        duplicates[key] = {
          count: group.length,
          reservations: group.map(res => ({
            id: res.id,
            quantity: res.quantity,
            taskId: res.taskId,
            moNumber: res.moNumber
          })),
          totalQuantity: group.reduce((sum, res) => sum + parseFloat(res.quantity || 0), 0)
        };
      }
    });
    
    console.log('🔍 [DEBUG] Znalezione duplikaty:', duplicates);
    
    return {
      batchId: validatedBatchId,
      totalReservations: reservations.length,
      duplicateGroups: duplicates,
      hasDuplicates: Object.keys(duplicates).length > 0,
      analysis: {
        uniqueGroups: Object.keys(groups).length,
        duplicatedGroups: Object.keys(duplicates).length,
        totalDuplicatedReservations: Object.values(duplicates).reduce((sum, group) => sum + group.count, 0)
      }
    };
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('❌ [DEBUG] Błąd podczas sprawdzania duplikatów rezerwacji:', error);
    throw new Error(`Błąd debugowania duplikatów rezerwacji: ${error.message}`);
  }
};

/**
 * 🛠️ Kompletna analiza partii - łączy wszystkie funkcje debugowania
 * @param {string} batchId - ID partii do pełnej analizy
 * @returns {Promise<Object>} - Kompletny raport analizy partii
 * @throws {ValidationError} - Gdy ID partii jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas analizy
 */
export const debugCompleteBatchAnalysis = async (batchId) => {
  try {
    // Walidacja parametrów
    const validatedBatchId = validateId(batchId, 'batchId');
    
    console.log('🔍 [DEBUG] Rozpoczynam kompleksową analizę partii:', validatedBatchId);
    
    // Równoległe wykonanie wszystkich analiz
    const [
      reservationAnalysis,
      materialBatchesAnalysis,
      duplicateReservationsAnalysis
    ] = await Promise.all([
      debugReservationTransfer(validatedBatchId),
      debugMaterialBatches(validatedBatchId),
      debugAndCleanDuplicateReservations(validatedBatchId)
    ]);
    
    const report = {
      batchId: validatedBatchId,
      timestamp: new Date().toISOString(),
      reservations: reservationAnalysis,
      materialBatches: materialBatchesAnalysis,
      duplicateReservations: duplicateReservationsAnalysis,
      summary: {
        totalReservations: reservationAnalysis.reservationsCount,
        tasksWithBatch: materialBatchesAnalysis.tasksCount,
        hasDuplicateReservations: duplicateReservationsAnalysis.hasDuplicates,
        issues: []
      }
    };
    
    // Analiza problemów
    if (duplicateReservationsAnalysis.hasDuplicates) {
      report.summary.issues.push('Znaleziono duplikowane rezerwacje');
    }
    
    if (reservationAnalysis.reservationsCount !== materialBatchesAnalysis.tasksCount) {
      report.summary.issues.push('Niezgodność między rezerwacjami a materialBatches');
    }
    
    console.log('📋 [DEBUG] Kompletna analiza zakończona:', report.summary);
    
    return report;
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('❌ [DEBUG] Błąd podczas kompletnej analizy partii:', error);
    throw new Error(`Błąd kompletnej analizy partii: ${error.message}`);
  }
};