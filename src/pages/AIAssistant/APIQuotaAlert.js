import React from 'react';
import { 
  Paper,
  Typography,
  Box,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Alert
} from '@mui/material';
import {
  ErrorOutline as ErrorIcon,
  Info as InfoIcon,
  CheckCircleOutline as CheckIcon,
  Warning as WarningIcon,
  Payments as PaymentsIcon,
  ArrowForward as ArrowForwardIcon
} from '@mui/icons-material';

/**
 * Komponent wyświetlający szczegółowe informacje o błędzie przekroczenia limitu API OpenAI
 * oraz porady jak rozwiązać ten problem
 */
const APIQuotaAlert = () => {
  const handleOpenBillingPage = () => {
    window.open('https://platform.openai.com/account/billing', '_blank');
  };
  
  const handleOpenAPIDocsPage = () => {
    window.open('https://platform.openai.com/docs/guides/error-codes/api-errors', '_blank');
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ErrorIcon color="error" fontSize="large" />
        <Typography variant="h5" color="error.main">
          Przekroczono limit API OpenAI
        </Typography>
      </Box>
      
      <Alert severity="warning" sx={{ mb: 3 }}>
        System wykrył błąd związany z limitem lub wyczerpaniem środków na koncie OpenAI. 
        Aby kontynuować korzystanie z asystenta AI, konieczne jest uzupełnienie konta.
      </Alert>
      
      <Typography variant="body1" paragraph>
        Komunikat błędu <strong>"You exceeded your current quota"</strong> oznacza, że wystąpił jeden z poniższych problemów:
      </Typography>
      
      <List>
        <ListItem>
          <ListItemIcon>
            <WarningIcon color="warning" />
          </ListItemIcon>
          <ListItemText 
            primary="Wyczerpanie darmowego limitu" 
            secondary="Jeśli korzystasz z darmowego kredytu startowego, możliwe że został on wyczerpany."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <WarningIcon color="warning" />
          </ListItemIcon>
          <ListItemText 
            primary="Przekroczenie miesięcznego limitu wydatków" 
            secondary="Jeśli ustawiłeś limit wydatków na koncie OpenAI, możliwe że został on osiągnięty."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <WarningIcon color="warning" />
          </ListItemIcon>
          <ListItemText 
            primary="Problem z metodą płatności" 
            secondary="Jeśli wystąpił problem z metodą płatności, OpenAI mogło zawiesić dostęp do API."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <InfoIcon color="info" />
          </ListItemIcon>
          <ListItemText 
            primary="Błąd 429 (Too Many Requests)" 
            secondary="Zbyt wiele zapytań w krótkim czasie. W tym przypadku odczekaj kilka minut i spróbuj ponownie."
          />
        </ListItem>
      </List>
      
      <Divider sx={{ my: 2 }} />
      
      <Typography variant="h6" gutterBottom>
        Jak rozwiązać problem?
      </Typography>
      
      <List>
        <ListItem>
          <ListItemIcon>
            <CheckIcon color="success" />
          </ListItemIcon>
          <ListItemText 
            primary="Sprawdź stan konta i metody płatności" 
            secondary="Zaloguj się do panelu OpenAI i przejdź do sekcji rozliczeń, aby sprawdzić status swojego konta."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <CheckIcon color="success" />
          </ListItemIcon>
          <ListItemText 
            primary="Uzupełnij środki lub dodaj metodę płatności" 
            secondary="Upewnij się, że metoda płatności jest poprawna i aktywna. W razie potrzeby dodaj nowe środki."
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <CheckIcon color="success" />
          </ListItemIcon>
          <ListItemText 
            primary="Zwiększ miesięczny limit (jeśli dotyczy)" 
            secondary="Jeśli ustaliłeś miesięczny limit wydatków, rozważ jego zwiększenie w ustawieniach konta."
          />
        </ListItem>
      </List>
      
      <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'center' }}>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<PaymentsIcon />}
          onClick={handleOpenBillingPage}
        >
          Przejdź do rozliczeń OpenAI
        </Button>
        
        <Button 
          variant="outlined" 
          endIcon={<ArrowForwardIcon />}
          onClick={handleOpenAPIDocsPage}
        >
          Dokumentacja błędów API
        </Button>
      </Box>
      
      <Typography variant="caption" sx={{ display: 'block', mt: 3, textAlign: 'center', color: 'text.secondary' }}>
        Uwaga: Koszt korzystania z modelu GPT-4o jest wyższy niż w przypadku starszych modeli. 
        Jeśli chcesz zmniejszyć koszty, rozważ zmianę modelu w konfiguracji.
      </Typography>
    </Paper>
  );
};

export default APIQuotaAlert; 