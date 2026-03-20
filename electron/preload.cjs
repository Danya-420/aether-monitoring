const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aetherAPI', {
    // Activity Data
    getDashboardData: () => ipcRenderer.invoke('get-dashboard-data'),
    getActivityLog: () => ipcRenderer.invoke('get-activity-log'),

    // Controls
    toggleMonitoring: (enabled) => ipcRenderer.send('toggle-monitoring', enabled),
    enterSleepMode: () => ipcRenderer.send('enter-sleep-mode'),

    // Settings
    updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
    getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch-status'),

    // Data Management
    exportData: () => ipcRenderer.invoke('export-data'),
    wipeData: () => ipcRenderer.invoke('wipe-data'),
    getWpmStats: () => ipcRenderer.invoke('get-wpm-stats'),

    // Listeners
    onDataUpdate: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('data-update', handler);
        return () => ipcRenderer.removeListener('data-update', handler);
    },
    onWpmUpdate: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('wpm-update', handler);
        return () => ipcRenderer.removeListener('wpm-update', handler);
    },
    onToggleIncognito: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('toggle-incognito', handler);
        return () => ipcRenderer.removeListener('toggle-incognito', handler);
    }
});
