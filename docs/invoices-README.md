# InvoicePdfGenerator

Komponent odpowiedzialny za generowanie PDF faktury. Został wydzielony z `InvoiceDetails.js` w celu lepszej separacji odpowiedzialności i możliwości ponownego użycia.

## Użycie

### Podstawowe użycie
```javascript
import { createInvoicePdfGenerator } from './InvoicePdfGenerator';

// Tworzenie instancji generatora PDF
const pdfGenerator = createInvoicePdfGenerator(invoice, companyInfo, 'pl');

// Pobieranie pliku PDF
const result = await pdfGenerator.downloadPdf('pl');

if (result.success) {
  console.log('PDF wygenerowane pomyślnie:', result.filename);
} else {
  console.error('Błąd generowania PDF:', result.error);
}
```

### Optymalizacja rozmiaru pliku
```javascript
// Dla małego rozmiaru pliku (bez szablonu tła)
const pdfGenerator = createInvoicePdfGenerator(invoice, companyInfo, 'pl', {
  useTemplate: false,           // Wyłącz szablon tła
  enableCompression: true,      // Włącz kompresję PDF
  imageQuality: 0.6            // Niższa jakość obrazów
});

// Dla średniego rozmiaru (z szablonem, ale skompresowanym)
const pdfGenerator = createInvoicePdfGenerator(invoice, companyInfo, 'pl', {
  useTemplate: true,           // Zachowaj szablon
  enableCompression: true,     // Włącz kompresję
  imageQuality: 0.7           // Średnia jakość kompresji
});

// Dla najwyższej jakości (domyślne ustawienia)
const pdfGenerator = createInvoicePdfGenerator(invoice, companyInfo, 'pl', {
  useTemplate: true,           // Pełny szablon
  enableCompression: true,     // Kompresja włączona
  imageQuality: 0.95          // Najwyższa jakość (domyślne)
});
```

## API

### `createInvoicePdfGenerator(invoice, companyInfo, language, options)`

Funkcja pomocnicza do tworzenia instancji generatora PDF.

#### Parametry:
- `invoice` - obiekt faktury
- `companyInfo` - informacje o firmie
- `language` - język ('pl' lub 'en')
- `options` - opcje optymalizacji (opcjonalne):
  - `useTemplate: boolean` - czy używać szablonu tła (domyślnie true)
  - `imageQuality: number` - jakość kompresji obrazu 0.1-1.0 (domyślnie 0.95)
  - `enableCompression: boolean` - czy włączyć kompresję PDF (domyślnie true)

#### Zwraca:
Instancję klasy `InvoicePdfGenerator`

### `InvoicePdfGenerator.downloadPdf(language)`

Generuje i pobiera plik PDF faktury.

#### Parametry:
- `language` - język dokumentu ('pl' lub 'en')

#### Zwraca:
Promise z obiektem rezultatu:
```javascript
{
  success: boolean,
  filename?: string,    // jeśli success: true
  message: string,
  error?: string       // jeśli success: false
}
```

## Funkcjonalności

- **Optymalizacja rozmiaru**: Zaawansowane opcje kompresji i optymalizacji
- **Szablon graficzny**: Automatyczne dodawanie szablonu faktury jako tło (z `/templates/invoice_template.png`)
- **Kompresja obrazów**: Canvas-based kompresja JPEG z konfigurowalnością jakości
- **Tryby działania**: Z szablonem lub bez szablonu dla oszczędności miejsca
- Obsługa faktur zwykłych i proform
- Obsługa faktur zakupowych
- Wielojęzyczność (polski/angielski)
- Automatyczne obliczanie sum VAT i netto
- Obsługa powiązanych zamówień zakupowych
- Dodatkowe koszty i zaliczki
- Formatowanie polskich znaków w PDF
- Tłumaczenie metod płatności
- Graceful fallback jeśli szablon nie może zostać załadowany

## Optymalizacja rozmiaru pliku

Komponent oferuje kilka opcji optymalizacji rozmiaru PDF:

1. **Bez szablonu** (`useTemplate: false`): Najlżejszy wariant, oszczędność ~90% rozmiaru
2. **Kompresja obrazu** (`imageQuality: 0.6-0.8`): Kontrola jakości vs rozmiar
3. **Kompresja PDF** (`enableCompression: true`): Ogólna kompresja dokumentu
4. **Canvas resampling**: Automatyczne dopasowanie rozdzielczości obrazu do PDF

## Struktura klasy

Klasa `InvoicePdfGenerator` zawiera metody:
- `convertPolishChars()` - konwersja polskich znaków
- `translatePaymentMethod()` - tłumaczenie metod płatności
- `formatDate()` - formatowanie dat
- `calculateTotalNetto()` - obliczanie wartości netto
- `calculateTotalVat()` - obliczanie VAT
- `addSellerInfo()` - dodawanie informacji o sprzedawcy
- `addBuyerInfo()` - dodawanie informacji o nabywcy
- `addItemsTable()` - dodawanie tabeli pozycji
- `addPurchaseOrdersTable()` - dodawanie tabeli zamówień zakupowych
- `addFinancialSummary()` - dodawanie podsumowania finansowego
- `addPaymentInfo()` - dodawanie informacji o płatności
- `addNotes()` - dodawanie uwag
- `addFooter()` - dodawanie stopki
- `generate()` - główna metoda generująca PDF
- `downloadPdf()` - generowanie i pobieranie PDF
