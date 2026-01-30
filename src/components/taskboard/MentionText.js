// src/components/taskboard/MentionText.js
// Komponent do renderowania tekstu z mentions jako klikalnych chipów
import React from 'react';
import { Chip, Box } from '@mui/material';
import FactoryIcon from '@mui/icons-material/Factory';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import { useNavigate } from 'react-router-dom';
import { 
  MENTION_TYPES, 
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

/**
 * Renderuje tekst z mentions jako klikalne chipy
 * @param {string} text - Tekst do wyrenderowania
 * @param {string} variant - Wariant wyświetlania: 'full' | 'compact' | 'inline'
 * @param {boolean} truncate - Czy skracać tekst
 * @param {number} maxLength - Maksymalna długość tekstu (jeśli truncate=true)
 */
const MentionText = ({ 
  text, 
  variant = 'full', 
  truncate = false, 
  maxLength = 100,
  sx = {}
}) => {
  const navigate = useNavigate();

  if (!text) return null;

  const mentions = parseMentions(text);
  
  // Jeśli brak mentions, zwróć zwykły tekst
  if (mentions.length === 0) {
    const displayText = truncate && text.length > maxLength 
      ? text.slice(0, maxLength) + '...' 
      : text;
    
    return (
      <Box 
        component="span" 
        sx={{ 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-word',
          ...sx 
        }}
      >
        {displayText}
      </Box>
    );
  }

  // Parsuj tekst i wstaw chipy w miejsce mentions
  let lastIndex = 0;
  const elements = [];
  let currentLength = 0;
  let shouldTruncate = false;

  for (let i = 0; i < mentions.length; i++) {
    const mention = mentions[i];
    
    // Tekst przed mention
    if (mention.index > lastIndex) {
      let textSegment = text.slice(lastIndex, mention.index);
      
      // Sprawdź czy trzeba skrócić
      if (truncate && currentLength + textSegment.length > maxLength) {
        textSegment = textSegment.slice(0, maxLength - currentLength);
        shouldTruncate = true;
        
        if (textSegment) {
          elements.push(
            <span key={`text-${i}`}>{textSegment}...</span>
          );
        }
        break;
      }
      
      currentLength += textSegment.length;
      elements.push(
        <span key={`text-${i}`}>{textSegment}</span>
      );
    }

    // Sprawdź czy mention się mieści
    if (truncate && currentLength >= maxLength) {
      shouldTruncate = true;
      break;
    }

    // Mention jako chip
    const typeConfig = MENTION_TYPES[mention.type];
    const IconComponent = TYPE_ICONS[mention.type];
    
    const chipSize = variant === 'compact' || variant === 'inline' ? 'small' : 'small';
    const chipHeight = variant === 'inline' ? 18 : variant === 'compact' ? 20 : 24;
    const fontSize = variant === 'inline' ? '0.65rem' : variant === 'compact' ? '0.7rem' : '0.75rem';
    
    elements.push(
      <Chip
        key={`mention-${i}`}
        icon={IconComponent && variant !== 'inline' ? (
          <IconComponent sx={{ fontSize: variant === 'compact' ? 12 : 14 }} />
        ) : null}
        label={variant === 'inline' ? mention.number : `${mention.type}:${mention.number}`}
        size={chipSize}
        onClick={(e) => {
          e.stopPropagation();
          const url = getMentionUrl(mention.type, mention.id);
          navigate(url);
        }}
        sx={{
          height: chipHeight,
          backgroundColor: typeConfig?.color || '#666',
          color: '#fff',
          fontWeight: 500,
          cursor: 'pointer',
          mx: 0.25,
          verticalAlign: 'middle',
          fontSize: fontSize,
          '& .MuiChip-icon': {
            color: '#fff',
            ml: 0.5
          },
          '& .MuiChip-label': {
            px: variant === 'inline' ? 0.5 : 0.75
          },
          '&:hover': {
            filter: 'brightness(1.15)',
            transform: 'scale(1.02)'
          },
          transition: 'all 0.15s ease'
        }}
      />
    );

    // Dodaj długość mention do licznika (przybliżona)
    currentLength += mention.number.length + 5;
    lastIndex = mention.index + mention.fullMatch.length;
  }

  // Tekst po ostatnim mention
  if (!shouldTruncate && lastIndex < text.length) {
    let textSegment = text.slice(lastIndex);
    
    if (truncate && currentLength + textSegment.length > maxLength) {
      textSegment = textSegment.slice(0, maxLength - currentLength) + '...';
    }
    
    elements.push(
      <span key="text-end">{textSegment}</span>
    );
  }

  return (
    <Box 
      component="span" 
      sx={{ 
        display: 'inline',
        whiteSpace: 'pre-wrap', 
        wordBreak: 'break-word',
        lineHeight: variant === 'full' ? 1.8 : 1.6,
        ...sx 
      }}
    >
      {elements}
    </Box>
  );
};

export default MentionText;
