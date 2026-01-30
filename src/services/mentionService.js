// src/services/mentionService.js
// Serwis do wyszukiwania dokumentów dla funkcjonalności @mentions

import { collection, query, where, getDocs, orderBy, limit, startAt, endAt } from 'firebase/firestore';
import { db } from './firebase/config';

// Typy dokumentów obsługiwanych przez mentions
export const MENTION_TYPES = {
  MO: {
    id: 'MO',
    label: 'Zadanie produkcyjne',
    labelEn: 'Manufacturing Order',
    prefix: 'MO',
    collection: 'productionTasks',
    numberField: 'moNumber',
    nameField: 'productName',
    color: '#4ECDC4', // teal
    route: '/production'
  },
  CO: {
    id: 'CO',
    label: 'Zamówienie klienta',
    labelEn: 'Customer Order',
    prefix: 'CO',
    collection: 'orders',
    numberField: 'orderNumber',
    nameField: 'customer.name',
    color: '#FF6B6B', // red
    route: '/orders'
  },
  PO: {
    id: 'PO',
    label: 'Zamówienie zakupu',
    labelEn: 'Purchase Order',
    prefix: 'PO',
    collection: 'purchaseOrders',
    numberField: 'number',
    nameField: 'supplier.name',
    color: '#45B7D1', // blue
    route: '/purchase-orders'
  },
  BATCH: {
    id: 'BATCH',
    label: 'Partia',
    labelEn: 'Batch',
    prefix: 'LOT',
    collection: 'inventoryBatches',
    numberField: 'batchNumber',
    nameField: 'itemName',
    color: '#F7DC6F', // yellow
    route: '/inventory'
  }
};

/**
 * Wyszukuje dokumenty po numerze (prefix)
 * @param {string} type - Typ dokumentu (MO, CO, PO, BATCH)
 * @param {string} searchTerm - Fraza wyszukiwania
 * @param {number} maxResults - Maksymalna liczba wyników
 * @returns {Promise<Array>} - Lista dokumentów
 */
export const searchDocumentsByNumber = async (type, searchTerm, maxResults = 10) => {
  try {
    const typeConfig = MENTION_TYPES[type];
    if (!typeConfig) {
      throw new Error(`Nieznany typ dokumentu: ${type}`);
    }

    const collectionRef = collection(db, typeConfig.collection);
    const searchTermUpper = searchTerm.toUpperCase();
    
    // Wyszukiwanie po numerze (range query)
    const q = query(
      collectionRef,
      orderBy(typeConfig.numberField),
      startAt(searchTermUpper),
      endAt(searchTermUpper + '\uf8ff'),
      limit(maxResults)
    );

    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: type,
        number: data[typeConfig.numberField] || doc.id,
        name: getNestedField(data, typeConfig.nameField) || '',
        data: data // Pełne dane do wyświetlenia dodatkowych info
      };
    });
  } catch (error) {
    console.error(`Błąd podczas wyszukiwania ${type}:`, error);
    return [];
  }
};

/**
 * Wyszukuje dokumenty wszystkich typów
 * @param {string} searchTerm - Fraza wyszukiwania
 * @param {number} maxResultsPerType - Maksymalna liczba wyników na typ
 * @returns {Promise<Array>} - Lista dokumentów ze wszystkich typów
 */
export const searchAllDocuments = async (searchTerm, maxResultsPerType = 5) => {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  try {
    const results = await Promise.all(
      Object.keys(MENTION_TYPES).map(type => 
        searchDocumentsByNumber(type, searchTerm, maxResultsPerType)
      )
    );

    // Spłaszcz wyniki
    return results.flat();
  } catch (error) {
    console.error('Błąd podczas wyszukiwania dokumentów:', error);
    return [];
  }
};

/**
 * Wyszukuje dokumenty konkretnego typu
 * @param {string} type - Typ dokumentu (MO, CO, PO, BATCH)
 * @param {string} searchTerm - Fraza wyszukiwania (może być pusta)
 * @param {number} maxResults - Maksymalna liczba wyników
 * @returns {Promise<Array>} - Lista dokumentów
 */
export const searchDocumentsByType = async (type, searchTerm = '', maxResults = 15) => {
  try {
    const typeConfig = MENTION_TYPES[type];
    if (!typeConfig) {
      throw new Error(`Nieznany typ dokumentu: ${type}`);
    }

    const collectionRef = collection(db, typeConfig.collection);
    
    let q;
    if (searchTerm && searchTerm.length >= 1) {
      // Wyszukiwanie po numerze
      const searchTermUpper = searchTerm.toUpperCase();
      q = query(
        collectionRef,
        orderBy(typeConfig.numberField),
        startAt(searchTermUpper),
        endAt(searchTermUpper + '\uf8ff'),
        limit(maxResults)
      );
    } else {
      // Pobierz ostatnie dokumenty
      q = query(
        collectionRef,
        orderBy('createdAt', 'desc'),
        limit(maxResults)
      );
    }

    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: type,
        number: data[typeConfig.numberField] || doc.id,
        name: getNestedField(data, typeConfig.nameField) || '',
        status: data.status,
        data: data
      };
    });
  } catch (error) {
    console.error(`Błąd podczas wyszukiwania ${type}:`, error);
    return [];
  }
};

/**
 * Parsuje tekst i wyciąga mentions
 * Format: @[TYP:NUMER](id) np. @[MO:MO00001](abc123)
 * @param {string} text - Tekst do sparsowania
 * @returns {Array} - Lista mentions
 */
export const parseMentions = (text) => {
  if (!text) return [];
  
  const mentionRegex = /@\[([A-Z]+):([^\]]+)\]\(([^)]+)\)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      fullMatch: match[0],
      type: match[1],
      number: match[2],
      id: match[3],
      index: match.index
    });
  }

  return mentions;
};

/**
 * Tworzy string mention do wstawienia w tekst
 * @param {string} type - Typ dokumentu
 * @param {string} number - Numer dokumentu
 * @param {string} id - ID dokumentu
 * @returns {string} - Sformatowany mention
 */
export const createMentionString = (type, number, id) => {
  return `@[${type}:${number}](${id})`;
};

/**
 * Pobiera URL do dokumentu na podstawie typu i ID
 * @param {string} type - Typ dokumentu
 * @param {string} id - ID dokumentu
 * @returns {string} - URL do dokumentu
 */
export const getMentionUrl = (type, id) => {
  const typeConfig = MENTION_TYPES[type];
  if (!typeConfig) return '/';
  
  switch (type) {
    case 'MO':
      return `/production/tasks/${id}`;
    case 'CO':
      return `/orders/${id}`;
    case 'PO':
      return `/purchase-orders/${id}`;
    case 'BATCH':
      return `/inventory/batch/${id}`;
    default:
      return '/';
  }
};

/**
 * Helper do pobierania zagnieżdżonych pól (np. "customer.name")
 */
const getNestedField = (obj, path) => {
  if (!path) return undefined;
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

export default {
  MENTION_TYPES,
  searchDocumentsByNumber,
  searchAllDocuments,
  searchDocumentsByType,
  parseMentions,
  createMentionString,
  getMentionUrl
};
