{
  id: 'inventory',
  label: 'Stany',
  icon: <InventoryIcon />,
  href: '/inventory',
  children: [
    {
      id: 'inventory-list',
      label: 'Lista przedmiotów',
      href: '/inventory',
    },
    {
      id: 'inventory-categories',
      label: 'Kategorie',
      href: '/inventory/categories',
    },
    {
      id: 'inventory-batches',
      label: 'Partie',
      href: '/inventory/batches',
    },
    {
      id: 'inventory-transactions',
      label: 'Historia',
      href: '/inventory/history',
    },
  ],
}, 