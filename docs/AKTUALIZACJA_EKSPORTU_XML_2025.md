# 📋 Aktualizacja Eksportu XML do Comarch Optima - Listopad 2025

## 🎯 Cel aktualizacji

System eksportu faktur do Comarch Optima został **całkowicie przepisany** w celu zapewnienia pełnej zgodności z oficjalnym schematem XML Comarch Optima ERP.

## ✅ Co się zmieniło?

### 1. Zgodność ze schematem Comarch Optima

**Przed:**
- Uproszczona struktura XML
- Własne nazwy tagów
- Brak namespace

**Po aktualizacji:**
- Pełna zgodność z oficjalnym schematem Comarch
- Namespace: `http://www.cdn.com.pl/optima/dokument`
- Wszystkie wymagane pola i struktury

### 2. Struktura nagłówka

**Dodano:**
- `GENERATOR` - identyfikacja systemu
- `TYP_DOKUMENTU` i `RODZAJ_DOKUMENTU` - typy zgodne z Optima
- `FV_MARZA`, `KOREKTA`, `DETAL` - flagi wymagane przez system
- `TYP_NETTO_BRUTTO` - typ dokumentu
- `OPIS` - automatyczny opis dokumentu
- `KWOTY` - sekcja z podsumowaniem wartości
- `MAGAZYN_ZRODLOWY` - magazyn źródłowy
- `STATUS_PLATNIKA` - status płatnika VAT

### 3. Kontrahenci

**Przed:**
- Jedna sekcja `<Kontrahent>`

**Po aktualizacji:**
- `PLATNIK` - płatnik faktury
- `ODBIORCA` - odbiorca towaru/usługi
- `SPRZEDAWCA` - dane Twojej firmy (BGW PHARMA)

Każda sekcja zawiera:
- NIP z kodem kraju (np. `<NIP_KRAJ>PL</NIP_KRAJ>`)
- Kompletny adres
- GLN i MPP (jeśli dostępne)

### 4. Kursy walut

**Nowa struktura:**
```xml
<WALUTA>
  <SYMBOL>EUR</SYMBOL>
  <KURS_L>4.2231</KURS_L>
  <KURS_M>1</KURS_M>
  <PLAT_WAL_OD_PLN>0</PLAT_WAL_OD_PLN>
  <KURS_NUMER>3</KURS_NUMER>
  <KURS_DATA>2025-11-17</KURS_DATA>
</WALUTA>
```

### 5. Pozycje faktury

Każda pozycja teraz zawiera:

**TOWAR** - szczegóły produktu/usługi:
- KOD (SKU/ID)
- NAZWA
- OPIS
- EAN, SWW, NUMER_KATALOGOWY
- MPP (Mała Produkcja Paragonowa)

**STAWKA_VAT** - informacje o VAT:
- STAWKA (wartość liczbowa)
- FLAGA (0=normalna, 1=zwolnione, 2=eksport/WDT, 3=odwrotne obciążenie)
- ZRODLOWA (stawka źródłowa)

**CENY** - szczegółowe ceny:
- Ceny w PLN (waluta systemowa)
- Ceny w walucie dokumentu
- Ceny po rabacie

**JM_ZLOZONA** - jednostki miary:
- JMZ (jednostka)
- Przeliczniki

### 6. Tabelka VAT

**Nowa funkcjonalność:**
Automatyczne podsumowanie wartości według stawek VAT:
- Osobna linia dla każdej stawki VAT
- Wartości w PLN i walucie dokumentu
- Suma netto, VAT, brutto dla każdej stawki

```xml
<TABELKA_VAT>
  <LINIA_VAT>
    <STAWKA_VAT>
      <STAWKA>23.00</STAWKA>
      <FLAGA>0</FLAGA>
    </STAWKA_VAT>
    <NETTO>1000.00</NETTO>
    <VAT>230.00</VAT>
    <BRUTTO>1230.00</BRUTTO>
    <NETTO_WAL>236.88</NETTO_WAL>
    <VAT_WAL>54.48</VAT_WAL>
    <BRUTTO_WAL>291.36</BRUTTO_WAL>
  </LINIA_VAT>
</TABELKA_VAT>
```

### 7. Przeliczanie walut

System automatycznie przelicza wszystkie wartości:
- Z waluty dokumentu (np. EUR) → PLN
- Z PLN → waluta dokumentu
- Zachowuje zgodność między cenami jednostkowymi a wartościami

**Przykład:**
- Cena w EUR: 100.00
- Kurs: 4.2231
- Cena w PLN: 422.31
- Ilość: 10
- Wartość w EUR: 1000.00
- Wartość w PLN: 4223.10

## 🔧 Dane techniczne

### Wspierane waluty:
- **EUR** - Euro
- **USD** - Dolar amerykański  
- **GBP** - Funt brytyjski
- **PLN** - Złoty polski

### Dane firmy (sprzedawca):

System **automatycznie pobiera dane firmy z modułu "Dane Firmy"** w aplikacji:
- ✅ Nazwa firmy
- ✅ NIP
- ✅ Adres (ulica, miasto, kod pocztowy, kraj)
- ✅ Konto bankowe (pierwsze z listy)
- ✅ Nazwa banku

**Jak zaktualizować dane firmy:**
1. W aplikacji MRP przejdź do **Ustawienia** → **Dane Firmy**
2. Zaktualizuj odpowiednie pola
3. Zapisz zmiany
4. Nowe dane będą automatycznie używane przy następnym eksporcie

**Ważne:**
Upewnij się, że wszystkie dane firmy są wypełnione przed pierwszym eksportem!

## 📝 Dla księgowych - Co musisz wiedzieć?

### 1. Import do Comarch Optima powinien teraz działać bezproblemowo

Wyeksportowany plik XML jest w pełni zgodny ze schematem Optima, więc:
- ✅ Import powinien przebiec bez błędów
- ✅ Wszystkie dane powinny się prawidłowo zaimportować
- ✅ Nie ma potrzeby ręcznej korekty danych

### 2. Sprawdź po imporcie:

**Kontrahent:**
- Czy NIP jest poprawny
- Czy adres się zgadza

**Pozycje:**
- Czy ceny są prawidłowe
- Czy wartości w PLN i walucie dokumentu się zgadzają

**Tabelka VAT:**
- Czy podsumowanie VAT jest zgodne z faktycznym
- Czy stawki VAT są prawidłowe (0% dla eksportu)

**Waluta:**
- Sprawdź czy kurs waluty jest aktualny
- W razie potrzeby skoryguj w Comarch Optima

### 3. Obsługa eksportu WDT (Wewnątrzwspólnotowa Dostawa Towarów):

Faktury eksportowe z VAT 0% są automatycznie oznaczane flagą `2` (eksport/WDT):
```xml
<STAWKA_VAT>
  <STAWKA>0.00</STAWKA>
  <FLAGA>2</FLAGA>  <!-- 2 = eksport/WDT -->
</STAWKA_VAT>
```

## ⚠️ Ważne informacje

### Kursy walut

System **automatycznie pobiera aktualne kursy walut z API NBP** (Narodowego Banku Polskiego):
- ✅ EUR - Euro
- ✅ USD - Dolar amerykański
- ✅ GBP - Funt brytyjski
- ✅ Wszystkie inne waluty obsługiwane przez NBP

**Jak to działa:**
1. Podczas eksportu system sprawdza datę wystawienia faktury
2. Pobiera kurs z API NBP dla tej konkretnej daty
3. Jeśli data przypada na weekend/święto, system automatycznie używa kursu z ostatniego dnia roboczego
4. Kursy są zapisywane w cache, aby przyspieszyć kolejne eksporty

**Zaleta:**
- Zawsze aktualne kursy zgodne z NBP
- Nie trzeba ręcznie aktualizować kursów
- Kursy są takie same jak w systemie księgowym

**Uwaga:**
Jeśli eksportujesz faktury z przeszłości, system użyje historycznych kursów NBP z odpowiednich dni.

## 🧪 Testowanie

### Zalecana procedura:

1. **Wybierz 2-3 faktury testowe** (różne waluty, różne stawki VAT)
2. **Wyeksportuj do XML**
3. **Zaimportuj do Comarch Optima** (do bazy testowej jeśli możliwe)
4. **Sprawdź wszystkie dane:**
   - Kontrahenci
   - Pozycje
   - Wartości
   - Kursy
   - Tabelka VAT
5. **Jeśli wszystko OK** - można eksportować faktury produkcyjne

## 📞 Wsparcie

W razie problemów:
1. Sprawdź czy wszystkie pola faktury są wypełnione (walidacja przed eksportem)
2. Sprawdź komunikaty błędów w oknie eksportu
3. Skontaktuj się z administratorem systemu MRP

## 📚 Dodatkowe dokumenty

- `COMARCH_OPTIMA_EXPORT.md` - szczegółowa dokumentacja eksportu
- `INSTRUKCJA_DLA_KSIEGOWYCH.md` - instrukcja krok po kroku
- `example_optima_invoice.xml` - przykładowy plik XML

---

**Data aktualizacji:** 21.11.2025  
**Wersja:** 2.0  
**Status:** ✅ Gotowe do użycia w produkcji

