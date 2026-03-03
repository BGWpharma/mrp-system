// src/services/operationalCostService.js
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query,
  where,
  orderBy,
  Timestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Kolekcja kosztów operacyjnych w Firestore
 * Struktura: jeden dokument per miesiąc (ID = YYYY-MM)
 */
const COLLECTION_NAME = 'operationalCosts';

/**
 * Kategorie kosztów operacyjnych
 */
export const OPERATIONAL_COST_CATEGORIES = [
  { value: 'rent', label: 'Czynsz / Najem', icon: '🏢' },
  { value: 'utilities', label: 'Media (prąd, woda, gaz)', icon: '💡' },
  { value: 'salaries', label: 'Wynagrodzenia', icon: '👥' },
  { value: 'marketing', label: 'Marketing / Reklama', icon: '📢' },
  { value: 'subscriptions', label: 'Subskrypcje / Licencje', icon: '📋' },
  { value: 'insurance', label: 'Ubezpieczenia', icon: '🛡️' },
  { value: 'maintenance', label: 'Konserwacja / Naprawy', icon: '🔧' },
  { value: 'transport', label: 'Transport / Paliwo', icon: '🚗' },
  { value: 'office', label: 'Materiały biurowe', icon: '📎' },
  { value: 'other', label: 'Inne', icon: '📌' }
];

/**
 * Generuje klucz miesiąca w formacie YYYY-MM
 * @param {Date} date - Data
 * @returns {string} - Klucz miesiąca (np. "2026-01")
 */
export const getMonthKey = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Parsuje klucz miesiąca na obiekt z rokiem i miesiącem
 * @param {string} monthKey - Klucz miesiąca (np. "2026-01")
 * @returns {Object} - { year: number, month: number }
 */
export const parseMonthKey = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, month };
};

/**
 * Generuje listę kluczy miesięcy w zakresie dat
 * @param {Date} dateFrom - Data początkowa
 * @param {Date} dateTo - Data końcowa
 * @returns {Array<string>} - Lista kluczy miesięcy
 */
export const getMonthKeysInRange = (dateFrom, dateTo) => {
  const keys = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  
  // Ustaw na pierwszy dzień miesiąca
  start.setDate(1);
  end.setDate(1);
  
  while (start <= end) {
    keys.push(getMonthKey(start));
    start.setMonth(start.getMonth() + 1);
  }
  
  return keys;
};

/**
 * Pobiera koszty operacyjne dla konkretnego miesiąca
 * @param {string} monthKey - Klucz miesiąca (np. "2026-01")
 * @returns {Promise<Object|null>} - Dokument kosztów lub null
 */
export const getOperationalCostsByMonth = async (monthKey) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, monthKey);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Błąd pobierania kosztów dla ${monthKey}:`, error);
    throw error;
  }
};

/**
 * Pobiera koszty operacyjne w zakresie dat
 * @param {Date} dateFrom - Data początkowa
 * @param {Date} dateTo - Data końcowa
 * @returns {Promise<Array>} - Lista dokumentów kosztów
 */
export const getOperationalCostsInRange = async (dateFrom, dateTo) => {
  try {
    const monthKeys = getMonthKeysInRange(dateFrom, dateTo);
    const results = [];
    
    // Pobierz dokumenty dla każdego miesiąca
    for (const monthKey of monthKeys) {
      const monthData = await getOperationalCostsByMonth(monthKey);
      if (monthData) {
        results.push(monthData);
      } else {
        // Zwróć pusty obiekt dla miesiąca bez kosztów
        const { year, month } = parseMonthKey(monthKey);
        results.push({
          id: monthKey,
          year,
          month,
          costs: [],
          totalAmount: 0,
          totalPaid: 0
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ Błąd pobierania kosztów w zakresie dat:', error);
    throw error;
  }
};

/**
 * Tworzy lub aktualizuje dokument miesiąca z nowym kosztem
 * @param {string} monthKey - Klucz miesiąca
 * @param {Object} cost - Dane kosztu
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Utworzony koszt
 */
export const addOperationalCost = async (monthKey, cost, userId) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, monthKey);
    const docSnap = await getDoc(docRef);
    
    const newCost = {
      id: uuidv4(),
      name: cost.name,
      amount: parseFloat(cost.amount) || 0,
      category: cost.category || 'other',
      description: cost.description || '',
      isPaid: cost.isPaid || false,
      paidDate: cost.isPaid && cost.paidDate ? Timestamp.fromDate(new Date(cost.paidDate)) : null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const { year, month } = parseMonthKey(monthKey);
    
    if (docSnap.exists()) {
      // Dokument istnieje - dodaj koszt do tablicy
      const existingData = docSnap.data();
      const existingCosts = existingData.costs || [];
      const updatedCosts = [...existingCosts, newCost];
      
      const totalAmount = updatedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
      const totalPaid = updatedCosts
        .filter(c => c.isPaid)
        .reduce((sum, c) => sum + (c.amount || 0), 0);
      
      await updateDoc(docRef, {
        costs: updatedCosts,
        totalAmount,
        totalPaid,
        updatedAt: Timestamp.now()
      });
    } else {
      // Nowy dokument
      await setDoc(docRef, {
        year,
        month,
        costs: [newCost],
        totalAmount: newCost.amount,
        totalPaid: newCost.isPaid ? newCost.amount : 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: userId
      });
    }
    
    console.log(`✅ Dodano koszt operacyjny dla ${monthKey}:`, newCost.name);
    return newCost;
  } catch (error) {
    console.error(`❌ Błąd dodawania kosztu dla ${monthKey}:`, error);
    throw error;
  }
};

/**
 * Aktualizuje istniejący koszt operacyjny
 * @param {string} monthKey - Klucz miesiąca
 * @param {string} costId - ID kosztu
 * @param {Object} updates - Dane do aktualizacji
 * @returns {Promise<Object>} - Zaktualizowany koszt
 */
export const updateOperationalCost = async (monthKey, costId, updates) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, monthKey);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error(`Dokument kosztów dla ${monthKey} nie istnieje`);
    }
    
    const data = docSnap.data();
    const costs = data.costs || [];
    const costIndex = costs.findIndex(c => c.id === costId);
    
    if (costIndex === -1) {
      throw new Error(`Koszt o ID ${costId} nie został znaleziony`);
    }
    
    // Zaktualizuj koszt
    const updatedCost = {
      ...costs[costIndex],
      name: updates.name !== undefined ? updates.name : costs[costIndex].name,
      amount: updates.amount !== undefined ? parseFloat(updates.amount) : costs[costIndex].amount,
      category: updates.category !== undefined ? updates.category : costs[costIndex].category,
      description: updates.description !== undefined ? updates.description : costs[costIndex].description,
      isPaid: updates.isPaid !== undefined ? updates.isPaid : costs[costIndex].isPaid,
      paidDate: updates.isPaid && updates.paidDate 
        ? Timestamp.fromDate(new Date(updates.paidDate)) 
        : (updates.isPaid === false ? null : costs[costIndex].paidDate),
      updatedAt: Timestamp.now()
    };
    
    costs[costIndex] = updatedCost;
    
    // Przelicz sumy
    const totalAmount = costs.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalPaid = costs
      .filter(c => c.isPaid)
      .reduce((sum, c) => sum + (c.amount || 0), 0);
    
    await updateDoc(docRef, {
      costs,
      totalAmount,
      totalPaid,
      updatedAt: Timestamp.now()
    });
    
    console.log(`✅ Zaktualizowano koszt operacyjny ${costId} dla ${monthKey}`);
    return updatedCost;
  } catch (error) {
    console.error(`❌ Błąd aktualizacji kosztu ${costId} dla ${monthKey}:`, error);
    throw error;
  }
};

/**
 * Usuwa koszt operacyjny
 * @param {string} monthKey - Klucz miesiąca
 * @param {string} costId - ID kosztu
 * @returns {Promise<void>}
 */
export const deleteOperationalCost = async (monthKey, costId) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, monthKey);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error(`Dokument kosztów dla ${monthKey} nie istnieje`);
    }
    
    const data = docSnap.data();
    const costs = data.costs || [];
    const updatedCosts = costs.filter(c => c.id !== costId);
    
    // Przelicz sumy
    const totalAmount = updatedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalPaid = updatedCosts
      .filter(c => c.isPaid)
      .reduce((sum, c) => sum + (c.amount || 0), 0);
    
    await updateDoc(docRef, {
      costs: updatedCosts,
      totalAmount,
      totalPaid,
      updatedAt: Timestamp.now()
    });
    
    console.log(`✅ Usunięto koszt operacyjny ${costId} dla ${monthKey}`);
  } catch (error) {
    console.error(`❌ Błąd usuwania kosztu ${costId} dla ${monthKey}:`, error);
    throw error;
  }
};

/**
 * Generuje timeline kosztów operacyjnych dla wykresu cashflow
 * @param {Date} dateFrom - Data początkowa
 * @param {Date} dateTo - Data końcowa
 * @returns {Promise<Object>} - Dane timeline
 */
export const generateOperationalCostsTimeline = async (dateFrom, dateTo) => {
  try {
    const monthsData = await getOperationalCostsInRange(dateFrom, dateTo);
    
    const timeline = [];
    let totalValue = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    
    monthsData.forEach(monthData => {
      if (monthData.costs && monthData.costs.length > 0) {
        monthData.costs.forEach(cost => {
          // Użyj ostatniego dnia miesiąca jako daty dla timeline
          const { year, month } = parseMonthKey(monthData.id);
          const date = new Date(year, month - 1, 15); // Środek miesiąca
          
          timeline.push({
            date,
            monthKey: monthData.id,
            costId: cost.id,
            name: cost.name,
            amount: cost.amount,
            category: cost.category,
            description: cost.description,
            isPaid: cost.isPaid,
            paidDate: cost.paidDate?.toDate?.() || cost.paidDate,
            type: 'operational_cost'
          });
          
          totalValue += cost.amount || 0;
          if (cost.isPaid) {
            totalPaid += cost.amount || 0;
          } else {
            totalRemaining += cost.amount || 0;
          }
        });
      }
    });
    
    // Sortuj chronologicznie
    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return {
      timeline,
      totalValue,
      totalPaid,
      totalRemaining,
      monthsCount: monthsData.filter(m => m.costs && m.costs.length > 0).length
    };
  } catch (error) {
    console.error('❌ Błąd generowania timeline kosztów operacyjnych:', error);
    return {
      timeline: [],
      totalValue: 0,
      totalPaid: 0,
      totalRemaining: 0,
      monthsCount: 0
    };
  }
};

/**
 * Pobiera etykietę kategorii
 * @param {string} categoryValue - Wartość kategorii
 * @returns {Object} - { label, icon }
 */
export const getCategoryLabel = (categoryValue) => {
  const category = OPERATIONAL_COST_CATEGORIES.find(c => c.value === categoryValue);
  return category || { label: categoryValue, icon: '📌' };
};

/**
 * Formatuje nazwę miesiąca
 * @param {string} monthKey - Klucz miesiąca (np. "2026-01")
 * @returns {string} - Nazwa miesiąca (np. "Styczeń 2026")
 */
export const formatMonthName = (monthKey) => {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
};
