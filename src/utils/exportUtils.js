/**
 * Funkcja eksportująca dane do pliku CSV
 * @param {Array} data - Tablica obiektów do eksportu
 * @param {string} fileName - Nazwa pliku
 */
export const exportToCSV = (data, fileName) => {
  if (!data || !data.length) {
    console.warn('Brak danych do eksportu');
    return;
  }

  // Pobierz nagłówki z pierwszego obiektu
  const headers = Object.keys(data[0]);
  
  // Utwórz zawartość CSV
  let csvContent = headers.join(';') + '\n';
  
  // Dodaj wiersze danych
  data.forEach(item => {
    const row = headers.map(header => {
      // Pobierz wartość dla danego nagłówka
      let value = item[header] !== undefined ? item[header] : '';
      
      // Jeśli wartość zawiera przecinek, cudzysłów lub nową linię, umieść ją w cudzysłowach
      if (typeof value === 'string' && (value.includes(';') || value.includes('"') || value.includes('\n'))) {
        // Zamień wszystkie cudzysłowy na podwójne cudzysłowy
        value = value.replace(/"/g, '""');
        // Umieść wartość w cudzysłowach
        value = `"${value}"`;
      }
      
      return value;
    }).join(';');
    
    csvContent += row + '\n';
  });
  
  // Utwórz obiekt Blob z zawartością CSV
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Utwórz URL dla obiektu Blob
  const url = URL.createObjectURL(blob);
  
  // Utwórz element <a> do pobrania pliku
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  
  // Dodaj element do dokumentu
  document.body.appendChild(link);
  
  // Kliknij link, aby rozpocząć pobieranie
  link.click();
  
  // Usuń element z dokumentu
  document.body.removeChild(link);
  
  // Zwolnij URL
  URL.revokeObjectURL(url);
}; 