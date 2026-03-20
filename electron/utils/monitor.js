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
        const isUserActive = idleTime < 60; // 60 seconds (1 minute)

        if (!isUserActive) {
            console.log('[Monitor] User idle, skipping activity log');
            return;
        }

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

            // Check if activity changed
            if (!this.currentActivity ||
                this.currentActivity.app !== appName ||
                this.currentActivity.title !== sanitizedTitle) {

                const activity = {
                    app: appName,
                    title: sanitizedTitle,
                    duration: this.interval / 1000, // seconds
                    type: 'active'
                };

                // Save to store
                activityStore.saveActivity(activity);

                // Update current
                this.currentActivity = activity;

                // Emit event for real-time update
                this.emit('activity-update', activity);
                console.log(`[Monitor] Activity detected: ${appName} - ${sanitizedTitle}`);
            } else {
                // Same activity, just emit update without saving duplicate record
                this.emit('activity-update', this.currentActivity);
            }
        } catch (error) {
            console.error('Error in activity monitor tick:', error);
        }
    }
}

export const monitor = new ActivityMonitor();
