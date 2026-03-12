import { getUsersDisplayNames } from '../services/userService';
import { getInvoicesByOrderId } from '../services/finance';
import { getCmrDocumentsByOrderId } from '../services/logistics';

const orderCache = new Map();
const defaultCacheTTL = 5 * 60 * 1000; // 5 minut

export const getCacheKey = (type, id) => `${type}_${id}`;

export const getCachedData = (key, ttl = defaultCacheTTL) => {
  const cached = orderCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < ttl) {
    return cached.data;
  }
  return null;
};

export const setCachedData = (key, data) => {
  orderCache.set(key, {
    data,
    timestamp: Date.now()
  });
};

export const invalidateCache = (pattern) => {
  const keysToDelete = [];
  orderCache.forEach((_, key) => {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => {
    orderCache.delete(key);
  });
};

export const getCachedUserNames = async (userIds) => {
  if (!userIds?.length) return {};
  
  const cacheKey = getCacheKey('userNames', userIds.sort().join(','));
  const cached = getCachedData(cacheKey, 10 * 60 * 1000);
  
  if (cached) return cached;
  
  const data = await getUsersDisplayNames(userIds);
  setCachedData(cacheKey, data);
  return data;
};

export const getCachedOrderInvoices = async (orderId) => {
  const cacheKey = getCacheKey('orderInvoices', orderId);
  const cached = getCachedData(cacheKey, 2 * 60 * 1000);
  
  if (cached) return cached;
  
  const data = await getInvoicesByOrderId(orderId);
  setCachedData(cacheKey, data);
  return data;
};

export const getCachedOrderCmrDocuments = async (orderId) => {
  const cacheKey = getCacheKey('orderCmr', orderId);
  const cached = getCachedData(cacheKey, 2 * 60 * 1000);
  
  if (cached) return cached;
  
  const data = await getCmrDocumentsByOrderId(orderId);
  setCachedData(cacheKey, data);
  return data;
};
