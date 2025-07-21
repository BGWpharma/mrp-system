# Aktualizacja reguł bezpieczeństwa Firebase - Skategoryzowane załączniki PO

## Przegląd zmian

Zaktualizowano reguły bezpieczeństwa Firebase Storage i Firestore w celu obsługi nowej struktury załączników w Purchase Orders (PO), która została podzielona na trzy kategorie:
- **CoA (Certyfikaty analiz)** - `coa/`
- **Faktury** - `invoice/` 
- **Inne załączniki** - `general/`

## Firebase Storage Rules

### Zaktualizowane pliki:
- `firebase.storage.rules`
- `storage.rules`

### Nowa struktura folderów:
```
purchase-order-attachments/
├── {orderId}/
│   ├── coa/
│   │   └── {fileName}
│   ├── invoice/
│   │   └── {fileName}
│   ├── general/
│   │   └── {fileName}
│   └── {fileName}  # Kompatybilność wsteczna
```

### Reguły Storage:

```javascript
// Nowa struktura z kategoriami
match /purchase-order-attachments/{orderId}/{category}/{fileName} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && 
                (category == 'coa' || category == 'invoice' || category == 'general');
}

// Kompatybilność wsteczna - stara struktura
match /purchase-order-attachments/{orderId}/{fileName} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

### Bezpieczeństwo:
- ✅ Tylko uwierzytelnieni użytkownicy mogą czytać załączniki
- ✅ Tylko uwierzytelnieni użytkownicy mogą przesyłać załączniki
- ✅ Walidacja kategorii - tylko dozwolone kategorie (`coa`, `invoice`, `general`)
- ✅ Zachowano kompatybilność wsteczną ze starą strukturą

## Firestore Rules

### Zaktualizowany plik:
- `firestore.rules`

### Nowe pola w kolekcji `purchaseOrders`:
- `coaAttachments: array` - Certyfikaty analiz
- `invoiceAttachments: array` - Załączniki faktur  
- `generalAttachments: array` - Inne załączniki
- `attachments: array` - Zachowane dla kompatybilności

### Reguły Firestore:

```javascript
// Funkcja walidacji pól załączników
function validateAttachmentFields(data) {
  return (!('coaAttachments' in data) || data.coaAttachments is list) &&
         (!('invoiceAttachments' in data) || data.invoiceAttachments is list) &&
         (!('generalAttachments' in data) || data.generalAttachments is list) &&
         (!('attachments' in data) || data.attachments is list);
}

// Reguły dla kolekcji purchaseOrders
match /purchaseOrders/{orderId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && 
                validateAttachmentFields(request.resource.data);
  allow update: if request.auth != null && 
                validateAttachmentFields(request.resource.data);
  allow delete: if request.auth != null;
}
```

### Bezpieczeństwo:
- ✅ Walidacja typów danych - nowe pola muszą być tablicami
- ✅ Tylko uwierzytelnieni użytkownicy mogą operować na dokumentach
- ✅ Automatyczna walidacja przy każdej operacji create/update

## Migracja danych

### Automatyczna migracja w aplikacji:
- Istniejące załączniki w polu `attachments` są automatycznie przenoszone do `generalAttachments` przy pierwszej edycji PO
- Zachowana kompatybilność wsteczna - stare PO nadal działają

### Struktura załączników:
```javascript
{
  id: string,
  fileName: string,
  storagePath: string,
  downloadURL: string,
  contentType: string,
  size: number,
  category: 'coa' | 'invoice' | 'general', // Nowe pole
  uploadedAt: string,
  uploadedBy: string
}
```

## Deployment

### Wymagane kroki wdrożenia:

1. **Aktualizacja reguł Storage:**
   ```bash
   firebase deploy --only storage
   ```

2. **Aktualizacja reguł Firestore:**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Weryfikacja reguł:**
   - Sprawdź w konsoli Firebase czy reguły zostały wdrożone
   - Przetestuj operacje CRUD na załącznikach
   - Sprawdź czy kompatybilność wsteczna działa

### Monitoring:
- Monitoruj logi Firebase Storage pod kątem błędów dostępu
- Sprawdź metryki użycia dla nowych ścieżek załączników
- Obserwuj wydajność zapytań Firestore

## Testy bezpieczeństwa

### Scenariusze testowe:

1. **Przesyłanie do dozwolonych kategorii:**
   - ✅ `/purchase-order-attachments/{orderId}/coa/{fileName}`
   - ✅ `/purchase-order-attachments/{orderId}/invoice/{fileName}`
   - ✅ `/purchase-order-attachments/{orderId}/general/{fileName}`

2. **Blokowanie niedozwolonych kategorii:**
   - ❌ `/purchase-order-attachments/{orderId}/other/{fileName}`
   - ❌ `/purchase-order-attachments/{orderId}/admin/{fileName}`

3. **Kompatybilność wsteczna:**
   - ✅ `/purchase-order-attachments/{orderId}/{fileName}`

4. **Walidacja pól Firestore:**
   - ✅ Pola załączników jako tablice
   - ❌ Pola załączników jako obiekty lub stringi

## Backup i rollback

### Plan rollback:
1. Przywróć poprzednie reguły z repozytorium
2. Wdróż poprzednie reguły: `firebase deploy --only storage,firestore:rules`
3. Aplikacja będzie nadal działać dzięki kompatybilności wstecznej

### Backup reguł:
Poprzednie reguły są zachowane w historii git i mogą być przywrócone w razie potrzeby. 