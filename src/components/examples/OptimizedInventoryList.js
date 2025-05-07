import React, { useState, useEffect, useCallback } from 'react';
import { useFirestore } from '../../hooks/useFirestore';

/**
 * Komponent prezentujący zoptymalizowane podejście do używania subskrypcji Firestore
 * Ten komponent:
 * 1. Używa subskrypcji tylko wtedy, gdy komponent jest widoczny (załadowany)
 * 2. Automatycznie odsubskrybuje przy odmontowaniu
 * 3. Używa ograniczenia ilości dokumentów przez parametr limit
 * 4. Stosuje filtrowanie po stronie serwera zamiast po stronie klienta
 */
const OptimizedInventoryList = ({ category, isVisible = true, limit = 10 }) => {
  const { 
    documents: items, 
    loading, 
    error, 
    isSubscribed,
    subscribe, 
    unsubscribe 
  } = useFirestore('inventory');
  
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Funkcja do ustawienia/aktualizacji subskrypcji
  const updateSubscription = useCallback(() => {
    // Przygotuj opcje subskrypcji
    const subscriptionOptions = {
      // Limit dokumentów - pozwala na zmniejszenie obciążenia
      limit: limit,
      
      // Sortowanie dokumentów
      orderBy: { field: 'name', direction: 'asc' },
      
      // Filtrowanie dokumentów po stronie serwera (jeśli podano kategorię)
      where: category ? { field: 'category', operator: '==', value: category } : null
    };
    
    // Utwórz funkcję callback, która zostanie wywołana przy każdej aktualizacji
    const handleSnapshot = (docs) => {
      console.log(`Otrzymano aktualizację z ${docs.length} elementami`);
      
      // Filtrowanie lokalne tylko dla searchTerm, którego nie możemy zrobić po stronie Firestore
      if (searchTerm.trim() !== '') {
        const filtered = docs.filter(item => 
          item.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredItems(filtered);
      } else {
        setFilteredItems(docs);
      }
    };
    
    // Uruchom subskrypcję
    subscribe(handleSnapshot, subscriptionOptions);
  }, [category, limit, searchTerm, subscribe]);
  
  // Zarządzaj subskrypcją przy zmianach visibility i parametrów
  useEffect(() => {
    // Uruchom subskrypcję tylko jeśli komponent jest widoczny
    if (isVisible) {
      updateSubscription();
    } else {
      // Odsubskrybuj jeśli komponent nie jest widoczny (np. jest w innej zakładce)
      unsubscribe();
    }
    
    // Czyszczenie przy odmontowaniu
    return () => {
      unsubscribe();
    };
  }, [isVisible, updateSubscription, unsubscribe]);
  
  // Aktualizuj filtry lokalne przy zmianie searchTerm
  useEffect(() => {
    if (isSubscribed) {
      // Jeśli zmieni się searchTerm, filtrujemy istniejące dokumenty lokalnie
      if (searchTerm.trim() !== '') {
        const filtered = items.filter(item => 
          item.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredItems(filtered);
      } else {
        setFilteredItems(items);
      }
    }
  }, [searchTerm, items, isSubscribed]);
  
  // Obsługa zmiany w polu wyszukiwania
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  if (loading) {
    return <div>Ładowanie...</div>;
  }
  
  if (error) {
    return <div>Błąd: {error}</div>;
  }
  
  return (
    <div>
      <h2>Lista magazynowa (zoptymalizowana)</h2>
      <div>
        <input
          type="text"
          placeholder="Szukaj po nazwie..."
          value={searchTerm}
          onChange={handleSearchChange}
        />
      </div>
      
      <p>
        <small>
          Status subskrypcji: {isSubscribed ? 'Aktywna' : 'Nieaktywna'}, 
          {isVisible ? ' komponent widoczny' : ' komponent ukryty'}
        </small>
      </p>
      
      {filteredItems.length === 0 ? (
        <p>Brak elementów do wyświetlenia</p>
      ) : (
        <ul>
          {filteredItems.map(item => (
            <li key={item.id}>
              <strong>{item.name}</strong> - {item.category}
              {item.quantity !== undefined && (
                <span> (Ilość: {item.quantity})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OptimizedInventoryList; 