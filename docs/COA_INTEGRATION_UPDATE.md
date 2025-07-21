# Aktualizacja integracji CoA w raportach gotowego produktu

## Przegląd zmian

Zaktualizowano system generowania raportów gotowego produktu, aby poprawnie pobierał i wyświetlał certyfikaty analizy (CoA) z nowej skategoryzowanej struktury załączników Purchase Orders.

## 🔬 **Zmiany w logice pobierania załączników**

### Poprzednia implementacja:
- Pobierane były **wszystkie** załączniki z PO
- Brak rozróżnienia między CoA, fakturami i innymi dokumentami
- Wszystko trafiało do sekcji "Physicochemical properties"

### Nowa implementacja:
- Priorytetowo pobierane są **tylko certyfikaty CoA** (`coaAttachments`)
- Kompatybilność wsteczna ze starymi załącznikami (`attachments`)
- Lepsze kategoryzowanie w raporcie

## 📝 **Zaktualizowane pliki**

### 1. `src/pages/Production/TaskDetailsPage.js`

**Funkcja `fetchIngredientAttachments`:**
```javascript
// PRZED
const allPoAttachments = [
  ...(poData.coaAttachments || []),
  ...(poData.invoiceAttachments || []),
  ...(poData.generalAttachments || []),
  ...(poData.attachments || [])
];

// PO
const coaAttachments = poData.coaAttachments || [];
let attachmentsToProcess = coaAttachments;
if (coaAttachments.length === 0 && poData.attachments && poData.attachments.length > 0) {
  attachmentsToProcess = poData.attachments; // Kompatybilność wsteczna
}
```

**Wyświetlanie w UI:**
- Zaktualizowano nagłówek: "4. Physicochemical properties (CoA)"
- Dodano wyjaśnienie o certyfikatach CoA
- Dodano chip z kategorią załącznika (CoA/Legacy)

### 2. `src/services/endProductReportService.js`

**Sekcja raportu PDF:**
- Nagłówek: "Physicochemical properties (CoA)" 
- Dodana kolumna "Type" w tabeli
- Zaktualizowane podsumowanie: "CoA certificates summary"
- Lepsze komunikaty o braku CoA

**Struktura tabeli:**
```
| File name | Type | Size | PO Number | Upload date |
|-----------|------|------|-----------|-------------|
| cert.pdf  | CoA  | 2MB  | PO-001    | 12.01.2024  |
```

## 🔄 **Logika kompatybilności wstecznej**

### Scenariusze działania:

1. **PO z nowymi CoA:**
   ```javascript
   poData.coaAttachments = [cert1.pdf, cert2.pdf]
   ```
   ✅ Wyświetlane: tylko CoA, kategoria: "CoA"

2. **Stare PO bez CoA:**
   ```javascript
   poData.attachments = [old_cert.pdf, invoice.pdf]
   poData.coaAttachments = []
   ```
   ✅ Wyświetlane: wszystkie stare załączniki, kategoria: "Legacy"

3. **PO z CoA i starymi załącznikami:**
   ```javascript
   poData.coaAttachments = [new_cert.pdf]
   poData.attachments = [old_file.pdf]
   ```
   ✅ Wyświetlane: tylko CoA, stare załączniki ignorowane

## 📊 **Wpływ na raporty**

### Sekcja "Physicochemical properties (CoA)":
- **Przed**: Wszystkie załączniki z PO (混合)
- **Po**: Tylko certyfikaty CoA (🎯 celowane)

### Korzyści:
- ✅ Lepsze kategoryzowanie dokumentów
- ✅ Czytelniejsze raporty
- ✅ Zgodność z branżowymi standardami
- ✅ Zachowana kompatybilność wsteczna

## 🎨 **Zmiany wizualne**

### TaskDetailsPage:
```
[CoA] [PO: PO-001] [📄] certificate.pdf    [⬇️]
[Legacy] [PO: PO-002] [📄] old_file.pdf    [⬇️]
```

### Raport PDF:
```
4. Physicochemical properties (CoA)

Ingredient ABC:
File name     | Type | Size | PO Number | Upload date
cert_abc.pdf  | CoA  | 2MB  | PO-001    | 12.01.2024

CoA certificates summary:
• Ingredients with CoA certificates: 3
• Total CoA certificates: 5
• Related purchase orders: 2
• Total size: 8.5 MB
```

## 🧪 **Testowanie**

### Scenariusze do przetestowania:

1. **Nowe PO z CoA:**
   - Dodaj CoA do PO
   - Utwórz zadanie produkcyjne
   - Sprawdź raport gotowego produktu
   - ✅ Powinny być widoczne tylko CoA

2. **Stare PO (przed aktualizacją):**
   - Znajdź stare PO z załącznikami
   - Utwórz zadanie z tym PO
   - Sprawdź raport
   - ✅ Powinny być widoczne stare załączniki jako "Legacy"

3. **Mieszany przypadek:**
   - PO z CoA i starymi załącznikami
   - ✅ Tylko CoA powinny być w raporcie

## 🔧 **Przyszłe ulepszenia**

### Możliwe rozszerzenia:
1. **Filtrowanie według typu CoA** (mikrobiologiczne, chemiczne)
2. **Walidacja kompletności CoA** dla każdego składnika
3. **Automatyczne przypomnienia** o brakujących CoA
4. **Integracja z systemami QA** dostawców

## 📋 **Wskazówki dla użytkowników**

### Dla zespołu zakupów:
- Dodawaj certyfikaty analizy do kategorii **"CoA"** w PO
- Faktury umieszczaj w kategorii **"Faktury"**
- Inne dokumenty w kategorii **"Inne załączniki"**

### Dla zespołu produkcji:
- Raporty gotowego produktu będą zawierać tylko CoA
- Kategoria "Legacy" oznacza stare załączniki (przed aktualizacją)
- Wszystkie CoA są automatycznie dołączane do raportu PDF

### Dla zespołu QA:
- Sekcja "Physicochemical properties (CoA)" zawiera tylko istotne certyfikaty
- Można łatwo zidentyfikować brakujące CoA dla składników
- Historia certyfikatów jest zachowana w powiązanych PO 