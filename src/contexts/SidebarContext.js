// src/contexts/SidebarContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// Tworzymy kontekst
export const SidebarContext = createContext();

// Customowy hook do używania kontekstu sidebara
export const useSidebar = () => useContext(SidebarContext);

export const SidebarProvider = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Ustaw domyślną wartość na true dla wszystkich urządzeń
  const [isOpen, setIsOpen] = useState(true);

  // Efekt ustawiający stan sidebara w zależności od rozmiaru ekranu
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false); // Domyślnie zamykaj sidebar na urządzeniach mobilnych (ale gdy się otworzy, to w pełnej wersji)
    } else {
      setIsOpen(true); // Otwieraj sidebar na większych ekranach
    }
  }, [isMobile]);

  // Funkcja do przełączania stanu sidebara
  const toggle = () => {
    setIsOpen(prevState => !prevState);
  };

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, isMobile }}>
      {children}
    </SidebarContext.Provider>
  );
};

export default SidebarProvider; 