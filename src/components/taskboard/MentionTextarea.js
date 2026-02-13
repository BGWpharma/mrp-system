// src/components/taskboard/MentionTextarea.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Popper,
  ClickAwayListener,
  TextField,
  InputAdornment,
  FormLabel
} from '@mui/material';
import FactoryIcon from '@mui/icons-material/Factory';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  MENTION_TYPES, 
  searchDocumentsByType, 
  createMentionString,
  parseMentions,
  getMentionUrl
} from '../../services/mentionService';

// Ikony dla typów dokumentów
const TYPE_ICONS = {
  MO: FactoryIcon,
  CO: ShoppingCartIcon,
  PO: LocalShippingIcon,
  BATCH: InventoryIcon
};

const MentionTextarea = ({ 
  value, 
  onChange, 
  label, 
  placeholder,
  rows = 4,
  ...props 
}) => {
  const { t, i18n } = useTranslation('taskboard');
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStep, setMenuStep] = useState('type'); // 'type' | 'search'
  const [selectedType, setSelectedType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isPl = i18n.language === 'pl';

  // Konwertuj wartość na HTML do wyświetlenia
  const valueToHtml = useCallback((text) => {
    if (!text) return '';
    
    const mentions = parseMentions(text);
    if (mentions.length === 0) {
      return escapeHtml(text).replace(/\n/g, '<br>');
    }

    let html = '';
    let lastIndex = 0;

    mentions.forEach((mention) => {
      // Tekst przed mention
      if (mention.index > lastIndex) {
        html += escapeHtml(text.slice(lastIndex, mention.index)).replace(/\n/g, '<br>');
      }

      // Mention jako span z data attributes
      const typeConfig = MENTION_TYPES[mention.type];
      html += `<span 
        class="mention-chip" 
        data-mention-type="${mention.type}" 
        data-mention-number="${mention.number}" 
        data-mention-id="${mention.id}"
        data-mention-full="${mention.fullMatch}"
        contenteditable="false"
        style="
          display: inline-flex;
          align-items: center;
          background-color: ${typeConfig?.color || '#666'};
          color: #fff;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 500;
          margin: 0 2px;
          cursor: pointer;
          user-select: none;
        "
      >${mention.type}:${mention.number}</span>`;

      lastIndex = mention.index + mention.fullMatch.length;
    });

    // Tekst po ostatnim mention
    if (lastIndex < text.length) {
      html += escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br>');
    }

    return html;
  }, []);

  // Escape HTML special characters
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Konwertuj HTML z edytora z powrotem na tekst z mentions
  const htmlToValue = useCallback((html) => {
    if (!html) return '';
    
    // Stwórz tymczasowy element do parsowania
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Zamień mention chipy na ich format tekstowy
    const mentionChips = temp.querySelectorAll('.mention-chip');
    mentionChips.forEach(chip => {
      const fullMatch = chip.getAttribute('data-mention-full');
      if (fullMatch) {
        chip.replaceWith(fullMatch);
      }
    });
    
    // Zamień <br> na newline
    temp.innerHTML = temp.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    
    // Pobierz tekst
    return temp.textContent || '';
  }, []);

  // Ustaw początkową wartość
  useEffect(() => {
    if (editorRef.current && !isFocused) {
      const html = valueToHtml(value);
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html;
      }
    }
  }, [value, valueToHtml, isFocused]);

  // Obsługa wpisywania
  const handleInput = (e) => {
    const html = e.target.innerHTML;
    const newValue = htmlToValue(html);
    onChange(newValue);
  };

  // Pomocnicza funkcja: znajdź chip sąsiadujący z kursorem
  const getAdjacentChip = (direction) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const { startContainer, startOffset } = range;

    // Kursor jest bezpośrednio w editorze (między węzłami potomnymi)
    if (startContainer === editorRef.current) {
      const children = Array.from(editorRef.current.childNodes);
      if (direction === 'before' && startOffset > 0) {
        const prev = children[startOffset - 1];
        if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.classList?.contains('mention-chip')) {
          return prev;
        }
      }
      if (direction === 'after' && startOffset < children.length) {
        const next = children[startOffset];
        if (next && next.nodeType === Node.ELEMENT_NODE && next.classList?.contains('mention-chip')) {
          return next;
        }
      }
      return null;
    }

    // Kursor jest w węźle tekstowym
    if (startContainer.nodeType === Node.TEXT_NODE) {
      if (direction === 'before' && startOffset === 0) {
        // Kursor na początku tekstu – sprawdź poprzedni sibling
        let prev = startContainer.previousSibling;
        if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.classList?.contains('mention-chip')) {
          return prev;
        }
      }
      if (direction === 'after' && startOffset === startContainer.textContent.length) {
        // Kursor na końcu tekstu – sprawdź następny sibling
        let next = startContainer.nextSibling;
        if (next && next.nodeType === Node.ELEMENT_NODE && next.classList?.contains('mention-chip')) {
          return next;
        }
      }
    }

    return null;
  };

  // Usuń chip i zaktualizuj wartość
  const removeChip = (chip) => {
    if (!chip || !editorRef.current) return;
    chip.remove();
    const newValue = htmlToValue(editorRef.current.innerHTML);
    onChange(newValue);
  };

  // Obsługa klawiszy
  const handleKeyDown = (e) => {
    if (menuOpen) {
      if (e.key === 'Escape') {
        closeMenu();
        e.preventDefault();
        return;
      }
    }

    // Obsługa usuwania chipów Backspace / Delete
    if (e.key === 'Backspace') {
      const chip = getAdjacentChip('before');
      if (chip) {
        e.preventDefault();
        removeChip(chip);
        return;
      }
    }

    if (e.key === 'Delete') {
      const chip = getAdjacentChip('after');
      if (chip) {
        e.preventDefault();
        removeChip(chip);
        return;
      }
    }

    // Wykryj "@"
    if (e.key === '@') {
      // Sprawdź czy przed kursorem jest spacja lub początek
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) || '';
        const lastChar = textBefore[textBefore.length - 1];
        
        if (!lastChar || /\s/.test(lastChar)) {
          // Otwórz menu po krótkim opóźnieniu (żeby "@" zostało wpisane)
          setTimeout(() => {
            setAnchorEl(editorRef.current);
            setMenuOpen(true);
            setMenuStep('type');
            setSelectedType(null);
            setSearchTerm('');
            setSearchResults([]);
          }, 10);
        }
      }
    }
  };

  // Zamknij menu
  const closeMenu = () => {
    setMenuOpen(false);
    setMenuStep('type');
    setSelectedType(null);
    setSearchTerm('');
    setSearchResults([]);
  };

  // Wybierz typ dokumentu
  const handleSelectType = async (type) => {
    setSelectedType(type);
    setMenuStep('search');
    setSearchTerm('');
    
    setLoading(true);
    try {
      const results = await searchDocumentsByType(type, '', 10);
      setSearchResults(results);
    } catch (error) {
      console.error('Błąd wyszukiwania:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Wyszukaj dokumenty
  const handleSearch = async (term) => {
    if (!selectedType) return;
    
    setLoading(true);
    try {
      const results = await searchDocumentsByType(selectedType, term, 15);
      setSearchResults(results);
    } catch (error) {
      console.error('Błąd wyszukiwania:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounce dla wyszukiwania
  useEffect(() => {
    if (menuStep !== 'search' || !selectedType) return;
    
    const timeoutId = setTimeout(() => {
      handleSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedType, menuStep]);

  // Wybierz dokument i wstaw mention
  const handleSelectDocument = (doc) => {
    if (!editorRef.current) return;
    
    // Znajdź i usuń "@" przed kursorem
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      // Szukaj "@" w tekście i usuń go
      const html = editorRef.current.innerHTML;
      // Usuń ostatnie "@" które nie jest częścią mention
      const newHtml = html.replace(/@(?![^\[]*\])(?=[^@]*$)/, '');
      editorRef.current.innerHTML = newHtml;
    }
    
    // Wstaw mention
    const mentionString = createMentionString(doc.type, doc.number, doc.id);
    const typeConfig = MENTION_TYPES[doc.type];
    
    const mentionHtml = `<span 
      class="mention-chip" 
      data-mention-type="${doc.type}" 
      data-mention-number="${doc.number}" 
      data-mention-id="${doc.id}"
      data-mention-full="${mentionString}"
      contenteditable="false"
      style="
        display: inline-flex;
        align-items: center;
        background-color: ${typeConfig?.color || '#666'};
        color: #fff;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 500;
        margin: 0 2px;
        cursor: pointer;
        user-select: none;
      "
    >${doc.type}:${doc.number}</span>&nbsp;`;
    
    // Wstaw na końcu (lub w miejscu kursora)
    editorRef.current.innerHTML += mentionHtml;
    
    // Aktualizuj wartość
    const newValue = htmlToValue(editorRef.current.innerHTML);
    onChange(newValue);
    
    closeMenu();
    
    // Ustaw kursor na końcu
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 0);
  };

  // Obsługa kliknięcia w mention chip
  const handleEditorClick = (e) => {
    const chip = e.target.closest('.mention-chip');
    if (chip) {
      e.preventDefault();
      const type = chip.getAttribute('data-mention-type');
      const id = chip.getAttribute('data-mention-id');
      const url = getMentionUrl(type, id);
      navigate(url);
    }
  };

  const minHeight = rows * 24;

  return (
    <Box>
      {label && (
        <FormLabel 
          sx={{ 
            display: 'block', 
            mb: 0.5, 
            fontSize: '0.75rem',
            color: isFocused ? 'primary.main' : 'text.secondary'
          }}
        >
          {label}
        </FormLabel>
      )}
      
      <Box
        sx={(theme) => ({
          position: 'relative',
          border: '1px solid',
          borderColor: isFocused 
            ? theme.palette.primary.main 
            : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)'),
          borderRadius: 1,
          transition: 'border-color 0.2s',
          '&:hover': {
            borderColor: isFocused 
              ? theme.palette.primary.main 
              : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)')
          }
        })}
      >
        <Box
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={handleEditorClick}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          data-placeholder={placeholder}
          sx={{
            minHeight: minHeight,
            maxHeight: 300,
            overflow: 'auto',
            p: 1.5,
            fontSize: '0.875rem',
            lineHeight: 1.6,
            outline: 'none',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            '&:empty:before': {
              content: 'attr(data-placeholder)',
              color: 'text.disabled',
              pointerEvents: 'none'
            },
            '& .mention-chip:hover': {
              filter: 'brightness(1.15)',
              transform: 'scale(1.02)'
            }
          }}
        />
        
        <Typography 
          variant="caption" 
          color="text.secondary"
          sx={{
            position: 'absolute',
            bottom: 4,
            right: 8,
            fontSize: '0.65rem',
            opacity: 0.6
          }}
        >
          @ {t('mentionHint')}
        </Typography>
      </Box>

      {/* Popup z wyborem */}
      <Popper
        open={menuOpen}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1400 }}
      >
        <ClickAwayListener onClickAway={closeMenu}>
          <Paper
            elevation={8}
            sx={{
              width: 320,
              maxHeight: 400,
              overflow: 'auto',
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              mt: 1
            }}
          >
            {menuStep === 'type' ? (
              <Box>
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('selectDocumentType')}
                  </Typography>
                </Box>
                <List dense disablePadding>
                  {Object.entries(MENTION_TYPES).map(([key, config]) => {
                    const IconComponent = TYPE_ICONS[key];
                    return (
                      <ListItem key={key} disablePadding>
                        <ListItemButton onClick={() => handleSelectType(key)}>
                          <ListItemIcon sx={{ minWidth: 40 }}>
                            <Box
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: 1,
                                bgcolor: config.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <IconComponent sx={{ fontSize: 18, color: '#fff' }} />
                            </Box>
                          </ListItemIcon>
                          <ListItemText 
                            primary={isPl ? config.label : config.labelEn}
                            secondary={config.prefix}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            ) : (
              <Box>
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Chip
                      size="small"
                      label={MENTION_TYPES[selectedType]?.prefix}
                      sx={{ 
                        bgcolor: MENTION_TYPES[selectedType]?.color,
                        color: '#fff'
                      }}
                    />
                    <Typography variant="subtitle2">
                      {isPl ? MENTION_TYPES[selectedType]?.label : MENTION_TYPES[selectedType]?.labelEn}
                    </Typography>
                  </Box>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder={t('searchDocument')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                        </InputAdornment>
                      )
                    }}
                  />
                </Box>

                {loading ? (
                  <Box display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={24} />
                  </Box>
                ) : searchResults.length === 0 ? (
                  <Box p={2} textAlign="center">
                    <Typography variant="body2" color="text.secondary">
                      {t('noResults')}
                    </Typography>
                  </Box>
                ) : (
                  <List dense disablePadding sx={{ maxHeight: 280, overflow: 'auto' }}>
                    {searchResults.map((doc) => (
                      <ListItem key={doc.id} disablePadding>
                        <ListItemButton onClick={() => handleSelectDocument(doc)}>
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="body2" fontWeight="bold">
                                  {doc.number}
                                </Typography>
                                {doc.status && (
                                  <Chip
                                    size="small"
                                    label={doc.status}
                                    sx={{ 
                                      height: 18,
                                      fontSize: '0.65rem',
                                      bgcolor: 'action.selected'
                                    }}
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {doc.name || '-'}
                              </Typography>
                            }
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            )}
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
};

export default MentionTextarea;
