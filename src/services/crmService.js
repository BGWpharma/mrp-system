import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../services/firebase/config';

// Stałe kolekcji
export const CONTACTS_COLLECTION = 'crmContacts';
export const INTERACTIONS_COLLECTION = 'crmInteractions';
export const CAMPAIGNS_COLLECTION = 'crmCampaigns';
export const LEADS_COLLECTION = 'crmLeads';
export const OPPORTUNITIES_COLLECTION = 'crmOpportunities';

// Funkcje do zarządzania kontaktami
export const createContact = async (contactData, userId) => {
  try {
    const docRef = await addDoc(collection(db, CONTACTS_COLLECTION), {
      ...contactData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { id: docRef.id, ...contactData };
  } catch (error) {
    console.error('Błąd podczas tworzenia kontaktu:', error);
    throw error;
  }
};

export const updateContact = async (contactId, contactData, userId) => {
  try {
    const contactRef = doc(db, CONTACTS_COLLECTION, contactId);
    await updateDoc(contactRef, {
      ...contactData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    return { id: contactId, ...contactData };
  } catch (error) {
    console.error('Błąd podczas aktualizacji kontaktu:', error);
    throw error;
  }
};

export const deleteContact = async (contactId) => {
  try {
    await deleteDoc(doc(db, CONTACTS_COLLECTION, contactId));
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania kontaktu:', error);
    throw error;
  }
};

export const getContactById = async (contactId) => {
  try {
    const contactRef = doc(db, CONTACTS_COLLECTION, contactId);
    const contactDoc = await getDoc(contactRef);
    
    if (!contactDoc.exists()) {
      throw new Error('Kontakt nie istnieje');
    }
    
    return { id: contactDoc.id, ...contactDoc.data() };
  } catch (error) {
    console.error('Błąd podczas pobierania kontaktu:', error);
    throw error;
  }
};

export const getAllContacts = async () => {
  try {
    const contactsQuery = query(
      collection(db, CONTACTS_COLLECTION),
      orderBy('lastName')
    );
    
    const querySnapshot = await getDocs(contactsQuery);
    const contacts = [];
    
    querySnapshot.forEach((doc) => {
      contacts.push({ id: doc.id, ...doc.data() });
    });
    
    return contacts;
  } catch (error) {
    console.error('Błąd podczas pobierania kontaktów:', error);
    throw error;
  }
};

export const searchContacts = async (searchTerm) => {
  try {
    const contactsRef = collection(db, CONTACTS_COLLECTION);
    const querySnapshot = await getDocs(contactsRef);
    const contacts = [];
    
    querySnapshot.forEach((doc) => {
      const contact = doc.data();
      // Wyszukiwanie po imieniu, nazwisku, firmie lub adresie email
      if (
        contact.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.email?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        contacts.push({ id: doc.id, ...contact });
      }
    });
    
    return contacts;
  } catch (error) {
    console.error('Błąd podczas wyszukiwania kontaktów:', error);
    throw error;
  }
};

// Funkcje do zarządzania interakcjami
export const createInteraction = async (interactionData, userId) => {
  try {
    const docRef = await addDoc(collection(db, INTERACTIONS_COLLECTION), {
      ...interactionData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { id: docRef.id, ...interactionData };
  } catch (error) {
    console.error('Błąd podczas tworzenia interakcji:', error);
    throw error;
  }
};

export const updateInteraction = async (interactionId, interactionData, userId) => {
  try {
    const interactionRef = doc(db, INTERACTIONS_COLLECTION, interactionId);
    await updateDoc(interactionRef, {
      ...interactionData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    return { id: interactionId, ...interactionData };
  } catch (error) {
    console.error('Błąd podczas aktualizacji interakcji:', error);
    throw error;
  }
};

export const deleteInteraction = async (interactionId) => {
  try {
    await deleteDoc(doc(db, INTERACTIONS_COLLECTION, interactionId));
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania interakcji:', error);
    throw error;
  }
};

export const getInteractionById = async (interactionId) => {
  try {
    const interactionRef = doc(db, INTERACTIONS_COLLECTION, interactionId);
    const interactionDoc = await getDoc(interactionRef);
    
    if (!interactionDoc.exists()) {
      throw new Error('Interakcja nie istnieje');
    }
    
    return { id: interactionDoc.id, ...interactionDoc.data() };
  } catch (error) {
    console.error('Błąd podczas pobierania interakcji:', error);
    throw error;
  }
};

export const getContactInteractions = async (contactId) => {
  try {
    const interactionsQuery = query(
      collection(db, INTERACTIONS_COLLECTION),
      where('contactId', '==', contactId),
      orderBy('date', 'desc')
    );
    
    const querySnapshot = await getDocs(interactionsQuery);
    const interactions = [];
    
    querySnapshot.forEach((doc) => {
      interactions.push({ id: doc.id, ...doc.data() });
    });
    
    return interactions;
  } catch (error) {
    console.error('Błąd podczas pobierania interakcji:', error);
    throw error;
  }
};

// Pobieranie wszystkich interakcji
export const getAllInteractions = async () => {
  try {
    const interactionsQuery = query(
      collection(db, INTERACTIONS_COLLECTION),
      orderBy('date', 'desc')
    );
    
    const querySnapshot = await getDocs(interactionsQuery);
    const interactions = [];
    
    querySnapshot.forEach((doc) => {
      interactions.push({ id: doc.id, ...doc.data() });
    });
    
    return interactions;
  } catch (error) {
    console.error('Błąd podczas pobierania wszystkich interakcji:', error);
    throw error;
  }
};

// Funkcje do zarządzania potencjalnymi klientami (leads)
export const createLead = async (leadData, userId) => {
  try {
    const docRef = await addDoc(collection(db, LEADS_COLLECTION), {
      ...leadData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { id: docRef.id, ...leadData };
  } catch (error) {
    console.error('Błąd podczas tworzenia leada:', error);
    throw error;
  }
};

export const updateLead = async (leadId, leadData, userId) => {
  try {
    const leadRef = doc(db, LEADS_COLLECTION, leadId);
    await updateDoc(leadRef, {
      ...leadData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    return { id: leadId, ...leadData };
  } catch (error) {
    console.error('Błąd podczas aktualizacji leada:', error);
    throw error;
  }
};

export const deleteLead = async (leadId) => {
  try {
    await deleteDoc(doc(db, LEADS_COLLECTION, leadId));
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania leada:', error);
    throw error;
  }
};

export const getLeadById = async (leadId) => {
  try {
    const leadRef = doc(db, LEADS_COLLECTION, leadId);
    const leadDoc = await getDoc(leadRef);
    
    if (!leadDoc.exists()) {
      throw new Error('Lead nie istnieje');
    }
    
    return { id: leadDoc.id, ...leadDoc.data() };
  } catch (error) {
    console.error('Błąd podczas pobierania leada:', error);
    throw error;
  }
};

export const getAllLeads = async () => {
  try {
    const leadsQuery = query(
      collection(db, LEADS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(leadsQuery);
    const leads = [];
    
    querySnapshot.forEach((doc) => {
      leads.push({ id: doc.id, ...doc.data() });
    });
    
    return leads;
  } catch (error) {
    console.error('Błąd podczas pobierania leadów:', error);
    throw error;
  }
};

// Funkcje do zarządzania możliwościami sprzedaży (opportunities)
export const createOpportunity = async (opportunityData, userId) => {
  try {
    const docRef = await addDoc(collection(db, OPPORTUNITIES_COLLECTION), {
      ...opportunityData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { id: docRef.id, ...opportunityData };
  } catch (error) {
    console.error('Błąd podczas tworzenia szansy sprzedaży:', error);
    throw error;
  }
};

export const updateOpportunity = async (opportunityId, opportunityData, userId) => {
  try {
    const opportunityRef = doc(db, OPPORTUNITIES_COLLECTION, opportunityId);
    await updateDoc(opportunityRef, {
      ...opportunityData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    return { id: opportunityId, ...opportunityData };
  } catch (error) {
    console.error('Błąd podczas aktualizacji szansy sprzedaży:', error);
    throw error;
  }
};

export const deleteOpportunity = async (opportunityId) => {
  try {
    await deleteDoc(doc(db, OPPORTUNITIES_COLLECTION, opportunityId));
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania szansy sprzedaży:', error);
    throw error;
  }
};

export const getOpportunityById = async (opportunityId) => {
  try {
    const opportunityRef = doc(db, OPPORTUNITIES_COLLECTION, opportunityId);
    const opportunityDoc = await getDoc(opportunityRef);
    
    if (!opportunityDoc.exists()) {
      throw new Error('Szansa sprzedaży nie istnieje');
    }
    
    return { id: opportunityDoc.id, ...opportunityDoc.data() };
  } catch (error) {
    console.error('Błąd podczas pobierania szansy sprzedaży:', error);
    throw error;
  }
};

export const getAllOpportunities = async () => {
  try {
    const opportunitiesQuery = query(
      collection(db, OPPORTUNITIES_COLLECTION),
      orderBy('expectedCloseDate')
    );
    
    const querySnapshot = await getDocs(opportunitiesQuery);
    const opportunities = [];
    
    querySnapshot.forEach((doc) => {
      opportunities.push({ id: doc.id, ...doc.data() });
    });
    
    return opportunities;
  } catch (error) {
    console.error('Błąd podczas pobierania szans sprzedaży:', error);
    throw error;
  }
};

// Funkcje do zarządzania kampaniami marketingowymi
export const createCampaign = async (campaignData, userId) => {
  try {
    const docRef = await addDoc(collection(db, CAMPAIGNS_COLLECTION), {
      ...campaignData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { id: docRef.id, ...campaignData };
  } catch (error) {
    console.error('Błąd podczas tworzenia kampanii:', error);
    throw error;
  }
};

export const updateCampaign = async (campaignId, campaignData, userId) => {
  try {
    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, campaignId);
    await updateDoc(campaignRef, {
      ...campaignData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    return { id: campaignId, ...campaignData };
  } catch (error) {
    console.error('Błąd podczas aktualizacji kampanii:', error);
    throw error;
  }
};

export const deleteCampaign = async (campaignId) => {
  try {
    await deleteDoc(doc(db, CAMPAIGNS_COLLECTION, campaignId));
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania kampanii:', error);
    throw error;
  }
};

export const getCampaignById = async (campaignId) => {
  try {
    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, campaignId);
    const campaignDoc = await getDoc(campaignRef);
    
    if (!campaignDoc.exists()) {
      throw new Error('Kampania nie istnieje');
    }
    
    return { id: campaignDoc.id, ...campaignDoc.data() };
  } catch (error) {
    console.error('Błąd podczas pobierania kampanii:', error);
    throw error;
  }
};

export const getAllCampaigns = async () => {
  try {
    const campaignsQuery = query(
      collection(db, CAMPAIGNS_COLLECTION),
      orderBy('startDate', 'desc')
    );
    
    const querySnapshot = await getDocs(campaignsQuery);
    const campaigns = [];
    
    querySnapshot.forEach((doc) => {
      campaigns.push({ id: doc.id, ...doc.data() });
    });
    
    return campaigns;
  } catch (error) {
    console.error('Błąd podczas pobierania kampanii:', error);
    throw error;
  }
};

// Pobieranie aktywnych kampanii
export const getActiveCampaigns = async () => {
  try {
    const today = new Date();
    const campaignsQuery = query(
      collection(db, CAMPAIGNS_COLLECTION)
    );
    
    const querySnapshot = await getDocs(campaignsQuery);
    const campaigns = [];
    
    querySnapshot.forEach((doc) => {
      const campaign = doc.data();
      
      // Jeśli kampania ma datę zakończenia i dzisiejsza data jest przed datą zakończenia
      // lub kampania nie ma daty zakończenia, dodaj ją do listy aktywnych kampanii
      if (
        (!campaign.endDate) || 
        (campaign.endDate && new Date(campaign.endDate) >= today)
      ) {
        campaigns.push({ id: doc.id, ...campaign });
      }
    });
    
    return campaigns;
  } catch (error) {
    console.error('Błąd podczas pobierania aktywnych kampanii:', error);
    throw error;
  }
}; 