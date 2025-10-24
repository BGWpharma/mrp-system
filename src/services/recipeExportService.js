// src/services/recipeExportService.js

import { getAllRecipes } from './recipeService';
import { getAllInventoryItems, getBatchesForMultipleItems, getSupplierPrices } from './inventory';
import { getPurchaseOrderById } from './purchaseOrderService';
import { getSuppliersByIds } from './supplierService';

/**
 * Eksportuje receptury do formatu CSV
 * 
 * @param {Object} options - Opcje eksportu
 * @param {Array} options.customers - Lista klientów
 * @param {Array} options.workstations - Lista stanowisk produkcyjnych
 * @param {string} options.selectedCustomerId - ID wybranego klienta (opcjonalnie)
 * @param {boolean} options.notesFilter - Filtr notatek (opcjonalnie)
 * @param {string} options.searchTerm - Termin wyszukiwania (opcjonalnie)
 * @param {Function} options.onError - Callback dla błędów
 * @param {Function} options.onSuccess - Callback dla sukcesu
 * @param {Function} options.t - Funkcja tłumaczenia
 */
export const exportRecipesToCSV = async ({
  customers,
  workstations,
  selectedCustomerId,
  notesFilter,
  searchTerm,
  onError,
  onSuccess,
  t
}) => {
  try {
    // Pobierz wszystkie receptury dla eksportu bezpośrednio z Firestore (pełne dane)
    let allRecipes = [];
    
    // Zawsze używaj bezpośredniego pobierania z Firestore dla eksportu, aby mieć pełne dane
    try {
      // Pobierz wszystkie receptury bezpośrednio z getAllRecipes
      const allRecipesFromFirestore = await getAllRecipes();
      
      // Zastosuj filtry jeśli są aktywne
      allRecipes = allRecipesFromFirestore;
      
      // Filtruj po kliencie jeśli wybrano
      if (selectedCustomerId) {
        allRecipes = allRecipes.filter(recipe => recipe.customerId === selectedCustomerId);
      }
      
      // Filtruj po notatkach jeśli wybrano
      if (notesFilter !== null) {
        allRecipes = allRecipes.filter(recipe => {
          const hasRecipeNotes = recipe.notes && recipe.notes.trim() !== '';
          return notesFilter ? hasRecipeNotes : !hasRecipeNotes;
        });
      }
      
      // Filtruj po wyszukiwanym terminie jeśli jest
      if (searchTerm && searchTerm.trim() !== '') {
        const searchTermLower = searchTerm.toLowerCase().trim();
        allRecipes = allRecipes.filter(recipe => 
          (recipe.name && recipe.name.toLowerCase().includes(searchTermLower)) ||
          (recipe.description && recipe.description.toLowerCase().includes(searchTermLower))
        );
      }
    } catch (error) {
      console.error('Błąd podczas pobierania receptur z Firestore:', error);
      onError('Nie udało się pobrać receptur do eksportu');
      return;
    }

    if (allRecipes.length === 0) {
      onError('Brak receptur do eksportu');
      return;
    }

    // Pobierz wszystkie pozycje magazynowe do znalezienia jednostek składników
    let allInventoryItems = [];
    try {
      console.log('📦 Pobieranie pozycji magazynowych dla jednostek składników...');
      allInventoryItems = await getAllInventoryItems();
      console.log('✅ Pobrano', allInventoryItems.length, 'pozycji magazynowych');
    } catch (error) {
      console.warn('⚠️ Nie udało się pobrać pozycji magazynowych, używam danych z receptur:', error);
    }

    // Przygotuj dane dla CSV zgodnie z wymaganymi nagłówkami
    const csvData = allRecipes.map((recipe, index) => {
      // Znajdź klienta
      const customer = customers.find(c => c.id === recipe.customerId);
      
      // Znajdź stanowisko produkcyjne
      const workstation = workstations.find(w => w.id === recipe.defaultWorkstationId);
      
      // Sprawdź różne możliwe pola dla czasu produkcji
      let timePerPiece = 0;
      if (recipe.productionTimePerUnit) {
        timePerPiece = parseFloat(recipe.productionTimePerUnit);
      } else if (recipe.prepTime) {
        timePerPiece = parseFloat(recipe.prepTime);
      } else if (recipe.preparationTime) {
        timePerPiece = parseFloat(recipe.preparationTime);
      }
      
      // Przygotuj listę składników z jednostkami z pozycji magazynowych
      const ingredients = recipe.ingredients || [];
      
      const componentsListing = ingredients
        .map(ing => {
          // Spróbuj znaleźć pozycję magazynową po ID lub nazwie
          const inventoryItem = allInventoryItems.find(item => 
            item.id === ing.itemId || 
            (item.name && ing.name && item.name.toLowerCase().trim() === ing.name.toLowerCase().trim())
          );
          
          // Użyj nazwy z inventory jeśli jest dostępna, w przeciwnym razie z receptury
          return inventoryItem?.name || ing.name || '';
        })
        .filter(name => name.trim() !== '')
        .join('; ');
      
      const componentsAmount = ingredients
        .map((ing, idx) => {
          // Spróbuj znaleźć pozycję magazynową po ID lub nazwie
          const inventoryItem = allInventoryItems.find(item => 
            item.id === ing.itemId || 
            (item.name && ing.name && item.name.toLowerCase().trim() === ing.name.toLowerCase().trim())
          );
          
          // Użyj jednostki z inventory jeśli jest dostępna, w przeciwnym razie z receptury
          const unit = inventoryItem?.unit || ing.unit || '';
          const quantity = ing.quantity || '';
          
          // Debug log dla pierwszego składnika pierwszej receptury
          if (index === 0 && idx === 0) {
            console.log(`📊 Przykład składnika #${idx + 1} (receptura "${recipe.name}"):`, {
              nazwa: ing.name,
              itemId: ing.itemId,
              znalezionoWInventory: !!inventoryItem,
              jednostkaZInventory: inventoryItem?.unit,
              jednostkaZReceptury: ing.unit,
              użytaJednostka: unit,
              ilość: quantity
            });
          }
          
          return `${quantity} ${unit}`.trim();
        })
        .filter(amount => amount !== '')
        .join('; ');
      
      // Przygotuj listę składników odżywczych (mikro/makro)
      const micronutrients = recipe.micronutrients || [];
      const microMacroListing = micronutrients
        .map(micro => micro.name || micro.code || '')
        .filter(name => name.trim() !== '')
        .join('; ');
      
      // Połącz amount i unit w jedną kolumnę (np. "100 mg")
      const microMacroAmount = micronutrients
        .map(micro => {
          const quantity = micro.quantity || '';
          const unit = micro.unit || '';
          return `${quantity} ${unit}`.trim();
        })
        .filter(amount => amount !== '')
        .join('; ');
      
      const microMacroType = micronutrients
        .map(micro => micro.category || '')
        .filter(type => type.trim() !== '')
        .join('; ');
      
      // Pobierz certyfikacje (z domyślnymi wartościami false)
      const certifications = recipe.certifications || {
        eco: false,
        halal: false,
        kosher: false,
        vegan: false,
        vege: false
      };
      
      return {
        'SKU': recipe.name || '',
        'description': recipe.description || '',
        'Client': customer ? customer.name : '',
        'Workstation': workstation ? workstation.name : '',
        'cost/piece': recipe.processingCostPerUnit ? recipe.processingCostPerUnit.toFixed(2) : '0.00',
        'time/piece': timePerPiece.toFixed(2),
        'Components listing': componentsListing,
        'Components amount': componentsAmount,
        'Micro/macro elements listing': microMacroListing,
        'Micro/macro amount': microMacroAmount,
        'Micro/macro type': microMacroType,
        '(Bool) EKO': certifications.eco ? 'TRUE' : 'FALSE',
        '(Bool) HALAL': certifications.halal ? 'TRUE' : 'FALSE',
        '(Bool) KOSHER': certifications.kosher ? 'TRUE' : 'FALSE',
        '(Bool) VEGAN': certifications.vegan ? 'TRUE' : 'FALSE',
        '(Bool) VEGETERIAN': certifications.vege ? 'TRUE' : 'FALSE',
        'notes': recipe.notes || ''
      };
    });

    console.log('✅ Przygotowano', csvData.length, 'receptur do eksportu CSV');

    // Utwórz nagłówki CSV
    const headers = [
      'SKU',
      'description',
      'Client',
      'Workstation',
      'cost/piece',
      'time/piece',
      'Components listing',
      'Components amount',
      'Micro/macro elements listing',
      'Micro/macro amount',
      'Micro/macro type',
      '(Bool) EKO',
      '(Bool) HALAL',
      '(Bool) KOSHER',
      '(Bool) VEGAN',
      '(Bool) VEGETERIAN',
      'notes'
    ];
    
    // Utwórz zawartość CSV
    const csvContent = [
      headers.map(header => `"${header}"`).join(','),
      ...csvData.map(row => 
        headers.map(header => {
          // Escape podwójne cudzysłowy w wartościach
          const value = String(row[header] || '').replace(/"/g, '""');
          return `"${value}"`;
        }).join(',')
      )
    ].join('\n');

    // Utwórz blob i pobierz plik
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Nazwa pliku z aktualną datą
    const currentDate = new Date().toISOString().slice(0, 10);
    const filename = `receptury_${currentDate}.csv`;
    
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onSuccess(t('recipes.list.exportSuccess', { count: allRecipes.length }));
  } catch (error) {
    console.error('Błąd podczas eksportu CSV:', error);
    onError(t('recipes.list.exportError'));
  }
};

/**
 * Eksportuje receptury ze szczegółowymi informacjami o składnikach i dostawcach
 * 
 * @param {Object} options - Opcje eksportu
 * @param {Array} options.customers - Lista klientów
 * @param {Object} options.exportFilters - Filtry eksportu (customerId, notesFilter, searchTerm)
 * @param {Function} options.onInfo - Callback dla informacji
 * @param {Function} options.onError - Callback dla błędów
 * @param {Function} options.onSuccess - Callback dla sukcesu
 */
export const exportRecipesWithSuppliers = async ({
  customers,
  exportFilters,
  onInfo,
  onError,
  onSuccess
}) => {
  try {
    onInfo('Przygotowywanie eksportu receptur z dostawcami...');

    // Pobierz wszystkie receptury (z zastosowanymi filtrami z dialogu)
    let allRecipes = [];
    
    try {
      const allRecipesFromFirestore = await getAllRecipes();
      allRecipes = allRecipesFromFirestore;
      
      // Zastosuj filtry z dialogu eksportu
      if (exportFilters.customerId) {
        allRecipes = allRecipes.filter(recipe => recipe.customerId === exportFilters.customerId);
      }
      
      if (exportFilters.notesFilter !== null) {
        allRecipes = allRecipes.filter(recipe => {
          const hasRecipeNotes = recipe.notes && recipe.notes.trim() !== '';
          return exportFilters.notesFilter ? hasRecipeNotes : !hasRecipeNotes;
        });
      }
      
      if (exportFilters.searchTerm && exportFilters.searchTerm.trim() !== '') {
        const searchTermLower = exportFilters.searchTerm.toLowerCase().trim();
        allRecipes = allRecipes.filter(recipe => 
          (recipe.name && recipe.name.toLowerCase().includes(searchTermLower)) ||
          (recipe.description && recipe.description.toLowerCase().includes(searchTermLower))
        );
      }
    } catch (error) {
      console.error('Błąd podczas pobierania receptur:', error);
      onError('Nie udało się pobrać receptur do eksportu');
      return;
    }

    if (allRecipes.length === 0) {
      onError('Brak receptur do eksportu');
      return;
    }

    onInfo('Pobieranie danych o partiach i zamówieniach zakupu...');

    // KROK 1: Zbierz wszystkie unikalne ID składników ze wszystkich receptur
    const allIngredientIds = new Set();
    allRecipes.forEach(recipe => {
      (recipe.ingredients || []).forEach(ingredient => {
        if (ingredient.id) {
          allIngredientIds.add(ingredient.id);
        }
      });
    });

    console.log(`📦 Znaleziono ${allIngredientIds.size} unikalnych składników w recepturach`);

    // KROK 2: Pobierz partie dla wszystkich składników (w partiach po 100)
    let batchesMap = {};
    if (allIngredientIds.size > 0) {
      try {
        const ingredientIdsArray = Array.from(allIngredientIds);
        const batchSize = 100; // Limit walidacji
        
        // Podziel na partie po 100 elementów
        for (let i = 0; i < ingredientIdsArray.length; i += batchSize) {
          const batch = ingredientIdsArray.slice(i, i + batchSize);
          
          onInfo(`Pobieranie partii dla składników ${i + 1}-${Math.min(i + batchSize, ingredientIdsArray.length)}/${ingredientIdsArray.length}...`);
          
          const batchResults = await getBatchesForMultipleItems(batch);
          
          // Scal wyniki
          batchesMap = { ...batchesMap, ...batchResults };
        }
        
        const totalBatches = Object.values(batchesMap).reduce((sum, batches) => sum + batches.length, 0);
        console.log(`📦 Pobrano ${totalBatches} partii dla ${allIngredientIds.size} składników`);
      } catch (error) {
        console.error('Błąd podczas pobierania partii:', error);
        onError('Nie udało się pobrać partii magazynowych');
      }
    }

    // KROK 3: Zbierz wszystkie unikalne ID zamówień zakupu z partii
    const allPOIds = new Set();
    Object.values(batchesMap).forEach(batches => {
      batches.forEach(batch => {
        const poId = batch.purchaseOrderDetails?.id || batch.sourceDetails?.orderId;
        if (poId) {
          allPOIds.add(poId);
        }
      });
    });

    console.log(`📑 Znaleziono ${allPOIds.size} unikalnych zamówień zakupu`);

    // KROK 4: Pobierz wszystkie Purchase Orders
    const purchaseOrdersMap = {};
    if (allPOIds.size > 0) {
      onInfo(`Pobieranie ${allPOIds.size} zamówień zakupu...`);
      let loadedPOs = 0;
      
      for (const poId of allPOIds) {
        try {
          const po = await getPurchaseOrderById(poId);
          if (po) {
            purchaseOrdersMap[poId] = po;
            loadedPOs++;
            
            // Informuj o postępie co 10 PO
            if (loadedPOs % 10 === 0) {
              onInfo(`Pobrano ${loadedPOs}/${allPOIds.size} zamówień zakupu...`);
            }
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania PO ${poId}:`, error);
        }
      }
      
      console.log(`📑 Pobrano ${loadedPOs} zamówień zakupu`);
    }

    // KROK 4A: Pobierz ceny dostawców z pozycji magazynowych
    const supplierPricesMap = {};
    const allSupplierIds = new Set();
    
    if (allIngredientIds.size > 0) {
      onInfo('Pobieranie cen dostawców z pozycji magazynowych...');
      let processedItems = 0;
      
      for (const itemId of allIngredientIds) {
        try {
          const supplierPrices = await getSupplierPrices(itemId, { includeInactive: false });
          if (supplierPrices && supplierPrices.length > 0) {
            supplierPricesMap[itemId] = supplierPrices;
            
            // Zbierz unikalne ID dostawców
            supplierPrices.forEach(sp => {
              if (sp.supplierId) {
                allSupplierIds.add(sp.supplierId);
              }
            });
          }
          
          processedItems++;
          if (processedItems % 20 === 0) {
            onInfo(`Pobrano ceny dla ${processedItems}/${allIngredientIds.size} składników...`);
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania cen dla składnika ${itemId}:`, error);
        }
      }
      
      console.log(`💰 Pobrano ceny dostawców dla ${Object.keys(supplierPricesMap).length} składników`);
    }

    // KROK 4B: Pobierz dane wszystkich dostawców
    const suppliersMap = {};
    if (allSupplierIds.size > 0) {
      onInfo(`Pobieranie danych ${allSupplierIds.size} dostawców...`);
      try {
        const suppliers = await getSuppliersByIds(Array.from(allSupplierIds));
        suppliers.forEach(supplier => {
          suppliersMap[supplier.id] = supplier;
        });
        console.log(`👥 Pobrano dane ${suppliers.length} dostawców`);
      } catch (error) {
        console.error('Błąd podczas pobierania dostawców:', error);
      }
    }

    onInfo('Generowanie eksportu...');

    // KROK 5: Przygotuj dane CSV z dostawcami dla składników
    const csvRows = [];
    let processedRecipes = 0;

    for (const recipe of allRecipes) {
      processedRecipes++;
      
      // Znajdź klienta
      const customer = customers.find(c => c.id === recipe.customerId);
      
      // Pobierz wszystkie składniki receptury
      const ingredients = recipe.ingredients || [];
      
      if (ingredients.length === 0) {
        // Przygotuj listę mikroelementów dla receptury bez składników
        const micronutrientsList = (recipe.micronutrients || [])
          .map(micro => {
            const parts = [];
            if (micro.code) parts.push(micro.code);
            if (micro.name) parts.push(micro.name);
            if (micro.quantity) parts.push(`${micro.quantity}${micro.unit || ''}`);
            return parts.join(' - ');
          })
          .join('; ');
        
        // Dodaj wiersz z mikroelementami jeśli receptura ma mikroelementy
        if (micronutrientsList) {
          csvRows.push({
            'Receptura (SKU)': recipe.name || '',
            'Opis receptury': recipe.description || '',
            'Klient': customer ? customer.name : '',
            'Składnik': '--- MIKROELEMENTY ---',
            'Ilość składnika': '',
            'Jednostka': '',
            'Dostawcy (z pozycji mag.)': '',
            'Dostawcy (z PO)': '',
            'Mikroelementy': micronutrientsList
          });
        } else {
          // Jeśli receptura nie ma składników ani mikroelementów, dodaj jeden wiersz informacyjny
          csvRows.push({
            'Receptura (SKU)': recipe.name || '',
            'Opis receptury': recipe.description || '',
            'Klient': customer ? customer.name : '',
            'Składnik': 'Brak składników',
            'Ilość składnika': '',
            'Jednostka': '',
            'Dostawcy (z pozycji mag.)': '-',
            'Dostawcy (z PO)': '-',
            'Mikroelementy': '-'
          });
        }
        
        // Dodaj pusty wiersz po recepturze
        csvRows.push({
          'Receptura (SKU)': '',
          'Opis receptury': '',
          'Klient': '',
          'Składnik': '',
          'Ilość składnika': '',
          'Jednostka': '',
          'Dostawcy (z pozycji mag.)': '',
          'Dostawcy (z PO)': '',
          'Mikroelementy': ''
        });
        
        continue;
      }

      // Przygotuj listę mikroelementów dla receptury
      const micronutrientsList = (recipe.micronutrients || [])
        .map(micro => {
          const parts = [];
          if (micro.code) parts.push(micro.code);
          if (micro.name) parts.push(micro.name);
          if (micro.quantity) parts.push(`${micro.quantity}${micro.unit || ''}`);
          return parts.join(' - ');
        })
        .join('; ');
      
      // Dodaj wiersz z mikroelementami dla receptury
      if (micronutrientsList) {
        csvRows.push({
          'Receptura (SKU)': recipe.name || '',
          'Opis receptury': recipe.description || '',
          'Klient': customer ? customer.name : '',
          'Składnik': '--- MIKROELEMENTY ---',
          'Ilość składnika': '',
          'Jednostka': '',
          'Dostawcy (z pozycji mag.)': '',
          'Dostawcy (z PO)': '',
          'Mikroelementy': micronutrientsList
        });
      }
      
      // Dla każdego składnika znajdź dostawców
      for (const ingredient of ingredients) {
        let suppliersFromPOText = '-';
        let suppliersFromInventoryText = '-';
        
        // A) Dostawcy z zamówień zakupu (PO)
        if (ingredient.id && batchesMap[ingredient.id]) {
          const ingredientBatches = batchesMap[ingredient.id];
          
          // Zbierz informacje o dostawcach z PO dla tego składnika
          const supplierInfos = [];
          const seenPOs = new Set(); // Unikalne PO dla tego składnika
          
          ingredientBatches.forEach(batch => {
            const poId = batch.purchaseOrderDetails?.id || batch.sourceDetails?.orderId;
            
            if (poId && !seenPOs.has(poId) && purchaseOrdersMap[poId]) {
              seenPOs.add(poId);
              const po = purchaseOrdersMap[poId];
              
              // Znajdź pozycję w PO dla tej partii
              const itemPoId = batch.purchaseOrderDetails?.itemPoId || batch.sourceDetails?.itemPoId;
              const poItem = po.items?.find(item => item.id === itemPoId);
              
              const supplierName = po.supplier?.name || 'Nieznany dostawca';
              const poNumber = po.number || poId;
              const price = poItem?.unitPrice ? `${parseFloat(poItem.unitPrice).toFixed(2)} ${po.currency || 'PLN'}` : '';
              
              // Format: "Dostawca (PO: PO/2024/001, 12.50 PLN)"
              let info = `${supplierName} (PO: ${poNumber}`;
              if (price) {
                info += `, ${price}`;
              }
              info += ')';
              
              supplierInfos.push(info);
            }
          });
          
          if (supplierInfos.length > 0) {
            suppliersFromPOText = supplierInfos.join('; ');
          }
        }
        
        // B) Dostawcy z pozycji magazynowej (inventorySupplierPrices)
        if (ingredient.id && supplierPricesMap[ingredient.id]) {
          const prices = supplierPricesMap[ingredient.id];
          
          const supplierDetails = prices.map(sp => {
            const supplier = suppliersMap[sp.supplierId];
            const supplierName = supplier ? supplier.name : sp.supplierId;
            const price = sp.price ? `${sp.price.toFixed(2)} ${sp.currency || 'PLN'}` : '';
            return price ? `${supplierName} (${price})` : supplierName;
          });
          
          if (supplierDetails.length > 0) {
            suppliersFromInventoryText = supplierDetails.join('; ');
          }
        }
        
        csvRows.push({
          'Receptura (SKU)': recipe.name || '',
          'Opis receptury': recipe.description || '',
          'Klient': customer ? customer.name : '',
          'Składnik': ingredient.name || '',
          'Ilość składnika': ingredient.quantity || '',
          'Jednostka': ingredient.unit || '',
          'Dostawcy (z pozycji mag.)': suppliersFromInventoryText,
          'Dostawcy (z PO)': suppliersFromPOText,
          'Mikroelementy': '-'
        });
      }
      
      // Dodaj pusty wiersz po każdej recepturze dla lepszej czytelności
      csvRows.push({
        'Receptura (SKU)': '',
        'Opis receptury': '',
        'Klient': '',
        'Składnik': '',
        'Ilość składnika': '',
        'Jednostka': '',
        'Dostawcy (z pozycji mag.)': '',
        'Dostawcy (z PO)': '',
        'Mikroelementy': ''
      });
      
      // Informuj użytkownika o postępie
      if (processedRecipes % 10 === 0) {
        onInfo(`Przetworzono ${processedRecipes}/${allRecipes.length} receptur...`);
      }
    }

    // Utwórz nagłówki CSV
    const headers = [
      'Receptura (SKU)', 
      'Opis receptury', 
      'Klient', 
      'Składnik', 
      'Ilość składnika', 
      'Jednostka', 
      'Dostawcy (z pozycji mag.)',
      'Dostawcy (z PO)',
      'Mikroelementy'
    ];
    
    // Utwórz zawartość CSV
    const csvContent = [
      headers.map(header => `"${header}"`).join(','),
      ...csvRows.map(row => 
        headers.map(header => `"${(row[header] || '').toString().replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    // Dodaj BOM dla poprawnego kodowania polskich znaków w Excelu
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Nazwa pliku z aktualną datą
    const currentDate = new Date().toISOString().slice(0, 10);
    const filename = `receptury_z_dostawcami_${currentDate}.csv`;
    
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onSuccess(`Eksport zakończony! Wyeksportowano ${allRecipes.length} receptur z ${csvRows.length} wierszami.`);
  } catch (error) {
    console.error('Błąd podczas eksportu receptur z dostawcami:', error);
    onError('Wystąpił błąd podczas eksportu');
  }
};

