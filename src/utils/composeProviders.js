import React from 'react';

/**
 * Komponuje wiele React Providerów w jeden komponent.
 * Przyjmuje providery jako argumenty — mogą być komponentami
 * lub tablicami [Komponent, props] jeśli provider wymaga props.
 * 
 * Zachowuje kolejność: pierwszy argument = najwyższy w drzewie.
 */
export const composeProviders = (...providers) => {
  const ComposedProviders = ({ children }) =>
    providers.reduceRight(
      (acc, Provider) =>
        Array.isArray(Provider)
          ? React.createElement(Provider[0], Provider[1], acc)
          : React.createElement(Provider, null, acc),
      children
    );
  ComposedProviders.displayName = 'ComposedProviders';
  return ComposedProviders;
};
