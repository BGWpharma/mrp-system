// src/constants/routes.js
// Centralny plik ze stałymi tras - jedyne źródło prawdy dla ścieżek nawigacji

export const ROUTES = {
  // === Auth ===
  LOGIN: '/login',
  REGISTER: '/register',

  // === Dashboard ===
  HOME: '/',
  TASKBOARD: '/taskboard',
  BOARD_DETAIL: (boardId) => `/taskboard/${boardId}`,
  WORK_TIME: '/work-time',
  SCHEDULE: '/schedule',

  // === Analytics ===
  ANALYTICS: '/analytics',
  ANALYTICS_FINANCIAL_REPORT: '/analytics/financial-report',
  ANALYTICS_PRODUCTION_TIME: '/analytics/production-time',
  ANALYTICS_MO_CONSUMPTION: '/analytics/mo-consumption',
  ANALYTICS_PRODUCTION_PROGRESS: '/analytics/production-progress',
  ANALYTICS_PRODUCTION_COSTS: '/analytics/production-costs',
  ANALYTICS_CASHFLOW: '/analytics/cashflow',
  ANALYTICS_MIXING: '/analytics/mixing',
  ANALYTICS_ECO_REPORT: '/analytics/eco-report',

  // === Admin ===
  ADMIN_USERS: '/admin/users',
  ADMIN_SYSTEM: '/admin/system',
  ADMIN_BUG_REPORTS: '/admin/bug-reports',

  // === Recipes ===
  RECIPES: '/recipes',
  RECIPE_NEW: '/recipes/new',
  RECIPE_DETAILS: (id) => `/recipes/${id}`,
  RECIPE_EDIT: (id) => `/recipes/${id}/edit`,

  // === Production ===
  PRODUCTION: '/production',
  PRODUCTION_NEW_TASK: '/production/new-task',
  PRODUCTION_TIMELINE: '/production/timeline',
  PRODUCTION_CALCULATOR: '/production/calculator',
  PRODUCTION_FORECAST: '/production/forecast',
  PRODUCTION_FORMS: '/production/forms',
  PRODUCTION_FORMS_COMPLETED_MO: '/production/forms/completed-mo',
  PRODUCTION_FORMS_CONTROL: '/production/forms/production-control',
  PRODUCTION_FORMS_SHIFT: '/production/forms/production-shift',
  PRODUCTION_FORMS_RESPONSES: '/production/forms/responses',
  PRODUCTION_TASK: (id) => `/production/tasks/${id}`,
  PRODUCTION_TASK_EDIT: (id) => `/production/tasks/${id}/edit`,
  PRODUCTION_CONSUMPTION: (taskId) => `/production/consumption/${taskId}`,
  PRODUCTION_REPORTS: '/production/reports',
  PRODUCTION_CREATE_FROM_ORDER: '/production/create-from-order',
  PRODUCTION_WORKSTATIONS: '/production/workstations',

  // === Inventory ===
  INVENTORY: '/inventory',
  INVENTORY_NEW: '/inventory/new',
  INVENTORY_ITEM: (id) => `/inventory/${id}`,
  INVENTORY_ITEM_BATCHES: (id) => `/inventory/${id}/batches`,
  INVENTORY_BATCH_EDIT: (id, batchId) => `/inventory/${id}/batches/${batchId}/edit`,
  INVENTORY_ITEM_EDIT: (id) => `/inventory/${id}/edit`,
  INVENTORY_ITEM_RECEIVE: (id) => `/inventory/${id}/receive`,
  INVENTORY_ITEM_ISSUE: (id) => `/inventory/${id}/issue`,
  INVENTORY_ITEM_HISTORY: (id) => `/inventory/${id}/history`,
  INVENTORY_EXPIRY_DATES: '/inventory/expiry-dates',
  INVENTORY_STOCKTAKING: '/inventory/stocktaking',
  INVENTORY_STOCKTAKING_NEW: '/inventory/stocktaking/new',
  INVENTORY_STOCKTAKING_DETAILS: (id) => `/inventory/stocktaking/${id}`,
  INVENTORY_STOCKTAKING_EDIT: (id) => `/inventory/stocktaking/${id}/edit`,
  INVENTORY_STOCKTAKING_REPORT: (id) => `/inventory/stocktaking/${id}/report`,
  INVENTORY_FORMS: '/inventory/forms',
  INVENTORY_FORMS_RESPONSES: '/inventory/forms/responses',
  INVENTORY_FORMS_LOADING: '/inventory/forms/loading-report',
  INVENTORY_FORMS_UNLOADING: '/inventory/forms/unloading-report',

  // === CMR ===
  CMR: '/inventory/cmr',
  CMR_NEW: '/inventory/cmr/new',
  CMR_DETAILS: (id) => `/inventory/cmr/${id}`,
  CMR_EDIT: (id) => `/inventory/cmr/${id}/edit`,

  // === Orders ===
  ORDERS: '/orders',
  ORDERS_CUSTOMERS: '/orders/customers',
  ORDERS_PRICE_LISTS: '/orders/price-lists',
  ORDER_NEW: '/orders/new',
  ORDER_EDIT: (orderId) => `/orders/edit/${orderId}`,
  ORDER_DETAILS: (orderId) => `/orders/${orderId}`,

  // === Price Lists ===
  PRICE_LIST_NEW: '/orders/price-lists/new',
  PRICE_LIST_DETAILS: (id) => `/orders/price-lists/${id}`,
  PRICE_LIST_EDIT: (id) => `/orders/price-lists/${id}/edit`,

  // === Sales ===
  SALES: '/sales',
  SALES_MATERIAL_ADVANCES: '/sales/material-advances',
  SALES_FACTORY_COSTS: '/sales/factory-costs',
  SALES_QUOTATION: '/sales/quotation',

  // === Invoices ===
  INVOICES: '/sales', // Kanoniczne miejsce listy faktur (SalesPage z zakładkami)
  INVOICE_NEW: '/invoices/new',
  INVOICE_DETAILS: (invoiceId) => `/invoices/${invoiceId}`,
  INVOICE_EDIT: (invoiceId) => `/invoices/${invoiceId}/edit`,
  INVOICE_COMPANY_SETTINGS: '/invoices/company-settings',

  // === Purchase Orders ===
  PURCHASE_ORDERS: '/purchase-orders',
  PURCHASE_ORDER_NEW: '/purchase-orders/new',
  PURCHASE_ORDER_DETAILS: (id) => `/purchase-orders/${id}`,
  PURCHASE_ORDER_EDIT: (id) => `/purchase-orders/${id}/edit`,

  // === Suppliers ===
  SUPPLIERS: '/suppliers',
  SUPPLIER_NEW: '/suppliers/new',
  SUPPLIER_EDIT: (id) => `/suppliers/${id}/edit`,
  SUPPLIER_VIEW: (id) => `/suppliers/${id}/view`,
  SUPPLIER_DETAILS: (id) => `/suppliers/${id}`,

  // === Customers (kanoniczne ścieżki) ===
  CUSTOMERS: '/orders/customers',
  CUSTOMER_DETAILS: (customerId) => `/orders/customers/${customerId}`,

  // === CRM ===
  CRM: '/crm',
  CRM_CONTACTS: '/crm/contacts',
  CRM_CONTACT_NEW: '/crm/contacts/new',
  CRM_CONTACT_DETAILS: (contactId) => `/crm/contacts/${contactId}`,
  CRM_CONTACT_EDIT: (contactId) => `/crm/contacts/${contactId}/edit`,
  CRM_INTERACTIONS: '/crm/interactions',
  CRM_INTERACTION_NEW: '/crm/interactions/new',
  CRM_INTERACTION_DETAILS: (interactionId) => `/crm/interactions/${interactionId}`,
  CRM_INTERACTION_EDIT: (interactionId) => `/crm/interactions/${interactionId}/edit`,
  CRM_OPPORTUNITIES: '/crm/opportunities',
  CRM_OPPORTUNITY_NEW: '/crm/opportunities/new',
  CRM_OPPORTUNITY_DETAILS: (opportunityId) => `/crm/opportunities/${opportunityId}`,
  CRM_OPPORTUNITY_EDIT: (opportunityId) => `/crm/opportunities/${opportunityId}/edit`,

  // === Hall Data ===
  HALL_DATA_CONDITIONS: '/hall-data/conditions',
  HALL_DATA_MACHINES: '/hall-data/machines',
  HALL_DATA_FORMS: '/hall-data/forms',
  HALL_DATA_FORMS_SERVICE_REPORT: '/hall-data/forms/service-report',
  HALL_DATA_FORMS_MONTHLY_SERVICE: '/hall-data/forms/monthly-service-report',
  HALL_DATA_FORMS_DEFECT_REGISTRY: '/hall-data/forms/defect-registry',
  HALL_DATA_FORMS_SERVICE_REPAIR: '/hall-data/forms/service-repair-report',
  HALL_DATA_FORMS_RESPONSES: '/hall-data/forms/responses',

  // === Other ===
  AI_ASSISTANT: '/ai-assistant',
  KIOSK: '/kiosk',
  NOTIFICATIONS_HISTORY: '/notifications/history',
};

export default ROUTES;
