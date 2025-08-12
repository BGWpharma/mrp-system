const fs = require('fs');
const path = require('path');

// Funkcja do automatycznego wykrywania namespace'ów z istniejących plików
const detectNamespaces = () => {
  const localesDir = 'src/i18n/locales/pl';
  if (!fs.existsSync(localesDir)) {
    return ['common']; // fallback
  }
  
  const files = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json') && file !== 'translation.json')
    .map(file => file.replace('.json', ''));
  
  return files.length > 0 ? files : ['common'];
};

module.exports = {
  input: [
    'src/**/*.{js,jsx}',
    '!src/**/*.test.{js,jsx}',
    '!src/i18n/**',
    '!**/node_modules/**',
    '!build/**',
    '!scripts/**'
  ],
  output: './',
  options: {
    debug: process.env.NODE_ENV === 'development',
    removeUnusedKeys: false,
    sort: true,
    func: {
      list: ['t', 'translate'],
      extensions: ['.js', '.jsx']
    },
    trans: {
      component: 'Trans',
      i18nKey: 'i18nKey',
      defaultsKey: 'defaults',
      extensions: ['.js', '.jsx'],
      fallbackKey: function(ns, value) {
        return value;
      }
    },
    lngs: ['pl', 'en'],
    ns: detectNamespaces(),
    defaultLng: 'pl',
    defaultNs: 'common',
    resource: {
      loadPath: 'src/i18n/locales/{{lng}}/{{ns}}.json',
      savePath: 'src/i18n/locales/{{lng}}/{{ns}}.json',
      jsonIndent: 2,
      lineEnding: '\n'
    },
    nsSeparator: ':',
    keySeparator: '.',
    // Konfiguracja interpolacji
    interpolation: {
      prefix: '{{',
      suffix: '}}'
    }
  },
  transform: function customTransform(file, enc, done) {
    'use strict';
    const parser = this.parser;
    const content = fs.readFileSync(file.path, enc);
    
    let count = 0;

    // Parsuj wywołania funkcji t() i translate()
    parser.parseFuncFromString(content, { list: ['t', 'translate'] }, (key, options) => {
      if (key) {
        // Określ namespace z klucza (jeśli używa separatora :)
        let namespace = options.defaultNs || 'common';
        let keyWithoutNs = key;
        
        if (key.includes(':')) {
          [namespace, keyWithoutNs] = key.split(':', 2);
        }
        
        parser.set(keyWithoutNs, Object.assign({}, options, {
          ns: namespace
        }));
        
        count++;
      }
    });

    if (count > 0) {
      console.log(`Znaleziono ${count} kluczy tłumaczeń w pliku: ${file.relative}`);
    }

    done();
  }
};
