// src/services/ai/rag/KnowledgeBaseManager.js

import { db } from '../../../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

/**
 * KnowledgeBaseManager - RAG (Retrieval-Augmented Generation)
 * Zarządza bazą wiedzy i wyszukiwaniem kontekstu dla asystenta AI
 */
export class KnowledgeBaseManager {
  static KNOWLEDGE_BASE_KEY = 'ai_knowledge_base_v1';
  static INDEX_KEY = 'ai_knowledge_index_v1';
  static LAST_INDEX_TIME_KEY = 'ai_last_index_time';
  static REINDEX_INTERVAL = 24 * 60 * 60 * 1000; // 24h

  /**
   * Indeksuje wszystkie dokumenty systemowe
   */
  static async indexSystemKnowledge(forceReindex = false) {
    try {
      // Sprawdź czy indeksowanie jest potrzebne
      if (!forceReindex && !this.shouldReindex()) {
        console.log('[KnowledgeBaseManager] Indeks aktualny, pomijam');
        return { success: true, cached: true };
      }

      console.log('[KnowledgeBaseManager] Rozpoczynam indeksowanie...');
      const startTime = performance.now();
      
      const knowledgeBase = [];

      // 1. Indeksuj receptury
      const recipesKB = await this.indexRecipes();
      knowledgeBase.push(...recipesKB);
      console.log(`[KnowledgeBaseManager] Zaindeksowano ${recipesKB.length} receptur`);

      // 2. Indeksuj produkty magazynowe
      const inventoryKB = await this.indexInventory();
      knowledgeBase.push(...inventoryKB);
      console.log(`[KnowledgeBaseManager] Zaindeksowano ${inventoryKB.length} produktów`);

      // 3. Indeksuj dostawców
      const suppliersKB = await this.indexSuppliers();
      knowledgeBase.push(...suppliersKB);
      console.log(`[KnowledgeBaseManager] Zaindeksowano ${suppliersKB.length} dostawców`);

      // 4. Indeksuj FAQ (jeśli istnieje)
      const faqKB = await this.indexFAQ();
      knowledgeBase.push(...faqKB);
      console.log(`[KnowledgeBaseManager] Zaindeksowano ${faqKB.length} FAQ`);

      // Zapisz bazę wiedzy
      await this.saveKnowledgeBase(knowledgeBase);

      // Zaktualizuj czas ostatniego indeksowania
      localStorage.setItem(this.LAST_INDEX_TIME_KEY, Date.now().toString());

      const indexTime = performance.now() - startTime;
      console.log(`[KnowledgeBaseManager] ✅ Indeksowanie zakończone w ${indexTime.toFixed(2)}ms`);
      console.log(`[KnowledgeBaseManager] Łącznie zaindeksowano ${knowledgeBase.length} dokumentów`);

      return {
        success: true,
        documentsIndexed: knowledgeBase.length,
        indexTime: indexTime,
        categories: {
          recipes: recipesKB.length,
          inventory: inventoryKB.length,
          suppliers: suppliersKB.length,
          faq: faqKB.length
        }
      };

    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd podczas indeksowania:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Indeksuje receptury
   */
  static async indexRecipes() {
    try {
      const recipesRef = collection(db, 'recipes');
      const snapshot = await getDocs(recipesRef);
      
      const knowledgeBase = [];

      snapshot.forEach(doc => {
        const recipe = doc.data();
        const id = doc.id;

        // Oblicz wagę
        const totalWeight = this.calculateRecipeWeight(recipe);
        const ingredientsCount = recipe.ingredients?.length || 0;

        // Główny dokument receptury
        knowledgeBase.push({
          type: 'recipe',
          category: 'recipes',
          id: id,
          title: recipe.name,
          content: `Receptura ${recipe.name} zawiera ${ingredientsCount} składników o łącznej wadze ${totalWeight}g`,
          metadata: {
            name: recipe.name,
            product: recipe.product,
            totalWeight: totalWeight,
            ingredientsCount: ingredientsCount,
            ingredients: recipe.ingredients?.map(i => i.name) || []
          },
          searchable: [
            recipe.name?.toLowerCase(),
            recipe.product?.toLowerCase(),
            ...(recipe.ingredients?.map(i => i.name?.toLowerCase()) || [])
          ].filter(Boolean),
          timestamp: Date.now()
        });

        // Dokumenty dla każdego składnika
        recipe.ingredients?.forEach((ingredient, index) => {
          knowledgeBase.push({
            type: 'recipe_ingredient',
            category: 'recipes',
            id: `${id}_ing_${index}`,
            title: `${recipe.name} - ${ingredient.name}`,
            content: `W recepturze ${recipe.name} składnik ${ingredient.name} ma wagę ${ingredient.quantity}${ingredient.unit || 'g'}`,
            metadata: {
              recipeName: recipe.name,
              recipeId: id,
              ingredientName: ingredient.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit
            },
            searchable: [
              recipe.name?.toLowerCase(),
              ingredient.name?.toLowerCase()
            ].filter(Boolean),
            timestamp: Date.now()
          });
        });
      });

      return knowledgeBase;
    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd indeksowania receptur:', error);
      return [];
    }
  }

  /**
   * Indeksuje produkty magazynowe
   */
  static async indexInventory() {
    try {
      const inventoryRef = collection(db, 'inventory');
      const snapshot = await getDocs(inventoryRef);
      
      const knowledgeBase = [];

      snapshot.forEach(doc => {
        const item = doc.data();
        const id = doc.id;

        // Status magazynowy
        const stockStatus = this.getStockStatus(item);

        knowledgeBase.push({
          type: 'inventory',
          category: 'inventory',
          id: id,
          title: item.name,
          content: `Produkt ${item.name} ma aktualnie ${item.quantity || 0}${item.unit || ''} w magazynie (min: ${item.minQuantity || 0}, status: ${stockStatus})`,
          metadata: {
            name: item.name,
            quantity: item.quantity || 0,
            minQuantity: item.minQuantity || 0,
            unit: item.unit,
            stockStatus: stockStatus,
            category: item.category,
            supplier: item.supplier
          },
          searchable: [
            item.name?.toLowerCase(),
            item.category?.toLowerCase(),
            item.supplier?.toLowerCase()
          ].filter(Boolean),
          timestamp: Date.now()
        });
      });

      return knowledgeBase;
    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd indeksowania magazynu:', error);
      return [];
    }
  }

  /**
   * Indeksuje dostawców
   */
  static async indexSuppliers() {
    try {
      const suppliersRef = collection(db, 'suppliers');
      const snapshot = await getDocs(suppliersRef);
      
      const knowledgeBase = [];

      snapshot.forEach(doc => {
        const supplier = doc.data();
        const id = doc.id;

        knowledgeBase.push({
          type: 'supplier',
          category: 'suppliers',
          id: id,
          title: supplier.name,
          content: `Dostawca ${supplier.name} (${supplier.contactPerson || 'brak kontaktu'}), email: ${supplier.email || 'brak'}, tel: ${supplier.phone || 'brak'}`,
          metadata: {
            name: supplier.name,
            contactPerson: supplier.contactPerson,
            email: supplier.email,
            phone: supplier.phone,
            address: supplier.address,
            nip: supplier.nip
          },
          searchable: [
            supplier.name?.toLowerCase(),
            supplier.contactPerson?.toLowerCase(),
            supplier.email?.toLowerCase()
          ].filter(Boolean),
          timestamp: Date.now()
        });
      });

      return knowledgeBase;
    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd indeksowania dostawców:', error);
      return [];
    }
  }

  /**
   * Indeksuje FAQ (można rozszerzyć o własne pytania)
   */
  static async indexFAQ() {
    // Przykładowe FAQ - można pobrać z Firebase lub zdefiniować statycznie
    const faqs = [
      {
        question: 'Jak dodać nową recepturę?',
        answer: 'Aby dodać nową recepturę, przejdź do sekcji Receptury i kliknij przycisk "Dodaj recepturę". Wypełnij wymagane pola: nazwa, produkt końcowy, składniki z ilościami.',
        keywords: ['receptura', 'dodaj', 'nowa', 'utworzyć']
      },
      {
        question: 'Jak sprawdzić stan magazynowy?',
        answer: 'Stan magazynowy możesz sprawdzić w sekcji Magazyn. Produkty z niskim stanem są oznaczone kolorem czerwonym.',
        keywords: ['magazyn', 'stan', 'ilość', 'dostępność']
      },
      {
        question: 'Co oznacza status "w trakcie" dla zadania produkcyjnego?',
        answer: 'Status "w trakcie" oznacza, że zadanie produkcyjne jest obecnie realizowane. Możesz śledzić jego postęp w sekcji Produkcja.',
        keywords: ['produkcja', 'status', 'w trakcie', 'zadanie']
      }
    ];

    return faqs.map((faq, index) => ({
      type: 'faq',
      category: 'faq',
      id: `faq_${index}`,
      title: faq.question,
      content: `${faq.question} ${faq.answer}`,
      metadata: {
        question: faq.question,
        answer: faq.answer,
        keywords: faq.keywords
      },
      searchable: [
        faq.question.toLowerCase(),
        ...faq.keywords.map(k => k.toLowerCase()),
        faq.answer.toLowerCase()
      ],
      timestamp: Date.now()
    }));
  }

  /**
   * Wyszukuje najbardziej relevantne dokumenty dla zapytania
   */
  static async retrieveRelevantContext(query, options = {}) {
    try {
      const {
        topK = 5,
        category = null,
        minScore = 0.3
      } = options;

      const knowledgeBase = await this.loadKnowledgeBase();
      
      if (!knowledgeBase || knowledgeBase.length === 0) {
        console.warn('[KnowledgeBaseManager] Baza wiedzy pusta, indeksowanie...');
        await this.indexSystemKnowledge();
        return this.retrieveRelevantContext(query, options); // Retry
      }

      // Tokenizuj zapytanie
      const queryTokens = this.tokenize(query);

      // Oblicz similarity dla każdego dokumentu
      const scored = knowledgeBase
        .filter(doc => !category || doc.category === category)
        .map(doc => ({
          ...doc,
          score: this.calculateRelevanceScore(queryTokens, doc)
        }))
        .filter(doc => doc.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      console.log(`[KnowledgeBaseManager] Znaleziono ${scored.length} relevantnych dokumentów`);

      return scored;

    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd wyszukiwania:', error);
      return [];
    }
  }

  /**
   * Augmentuje zapytanie dodatkowym kontekstem z bazy wiedzy
   */
  static async augmentQueryWithContext(query, options = {}) {
    try {
      const relevantDocs = await this.retrieveRelevantContext(query, options);

      if (relevantDocs.length === 0) {
        return {
          originalQuery: query,
          augmentedQuery: query,
          additionalContext: '',
          relevantDocuments: [],
          confidence: 0
        };
      }

      // Formatuj kontekst
      const contextText = relevantDocs
        .map(doc => `• ${doc.content}`)
        .join('\n');

      // Opcjonalnie: dodaj kontekst bezpośrednio do zapytania
      const augmentedQuery = options.includeInQuery
        ? `${query}\n\nDodatkowy kontekst:\n${contextText}`
        : query;

      return {
        originalQuery: query,
        augmentedQuery: augmentedQuery,
        additionalContext: contextText,
        relevantDocuments: relevantDocs,
        confidence: relevantDocs[0]?.score || 0,
        documentsUsed: relevantDocs.length
      };

    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd augmentacji:', error);
      return {
        originalQuery: query,
        augmentedQuery: query,
        additionalContext: '',
        relevantDocuments: [],
        confidence: 0,
        error: error.message
      };
    }
  }

  // ==================== PRIVATE METHODS ====================

  static calculateRecipeWeight(recipe) {
    if (!recipe.ingredients) return 0;
    
    return recipe.ingredients.reduce((sum, ingredient) => {
      let quantity = parseFloat(ingredient.quantity) || 0;
      
      // Konwertuj jednostki na gramy
      if (ingredient.unit === 'kg') {
        quantity *= 1000;
      }
      
      return sum + quantity;
    }, 0);
  }

  static getStockStatus(item) {
    const quantity = item.quantity || 0;
    const minQuantity = item.minQuantity || 0;

    if (quantity === 0) return 'brak';
    if (quantity <= minQuantity) return 'niski';
    if (quantity > minQuantity * 10) return 'wysoki';
    return 'normalny';
  }

  static tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\sąćęłńóśźż]/g, '')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  static calculateRelevanceScore(queryTokens, document) {
    let score = 0;

    // 1. Dopasowanie do searchable (60% wagi)
    if (document.searchable) {
      const searchableText = document.searchable.join(' ');
      const matchedTokens = queryTokens.filter(token => 
        searchableText.includes(token)
      );
      score += (matchedTokens.length / queryTokens.length) * 0.6;
    }

    // 2. Dopasowanie do title (30% wagi)
    if (document.title) {
      const titleTokens = this.tokenize(document.title);
      const matchedTokens = queryTokens.filter(token => 
        titleTokens.includes(token)
      );
      score += (matchedTokens.length / queryTokens.length) * 0.3;
    }

    // 3. Dopasowanie do content (10% wagi)
    if (document.content) {
      const contentTokens = this.tokenize(document.content);
      const matchedTokens = queryTokens.filter(token => 
        contentTokens.includes(token)
      );
      score += (matchedTokens.length / queryTokens.length) * 0.1;
    }

    return score;
  }

  static shouldReindex() {
    try {
      const lastIndexTime = localStorage.getItem(this.LAST_INDEX_TIME_KEY);
      if (!lastIndexTime) return true;

      const timeSinceIndex = Date.now() - parseInt(lastIndexTime);
      return timeSinceIndex > this.REINDEX_INTERVAL;
    } catch (error) {
      return true;
    }
  }

  static async saveKnowledgeBase(knowledgeBase) {
    try {
      // Zapisz w localStorage (dla szybkiego dostępu)
      localStorage.setItem(
        this.KNOWLEDGE_BASE_KEY,
        JSON.stringify(knowledgeBase)
      );

      console.log(`[KnowledgeBaseManager] Zapisano ${knowledgeBase.length} dokumentów`);
    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd zapisu bazy wiedzy:', error);
      
      if (error.name === 'QuotaExceededError') {
        // Jeśli przekroczono limit, zapisz tylko najważniejsze dokumenty
        console.warn('[KnowledgeBaseManager] Quota exceeded, zapisuję skróconą wersję');
        const reduced = knowledgeBase.slice(0, Math.floor(knowledgeBase.length / 2));
        localStorage.setItem(this.KNOWLEDGE_BASE_KEY, JSON.stringify(reduced));
      }
    }
  }

  static async loadKnowledgeBase() {
    try {
      const data = localStorage.getItem(this.KNOWLEDGE_BASE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd ładowania bazy wiedzy:', error);
      return [];
    }
  }

  /**
   * Czyści bazę wiedzy
   */
  static clear() {
    try {
      localStorage.removeItem(this.KNOWLEDGE_BASE_KEY);
      localStorage.removeItem(this.LAST_INDEX_TIME_KEY);
      console.log('[KnowledgeBaseManager] Baza wiedzy wyczyszczona');
    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd czyszczenia bazy wiedzy:', error);
    }
  }

  /**
   * Pobiera statystyki bazy wiedzy
   */
  static getStats() {
    try {
      const knowledgeBase = JSON.parse(
        localStorage.getItem(this.KNOWLEDGE_BASE_KEY) || '[]'
      );
      
      const lastIndexTime = localStorage.getItem(this.LAST_INDEX_TIME_KEY);
      
      const categoryCounts = {};
      const typeCounts = {};
      
      knowledgeBase.forEach(doc => {
        categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1;
        typeCounts[doc.type] = (typeCounts[doc.type] || 0) + 1;
      });

      return {
        totalDocuments: knowledgeBase.length,
        categories: categoryCounts,
        types: typeCounts,
        lastIndexed: lastIndexTime ? new Date(parseInt(lastIndexTime)).toLocaleString('pl-PL') : 'Nigdy',
        needsReindex: this.shouldReindex()
      };
    } catch (error) {
      console.error('[KnowledgeBaseManager] Błąd pobierania statystyk:', error);
      return {
        totalDocuments: 0,
        categories: {},
        types: {},
        lastIndexed: 'Nigdy',
        needsReindex: true
      };
    }
  }
}



