const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aetherAPI', {
    getDashboardData: () => ipcRenderer.invoke('get-dashboard-data'),
    getActivityLog: () => ipcRenderer.invoke('get-activity-log'),
    toggleMonitoring: (enabled) => ipcRenderer.send('toggle-monitoring', enabled),
    enterSleepMode: () => ipcRenderer.send('enter-sleep-mode'),

    updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
    getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch-status'),
    exportData: () => ipcRenderer.invoke('export-data'),
    wipeData: () => ipcRenderer.invoke('wipe-data'),
    getWpmStats: () => ipcRenderer.invoke('get-wpm-stats'),

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
        const handler = (event, val) => callback(val);
        ipcRenderer.on('toggle-incognito', handler);
        return () => ipcRenderer.removeListener('toggle-incognito', handler);
    },
    onSystemResume: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('system-resume', handler);
        return () => ipcRenderer.removeListener('system-resume', handler);
    },

    enableLoopbackAudio: () => ipcRenderer.invoke('enable-loopback-audio'),
    disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),
    sendAudioActivity: (isActive) => ipcRenderer.send('audio-activity-status', isActive)
});
