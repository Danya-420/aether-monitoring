import { powerMonitor } from 'electron';
import activeWin from 'active-win';
import { activityStore, sanitize } from './store.js';
import { EventEmitter } from 'events';

class ActivityMonitor extends EventEmitter {
    constructor(interval = 5000) {
        super();
        this.interval = interval;
        this.timer = null;
        this.currentActivity = null;
        this.isPaused = false;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), this.interval);
        console.log('Activity monitoring started');
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('Activity monitoring stopped');
    }

    pause() {
        this.isPaused = true;
        console.log('Activity monitoring paused');
    }

    resume() {
        this.isPaused = false;
        console.log('Activity monitoring resumed');
    }

    async tick() {
        if (this.isPaused) return;

        const idleTime = powerMonitor.getSystemIdleTime();
        const isUserActive = idleTime < 60;

        if (!isUserActive) return;

        const settings = activityStore.getSettings();
        if (settings.isIncognito) {
            if (this.currentActivity) {
                this.currentActivity = null;
            }
            return;
        }

        try {
            const result = await activeWin();
            if (!result) return;

            const { owner, title, bounds } = result;
            const appName = owner.name;
            const sanitizedTitle = sanitize(title);
            if (!this.currentActivity ||
                this.currentActivity.app !== appName ||
                this.currentActivity.title !== sanitizedTitle) {
                console.log(`[Monitor] Activity: ${appName} - ${sanitizedTitle}`);
            }

            const activity = {
                app: appName,
                title: sanitizedTitle,
                duration: this.interval / 1000,
                type: 'active'
            };

            activityStore.saveActivity(activity);

            this.currentActivity = activity;
            this.emit('activity-update', activity);
        } catch (error) {
            console.error('Error in activity monitor tick:', error);
        }
    }
}

export const monitor = new ActivityMonitor();
