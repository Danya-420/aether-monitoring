import Store from 'electron-store';

const store = new Store({ name: 'aether' });

/**
 * Sanitizes window titles by removing personal/system data.
 */
export function sanitize(title) {
    if (!title) return '';

    let sanitized = title.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

    sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL]');

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
            autoLaunch: false,
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
        const heatmapSeconds = Array(7).fill(null).map(() => Array(24).fill(0));
        const now = new Date();
        const day = now.getDay();
        const daysSinceMonday = (day + 6) % 7;

        const startOfWeek = new Date(now);
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(now.getDate() - daysSinceMonday);
        const startOfWeekTime = startOfWeek.getTime();

        activities.forEach(record => {
            const timestamp = new Date(record.timestamp).getTime();
            if (timestamp < startOfWeekTime) return;

            const date = new Date(timestamp);
            const day = date.getDay();
            const uiDay = day === 0 ? 6 : day - 1;
            const hour = date.getHours();

            heatmapSeconds[uiDay][hour] += (record.duration || 300);
        });

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

        let totalKeystrokes = 0;
        let totalMinutes = 0;

        recentWeek.forEach(h => {
            totalKeystrokes += (h.totalKeystrokes || 0);
            totalMinutes += (h.activeMinutes || 0);
        });

        if (totalMinutes === 0) return 0;

        // Weighted Average = (Sum of Keystrokes / 5) / Sum of Minutes
        const weightedWpm = (totalKeystrokes / 5) / totalMinutes;
        return Math.round(weightedWpm);
    },

    setAutoLaunchEnabled: (enabled) => {
        store.set('settings.autoLaunch', enabled);
    },

    getAutoLaunchEnabled: () => {
        return store.get('settings.autoLaunch', false);
    }
};
