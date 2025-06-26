import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  ShoppingCart, 
  Package, 
  Search, 
  User,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import OrderHistory from './OrderHistory';
import ProductCatalog from './ProductCatalog';
import ShoppingCartComponent from './ShoppingCart';
import PortalLogin from './PortalLogin';

const CustomerPortalPage = () => {
  const { slug } = useParams();
  const [activeTab, setActiveTab] = useState('orders');
  const [cart, setCart] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [portalData, setPortalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    fetchPortalData();
  }, [slug]);

  // Opcjonalnie: Wyloguj użytkownika gdy zamknie kartę (tylko dla chronionych portali)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (portalData?.requiresLogin && isAuthenticated) {
        // Pozostaw zalogowanie - usuń poniższą linię jeśli chcesz zachować sesję
        // localStorage.removeItem(`portal_auth_${slug}`);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [portalData, isAuthenticated, slug]);

  const fetchPortalData = async () => {
    try {
      setLoading(true);
      const portalsRef = collection(db, 'customerPortals');
      const q = query(portalsRef, where('slug', '==', slug));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const portalDoc = querySnapshot.docs[0];
        const portal = {
          id: portalDoc.id,
          ...portalDoc.data()
        };
        setPortalData(portal);
        
        // Sprawdź czy portal wymaga logowania
        if (!portal.requiresLogin) {
          setIsAuthenticated(true); // Portal publiczny
        } else {
          // Sprawdź czy użytkownik jest już zalogowany
          const savedAuth = localStorage.getItem(`portal_auth_${slug}`);
          if (savedAuth === 'true') {
            setIsAuthenticated(true);
          }
        }
      } else {
        setError('Portal not found');
      }
    } catch (error) {
      console.error('Error fetching portal data:', error);
      setError('Failed to load portal data');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId, newQuantity) => {
    if (newQuantity === 0) {
      setCart(prev => prev.filter(item => item.id !== productId));
    } else {
      setCart(prev => prev.map(item => 
        item.id === productId 
          ? { ...item, quantity: newQuantity }
          : item
      ));
    }
  };

  const clearCart = () => {
    setCart([]);
  };

  const handleLogin = async (username, password) => {
    setLoginError('');
    
    if (!portalData) {
      setLoginError('Portal data not loaded');
      return;
    }

    // Sprawdź dane logowania
    if (username === portalData.username && password === portalData.password) {
      setIsAuthenticated(true);
      // Zapisz stan logowania w localStorage (opcjonalnie)
      localStorage.setItem(`portal_auth_${slug}`, 'true');
    } else {
      setLoginError('Invalid username or password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(`portal_auth_${slug}`);
    setCart([]); // Wyczyść koszyk przy wylogowaniu
  };

  const sidebarItems = [
    { id: 'orders', label: 'My Orders', icon: Package },
    { id: 'products', label: 'Product Catalog', icon: Search },
    { id: 'cart', label: 'Shopping Cart', icon: ShoppingCart, badge: cart.reduce((sum, item) => sum + item.quantity, 0) }
  ];

  const renderContent = () => {
    if (!portalData) return null;

    switch(activeTab) {
      case 'orders':
        return <OrderHistory customerId={portalData.customerId} customerName={portalData.customerName} />;
      case 'products':
        return (
          <ProductCatalog 
            onAddToCart={addToCart} 
            assignedPriceLists={portalData.assignedPriceLists || []}
          />
        );
      case 'cart':
        return (
          <ShoppingCartComponent 
            cart={cart}
            onUpdateQuantity={updateCartQuantity}
            onClearCart={clearCart}
            onSwitchToProducts={() => setActiveTab('products')}
            customerId={portalData?.customerId}
          />
        );
      default:
        return <OrderHistory customerId={portalData.customerId} customerName={portalData.customerName} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Portal Not Found</h1>
          <p className="text-gray-400 mb-4">{error}</p>
          <p className="text-gray-500">Please check the URL or contact support.</p>
        </div>
      </div>
    );
  }

  // Jeśli portal wymaga logowania, ale użytkownik nie jest zalogowany
  if (portalData && portalData.requiresLogin && !isAuthenticated) {
    return (
      <PortalLogin 
        portalData={portalData}
        onLogin={handleLogin}
        error={loginError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static top-0 left-0 bottom-0 ${sidebarCollapsed ? 'w-16 lg:w-20' : 'w-64'} bg-gray-800 border-r border-gray-700 z-50 transition-all duration-300 flex flex-col`}>
        
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-center border-b border-gray-700 relative px-2">
          {/* Logo */}
          <div className="flex items-center justify-center">
            {sidebarCollapsed ? (
              <img 
                src="/BGW-logo-icon.png" 
                alt="BGW Logo"
                className="w-8 h-8 lg:w-12 lg:h-12 object-contain"
              />
            ) : (
              <img 
                src="/BGWportal-logo.png" 
                alt="BGW Portal Logo"
                className="h-8 lg:h-12 object-contain"
              />
            )}
          </div>
          
          {/* Mobile close button */}
          <button 
            onClick={() => setSidebarOpen(false)} 
            className="lg:hidden absolute top-2 right-2 p-1 rounded-md hover:bg-gray-700 text-white flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 lg:py-4 space-y-1 lg:space-y-2 overflow-y-auto overflow-x-hidden">
          <div className={`space-y-1 lg:space-y-2 ${sidebarCollapsed ? 'px-1 lg:px-2' : 'px-2 lg:px-4'}`}>
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center py-2 lg:py-3 rounded-lg transition-all duration-200 relative group ${
                  sidebarCollapsed ? 'justify-center px-1 lg:px-2' : 'px-2 lg:px-4'
                } ${
                  activeTab === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
                title={sidebarCollapsed ? item.label : ''}
              >
                <item.icon className={`w-4 h-4 lg:w-5 lg:h-5 flex-shrink-0 ${sidebarCollapsed ? '' : 'mr-2 lg:mr-3'}`} />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left min-w-0 truncate text-sm lg:text-base">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[16px] lg:min-w-[20px] text-center flex-shrink-0 ml-2">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
                
                {/* Badge for collapsed state */}
                {sidebarCollapsed && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 lg:w-5 lg:h-5 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}

                {/* Tooltip for collapsed state */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 lg:ml-6 px-2 py-1 bg-gray-900 text-white text-xs lg:text-sm rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
                    {item.label}
                    {item.badge > 0 && ` (${item.badge})`}
                  </div>
                )}
              </button>
            ))}
            
            {/* Collapse Button - ukryj na mobile */}
            <div className={`pt-2 border-t border-gray-700 mt-4 hidden lg:block ${sidebarCollapsed ? 'px-0' : 'px-0'}`}>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`w-full flex items-center py-3 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white transition-all duration-200 relative group ${
                  sidebarCollapsed ? 'justify-center px-2' : 'px-4'
                }`}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <>
                    <ChevronLeft className="w-5 h-5 flex-shrink-0 mr-3" />
                    <span className="flex-1 text-left min-w-0 truncate text-sm">Collapse</span>
                  </>
                )}
                
                {/* Tooltip for collapsed state */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-6 px-2 py-1 bg-gray-900 text-white text-sm rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
                    Expand sidebar
                  </div>
                )}
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center min-w-0 flex-1">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden p-2 rounded-md hover:bg-gray-700 text-white mr-3 flex-shrink-0"
                >
                  <Menu className="w-5 h-5 lg:w-6 lg:h-6" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-lg lg:text-xl font-bold text-white truncate">{portalData?.portalName || 'Customer Portal'}</h1>
                  <p className="text-xs lg:text-sm text-gray-400 truncate">{portalData?.customerName || slug}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
                <button
                  onClick={() => setActiveTab('cart')}
                  className="relative p-2 rounded-lg hover:bg-gray-700 transition-colors"
                  title="Go to Shopping Cart"
                >
                  <ShoppingCart className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300 hover:text-white" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 lg:w-5 lg:h-5 flex items-center justify-center">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  )}
                </button>
                <div className="hidden sm:flex items-center space-x-2">
                  <User className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300" />
                  <span className="text-xs lg:text-sm text-gray-300 truncate max-w-20 lg:max-w-none">{portalData?.customerName || 'Customer'}</span>
                </div>
                <Settings className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300 hover:text-white cursor-pointer" />
                {portalData?.requiresLogin && (
                  <button
                    onClick={handleLogout}
                    className="text-gray-300 hover:text-white transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerPortalPage; 