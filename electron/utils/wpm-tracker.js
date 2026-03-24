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

        if (!this.activeTypingStartTime) {
            this.activeTypingStartTime = now;
        } else {
            const gap = now - this.lastKeystrokeTime;
            if (gap > this.idleThreshold) {
                // End current session and start a new one
                const sessionDuration = this.lastKeystrokeTime - this.activeTypingStartTime;
                this.totalActiveDuration += sessionDuration;
                this.activeTypingStartTime = now;
            }
        }

        this.lastKeystrokeTime = now;
    }

    calculateWpm() {
        let currentSessionDuration = 0;
        const now = Date.now();
        
        if (this.activeTypingStartTime && this.lastKeystrokeTime) {
            // If we are currently typing (gap < threshold since last key), include the current session
            if (now - this.lastKeystrokeTime <= this.idleThreshold) {
                currentSessionDuration = this.lastKeystrokeTime - this.activeTypingStartTime;
            } else {
                // The handleKeyDown logic adds the session when the NEXT key comes.
                // For real-time display, if we just finished a session (now > threshold),
                // we should include it if it hasn't been added to totalActiveDuration yet.
                // However, to keep it simple and consistent with handleKeyDown, we only add it
                // when it's "finalized" by idle state in save/emit or by a new key.
                currentSessionDuration = this.lastKeystrokeTime - this.activeTypingStartTime;
            }
        }
        
        const totalDurationMs = this.totalActiveDuration + currentSessionDuration;
        const activeSeconds = totalDurationMs / 1000;
        const activeMinutes = activeSeconds / 60;

        // Requirement: Consider edge cases for different typing patterns
        if (activeSeconds < 2) return 0; // Lowered threshold slightly for better responsiveness

        const wpm = (this.totalKeystrokes / 5) / activeMinutes;
        return Math.round(wpm);
    }

    getStats() {
        let currentSessionDuration = 0;
        if (this.activeTypingStartTime && this.lastKeystrokeTime) {
            currentSessionDuration = this.lastKeystrokeTime - this.activeTypingStartTime;
        }

        return {
            wpm: this.calculateWpm(),
            totalKeystrokes: this.totalKeystrokes,
            activeTypingTime: Math.round((this.totalActiveDuration + currentSessionDuration) / 1000)
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

        // Factor in the final session of the day if it hasn't been added yet
        if (this.activeTypingStartTime && this.lastKeystrokeTime) {
            const sessionDuration = this.lastKeystrokeTime - this.activeTypingStartTime;
            this.totalActiveDuration += sessionDuration;
            this.activeTypingStartTime = null;
            this.lastKeystrokeTime = null;
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
