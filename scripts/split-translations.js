const fs = require('fs');
const path = require('path');

/**
 * Skrypt do automatycznego podziału dużego pliku tłumaczeń na mniejsze namespace'y
 * Dzieli obecny translation.json na logiczne sekcje dla łatwiejszego zarządzania
 */

const LOCALES_DIR = 'src/i18n/locales';
const LANGUAGES = ['pl', 'en'];

// Definicja głównych namespace'ów - logiczne grupowanie
const NAMESPACE_MAPPING = {
  // Podstawowe
  'common': ['common'],
  'navigation': ['navigation'],
  'auth': ['auth'],
  'dashboard': ['dashboard'],
  
  // Główne funkcjonalności
  'inventory': ['inventory'],
  'production': ['production'],
  'orders': ['orders', 'orderDetails', 'orderForm'],
  'invoices': ['invoices'],
  'customers': ['customers'],
  'suppliers': ['suppliers'],
  'recipes': ['recipes'],
  
  // Raporty i analizy
  'reports': ['analytics', 'coReports'],
  
  // Zarządzanie
  'machines': ['machines'],
  'purchaseOrders': ['purchaseOrders'],
  'cmr': ['cmr'],
  'forms': ['productionForms', 'inventoryForms'],
  
  // Pomocnicze
  'calculator': ['calculator'],
  'priceLists': ['priceLists'],
  'aiAssistant': ['aiAssistant'],
  'environmentalConditions': ['environmentalConditions'],
  'expiryDates': ['expiryDates'],
  'stocktaking': ['stocktaking'],
  'interactions': ['purchaseInteractions', 'interactionDetails'],
  'sidebar': ['sidebar']
};

// Funkcja do tworzenia katalogu jeśli nie istnieje
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Utworzono katalog: ${dirPath}`);
  }
};

// Funkcja do podziału pliku tłumaczeń
const splitTranslationFile = (language) => {
  const translationPath = path.join(LOCALES_DIR, language, 'translation.json');
  
  if (!fs.existsSync(translationPath)) {
    console.log(`⚠️  Plik ${translationPath} nie istnieje, pomijam...`);
    return;
  }

  console.log(`🔍 Przetwarzam plik: ${translationPath}`);
  
  try {
    const translationData = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
    
    // Utwórz backup oryginalnego pliku jeśli nie istnieje
    const backupPath = translationPath.replace('.json', '.backup.json');
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, JSON.stringify(translationData, null, 2));
      console.log(`💾 Utworzono backup: ${backupPath}`);
    }
    
    // Grupuj dane według namespace'ów
    const groupedData = {};
    
    // Inicjalizuj grupy
    Object.keys(NAMESPACE_MAPPING).forEach(namespace => {
      groupedData[namespace] = {};
    });
    
    // Mapuj klucze do odpowiednich namespace'ów
    Object.keys(translationData).forEach(originalKey => {
      let assigned = false;
      
      // Sprawdź czy klucz pasuje do któregoś z mapowań
      for (const [targetNamespace, sourceKeys] of Object.entries(NAMESPACE_MAPPING)) {
        if (sourceKeys.includes(originalKey)) {
          groupedData[targetNamespace][originalKey] = translationData[originalKey];
          assigned = true;
          break;
        }
      }
      
      // Jeśli nie znaleziono mapowania, dodaj do 'common'
      if (!assigned) {
        console.log(`⚠️  Klucz '${originalKey}' nie został zmapowany, dodaję do 'common'`);
        groupedData['common'][originalKey] = translationData[originalKey];
      }
    });
    
    // Zapisz namespace'y jako osobne pliki (bez zagnieżdżenia)
    let createdFiles = 0;
    Object.keys(groupedData).forEach(namespace => {
      if (Object.keys(groupedData[namespace]).length > 0) {
        const namespacePath = path.join(LOCALES_DIR, language, `${namespace}.json`);
        
        // Sprawdź czy dane są zagnieżdżone w kluczu namespace'a
        let dataToSave = groupedData[namespace];
        
        // Jeśli w grupie jest tylko jeden klucz i jest to nazwa namespace'a, wyciągnij jego zawartość
        const keys = Object.keys(dataToSave);
        if (keys.length === 1 && keys[0] === namespace) {
          dataToSave = dataToSave[namespace];
          console.log(`🔧 Rozpakowuję zagnieżdżoną strukturę dla namespace'a: ${namespace}`);
        }
        
        fs.writeFileSync(namespacePath, JSON.stringify(dataToSave, null, 2) + '\n');
        console.log(`📄 Utworzono: ${namespacePath} (${Object.keys(dataToSave).length} kluczy)`);
        createdFiles++;
      }
    });
    
    console.log(`✅ Pomyślnie podzielono plik dla języka: ${language}`);
    console.log(`📊 Utworzono ${createdFiles} namespace'ów`);
    
  } catch (error) {
    console.error(`❌ Błąd podczas przetwarzania pliku ${translationPath}:`, error.message);
  }
};

// Funkcja główna
const main = () => {
  console.log('🚀 Rozpoczynam podział plików tłumaczeń...\n');
  
  // Sprawdź czy katalog locales istnieje
  if (!fs.existsSync(LOCALES_DIR)) {
    console.error(`❌ Katalog ${LOCALES_DIR} nie istnieje!`);
    process.exit(1);
  }
  
  // Przetwarzaj każdy język
  LANGUAGES.forEach(language => {
    console.log(`\n🌐 Przetwarzam język: ${language.toUpperCase()}`);
    
    const languageDir = path.join(LOCALES_DIR, language);
    ensureDirectoryExists(languageDir);
    
    splitTranslationFile(language);
  });
  
  console.log('\n🎉 Podział plików zakończony pomyślnie!');
  console.log('\n📋 Następne kroki:');
  console.log('1. Sprawdź utworzone pliki w katalogach locales');
  console.log('2. Zaktualizuj konfigurację i18n (będzie zrobione automatycznie)');
  console.log('3. Przetestuj aplikację');
  console.log('4. Jeśli wszystko działa, możesz usunąć pliki .backup.json');
};

// Uruchom skrypt
if (require.main === module) {
  main();
}

module.exports = { splitTranslationFile, main };
