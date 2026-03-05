import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  LinearProgress,
  Button,
  Menu,
  MenuItem
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import {
  translateStatus,
  translatePaymentStatus,
  KANBAN_COLUMN_COLORS,
  getAlowedTransitions
} from '../../../../services/purchaseOrders';
import { format, parseISO, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';

const safeFormatDate = (date, formatString = 'dd MMMM yyyy') => {
  if (!date) return 'Nie określono';
  try {
    let dateObj;
    if (date instanceof Date) dateObj = date;
    else if (typeof date === 'string') dateObj = parseISO(date);
    else if (date?.toDate) dateObj = date.toDate();
    else if (date?.seconds) dateObj = new Date(date.seconds * 1000);
    else return 'Nie określono';
    if (!isValid(dateObj)) return 'Nie określono';
    return format(dateObj, formatString, { locale: pl });
  } catch {
    return 'Nie określono';
  }
};

const formatCurrency = (value, currency = 'PLN') => {
  if (value == null) return '-';
  const symbols = { EUR: '€', USD: '$', PLN: 'zł', GBP: '£' };
  const num = Number(value);
  if (isNaN(num)) return '-';
  return `${num.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbols[currency] || currency}`;
};

const formatAddress = (address) => {
  if (!address) return 'Brak adresu';
  return [address.street, [address.postalCode, address.city].filter(Boolean).join(' '), address.country]
    .filter(Boolean)
    .join(', ');
};

const POModalDetailsTab = ({ purchaseOrder, userNames, onStatusChange, onRefresh }) => {
  const [statusMenuAnchor, setStatusMenuAnchor] = React.useState(null);
  const po = purchaseOrder;
  const supplier = po?.supplier;
  const mainAddress = supplier?.addresses?.find(a => a.isMain) || supplier?.addresses?.[0];
  const allowedTransitions = getAlowedTransitions(po?.status);

  const calculateVAT = () => {
    const items = po?.items || [];
    const additionalCosts = po?.additionalCostsItems || [];
    const globalDiscount = parseFloat(po?.globalDiscount || 0);

    let itemsNet = 0, itemsVat = 0;
    items.forEach(item => {
      const net = parseFloat(item.totalPrice) || 0;
      itemsNet += net;
      itemsVat += (net * (item.vatRate || 0)) / 100;
    });

    let addCostsNet = 0, addCostsVat = 0;
    additionalCosts.forEach(cost => {
      const net = parseFloat(cost.value) || 0;
      addCostsNet += net;
      addCostsVat += (net * (cost.vatRate || 0)) / 100;
    });

    const totalNet = itemsNet + addCostsNet;
    const totalVat = itemsVat + addCostsVat;
    const totalGross = totalNet + totalVat;
    const discountMultiplier = (100 - globalDiscount) / 100;

    return {
      itemsNet,
      addCostsNet,
      totalNet: totalNet * discountMultiplier,
      totalVat: totalVat * discountMultiplier,
      totalGross: totalGross * discountMultiplier,
      discount: globalDiscount
    };
  };

  const vat = calculateVAT();
  const currency = po?.currency || 'EUR';

  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Dane zamówienia</Typography>

            <Grid container spacing={1.5}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Numer</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{po?.number}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={translateStatus(po?.status)}
                    size="small"
                    sx={{ bgcolor: KANBAN_COLUMN_COLORS[po?.status] || '#9E9E9E', color: '#fff' }}
                  />
                  {allowedTransitions.length > 0 && (
                    <>
                      <Button
                        size="small"
                        variant="text"
                        onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
                        sx={{ minWidth: 'auto', fontSize: '0.7rem', textTransform: 'none' }}
                      >
                        Zmień
                      </Button>
                      <Menu
                        anchorEl={statusMenuAnchor}
                        open={Boolean(statusMenuAnchor)}
                        onClose={() => setStatusMenuAnchor(null)}
                      >
                        {allowedTransitions.map(status => (
                          <MenuItem
                            key={status}
                            onClick={() => { setStatusMenuAnchor(null); onStatusChange(status); }}
                          >
                            <Chip
                              label={translateStatus(status)}
                              size="small"
                              sx={{ bgcolor: KANBAN_COLUMN_COLORS[status], color: '#fff', mr: 1 }}
                            />
                          </MenuItem>
                        ))}
                      </Menu>
                    </>
                  )}
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Status płatności</Typography>
                <Typography variant="body2">{translatePaymentStatus(po?.paymentStatus)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Waluta</Typography>
                <Typography variant="body2">{currency}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">Data zamówienia</Typography>
                </Box>
                <Typography variant="body2">{safeFormatDate(po?.orderDate)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LocalShippingIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">Planowana dostawa</Typography>
                </Box>
                <Typography variant="body2">{safeFormatDate(po?.expectedDeliveryDate)}</Typography>
              </Grid>
              {po?.incoterms && (
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Incoterms</Typography>
                  <Typography variant="body2">{po.incoterms}</Typography>
                </Grid>
              )}
              {po?.deliveryAddress && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Adres dostawy</Typography>
                  <Typography variant="body2">{po.deliveryAddress}</Typography>
                </Grid>
              )}
              {po?.notes && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Uwagi</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{po.notes}</Typography>
                </Grid>
              )}
            </Grid>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Podsumowanie kosztów</Typography>
            <Grid container spacing={1}>
              <Grid item xs={8}><Typography variant="body2">Pozycje netto</Typography></Grid>
              <Grid item xs={4}><Typography variant="body2" align="right">{formatCurrency(vat.itemsNet, currency)}</Typography></Grid>

              {vat.addCostsNet > 0 && (
                <>
                  <Grid item xs={8}><Typography variant="body2">Koszty dodatkowe netto</Typography></Grid>
                  <Grid item xs={4}><Typography variant="body2" align="right">{formatCurrency(vat.addCostsNet, currency)}</Typography></Grid>
                </>
              )}

              {vat.discount > 0 && (
                <>
                  <Grid item xs={8}><Typography variant="body2" color="error">Rabat globalny ({vat.discount}%)</Typography></Grid>
                  <Grid item xs={4}><Typography variant="body2" align="right" color="error">-</Typography></Grid>
                </>
              )}

              <Grid item xs={12}><Divider sx={{ my: 0.5 }} /></Grid>

              <Grid item xs={8}><Typography variant="body2">Netto</Typography></Grid>
              <Grid item xs={4}><Typography variant="body2" align="right">{formatCurrency(vat.totalNet, currency)}</Typography></Grid>

              <Grid item xs={8}><Typography variant="body2">VAT</Typography></Grid>
              <Grid item xs={4}><Typography variant="body2" align="right">{formatCurrency(vat.totalVat, currency)}</Typography></Grid>

              <Grid item xs={12}><Divider sx={{ my: 0.5 }} /></Grid>

              <Grid item xs={8}><Typography variant="body1" sx={{ fontWeight: 700 }}>Brutto</Typography></Grid>
              <Grid item xs={4}><Typography variant="body1" align="right" sx={{ fontWeight: 700 }}>{formatCurrency(vat.totalGross, currency)}</Typography></Grid>
            </Grid>

            {po?.totalPaidFromInvoices != null && vat.totalGross > 0 && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Wpłacono z faktur</Typography>
                  <Typography variant="caption">
                    {formatCurrency(po.totalPaidFromInvoices, currency)} ({Math.min(100, Math.round((po.totalPaidFromInvoices / vat.totalGross) * 100))}%)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (po.totalPaidFromInvoices / vat.totalGross) * 100)}
                  sx={{ height: 5, borderRadius: 3 }}
                />
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Dostawca</Typography>
            {supplier ? (
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>{supplier.name}</Typography>
                {supplier.contactPerson && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <PersonIcon sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2">{supplier.contactPerson}</Typography>
                  </Box>
                )}
                {mainAddress && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5 }}>
                    <LocationOnIcon sx={{ mr: 1, fontSize: 16, mt: 0.3, color: 'text.secondary' }} />
                    <Typography variant="body2">{formatAddress(mainAddress)}</Typography>
                  </Box>
                )}
                {supplier.email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <EmailIcon sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" component="a" href={`mailto:${supplier.email}`} sx={{ color: 'primary.main' }}>
                      {supplier.email}
                    </Typography>
                  </Box>
                )}
                {supplier.phone && (
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <PhoneIcon sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" component="a" href={`tel:${supplier.phone}`} sx={{ color: 'primary.main' }}>
                      {supplier.phone}
                    </Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">Brak danych dostawcy</Typography>
            )}
          </Paper>

          {po?.statusHistory?.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>Historia statusów</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>Data</TableCell>
                    <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>Z</TableCell>
                    <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>Na</TableCell>
                    <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>Kto</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...po.statusHistory].reverse().slice(0, 10).map((change, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>
                        {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : '-'}
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Chip label={translateStatus(change.oldStatus)} size="small"
                          sx={{ fontSize: '0.65rem', height: 20, bgcolor: KANBAN_COLUMN_COLORS[change.oldStatus], color: '#fff' }} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Chip label={translateStatus(change.newStatus)} size="small"
                          sx={{ fontSize: '0.65rem', height: 20, bgcolor: KANBAN_COLUMN_COLORS[change.newStatus], color: '#fff' }} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>
                        {userNames[change.changedBy] || change.changedBy || 'System'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default POModalDetailsTab;
