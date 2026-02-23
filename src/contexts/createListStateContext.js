import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';

const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

/**
 * Generic factory for list-state contexts with localStorage persistence
 * and guaranteed memoization of actions and context value.
 *
 * @param {Object} config
 * @param {string} config.name
 * @param {string} config.storageKey
 * @param {Object} config.initialState
 * @param {Object} config.actionTypes — must include LOAD_STATE
 * @param {Function} config.reducerCases — (state, action) => newState (pure, no side-effects)
 * @param {Function} config.createActions — (dispatch, actionTypes) => actions object
 * @param {{ serialize?: Function, deserialize?: Function }} [config.serialization]
 * @param {number} [config.maxAge=86400000]
 */
export function createListStateContext(config) {
  const {
    name,
    storageKey,
    initialState,
    actionTypes,
    reducerCases,
    createActions,
    serialization,
    maxAge = DEFAULT_MAX_AGE,
  } = config;

  const Context = createContext();

  const reducer = (state, action) => {
    const newState = reducerCases(state, action);

    if (action.type !== actionTypes.LOAD_STATE) {
      try {
        const toSave = serialization?.serialize
          ? serialization.serialize(newState)
          : newState;
        localStorage.setItem(storageKey, JSON.stringify(toSave));
      } catch (err) {
        console.warn(`Nie można zapisać stanu ${name} do localStorage:`, err);
      }
    }

    return newState;
  };

  const Provider = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, initialState);

    useEffect(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;

        let parsed = JSON.parse(raw);
        const isValid =
          parsed.lastUpdated && Date.now() - parsed.lastUpdated < maxAge;

        if (isValid) {
          if (serialization?.deserialize) {
            parsed = serialization.deserialize(parsed);
          }
          dispatch({ type: actionTypes.LOAD_STATE, payload: parsed });
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (err) {
        console.warn(
          `Błąd ładowania stanu ${name} z localStorage:`,
          err,
        );
        localStorage.removeItem(storageKey);
      }
    }, []);

    const actions = useMemo(
      () => createActions(dispatch, actionTypes),
      [dispatch],
    );

    const contextValue = useMemo(() => ({ state, actions }), [state, actions]);

    return (
      <Context.Provider value={contextValue}>{children}</Context.Provider>
    );
  };

  Provider.displayName = `${name}ListStateProvider`;

  const useListState = () => {
    const context = useContext(Context);
    if (!context) {
      throw new Error(
        `use${name}ListState musi być używany wewnątrz ${name}ListStateProvider`,
      );
    }
    return context;
  };

  return { Context, Provider, useListState };
}
