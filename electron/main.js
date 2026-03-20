import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, powerMonitor } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { activityStore } from './utils/store.js';
import { monitor } from './utils/monitor.js';
import { wpmTracker } from './utils/wpm-tracker.js';

app.disableHardwareAcceleration();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

Menu.setApplicationMenu(null);

const isDev = !app.isPackaged;

let mainWindow;
let tray = null;
app.isQuiting = false;
let isIncognito = false;

// Instance & Lifecycle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();

            monitor.resume();
            wpmTracker.resume();
            console.log('[Main] Second instance: Resuming monitoring.');
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

                monitor.resume();
                wpmTracker.resume();
                console.log('[Tray] Window shown: Resuming monitoring.');
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

            monitor.resume();
            wpmTracker.resume();
            console.log('[Tray] Window shown: Resuming monitoring.');
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
            preload: join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
    }

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

// API Handlers (IPC)
ipcMain.handle('set-auto-launch', async (event, enabled) => {
    app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,
        name: 'Aether',
        path: app.getPath('exe'),
        args: ['--hidden']
    });

    activityStore.setAutoLaunchEnabled(enabled);

    console.log(`[Auto-Launch] Applied: ${enabled}`);
    return true;
});

ipcMain.handle('get-auto-launch-status', () => {
    const loginSettings = app.getLoginItemSettings();
    const storedPreference = activityStore.getAutoLaunchEnabled();

    console.log(`[Auto-Launch] Windows: ${loginSettings.openAtLogin}, Stored: ${storedPreference}`);

    return loginSettings.openAtLogin;
});

ipcMain.handle('get-dashboard-data', async () => {
    const activities = activityStore.getActivities();
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const todayActivities = activities.filter(a => a.timestamp.startsWith(today));

    const appStats = {};
    todayActivities.forEach(a => {
        appStats[a.app] = (appStats[a.app] || 0) + a.duration;
    });

    const topApps = Object.entries(appStats)
        .map(([name, duration]) => ({
            name: name.toUpperCase(),
            duration: duration,
            percent: 0
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

    const hourlyStats = Array(24).fill(0);
    todayActivities.forEach(a => {
        const hour = new Date(a.timestamp).getHours();
        hourlyStats[hour] += a.duration;
    });

    const hourlyFlow = hourlyStats.map(s => Math.min(Math.round(s / 60), 60));

    const wpmComparison = getWpmComparisonHelper();

    console.log('WPM Stats Refresh:', wpmComparison);

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

monitor.on('activity-update', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('data-update', data);
    }
});

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
    let lastSavedDay = new Date().toISOString().split('T')[0];
    setInterval(() => {
        const today = new Date().toISOString().split('T')[0];
        if (today !== lastSavedDay) {
            console.log(`[App] Day changed to ${today}. Saving previous day's WPM summary...`);
            wpmTracker.saveDailySummary();
            lastSavedDay = today;
        }
    }, 60 * 60 * 1000);
}

app.whenReady().then(() => {
    const loginItemSettings = app.getLoginItemSettings();
    const wasOpenedAtLogin = loginItemSettings.wasOpenedAtLogin;

    console.log('=== LAUNCH DEBUG ===');
    console.log('wasOpenedAtLogin:', wasOpenedAtLogin);
    console.log('argv:', process.argv);
    console.log('includes --hidden:', isHiddenLaunch);
    console.log('===================');

    createWindow();
    createTray();

    if (!wasOpenedAtLogin && !isHiddenLaunch) {
        mainWindow.maximize();
        mainWindow.show();
    } else {
        console.log('[Main] Starting hidden (auto-launch/hidden flag)');
    }

    const currentSettings = activityStore.getSettings();
    if (currentSettings && currentSettings.isIncognito !== undefined) {
        isIncognito = currentSettings.isIncognito;
        updateTrayMenu();
    }

    monitor.start();
    wpmTracker.start();

    if (currentSettings.isMonitoringEnabled === false) {
        monitor.pause();
        wpmTracker.pause();
        console.log('[Main] Monitoring initialized as PAUSED based on user settings.');
    }

    setupWpmSaveTriggers();

    activityStore.cleanupOldRecords(30);

    powerMonitor.on('suspend', () => {
        console.log('System suspending, stopping monitor');
        monitor.stop();
        wpmTracker.saveDailySummary();
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
            console.log('[App] Sleep Mode: Monitoring paused.');
        }
    });

    app.on('before-quit', () => {
        console.log('[App] Performing final saves before quit...');
        wpmTracker.saveDailySummary();
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
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (mainWindow === null) {
            createWindow();
        }
    });
});