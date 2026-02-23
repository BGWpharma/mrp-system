import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Grid, 
  Paper, 
  Typography, 
  Box, 
  Card, 
  CardContent, 
  CardHeader, 
  Divider, 
  List, 
  ListItem, 
  ListItemText,
  ListItemIcon,
  Button,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Badge,
  Chip
} from '@mui/material';
import { 
  People as PeopleIcon, 
  CallMade as CallMadeIcon, 
  MonetizationOn as MonetizationOnIcon, 
  Campaign as CampaignIcon,
  PersonAdd as PersonAddIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Event as EventIcon,
  ContactPhone as ContactPhoneIcon,
  MoreVert as MoreVertIcon,
  Add as AddIcon,
  EmojiEvents as EmojiEventsIcon,
  TrendingUp as TrendingUpIcon
} from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import { 
  getAllContacts, 
  getContactInteractions, 
  getActiveCampaigns, 
  getAllOpportunities 
} from '../../services/crmService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { OPPORTUNITY_STAGES } from '../../utils/constants';

const CRMDashboardPage = () => {
  const [contacts, setContacts] = useState([]);
  const [recentInteractions, setRecentInteractions] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalContacts: 0,
    newContactsThisMonth: 0,
    upcomingInteractions: 0,
    activeOpportunities: 0,
    opportunitiesValue: 0,
    activeCampaigns: 0,
    wonDealsThisMonth: 0
  });
  
  const { currentUser } = useAuth();
  const { showError } = useNotification();
  const { t } = useTranslation('interactions');
  const navigate = useNavigate();
  
  useEffect(() => {
    let cancelled = false;
    const fetchCRMData = async () => {
      try {
        setLoading(true);
        
        const [allContacts, activeCampaigns, allOpportunities] = await Promise.all([
          getAllContacts(),
          getActiveCampaigns(), 
          getAllOpportunities()
        ]);
        if (cancelled) return;

        setContacts(allContacts);
        setCampaigns(activeCampaigns);
        setOpportunities(allOpportunities);
        
        const interactionPromises = allContacts.slice(0, 5).map(contact => 
          getContactInteractions(contact.id).catch(err => {
            console.error(`Błąd pobierania interakcji dla kontaktu ${contact.id}:`, err);
            return [];
          })
        );
        
        const interactionResults = await Promise.all(interactionPromises);
        if (cancelled) return;
        let interactions = interactionResults.flat();
        
        interactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        setRecentInteractions(interactions.slice(0, 5));
        
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const newContactsThisMonth = allContacts.filter(contact => {
          return contact.createdAt && new Date(contact.createdAt.seconds * 1000) >= firstDayOfMonth;
        }).length;
        
        const upcomingInteractions = interactions.filter(interaction => {
          return interaction.date && new Date(interaction.date) > now && interaction.status !== 'Anulowane';
        }).length;
        
        const activeOpportunities = allOpportunities.filter(opp => 
          !opp.stage.includes('Zamknięte')
        );
        
        const opportunitiesValue = activeOpportunities.reduce((sum, opp) => 
          sum + (opp.amount || 0) * (opp.probability || 0) / 100, 0
        );
        
        const wonDealsThisMonth = allOpportunities.filter(opp => {
          const closeDate = opp.updatedAt ? new Date(opp.updatedAt.seconds * 1000) : null;
          return opp.stage === OPPORTUNITY_STAGES.CLOSED_WON && closeDate && closeDate >= firstDayOfMonth;
        }).length;
        
        setStats({
          totalContacts: allContacts.length,
          newContactsThisMonth,
          upcomingInteractions,
          activeOpportunities: activeOpportunities.length,
          opportunitiesValue,
          activeCampaigns: activeCampaigns.length,
          wonDealsThisMonth
        });
        
        setStatsLoading(false);
        console.log('✅ Dane CRM zostały załadowane równolegle');
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych CRM:', error);
        showError('Nie udało się pobrać danych CRM: ' + error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    fetchCRMData();
    return () => { cancelled = true; };
  }, [showError]);
  
  const formatDate = (dateString) => {
    if (!dateString) return '';
    let date;
    
    if (typeof dateString === 'object' && dateString.seconds) {
      // Convert Firestore Timestamp to Date
      date = new Date(dateString.seconds * 1000);
    } else {
      date = new Date(dateString);
    }
    
    return format(date, 'dd MMM yyyy, HH:mm', { locale: pl });
  };
  
  // Funkcja do renderowania odpowiedniej ikony dla typu interakcji
  const getInteractionIcon = (type) => {
    switch (type) {
      case 'Rozmowa telefoniczna':
        return <PhoneIcon color="primary" />;
      case 'E-mail':
        return <EmailIcon color="info" />;
      case 'Spotkanie':
        return <EventIcon color="success" />;
      default:
        return <ContactPhoneIcon />;
    }
  };
  
  // Funkcja do formatowania wartości pieniężnych
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pl-PL', { 
      style: 'currency', 
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  
  const getStatusColor = (stage) => {
    switch (stage) {
      case OPPORTUNITY_STAGES.NEGOTIATION:
        return 'warning';
      case OPPORTUNITY_STAGES.CLOSED_WON:
        return 'success';
      case OPPORTUNITY_STAGES.CLOSED_LOST:
        return 'error';
      default:
        return 'primary';
    }
  };
  
  const StatCard = ({ icon, title, value, loading, suffix = '', color = 'primary' }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <Box sx={{ 
              backgroundColor: `${color}.light`, 
              color: `${color}.main`,
              p: 1.5,
              borderRadius: 2
            }}>
              {icon}
            </Box>
          </Grid>
          <Grid item xs>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
            {loading ? (
              <CircularProgress size={20} />
            ) : (
              <Typography variant="h5" component="div" fontWeight="bold">
                {value}{suffix}
              </Typography>
            )}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
  
  return (
    <Container maxWidth="xl">
      <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h4" component="h1" gutterBottom>
          CRM Dashboard
        </Typography>
        <Box>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<PersonAddIcon />} 
            component={Link}
            to="/crm/contacts/new"
            sx={{ mr: 1 }}
          >
            Nowy kontakt
          </Button>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<AddIcon />}
            onClick={(e) => {
              const menu = document.getElementById('new-menu');
              menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
            }}
          >
            {t('common:common.add')}
          </Button>
          <Box 
            id="new-menu" 
            sx={{ 
              display: 'none', 
              position: 'absolute', 
              right: 20, 
              mt: 1, 
              zIndex: 10, 
              bgcolor: 'background.paper',
              boxShadow: 5,
              borderRadius: 1
            }}
          >
            <MenuItem 
              component={Link} 
              to="/crm/interactions/new"
            >
              Nowa interakcja
            </MenuItem>
            <MenuItem 
              component={Link} 
              to="/crm/opportunities/new"
            >
              Nowa szansa sprzedaży
            </MenuItem>
          </Box>
        </Box>
      </Box>
      
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<PeopleIcon />}
            title="Kontakty"
            value={stats.totalContacts}
            loading={statsLoading}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<CallMadeIcon />}
            title={t('dashboard.upcomingPurchaseInteractions')}
            value={stats.upcomingInteractions}
            loading={statsLoading}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<MonetizationOnIcon />}
            title={t('dashboard.salesOpportunities')}
            value={formatCurrency(stats.opportunitiesValue)}
            loading={statsLoading}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<EmojiEventsIcon />}
            title={t('dashboard.wonThisMonth')}
            value={stats.wonDealsThisMonth}
            loading={statsLoading}
            color="warning"
          />
        </Grid>
      </Grid>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader 
              title="Ostatnie interakcje zakupowe" 
              action={
                <Button 
                  component={Link} 
                  to="/crm/interactions"
                  size="small"
                >
                  Zobacz wszystkie
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {loading ? (
                <Box display="flex" justifyContent="center" p={2}>
                  <CircularProgress />
                </Box>
              ) : recentInteractions.length > 0 ? (
                <List>
                  {recentInteractions.map((interaction) => (
                    <ListItem 
                      key={interaction.id}
                      button
                      onClick={() => navigate(`/crm/interactions/${interaction.id}`)}
                      secondaryAction={
                        <Chip 
                          label={interaction.status} 
                          size="small" 
                          color={
                            interaction.status === 'Zakończone' ? 'success' : 
                            interaction.status === 'Anulowane' ? 'error' : 'primary'
                          }
                        />
                      }
                    >
                      <ListItemIcon>
                        {getInteractionIcon(interaction.type)}
                      </ListItemIcon>
                      <ListItemText 
                        primary={interaction.subject}
                        secondary={
                          <>
                            <Typography component="span" variant="body2" color="text.primary">
                              {interaction.contactName}
                            </Typography>
                            {` — ${formatDate(interaction.date)}`}
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" align="center" p={2}>
                  Brak ostatnich interakcji
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader 
              title={t('dashboard.currentSalesOpportunities')} 
              action={
                <Button 
                  component={Link} 
                  to="/crm/opportunities"
                  size="small"
                >
                  Zobacz wszystkie
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {loading ? (
                <Box display="flex" justifyContent="center" p={2}>
                  <CircularProgress />
                </Box>
              ) : opportunities.length > 0 ? (
                <List>
                  {opportunities
                    .filter(opp => !opp.stage.includes('Zamknięte'))
                    .slice(0, 5)
                    .map((opportunity) => (
                      <ListItem 
                        key={opportunity.id}
                        button
                        onClick={() => navigate(`/crm/opportunities/${opportunity.id}`)}
                        secondaryAction={
                          <Box display="flex" alignItems="center">
                            <Typography variant="body2" mr={1}>
                              {formatCurrency(opportunity.amount || 0)}
                            </Typography>
                            <Chip 
                              label={opportunity.stage} 
                              size="small" 
                              color={getStatusColor(opportunity.stage)}
                            />
                          </Box>
                        }
                      >
                        <ListItemIcon>
                          <TrendingUpIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={opportunity.name}
                          secondary={opportunity.contactName || 'Brak kontaktu'}
                        />
                      </ListItem>
                    ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" align="center" p={2}>
                  Brak aktywnych szans sprzedaży
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Aktywne kampanie" 
              action={
                <Button 
                  component={Link} 
                  to="/crm/campaigns"
                  size="small"
                >
                  Zobacz wszystkie
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {loading ? (
                <Box display="flex" justifyContent="center" p={2}>
                  <CircularProgress />
                </Box>
              ) : campaigns.length > 0 ? (
                <Grid container spacing={2}>
                  {campaigns.slice(0, 4).map((campaign) => (
                    <Grid item xs={12} sm={6} md={3} key={campaign.id}>
                      <Card variant="outlined">
                        <CardContent>
                          <Box display="flex" alignItems="center" mb={1}>
                            <CampaignIcon color="primary" sx={{ mr: 1 }} />
                            <Typography variant="subtitle1" component="div" noWrap>
                              {campaign.name}
                            </Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {campaign.type || 'Inna kampania'}
                          </Typography>
                          <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
                            <Chip 
                              label={campaign.status} 
                              size="small" 
                              color={campaign.status === 'Aktywna' ? 'success' : 'primary'} 
                            />
                            <Typography variant="body2">
                              {formatCurrency(campaign.budget || 0)}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography variant="body2" color="text.secondary" align="center" p={2}>
                  Brak aktywnych kampanii
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default CRMDashboardPage; 