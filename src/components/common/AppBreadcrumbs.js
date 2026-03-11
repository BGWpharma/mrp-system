import React from 'react';
import { Breadcrumbs as MuiBreadcrumbs, Link, Typography, Box } from '@mui/material';
import { Home as HomeIcon, NavigateNext as NavigateNextIcon } from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';

const ROUTE_LABELS = {
  'analytics': 'Analityka',
  'financial-report': 'Raport finansowy',
  'production-time': 'Czas produkcji',
  'mo-consumption': 'Zużycie MO',
  'production-costs': 'Koszty produkcji',
  'cashflow': 'Cashflow',
  'eco-report': 'Raport ekologiczny',
  'weekly-sprint': 'Sprint tygodniowy',
  'admin': 'Administracja',
  'users': 'Użytkownicy',
  'system': 'System',
  'bug-reports': 'Zgłoszenia błędów',
  'recipes': 'Receptury',
  'new': 'Nowy',
  'edit': 'Edycja',
  'production': 'Produkcja',
  'new-task': 'Nowe zadanie',
  'timeline': 'Oś czasu',
  'calculator': 'Kalkulator',
  'forecast': 'Prognoza',
  'forms': 'Formularze',
  'completed-mo': 'Zakończone MO',
  'production-control': 'Kontrola produkcji',
  'production-shift': 'Zmiana produkcyjna',
  'responses': 'Odpowiedzi',
  'tasks': 'Zadania',
  'consumption': 'Zużycie',
  'reports': 'Raporty',
  'create-from-order': 'Z zamówienia',
  'workstations': 'Stanowiska',
  'inventory': 'Magazyn',
  'batches': 'Partie',
  'batch': 'Partia',
  'stocktaking': 'Inwentaryzacja',
  'cmr': 'CMR',
  'warehouses': 'Magazyny',
  'procurement-forecasts': 'Prognozy zakupów',
  'orders': 'Zamówienia',
  'customers': 'Klienci',
  'price-lists': 'Cenniki',
  'sales': 'Sprzedaż',
  'material-advances': 'Zaliczki materiałowe',
  'factory-costs': 'Koszty fabryczne',
  'quotation': 'Wycena',
  'invoices': 'Faktury',
  'company-settings': 'Dane firmy',
  'purchase-orders': 'Zamówienia zakupu',
  'suppliers': 'Dostawcy',
  'crm': 'CRM',
  'contacts': 'Kontakty',
  'interactions': 'Interakcje',
  'opportunities': 'Szanse sprzedaży',
  'hall-data': 'Dane hali',
  'conditions': 'Warunki',
  'machines': 'Maszyny',
  'taskboard': 'Tablica zadań',
  'ai-assistant': 'Asystent AI',
  'kiosk': 'Kiosk',
  'work-time': 'Czas pracy',
  'schedule': 'Harmonogram',
  'notifications': 'Powiadomienia',
  'history': 'Historia',
  'reinvoices': 'Refaktury',
};

const isIdSegment = (segment) => {
  if (segment.length >= 15) return true;
  if (/^[a-zA-Z0-9]{20,}$/.test(segment)) return true;
  return false;
};

const AppBreadcrumbs = () => {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);

  if (pathSegments.length === 0) return null;

  const crumbs = pathSegments.map((segment, index) => {
    const path = '/' + pathSegments.slice(0, index + 1).join('/');
    const isLast = index === pathSegments.length - 1;
    const label = ROUTE_LABELS[segment] || (isIdSegment(segment) ? 'Szczegóły' : segment);

    return { label, path, isLast };
  });

  return (
    <Box sx={{ mb: 1.5, mt: -0.5 }}>
      <MuiBreadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: 16 }} />}
        sx={{
          '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
          '& .MuiBreadcrumbs-li': { whiteSpace: 'nowrap' },
          fontSize: '0.8125rem',
        }}
      >
        <Link
          component={RouterLink}
          to="/"
          underline="hover"
          color="text.secondary"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 'inherit' }}
        >
          <HomeIcon sx={{ fontSize: 16 }} />
          Dashboard
        </Link>
        {crumbs.map((crumb) =>
          crumb.isLast ? (
            <Typography
              key={crumb.path}
              color="text.primary"
              sx={{ fontSize: 'inherit', fontWeight: 500 }}
            >
              {crumb.label}
            </Typography>
          ) : (
            <Link
              key={crumb.path}
              component={RouterLink}
              to={crumb.path}
              underline="hover"
              color="text.secondary"
              sx={{ fontSize: 'inherit' }}
            >
              {crumb.label}
            </Link>
          )
        )}
      </MuiBreadcrumbs>
    </Box>
  );
};

export default AppBreadcrumbs;
