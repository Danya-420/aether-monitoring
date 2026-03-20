import { uIOhook } from 'uiohook-napi';
import { activityStore } from './store.js';
import { EventEmitter } from 'events';

class WpmTracker extends EventEmitter {
    constructor() {
        super();
        this.totalKeystrokes = 0;
        this.totalActiveDuration = 0;
        this.lastKeystrokeTime = null;
        this.activeTypingStartTime = null;
        this.updateInterval = null;
        this.idleThreshold = 5000;
        this.isPaused = false;
        this.needsSave = false;

        this.loadTodayStats();
    }

    loadTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        const history = activityStore.getWpmHistory();
        const todayRecord = history.find(h => h.date === today);

        if (todayRecord) {
            this.totalKeystrokes = todayRecord.totalKeystrokes || 0;
            this.totalActiveDuration = (todayRecord.activeMinutes || 0) * 60 * 1000;
            console.log(`[WPM] Resumed today's session: ${this.totalKeystrokes} keys, ${todayRecord.activeMinutes}m active`);
        }
    }

    start() {
        uIOhook.on('keydown', () => this.handleKeyDown());
        uIOhook.start();

        this.updateInterval = setInterval(() => {
            this.emitStats();
        }, 5000);

        console.log('[WPM] Tracker started');
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        uIOhook.stop();
        console.log('[WPM] Tracker stopped');
    }

    handleKeyDown() {
        const settings = activityStore.getSettings();
        if (settings.isIncognito) {
            this.lastKeystrokeTime = null;
            this.activeTypingStartTime = null;
            return;
        }
        if (this.isPaused) return;

        this.needsSave = true;
        const now = Date.now();
        this.totalKeystrokes++;

        if (!this.lastKeystrokeTime) {
            this.activeTypingStartTime = now;
        } else {
            const gap = now - this.lastKeystrokeTime;
            if (gap > this.idleThreshold) {
                this.activeTypingStartTime = now;
            } else {
                this.totalActiveDuration += gap;
            }
        }

        this.lastKeystrokeTime = now;
    }

    calculateWpm() {
        const activeSeconds = this.totalActiveDuration / 1000;
        const activeMinutes = activeSeconds / 60;

        if (activeSeconds < 5) return 0;

        const wpm = (this.totalKeystrokes / 5) / activeMinutes;
        return Math.round(wpm);
    }

    getStats() {
        return {
            wpm: this.calculateWpm(),
            totalKeystrokes: this.totalKeystrokes,
            activeTypingTime: Math.round(this.totalActiveDuration / 1000)
        };
    }

    emitStats() {
        const stats = this.getStats();
        this.emit('wpm-update', stats);
        console.log(`[WPM] ${stats.wpm} WPM | ${stats.totalKeystrokes} keys`);
    }

    saveDailySummary() {
        if (!this.needsSave) {
            console.log('[WPM] No new data since last save. Skipping summary write.');
            return;
        }

        const stats = this.getStats();
        const today = new Date().toISOString().split('T')[0];

        const summary = {
            date: today,
            avgWpm: stats.wpm,
            totalKeystrokes: stats.totalKeystrokes,
            activeMinutes: this.totalActiveDuration / (1000 * 60)
        };

        const history = activityStore.getWpmHistory();

        const todayIdx = history.findIndex(h => h.date === today);
        if (todayIdx > -1) {
            history[todayIdx] = summary;
        } else {
            history.push(summary);
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const cutoffStr = cutoffDate.toISOString().split('T')[0];

        const filteredHistory = history.filter(h => h.date >= cutoffStr);

        activityStore.saveWpmHistory(filteredHistory);
        this.needsSave = false;
        console.log(`[WPM] Daily summary saved for ${today}: ${stats.wpm} WPM`);
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }
}

export const wpmTracker = new WpmTracker();
