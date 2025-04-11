import React from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText,
  Divider
} from '@mui/material';
import { 
  Numbers as NumbersIcon,
  Key as KeyIcon,
  Login as LoginIcon,
  Person as PersonIcon,
  Payments as PaymentsIcon,
  ArrowRight as ArrowRightIcon,
  Shield as ShieldIcon
} from '@mui/icons-material';

const ApiKeyInstructions = () => {
  return (
    <Paper sx={{ p: 3, mt: 4, mb: 4 }}>
      <Typography variant="h5" gutterBottom>
        Jak uzyskać klucz API OpenAI dla GPT-4o
      </Typography>
      
      <Divider sx={{ my: 2 }} />
      
      <Typography variant="body1" paragraph>
        Aby korzystać z zaawansowanych funkcji asystenta AI opartych na GPT-4o, potrzebujesz klucza API OpenAI.
        Poniżej znajdziesz instrukcje, jak go uzyskać:
      </Typography>
      
      <List>
        <ListItem>
          <ListItemIcon>
            <NumbersIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary="Krok 1: Utwórz konto OpenAI" 
            secondary="Odwiedź stronę https://platform.openai.com/signup i utwórz konto, jeśli jeszcze go nie masz."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <LoginIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary="Krok 2: Zaloguj się na swoje konto" 
            secondary="Przejdź do https://platform.openai.com/login i zaloguj się na swoje konto OpenAI."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <PersonIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary="Krok 3: Przejdź do panelu API" 
            secondary="Po zalogowaniu przejdź do sekcji API w panelu nawigacyjnym."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <PaymentsIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary="Krok 4: Dodaj metodę płatności" 
            secondary="Aby korzystać z API OpenAI, musisz dodać metodę płatności. OpenAI oferuje darmowy kredyt dla nowych użytkowników, ale po jego wyczerpaniu będziesz musiał płacić za użycie API."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <KeyIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary="Krok 5: Wygeneruj klucz API" 
            secondary="Przejdź do sekcji 'API keys' i kliknij 'Create new secret key'. Nadaj kluczowi nazwę opisową, np. 'MRP System'."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <ArrowRightIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary="Krok 6: Skopiuj i zapisz klucz API" 
            secondary="Skopiuj wygenerowany klucz API (zaczyna się od 'sk-'). UWAGA: Ten klucz będzie pokazany tylko raz, więc upewnij się, że go zapisałeś!"
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <ShieldIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary="Krok 7: Wprowadź klucz w ustawieniach asystenta" 
            secondary="Wklej skopiowany klucz API w polu 'Klucz API OpenAI' w ustawieniach asystenta AI."
          />
        </ListItem>
      </List>
      
      <Divider sx={{ my: 2 }} />
      
      <Box sx={{ mt: 2, bgcolor: 'info.light', p: 2, borderRadius: 1 }}>
        <Typography variant="subtitle1" sx={{ color: 'info.contrastText', mb: 1 }}>
          Ważne informacje:
        </Typography>
        <Typography variant="body2" sx={{ color: 'info.contrastText' }}>
          • Twój klucz API jest poufny - nie udostępniaj go nikomu.<br />
          • OpenAI pobiera opłaty za użycie API na podstawie liczby tokenów (jednostek tekstu) przetwarzanych przez model.<br />
          • Model GPT-4o jest najbardziej zaawansowanym modelem oferowanym przez OpenAI i może generować wyższe koszty niż inne modele.<br />
          • Możesz monitorować swoje zużycie i koszty w panelu OpenAI w sekcji "Usage".<br />
          • W każdej chwili możesz dezaktywować lub usunąć swój klucz API w panelu OpenAI.
        </Typography>
      </Box>
      
      <Typography variant="caption" display="block" sx={{ mt: 3, color: 'text.secondary' }}>
        Aktualne informacje i dokumentacja API są dostępne na stronie: 
        <a href="https://platform.openai.com/docs" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '4px' }}>
          https://platform.openai.com/docs
        </a>
      </Typography>
    </Paper>
  );
};

export default ApiKeyInstructions; 