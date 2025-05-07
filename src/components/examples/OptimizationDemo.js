import React, { useState } from 'react';
import OptimizedInventoryList from './OptimizedInventoryList';
import { useEffect } from 'react';
import { getAllInventoryItems } from '../../services/inventoryService';

/**
 * Komponent demonstracyjny pokazujący optymalizacje:
 * 1. Zoptymalizowane zapytania Firestore w inventoryService (używa strony serwera gdy to możliwe)
 * 2. Mądre zarządzanie subskrypcjami w komponencie OptimizedInventoryList 
 */
const OptimizationDemo = () => {
  const [activeTab, setActiveTab] = useState('subscribe'); // 'subscribe' lub 'query'
  const [category, setCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [inventoryResults, setInventoryResults] = useState(null);
  
  // Kategorie do wyboru (można by pobierać dynamicznie)
  const categories = ['surowce', 'opakowania', 'produkty', 'inne'];
  
  // Obsługa zmiany kategorii
  const handleCategoryChange = (e) => {
    setCategory(e.target.value);
  };
  
  // Obsługa zmiany wyszukiwania
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  // Obsługa zmiany rozmiaru strony
  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value));
    setCurrentPage(1); // Resetuj stronę przy zmianie rozmiaru
  };
  
  // Obsługa zmiany strony
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };
  
  // Demonstracja zoptymalizowanej funkcji getAllInventoryItems
  const loadInventoryWithOptimizedQuery = async () => {
    setLoading(true);
    try {
      const warehouseId = null; // Można dodać wybór magazynu w interfejsie
      const result = await getAllInventoryItems(
        warehouseId, 
        currentPage,
        pageSize,
        searchTerm,
        category
      );
      setInventoryResults(result);
      console.log('Zoptymalizowane zapytanie zwróciło:', result);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Pobierz dane przy zmianie parametrów zapytania (dla zakładki query)
  useEffect(() => {
    if (activeTab === 'query') {
      loadInventoryWithOptimizedQuery();
    }
  }, [activeTab, currentPage, pageSize, category, searchTerm]);
  
  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Demonstracja optymalizacji Firestore</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={() => setActiveTab('subscribe')}
            style={{ 
              fontWeight: activeTab === 'subscribe' ? 'bold' : 'normal',
              backgroundColor: activeTab === 'subscribe' ? '#e0e0ff' : '#f0f0f0'
            }}
          >
            Optymalizacja subskrypcji
          </button>
          <button 
            onClick={() => setActiveTab('query')}
            style={{ 
              fontWeight: activeTab === 'query' ? 'bold' : 'normal',
              backgroundColor: activeTab === 'query' ? '#e0ffef' : '#f0f0f0'
            }}
          >
            Optymalizacja zapytań
          </button>
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ marginRight: '10px' }}>
            Kategoria:
            <select 
              value={category} 
              onChange={handleCategoryChange} 
              style={{ marginLeft: '5px' }}
            >
              <option value="">Wszystkie</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
          
          <label style={{ marginLeft: '20px' }}>
            Wyszukaj:
            <input 
              type="text" 
              value={searchTerm} 
              onChange={handleSearchChange} 
              style={{ marginLeft: '5px' }}
              placeholder="Wpisz nazwę..."
            />
          </label>
        </div>
      </div>
      
      {activeTab === 'subscribe' && (
        <div>
          <h2>1. Optymalizacja subskrypcji (korzysta z useFirestore)</h2>
          <p>Ten komponent używa inteligentnych subskrypcji, aby zmniejszyć ilość zapytań do bazy:</p>
          <ul>
            <li>Automatycznie odsubskrybuje, gdy komponent jest niewidoczny</li>
            <li>Automatycznie zarządza subskrypcjami przy zniszczeniu komponentu</li>
            <li>Używa limitów do ograniczenia ilości pobranych dokumentów</li>
            <li>Stosuje filtrowanie po stronie serwera tam, gdzie to możliwe</li>
          </ul>
          
          <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
            <OptimizedInventoryList 
              category={category || undefined} 
              isVisible={activeTab === 'subscribe'} 
              limit={pageSize}
            />
          </div>
        </div>
      )}
      
      {activeTab === 'query' && (
        <div>
          <h2>2. Optymalizacja zapytań (korzysta z inventoryService)</h2>
          <p>Ta funkcjonalność demonstruje zoptymalizowane zapytania:</p>
          <ul>
            <li>Filtrowanie po kategorii jest wykonywane po stronie serwera</li>
            <li>Wyszukiwanie tekstowe (które nie jest natywnie obsługiwane przez Firestore) jest wykonywane lokalnie</li>
            <li>Paginacja jest obsługiwana efektywnie</li>
            <li>Zapytania o partie są optymalizowane i filtrowane po stronie serwera</li>
          </ul>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ marginRight: '15px' }}>
              Rozmiar strony:
              <select 
                value={pageSize} 
                onChange={handlePageSizeChange}
                style={{ marginLeft: '5px' }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
            
            <div style={{ marginTop: '10px' }}>
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                Poprzednia
              </button>
              <span style={{ margin: '0 10px' }}>
                Strona {currentPage} z {inventoryResults?.totalPages || 1}
              </span>
              <button 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!inventoryResults || currentPage >= inventoryResults.totalPages || loading}
              >
                Następna
              </button>
            </div>
          </div>
          
          {loading ? (
            <div>Ładowanie danych...</div>
          ) : inventoryResults ? (
            <div>
              <p>Znaleziono łącznie: {inventoryResults.totalCount} elementów</p>
              
              <div style={{ padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
                {inventoryResults.items.length === 0 ? (
                  <p>Brak elementów spełniających kryteria</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Nazwa</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Kategoria</th>
                        <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>Ilość</th>
                        <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>Cena jedn.</th>
                        <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>Wartość</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryResults.items.map(item => (
                        <tr key={item.id}>
                          <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.name}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.category}</td>
                          <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>
                            {item.currentQuantity !== undefined ? item.currentQuantity.toFixed(2) : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>
                            {item.averageUnitPrice !== undefined ? item.averageUnitPrice.toFixed(2) : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>
                            {item.totalValue !== undefined ? item.totalValue.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <p>Kliknij "Załaduj dane", aby pobrać dane z Firestore.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default OptimizationDemo; 