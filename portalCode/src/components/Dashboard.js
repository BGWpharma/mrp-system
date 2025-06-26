import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  Users, 
  DollarSign, 
  Globe, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight,
  BarChart3
} from 'lucide-react';
import Customers from './Customers';
import PriceLists from './PriceLists';
import CustomerPortals from './CustomerPortals';
import Settings from './Settings';

const Dashboard = ({ user }) => {
  const [activeTab, setActiveTab] = useState('customers');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      console.log('Signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const menuItems = [
    { id: 'customers', name: 'Customers', icon: Users },
    { id: 'price-lists', name: 'Price Lists', icon: DollarSign },
    { id: 'customer-portals', name: 'Customer Portals', icon: Globe },
    { id: 'settings', name: 'Settings', icon: SettingsIcon },
  ];

  const renderContent = () => {
    switch(activeTab) {
      case 'customers':
        return <Customers />;
      case 'price-lists':
        return <PriceLists />;
      case 'customer-portals':
        return <CustomerPortals />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <div className="text-center py-20">
            <div className="mx-auto h-24 w-24 text-gray-400 mb-6 flex items-center justify-center">
              <BarChart3 className="w-full h-full" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">
              Welcome to Admin Panel!
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">
              Select a menu item from the sidebar to get started managing customers, price lists, and customer portals.
            </p>
          </div>
        );
    }
  };

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
              <div className="flex items-center space-x-2 lg:space-x-3">
                <img 
                  src="/BGW-logo-icon.png" 
                  alt="BGW Logo"
                  className="w-8 h-8 lg:w-12 lg:h-12 object-contain flex-shrink-0"
                />
                <div className="min-w-0">
                  <h1 className="text-lg lg:text-xl font-bold text-white truncate">BGW Portal</h1>
                  <p className="text-xs text-gray-400 truncate">Admin Panel</p>
                </div>
              </div>
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
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
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
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                  title={sidebarCollapsed ? item.name : ''}
                >
                  <IconComponent className={`w-4 h-4 lg:w-5 lg:h-5 flex-shrink-0 ${sidebarCollapsed ? '' : 'mr-2 lg:mr-3'}`} />
                  {!sidebarCollapsed && (
                    <span className="flex-1 text-left min-w-0 truncate font-medium text-sm lg:text-base">{item.name}</span>
                  )}
                  
                  {/* Tooltip for collapsed state */}
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-2 lg:ml-6 px-2 py-1 bg-gray-900 text-white text-xs lg:text-sm rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
                      {item.name}
                    </div>
                  )}
                </button>
              );
            })}
            
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
                  className="lg:hidden p-2 rounded-md hover:bg-gray-700 text-white mr-3 transition-colors flex-shrink-0"
                >
                  <Menu className="w-5 h-5 lg:w-6 lg:h-6" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-lg lg:text-xl font-semibold text-white truncate">
                    {menuItems.find(item => item.id === activeTab)?.name || 'Dashboard'}
                  </h2>
                  <p className="text-xs lg:text-sm text-gray-400 truncate">BGW Portal Administration</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
                {/* User Profile */}
                <div className="hidden sm:flex items-center space-x-2 lg:space-x-3">
                  <img
                    className="h-6 w-6 lg:h-8 lg:w-8 rounded-full border-2 border-gray-600"
                    src={user?.photoURL || '/api/placeholder/32/32'}
                    alt="Profile"
                  />
                  <div className="text-xs lg:text-sm min-w-0">
                    <div className="font-medium text-white truncate max-w-24 lg:max-w-none">
                      {user?.displayName || 'Admin User'}
                    </div>
                    <div className="text-gray-400 truncate max-w-24 lg:max-w-none">
                      {user?.email}
                    </div>
                  </div>
                </div>

                {/* Settings Icon */}
                <button className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
                  <SettingsIcon className="w-5 h-5 lg:w-6 lg:h-6" />
                </button>

                {/* Logout Icon */}
                <button
                  onClick={handleSignOut}
                  className="p-2 rounded-lg text-gray-300 hover:text-red-400 hover:bg-gray-700 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5 lg:w-6 lg:h-6" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
            <div className="bg-gray-800 rounded-lg border border-gray-700 min-h-96 shadow-lg">
              <div className="p-4 lg:p-6">
                {renderContent()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 