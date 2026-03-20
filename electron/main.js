import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, powerMonitor } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { activityStore } from './utils/store.js';
import { monitor } from './utils/monitor.js';
import { wpmTracker } from './utils/wpm-tracker.js';

app.disableHardwareAcceleration();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Remove default menu bar
Menu.setApplicationMenu(null);

const isDev = !app.isPackaged;

let mainWindow;
let tray = null;
app.isQuiting = false;
let isIncognito = false;

const isHiddenLaunch = process.argv.includes('--hidden');

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            
            // Resume monitoring if it was paused by Sleep Mode
            const settings = activityStore.getSettings();
            if (settings.isMonitoringEnabled !== false) {
                monitor.resume();
                wpmTracker.resume();
                console.log('[Main] Second instance detected: Showing window and resuming monitoring.');
            }
        }
    });
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Dashboard',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
                
                // Resume monitoring if it was paused by Sleep Mode
                const settings = activityStore.getSettings();
                if (settings.isMonitoringEnabled !== false) {
                    monitor.resume();
                    wpmTracker.resume();
                    console.log('[Tray Menu] Window shown: Resuming monitoring.');
                }
            }
        },
        {
            label: isIncognito ? 'Disable Incognito' : 'Enable Incognito',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('toggle-incognito');
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit Aether',
            click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);
    tray.setContextMenu(contextMenu);
}

function createTray() {
    const iconPath = app.isPackaged 
        ? join(process.resourcesPath, 'public', 'icons', 'icon.png')
        : join(__dirname, '../public/icons/icon.png');

    let trayIcon;
    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            console.warn('[Tray] Icon is empty, using default');
            trayIcon = nativeImage.createEmpty();
        }
    } catch (error) {
        console.error('[Tray] Failed to load icon:', error);
        trayIcon = nativeImage.createEmpty();
    }

    const resizedIcon = trayIcon.resize({ width: 16, height: 16 });

    tray = new Tray(resizedIcon);
    updateTrayMenu();
    tray.setToolTip('Aether - Activity Tracker');

    tray.on('click', () => {
        if (mainWindow && mainWindow.isVisible()) {
            mainWindow.hide();
        } else if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            
            // Resume monitoring when showing window (exiting Sleep Mode)
            const settings = activityStore.getSettings();
            if (settings.isMonitoringEnabled !== false) {
                monitor.resume();
                wpmTracker.resume();
                console.log('[Tray] Window shown: Resuming monitoring.');
            }
        }
    });

    console.log('[Tray] Created successfully');
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 800,
        show: false,
        frame: true,
        backgroundColor: '#F9F7F2',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const url = isDev
        ? 'http://localhost:5173'
        : `file://${join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(url);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }


    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.on('closed', () => (mainWindow = null));
}

// IPC Handlers
ipcMain.handle('set-auto-launch', async (event, enabled) => {
    app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,
        name: 'Aether',
        path: app.getPath('exe'),
        args: ['--hidden']
    });
    
    // Persist to store
    activityStore.setAutoLaunchEnabled(enabled);
    
    console.log(`[Auto-Launch] Applied: ${enabled}`);
    return true;
});

ipcMain.handle('get-auto-launch-status', () => {
    // Check both Windows setting AND stored preference
    const loginSettings = app.getLoginItemSettings();
    const storedPreference = activityStore.getAutoLaunchEnabled();
    
    console.log(`[Auto-Launch] Windows: ${loginSettings.openAtLogin}, Stored: ${storedPreference}`);
    
    // Return stored preference (more reliable)
    return storedPreference;
});

ipcMain.handle('get-dashboard-data', async () => {
    const activities = activityStore.getActivities();
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Filter today's activities
    const todayActivities = activities.filter(a => a.timestamp.startsWith(today));

    // Aggregate by app
    const appStats = {};
    todayActivities.forEach(a => {
        appStats[a.app] = (appStats[a.app] || 0) + a.duration;
    });

    const topApps = Object.entries(appStats)
        .map(([name, duration]) => ({
            name: name.toUpperCase(),
            duration: duration,
            percent: 0 // Will calculate based on max below
        }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);

    const maxDuration = topApps.length > 0 ? topApps[0].duration : 1;
    topApps.forEach(a => {
        a.percent = Math.round((a.duration / maxDuration) * 100);
        const h = Math.floor(a.duration / 3600);
        const m = Math.floor((a.duration % 3600) / 60);
        a.time = `${h}h ${m}m`;
    });

    // Aggregate by hour (Flow Chart)
    const hourlyStats = Array(24).fill(0);
    todayActivities.forEach(a => {
        const hour = new Date(a.timestamp).getHours();
        hourlyStats[hour] += a.duration;
    });

    // Convert seconds to minutes (max 60m)
    const hourlyFlow = hourlyStats.map(s => Math.min(Math.round(s / 60), 60));

    const wpmComparison = getWpmComparisonHelper();

    // Verification log
    console.log('WPM Comparison (Dashboard):', wpmComparison);

    return {
        topApps,
        hourlyFlow,
        totalActiveTime: todayActivities.reduce((sum, a) => sum + a.duration, 0),
        totalRecords: activityStore.getTotalRecords(),
        weeklyHeatmap: activityStore.getWeeklyHeatmap(),
        wpmComparison,
        settings: activityStore.getSettings()
    };
});

function getWpmComparisonHelper() {
    const stats = wpmTracker.getStats();
    const currentWpm = stats.wpm;
    const weeklyAvg = activityStore.getWeeklyWpmAverage();
    let trend = 0;
    if (weeklyAvg > 0) {
        trend = ((currentWpm - weeklyAvg) / weeklyAvg) * 100;
        // Cap trend at ±99%
        trend = Math.max(-99, Math.min(99, Math.round(trend)));
    }

    return {
        ...stats,
        weeklyAvg: weeklyAvg,
        trend: trend,
        direction: trend >= 0 ? 'up' : 'down'
    };
}

ipcMain.handle('get-activity-log', async () => {
    return activityStore.getActivities();
});

ipcMain.on('toggle-monitoring', (event, enabled) => {
    if (enabled) monitor.resume();
    else monitor.pause();
    activityStore.saveSettings({ isMonitoringEnabled: enabled });
});

ipcMain.handle('update-settings', async (event, settings) => {
    activityStore.saveSettings(settings);
    
    // Sync Incognito status to tray menu if it was changed
    if (settings.isIncognito !== undefined) {
        isIncognito = settings.isIncognito;
        updateTrayMenu();
    }
    
    return { success: true };
});

ipcMain.handle('export-data', async () => {
    const data = activityStore.getActivities();
    return JSON.stringify(data, null, 2);
});

ipcMain.handle('wipe-data', async () => {
    activityStore.wipeAllData();
    return { success: true };
});

// Forward activity updates to renderer
monitor.on('activity-update', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('data-update', data);
    }
});

// Forward WPM updates to renderer
wpmTracker.on('wpm-update', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const fullStats = getWpmComparisonHelper();
        mainWindow.webContents.send('wpm-update', fullStats);
    }
});

ipcMain.handle('get-wpm-stats', () => {
    return wpmTracker.getStats();
});

// Handle WPM Save Triggers
function setupWpmSaveTriggers() {
    // 1. Save on before-quit
    app.on('before-quit', () => {
        console.log('[App] Saving daily WPM summary before quit...');
        wpmTracker.saveDailySummary();
    });

    // 2. Daily check (check every hour if day changed)
    let lastSavedDay = new Date().toISOString().split('T')[0];
    setInterval(() => {
        const today = new Date().toISOString().split('T')[0];
        if (today !== lastSavedDay) {
            console.log(`[App] Day changed to ${today}. Saving previous day's WPM summary...`);
            wpmTracker.saveDailySummary();
            lastSavedDay = today;
        }
    }, 60 * 60 * 1000); // Check every hour
}

app.whenReady().then(() => {
    // Check if launched as login item (Windows)
    const loginItemSettings = app.getLoginItemSettings();
    const wasOpenedAtLogin = loginItemSettings.wasOpenedAtLogin;

    console.log('=== LAUNCH DEBUG ===');
    console.log('wasOpenedAtLogin:', wasOpenedAtLogin);
    console.log('argv:', process.argv);
    console.log('includes --hidden:', isHiddenLaunch);
    console.log('===================');

    createWindow();
    createTray();

    // Only show window if NOT launched at login AND not --hidden flag
    if (!wasOpenedAtLogin && !isHiddenLaunch) {
        mainWindow.maximize();
        mainWindow.show();
    } else {
        console.log('[Main] Starting hidden (auto-launch/hidden flag)');
    }

    // Init Incognito & Monitoring state from store
    const currentSettings = activityStore.getSettings();
    if (currentSettings && currentSettings.isIncognito !== undefined) {
        isIncognito = currentSettings.isIncognito;
        updateTrayMenu();
    }

    // Start/Resume monitoring based on stored preference
    monitor.start();
    wpmTracker.start();
    
    if (currentSettings.isMonitoringEnabled === false) {
        monitor.pause();
        wpmTracker.pause();
        console.log('[Main] Monitoring initialized as PAUSED based on user settings.');
    }

    setupWpmSaveTriggers();

    // Auto-cleanup old records (30 days)
    activityStore.cleanupOldRecords(30);

    // Handle Power Events
    powerMonitor.on('suspend', () => {
        console.log('System suspending, stopping monitor');
        monitor.stop();
        wpmTracker.saveDailySummary(); // Save on suspend too
    });

    powerMonitor.on('resume', () => {
        console.log('System resumed, starting monitor');
        monitor.start();
    });

    ipcMain.on('enter-sleep-mode', () => {
        if (mainWindow) {
            mainWindow.hide();
            monitor.pause();
            wpmTracker.pause();
            console.log('[App] Entering Sleep Mode: Window hidden, monitoring paused.');
        }
    });

});

// Handle app quit
app.on('before-quit', () => {
    app.isQuiting = true;
});

app.on('quit', () => {
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

app.on('will-quit', () => {
    wpmTracker.stop();
});

app.on('window-all-closed', () => {
    // We already handle close to hide, but if it gets here (e.g. app.isQuiting=true)
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});