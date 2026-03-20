import Store from 'electron-store';

const store = new Store({ name: 'aether' });

/**
 * Sanitizes window titles by removing emails, URLs, and file paths.
 * @param {string} title 
 * @returns {string}
 */
export function sanitize(title) {
    if (!title) return '';

    // Remove emails
    let sanitized = title.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

    // Remove URLs (basic)
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL]');

    // Remove file paths (Windows & Unix style)
    sanitized = sanitized.replace(/[a-zA-Z]:\\[\\\w\s.-]+/g, '[PATH]');
    sanitized = sanitized.replace(/\/[^\s]+\/[^\s]+/g, '[PATH]');

    return sanitized;
}

export const activityStore = {
    saveActivity: (activity) => {
        const sanitizedActivity = {
            ...activity,
            title: sanitize(activity.title)
        };
        const activities = store.get('activities', []);
        activities.push({
            ...sanitizedActivity,
            timestamp: new Date().toISOString()
        });
        store.set('activities', activities);
        return sanitizedActivity;
    },

    getActivities: () => {
        return store.get('activities', []);
    },

    getTotalRecords: () => {
        return store.get('activities', []).length;
    },

    getSettings: () => {
        return store.get('settings', {
            isIncognito: false,
            isMonitoringEnabled: true,
            blacklist: [],
            retentionDays: 30
        });
    },

    saveSettings: (settings) => {
        const currentSettings = store.get('settings', {});
        store.set('settings', { ...currentSettings, ...settings });
    },

    wipeAllData: () => {
        store.clear();
    },

    getWeeklyHeatmap: () => {
        const activities = store.get('activities', []);
        // Initialize heatmap with seconds instead of minutes
        const heatmapSeconds = Array(7).fill(null).map(() => Array(24).fill(0));
        const now = Date.now();
        const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

        activities.forEach(record => {
            const timestamp = new Date(record.timestamp).getTime();
            if (timestamp < weekAgo) return; 
            
            const date = new Date(timestamp);
            const day = date.getDay();
            const uiDay = day === 0 ? 6 : day - 1; 
            const hour = date.getHours();
            
            // Accumulate raw seconds
            heatmapSeconds[uiDay][hour] += (record.duration || 300);
        });

        // Convert accumulated seconds to rounded minutes for the final output
        return heatmapSeconds.map(dayRow => 
            dayRow.map(hourSeconds => Math.round(hourSeconds / 60))
        );
    },

    cleanupOldRecords: (maxDays = 30) => {
        const start = Date.now();
        const activities = store.get('activities', []);
        const cutoff = Date.now() - (maxDays * 24 * 60 * 60 * 1000);

        const filtered = activities.filter(a => {
            const timestamp = new Date(a.timestamp).getTime();
            return timestamp >= cutoff;
        });

        store.set('activities', filtered);
        const deleted = activities.length - filtered.length;
        console.log(`[Store] Cleaned ${deleted} records in ${Date.now() - start}ms`);
        return deleted;
    },

    getWpmHistory: () => {
        return store.get('wpmHistory', []);
    },

    saveWpmHistory: (history) => {
        store.set('wpmHistory', history);
    },

    getWeeklyWpmAverage: () => {
        const history = store.get('wpmHistory', []);
        const now = Date.now();
        const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
        const weekAgoStr = new Date(weekAgo).toISOString().split('T')[0];

        const recentWeek = history.filter(h => h.date >= weekAgoStr);
        
        if (recentWeek.length === 0) return 0;
        
        const total = recentWeek.reduce((sum, h) => sum + h.avgWpm, 0);
        return Math.round(total / recentWeek.length);
    },

    setAutoLaunchEnabled: (enabled) => {
        store.set('settings.autoLaunch', enabled);
    },

    getAutoLaunchEnabled: () => {
        return store.get('settings.autoLaunch', false);
    }
};
