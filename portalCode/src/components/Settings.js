import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

const Settings = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <p className="text-gray-400 mt-1">
            Manage system settings and configuration
          </p>
        </div>
      </div>

      {/* Settings Content - Empty for now */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
        <div className="text-center py-20">
          <div className="mx-auto h-24 w-24 text-gray-400 mb-4 flex items-center justify-center">
            <SettingsIcon className="w-full h-full" />
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-2">Settings Panel</h3>
          <p className="text-gray-400 max-w-sm mx-auto">
            This settings panel is currently under development. Configuration options will be available here soon.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings; 