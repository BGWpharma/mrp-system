(function (global) {
  var Roboto = (function () {
    'use strict';
    // Ten plik definiuje czcionkę Roboto Regular dla jsPDF
    // Skrócona wersja dla podstawowych polskich znaków
    var font = {
      normal: {
        id: 'Roboto-Regular',
        postScriptName: 'Roboto-Regular',
        family: 'Roboto',
        weight: 'normal',
        style: 'normal',
        encoding: "StandardEncoding",
        compression: "none",
        supportedLanguages: ["polish", "english", "german"],
        // Przykładowy słownik znaków dla podstawowych polskich liter
        widths: {
          0: 600, // domyślna szerokość
          'a': 500, 'ą': 500,
          'c': 480, 'ć': 480,
          'e': 480, 'ę': 480,
          'l': 240, 'ł': 240,
          'n': 520, 'ń': 520,
          'o': 520, 'ó': 520,
          's': 480, 'ś': 480,
          'z': 480, 'ź': 480, 'ż': 480,
          'A': 580, 'Ą': 580,
          'C': 620, 'Ć': 620,
          'E': 580, 'Ę': 580,
          'L': 500, 'Ł': 500,
          'N': 680, 'Ń': 680,
          'O': 680, 'Ó': 680,
          'S': 620, 'Ś': 620,
          'Z': 580, 'Ź': 580, 'Ż': 580
        }
      }
    };

    if (typeof global.jsPDF === 'undefined') {
      if (typeof window === 'undefined') {
        console.error('Nie można znaleźć globalnego obiektu jsPDF - czcionka nie zostanie załadowana');
        return;
      }
      global = window;
      if (typeof global.jsPDF === 'undefined') {
        console.error('Nie można znaleźć globalnego obiektu jsPDF - czcionka nie zostanie załadowana');
        return;
      }
    }

    if (typeof global.jsPDF.API === 'undefined') {
      console.error('Nie można znaleźć API jsPDF - czcionka nie zostanie załadowana');
      return;
    }

    var API = global.jsPDF.API;
    if (typeof API.events === 'undefined') {
      API.events = {};
    }

    // Dodaj obsługę polskich znaków
    API.events.push([
      'addFonts',
      function addFonts() {
        var fontNormal = this.internal.getFont('Roboto-Regular', 'normal');
        if (fontNormal) {
          // Już dodano czcionkę
          return;
        }
        
        // Dodaj czcionkę do dokumentu
        this.addFileToVFS('Roboto-Regular.ttf', 'data:font/ttf;base64,AAAAB...');
        this.addFont('Roboto-Regular.ttf', 'Roboto-Regular', 'normal');
        console.log('Dodano czcionkę Roboto Regular z obsługą polskich znaków');
      }
    ]);

    return font;
  })();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Roboto;
  } else {
    global.Roboto = Roboto;
  }
})(typeof self !== 'undefined' && self || typeof window !== 'undefined' && window || typeof global !== 'undefined' && global || Function('return typeof this === "object" && this.content')() || Function('return this')());

// W rzeczywistości potrzebny byłby pełny zakodowany font w base64 tutaj
// Ten plik jest uproszczony dla celów przykładowych 