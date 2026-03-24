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
        this.isAudioPlaying = false;
    }

    setAudioActive(isActive) {
        if (this.isAudioPlaying !== isActive) {
            console.log(`[Monitor] Audio state updated via IPC: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
        }
        this.isAudioPlaying = isActive;
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

        const isUserActive = idleTime < 60 || this.isAudioPlaying;

        if (!isUserActive) {
            if (this.currentActivity) {
                console.log(`[Monitor] User is now true idle (No input for ${idleTime}s, No audio)`);
                this.currentActivity = null;
            }
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

            const { owner, title } = result;
            const appName = owner.name;
            const sanitizedTitle = sanitize(title);

            const activity = {
                app: appName,
                title: sanitizedTitle,
                duration: this.interval / 1000,
                type: 'active',
                tags: []
            };

            if (idleTime >= 60 && this.isAudioPlaying) {
                activity.type = 'passive';
                activity.tags.push('passive');
            }

            if (!this.currentActivity ||
                this.currentActivity.app !== appName ||
                this.currentActivity.title !== sanitizedTitle) {
                const tag = (activity.type === 'passive') ? '[Passive]' : '[Active]';
                console.log(`[Monitor] ${tag} Activity: ${appName} - ${sanitizedTitle}`);
            }

            activityStore.saveActivity(activity);

            this.currentActivity = activity;
            this.emit('activity-update', activity);
        } catch (error) {
            console.error('Error in activity monitor tick:', error);
        }
    }
}

export const monitor = new ActivityMonitor();
