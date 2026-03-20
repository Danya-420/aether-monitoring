import React, { useState, useEffect } from 'react';
import { Activity, Keyboard, Layers, Shield, Power, EyeOff, Bell, Clock, Cpu, Terminal, Hash, ChevronRight, Zap } from 'lucide-react';

// --- HELPER COMPONENTS ---

// Refined GlassCard with Terminal aesthetics
const TerminalCard = ({ children, title, icon: Icon, className = "", headerColor = "bg-orange-50" }) => (
    <div className={`relative bg-white/80 backdrop-blur-md border border-orange-200 rounded-none overflow-hidden flex flex-col shadow-[4px_4px_0px_0px_rgba(234,88,12,0.1)] ${className}`}>
        {/* Terminal Header Bar */}
        <div className={`flex items-center justify-between px-4 py-3 ${headerColor} border-b border-orange-200`}>
            <div className="flex items-center gap-2">
                {Icon && <Icon className="w-4 h-4 text-orange-600" />}
                <h2 className="text-orange-900 font-mono font-bold uppercase tracking-widest text-sm">{title}</h2>
            </div>
            <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-300"></div>
                <div className="w-2 h-2 rounded-full bg-orange-400"></div>
            </div>
        </div>
        <div className="flex-1 p-8 relative">
            {/* Decorative Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(234,88,12,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(234,88,12,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
            <div className="relative z-10 h-full flex flex-col">
                {children}
            </div>
        </div>
        {/* Bottom decorative line */}
        <div className="h-1 w-full bg-orange-100"></div>
    </div>
);

// Digital segmented bar
const DigitalBar = ({ percentage, colorClass }) => {
    const totalBlocks = 20;
    const filledBlocks = Math.round((percentage / 100) * totalBlocks);

    return (
        <div className="flex gap-0.5 w-full h-5 font-mono text-[11px] leading-none">
            {Array.from({ length: totalBlocks }).map((_, i) => (
                <div
                    key={i}
                    className={`h-full flex-1 transition-all duration-300 border border-orange-100 ${i < filledBlocks ? colorClass : 'bg-stone-100'}`}
                />
            ))}
        </div>
    );
};

const TerminalToggle = ({ label, icon: Icon, checked, onChange = (_val: boolean) => { } }: { label: string, icon: any, checked: boolean, onChange?: (val: boolean) => void }) => {
    const toggle = () => {
        if (onChange) onChange(!checked);
    };

    return (
        <div
            className="group flex items-center justify-between p-3 rounded-none border border-transparent hover:border-orange-200 hover:bg-orange-50/50 transition-all cursor-pointer bg-stone-50"
            onClick={toggle}
        >
            <div className="flex items-center gap-3 text-stone-700 font-mono text-base">
                <Icon className="w-5 h-5 text-orange-600 group-hover:text-orange-700" />
                <span className="uppercase tracking-wide">{label}</span>
            </div>
            <div className={`w-10 h-5 border border-stone-300 rounded-none p-0.5 transition-colors duration-200 ${checked ? 'bg-orange-600 border-orange-600' : 'bg-stone-200'}`}>
                <div className={`w-3 h-3 bg-white shadow-none transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
        </div>
    );
};

const NavItem = ({ id, label, icon: Icon, activeTab, onSelect }) => {
    const isActive = activeTab === id;
    return (
        <button
            onClick={() => onSelect(id)}
            className={`w-full flex items-center gap-4 px-5 py-4 border-l-2 transition-all font-mono text-sm uppercase tracking-widest
        ${isActive
                    ? 'border-orange-500 bg-orange-50 text-orange-900 font-bold'
                    : 'border-transparent text-stone-400 hover:text-stone-600 hover:bg-stone-50'
                }`}
        >
            <Icon className={`w-5 h-5 ${isActive ? 'text-orange-600' : 'text-stone-400'}`} />
            <span className="flex-1 text-left">{label}</span>
            {isActive && <ChevronRight className="w-3 h-3 text-orange-500" />}
        </button>
    );
};

// --- IPC API Types ---
declare global {
    interface Window {
        aetherAPI: {
            getDashboardData: () => Promise<any>;
            getActivityLog: () => Promise<any>;
            toggleMonitoring: (enabled: boolean) => void;
            updateSettings: (settings: any) => Promise<any>;
            exportData: () => Promise<string>;
            wipeData: () => Promise<any>;
            getWpmStats: () => Promise<any>;
            getAutoLaunchStatus: () => Promise<boolean>;
            setAutoLaunch: (enabled: boolean) => Promise<boolean>;
            onDataUpdate: (callback: (data: any) => void) => () => void;
            onWpmUpdate: (callback: (data: any) => void) => () => void;
            onToggleIncognito: (callback: () => void) => () => void;
            enterSleepMode: () => void;
        }
    }
}

// --- CHART GENERATION HELPER ---
const generateFlowPath = (data: number[]) => {
    if (!data || !data.length) return '';

    // Map data to percentages (0-100 for X and Y)
    // Add a 20% buffer at the top to prevent plateauing against the container edge
    const points = data.map((d, i) => [
        (i / (data.length - 1)) * 100,
        100 - (d / 60) * 90
    ]);

    let path = `M ${points[0][0]} ${points[0][1]}`;

    // Create cubic bezier curves for smooth, rolling edges
    // Using a 0.35 factor for control points to make peaks feel less "flat"
    for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const tension = (next[0] - curr[0]) * 0.35;
        path += ` C ${curr[0] + tension} ${curr[1]}, ${next[0] - tension} ${next[1]}, ${next[0]} ${next[1]}`;
    }
    return path;
};

// --- MAIN DASHBOARD ---

export default function App() {
    const [activeTab, setActiveTab] = useState('flow');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionPhase, setTransitionPhase] = useState<'idle' | 'sweeping' | 'showing'>('idle');
    const [time, setTime] = useState(new Date());
    const [bootSequence, setBootSequence] = useState(true);
    const [dashboardData, setDashboardData] = useState<{
        topApps: any[],
        hourlyFlow: number[],
        totalActiveTime: number,
        weeklyHeatmap: number[][] | null,
        wpmComparison?: {
            current: number,
            weeklyAvg: number,
            trend: number,
            direction: 'up' | 'down'
        }
    } | null>(null);
    const [wpmStats, setWpmStats] = useState({
        wpm: 0,
        totalKeystrokes: 0,
        activeTypingTime: 0
    });
    const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);
    const [isIncognito, setIsIncognito] = useState(false);
    const [loading, setLoading] = useState(true);

    const refreshData = async () => {
        try {
            const data = await window.aetherAPI.getDashboardData();
            setDashboardData(data);
            if (data.wpmComparison) {
                setWpmStats(data.wpmComparison);
            }
            if (data.settings && data.settings.isIncognito !== undefined) {
                setIsIncognito(data.settings.isIncognito);
            }
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Real-time clock and initial load
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        setTimeout(() => setBootSequence(false), 1500);

        refreshData();

        // Listen for real-time updates
        const removeDataUpdate = window.aetherAPI.onDataUpdate((data) => {
            console.log('Real-time activity update:', data);
            // Refresh dashboard data when activity changes
            refreshData();
        });

        // Fetch initial WPM stats
        window.aetherAPI.getWpmStats()
            .then(setWpmStats)
            .catch(err => console.error('Failed to get WPM stats:', err));

        // Fetch initial autoLaunch status
        window.aetherAPI.getAutoLaunchStatus()
            .then(setAutoLaunchEnabled)
            .catch(err => console.error('Failed to get auto launch status:', err));

        // Listen for WPM updates
        const removeWpmUpdate = window.aetherAPI.onWpmUpdate((stats) => {
            console.log('Synchronized WPM update:', stats);
            setWpmStats(stats);
            setDashboardData(prev => prev ? { ...prev, wpmComparison: stats } : prev);
        });

        // Listen for Incognito toggle from main process (Tray)
        let removeToggleIncognito: (() => void) | null = null;
        if (window.aetherAPI.onToggleIncognito) {
            removeToggleIncognito = window.aetherAPI.onToggleIncognito(() => {
                setIsIncognito(prev => {
                    const next = !prev;
                    window.aetherAPI.updateSettings({ isIncognito: next });
                    return next;
                });
            });
        }

        return () => {
            clearInterval(timer);
            if (removeDataUpdate) removeDataUpdate();
            if (removeWpmUpdate) removeWpmUpdate();
            if (removeToggleIncognito) removeToggleIncognito();
        };
    }, []);

    const formattedTime = time.toLocaleTimeString('en-US', { hour12: false });

    // Calculate uptime based on total active time today
    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    const uptime = dashboardData ? formatDuration(dashboardData.totalActiveTime) : "00:00:00";

    const handleTabChange = (tab: string) => {
        if (tab === activeTab || isTransitioning) return;
        
        // Start transition
        setIsTransitioning(true);
        
        // Step 1: Mark container as sweeping (triggers scanline + old content fade)
        setTransitionPhase('sweeping');
        
        // Step 2: Wait for scanline to pass middle (200ms), then swap content
        setTimeout(() => {
            setActiveTab(tab);
            setTransitionPhase('showing');
            
            // Step 3: Wait for new content fade-in (400ms), then reset
            setTimeout(() => {
                setIsTransitioning(false);
                setTransitionPhase('idle');
            }, 400);
        }, 200);
    };

    return (
        <div className="h-screen overflow-hidden bg-[#FDFBF7] text-stone-800 font-mono p-4 md:p-8 flex items-center justify-center relative selection:bg-orange-200 selection:text-orange-900">

            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(234,88,12,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(234,88,12,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

            {/* Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(253,251,247,0.8)_100%)] pointer-events-none"></div>

            {/* Boot Overlay */}
            {bootSequence && (
                <div className="absolute inset-0 z-50 bg-[#FDFBF7] flex flex-col items-center justify-center">
                    <div className="w-64 h-1 bg-stone-200 rounded-none overflow-hidden">
                        <div className="h-full bg-orange-500 animate-[width_1s_ease-out_forwards]" style={{ width: '0%' }}></div>
                    </div>
                    <div className="mt-4 text-xs text-orange-600 font-bold animate-pulse">INITIALIZING AETHER_CORE...</div>
                </div>
            )}

            <div className="w-full max-w-[1600px] h-full max-h-full flex gap-8 relative z-10">

                {/* LEFT: MAIN CONTENT AREA */}
                <div className="flex-1 bg-white border-2 border-stone-200 rounded-none p-1 flex flex-col shadow-[8px_8px_0px_0px_rgba(229,115,115,0.1)]">
                    <div className="flex-1 bg-[#FDFBF7] border border-stone-100 p-6 flex flex-col overflow-hidden relative">

                        {/* Content Header */}
                        <header className="flex items-center justify-between mb-6 pb-4 border-b-2 border-stone-100">
                            <div className="flex items-center gap-3">
                                <div className="bg-orange-500 text-white p-1.5 rounded-none">
                                    <Terminal className="w-5 h-5" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tighter">
                                        {activeTab.replace('-', ' ')} <span className="text-orange-500">_</span>
                                    </h1>
                                    <p className="text-stone-400 text-sm mt-1 font-mono">SYS.ATMOSPHERE.DATA.V.2.0</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 bg-stone-900 text-white px-6 py-3 rounded-none shadow-lg">
                                <div className="flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 bg-green-500 rounded-none animate-pulse"></span>
                                    <span className="font-mono text-sm tracking-widest">ONLINE</span>
                                </div>
                                <div className="w-px h-6 bg-stone-700"></div>
                                <span className="font-mono text-base font-bold text-orange-400 tracking-wider">UPTIME: {uptime}</span>
                            </div>
                        </header>

                        {/* DYNAMIC TAB CONTENT */}
                        <div className={`flex-1 overflow-hidden relative anim-scanline ${transitionPhase !== 'idle' ? 'sweeping' : ''}`}>
                            <div className={`tab-content-inner h-full overflow-y-auto pr-2 custom-scrollbar ${transitionPhase === 'showing' ? 'new' : ''}`}>

                                {activeTab === 'flow' && (
                                <TerminalCard className="h-full" title="Daily Flow Metrics" icon={Activity}>
                                    {(loading || !dashboardData) ? (
                                        <div className="flex-1 flex items-center justify-center font-mono text-[10px] text-stone-400 font-bold">
                                            CALIBRATING_SENSORS...
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col">
                                            <div className="flex justify-between items-center mb-8">
                                                <div className="flex flex-col">
                                                    <span className="text-[14px] font-black text-stone-900 uppercase tracking-tighter mb-1">Session Intensity</span>
                                                    <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Aggregate Hourly Volume</span>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(234,88,12,0.4)]"></div><span className="text-[11px] font-black text-stone-500 uppercase">High</span></div>
                                                    <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-orange-200"></div><span className="text-[11px] font-black text-stone-500 uppercase">Low</span></div>
                                                </div>
                                            </div>

                                            {/* MODERNIZED CONNECTED FLOW VISUALIZATION */}
                                            <div className="flex-1 relative mt-4 min-h-[300px]">
                                                {/* Background Grid Lines */}
                                                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                                    {[...Array(5)].map((_, i) => (
                                                        <div key={i} className="w-full border-t border-dashed border-stone-100 h-0" />
                                                    ))}
                                                </div>

                                                {/* Unified SVG Area Curve */}
                                                <div className="absolute inset-0 pt-4 pointer-events-none">
                                                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                                                        <defs>
                                                            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                                                <stop offset="0%" stopColor="#f97316" stopOpacity="0.5" />
                                                                <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                                                            </linearGradient>
                                                        </defs>
                                                        {/* Fill Area */}
                                                        <path
                                                            d={`${generateFlowPath(dashboardData.hourlyFlow)} L 100 100 L 0 100 Z`}
                                                            fill="url(#flowGradient)"
                                                            className="transition-all duration-700"
                                                        />
                                                        {/* Smooth Stroke */}
                                                        <path
                                                            d={generateFlowPath(dashboardData.hourlyFlow)}
                                                            fill="none"
                                                            stroke="#ea580c"
                                                            strokeWidth="2"
                                                            vectorEffect="non-scaling-stroke"
                                                            className="transition-all duration-700"
                                                        />
                                                    </svg>
                                                </div>

                                                {/* Interactive Hover Grid Overlay */}
                                                <div className="absolute inset-0 flex items-end gap-0 pt-4 z-10">
                                                    {dashboardData.hourlyFlow.map((h, i) => (
                                                        <div key={i} className="flex-1 h-full relative group">
                                                            {/* Hover Trigger Zone */}
                                                            <div className="absolute inset-0 cursor-crosshair group-hover:bg-orange-500/10 border-x border-transparent group-hover:border-orange-500/30 transition-colors"></div>

                                                            {/* Tooltip */}
                                                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-10 bg-stone-900 text-white text-[10px] font-bold px-3 py-1.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-md">
                                                                {h} MINS @ {i}:00
                                                            </div>

                                                            {/* Label */}
                                                            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                                                                <span className={`text-[12px] font-black tracking-tighter ${i % 4 === 0 ? 'text-stone-900' : 'text-stone-300'}`}>
                                                                    {i.toString().padStart(2, '0')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="h-8" /> {/* Spacer for labels */}
                                        </div>
                                    )}
                                </TerminalCard>
                            )}

                            {activeTab === 'pulse' && (
                                <div className="flex flex-col gap-6 h-full">

                                    {/* TOP ROW: 7-Day Heatmap (Full Width) */}
                                    <TerminalCard title="7-Day Activity Matrix" icon={Cpu}>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-center text-[13px] font-bold text-stone-400 uppercase mb-3">
                                                <span>Historical Density (Mon - Sun)</span>
                                                <div className="flex gap-4 items-center">
                                                    <span className="text-[11px]">Less</span>
                                                    <div className="flex gap-1">
                                                        <div className="w-4 h-4 bg-stone-100 border border-stone-200"></div>
                                                        <div className="w-4 h-4 bg-orange-100"></div>
                                                        <div className="w-4 h-4 bg-orange-300"></div>
                                                        <div className="w-4 h-4 bg-orange-500"></div>
                                                    </div>
                                                    <span className="text-[11px]">More</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2 overflow-x-auto custom-scrollbar pb-10">
                                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dIdx) => (
                                                    <div key={day} className="flex items-center gap-4 min-w-max">
                                                        <span className="flex-none w-12 text-[12px] font-bold text-stone-400 uppercase">{day}</span>
                                                        <div className="flex-1 grid grid-cols-[repeat(24,minmax(18px,1fr))] gap-1.5">
                                                            {Array.from({ length: 24 }).map((_, hIdx) => {
                                                                const val = dashboardData?.weeklyHeatmap?.[dIdx]?.[hIdx] || 0;
                                                                const color = val > 45 ? 'bg-orange-500 shadow-[0_0_8px_rgba(234,88,12,0.3)]' :
                                                                    val > 20 ? 'bg-orange-300' :
                                                                        val > 0 ? 'bg-orange-100' : 'bg-stone-50 border border-stone-100';
                                                                return (
                                                                    <div
                                                                        key={hIdx}
                                                                        title={`${day} ${hIdx}:00 - ${val}m`}
                                                                        className={`h-6 rounded-none transition-all hover:scale-125 hover:z-20 cursor-crosshair ${color}`}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                                <div className="flex items-center gap-4 mt-4 min-w-max">
                                                    <span className="flex-none w-12"></span>
                                                    <div className="flex-1 grid grid-cols-[repeat(24,minmax(18px,1fr))] gap-1.5">
                                                        {Array.from({ length: 24 }).map((_, i) => (
                                                            <span key={i} className="text-[11px] text-center text-stone-400 font-bold">
                                                                {i % 4 === 0 ? i : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </TerminalCard>

                                    {/* BOTTOM ROW: WPM + Comparison (50/50 Split) */}
                                    <div className="grid grid-cols-2 gap-6">

                                        {/* LEFT: Input Velocity */}
                                        <TerminalCard title="Input Velocity" icon={Keyboard}>
                                            <div className="flex flex-col items-center py-4">
                                                <div className="w-40 h-40 border-8 border-stone-100 flex flex-col items-center justify-center relative bg-white shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]">
                                                    <div className="absolute inset-0 border-t-8 border-orange-500 animate-spin-slow" style={{ animationDuration: '3s' }}></div>
                                                    <span className="text-5xl font-black text-stone-900 leading-none">{wpmStats.wpm}</span>
                                                    <span className="text-[13px] font-bold text-orange-600 tracking-widest mt-2">WPM</span>
                                                </div>
                                                <div className="w-full mt-8 space-y-4">
                                                    <div className="flex justify-between text-[13px] font-bold text-stone-500 border-b border-stone-100 pb-2">
                                                        <span>TOTAL_KEYS</span>
                                                        <span className="text-stone-900 font-black">{wpmStats.totalKeystrokes.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[13px] font-bold text-stone-500 border-b border-stone-100 pb-2">
                                                        <span>TYPING_TIME</span>
                                                        <span className="text-stone-900 font-black">{formatDuration(wpmStats.activeTypingTime)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </TerminalCard>

                                        {/* RIGHT: Weekly Comparison */}
                                        <TerminalCard title="Weekly Comparison" icon={Activity}>
                                            <div className="flex flex-col h-full justify-center gap-6">

                                                {/* Main Comparison Display */}
                                                <div className="bg-stone-50 border-2 border-stone-200 p-5">
                                                    <div className="text-[12px] font-bold text-stone-400 uppercase tracking-widest mb-4">
                                                        vs. Weekly Average
                                                    </div>

                                                    {(!wpmStats || (wpmStats as any).weeklyAvg === 0) ? (
                                                        <div className="flex flex-col items-center py-6">
                                                            <span className="text-[18px] font-black text-stone-400 uppercase">Build your history</span>
                                                            <span className="text-[11px] text-stone-300 font-bold mt-2 text-center font-mono">
                                                                {"["} DATA_ACCUMULATING_7D_WINDOW {"]"}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-end justify-between mb-2">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[28px] font-black text-stone-900 leading-none">
                                                                        {wpmStats.wpm}
                                                                    </span>
                                                                    <span className="text-[8px] font-bold text-stone-400 uppercase">Current</span>
                                                                </div>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-[28px] font-black text-stone-400 leading-none">
                                                                        {(wpmStats as any).weeklyAvg}
                                                                    </span>
                                                                    <span className="text-[8px] font-bold text-stone-400 uppercase">Average</span>
                                                                </div>
                                                            </div>

                                                            {/* Trend Indicator */}
                                                            <div className={`flex items-center gap-2 mt-4 pt-4 border-t-2 border-stone-200 ${
                                                                (wpmStats as any).trend > 0 ? 'text-orange-600' : 
                                                                (wpmStats as any).trend < 0 ? 'text-stone-400' : 'text-stone-500'
                                                                }`}>
                                                                {(wpmStats as any).trend > 0 ? (
                                                                    <Zap className="w-5 h-5 fill-current" />
                                                                ) : (wpmStats as any).trend < 0 ? (
                                                                    <Layers className="w-5 h-5 text-stone-300 rotate-180" />
                                                                ) : (
                                                                    <Hash className="w-5 h-5 text-stone-400" />
                                                                )}
                                                                <span className="text-[14px] font-black uppercase tracking-wide">
                                                                    {(wpmStats as any).trend > 0 ? '+' : ''}{(wpmStats as any).trend}%
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Context Message */}
                                                {wpmStats && (wpmStats as any).weeklyAvg > 0 && (
                                                    <div className="text-[12px] text-stone-400 leading-relaxed mt-4">
                                                        {(wpmStats as any).trend > 0 ? (
                                                            <span>▶ You're typing <strong className="text-orange-600">faster</strong> than your weekly average. Keep it up!</span>
                                                        ) : (wpmStats as any).trend < 0 ? (
                                                            <span>▶ You're typing <strong className="text-stone-600">slower</strong> than your weekly average. Warm up?</span>
                                                        ) : (
                                                            <span>▶ You're typing <strong className="text-stone-500">exactly</strong> at your weekly average. Solid consistency!</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </TerminalCard>

                                    </div>
                                </div>
                            )}

                            {activeTab === 'inventory' && (
                                <TerminalCard className="h-full" title="Process Inventory" icon={Layers}>
                                    {loading ? (
                                        <div className="flex-1 flex items-center justify-center font-mono text-xs animate-pulse text-stone-400">
                                            SCANNING_PROCESS_STACK...
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-6 h-full justify-center">
                                            {(dashboardData?.topApps || []).length > 0 ? (
                                                dashboardData?.topApps.map((app, i) => (
                                                    <div key={i} className="flex flex-col gap-2 group">
                                                        <div className="flex justify-between text-sm font-bold text-stone-700 font-mono group-hover:text-orange-700 transition-colors">
                                                            <span className="flex items-center gap-3"><Hash className="w-4 h-4 text-stone-400" /> {app.name}</span>
                                                            <span className="text-stone-400">{app.time}</span>
                                                        </div>
                                                        <DigitalBar percentage={app.percent} colorClass="bg-orange-500" />
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center font-mono text-xs text-stone-400 uppercase tracking-widest">
                                                    No activity recorded today
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </TerminalCard>
                            )}

                            {activeTab === 'control' && (
                                <TerminalCard className="h-full" title="System Configuration" icon={Shield}>
                                    <div className="flex flex-col h-full gap-6">

                                        {/* Section 1: Privacy Controls */}
                                        <div className="flex flex-col gap-4">
                                            <div className="text-[13px] text-stone-500 font-bold uppercase tracking-widest border-b border-stone-200 pb-3">
                                                Privacy Controls
                                            </div>
                                            <TerminalToggle
                                                label="Incognito Mode"
                                                icon={EyeOff}
                                                checked={isIncognito}
                                                onChange={(val) => {
                                                    setIsIncognito(val);
                                                    window.aetherAPI.updateSettings({ isIncognito: val });
                                                }}
                                            />
                                            <p className="text-[13px] text-stone-400 leading-relaxed font-mono mt-1">
                                                When enabled, all activity tracking and WPM collection are paused immediately.
                                            </p>
                                            
                                            <div>
                                                <TerminalToggle
                                                    label="Launch on Startup"
                                                    icon={Power}
                                                    checked={autoLaunchEnabled}
                                                    onChange={async (val) => {
                                                        await window.aetherAPI.setAutoLaunch(val);
                                                        setAutoLaunchEnabled(val);
                                                    }}
                                                />
                                                {autoLaunchEnabled && (
                                                    <p className="text-[9px] text-orange-600 font-bold mt-2">
                                                        ✓ Auto-launch enabled - Aether will start with Windows
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Section 2: Data Management */}
                                        <div className="flex flex-col gap-4">
                                            <div className="text-[13px] text-stone-500 font-bold uppercase tracking-widest border-b border-stone-200 pb-3">
                                                Data Management
                                            </div>

                                            {/* Storage Stats */}
                                            <div className="bg-stone-50 border border-stone-200 p-4 rounded-none">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-mono font-bold text-stone-700">Stored Records</span>
                                                    <span className="text-xs text-orange-600">
                                                        {(dashboardData as any)?.totalRecords || 0}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-mono font-bold text-stone-700">Session Start</span>
                                                    <span className="text-xs font-mono text-stone-500">{uptime}</span>
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-stone-200">
                                                    <p className="text-[12px] text-stone-400 leading-relaxed font-mono">
                                                        {">"} Data is automatically deleted after 30 days to protect privacy.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Wipe Data Action */}
                                            <div className="bg-rose-50 border border-rose-200 p-4 rounded-none">
                                                <div className="text-[13px] text-rose-600 font-bold uppercase tracking-widest mb-3">
                                                    Danger Zone
                                                </div>
                                                <p className="text-[12px] text-rose-400 leading-relaxed font-mono mb-4">
                                                    Permanently delete all activity logs and WPM history. This action cannot be undone.
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm('⚠️ WARNING: This will delete all recorded data permanently. Continue?')) {
                                                            window.aetherAPI.wipeData();
                                                            // Optionally refresh dashboard data here
                                                        }
                                                    }}
                                                    className="w-full bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold px-5 py-4 rounded-none transition-colors uppercase tracking-wider flex items-center justify-center gap-3"
                                                >
                                                    <Power className="w-4 h-4" />
                                                    Wipe All Data
                                                </button>
                                            </div>
                                        </div>

                                        {/* Section 3: System Info */}
                                        <div className="mt-auto pt-4 border-t border-stone-200">
                                            <div className="flex justify-between text-[11px] text-stone-400 font-mono">
                                                <span>AETHER.OS v1.0.0</span>
                                                <span>BUILD: STABLE</span>
                                            </div>
                                        </div>

                                    </div>
                                </TerminalCard>
                            )}

                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: NAVIGATION SIDEBAR */}
                <div className="w-64 flex flex-col gap-6">

                    {/* Brand Block */}
                    <div className="bg-stone-900 text-white p-8 rounded-none shadow-[6px_6px_0px_0px_rgba(234,88,12,1)] border-2 border-stone-800">
                        <h1 className="text-3xl font-black tracking-tighter mb-2">AETHER<span className="text-orange-500">.OS</span></h1>
                        <p className="text-[12px] text-stone-400 font-mono uppercase tracking-widest">Environment Control</p>
                    </div>

                    <nav className="bg-white border-2 border-stone-200 rounded-none p-2 shadow-[4px_4px_0px_0px_rgba(229,115,115,0.1)]">
                        <NavItem id="flow" label="Daily Flow" icon={Activity} activeTab={activeTab} onSelect={handleTabChange} />
                        <NavItem id="pulse" label="Input Pulse" icon={Keyboard} activeTab={activeTab} onSelect={handleTabChange} />
                        <NavItem id="inventory" label="App Inventory" icon={Layers} activeTab={activeTab} onSelect={handleTabChange} />
                        <NavItem id="control" label="Control Plane" icon={Shield} activeTab={activeTab} onSelect={handleTabChange} />
                    </nav>

                    <div className="flex-1 flex flex-col justify-end gap-4">
                        {/* Clock Widget */}
                        <div className="bg-white border-2 border-stone-200 p-6 rounded-none flex items-center justify-between shadow-sm group hover:border-orange-300 transition-colors">
                            <div className="flex flex-col">
                                <span className="text-[11px] text-stone-400 font-mono uppercase">System Time</span>
                                <span className="font-mono text-2xl font-bold text-stone-800">{formattedTime}</span>
                            </div>
                            <Clock className="w-6 h-6 text-stone-300 group-hover:text-orange-500 transition-colors" />
                        </div>

                        {/* Shutdown Button */}
                        <button 
                            onClick={() => window.aetherAPI.enterSleepMode()}
                            className="w-full flex items-center justify-center gap-3 text-white font-bold text-sm uppercase tracking-widest transition-all bg-stone-900 hover:bg-rose-600 border-2 border-stone-900 hover:border-rose-600 px-8 py-5 rounded-none shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-1 active:shadow-none"
                        >
                            <Power className="w-5 h-5" />
                            Sleep Mode
                        </button>
                    </div>

                </div>

            </div>
        </div>
    );
}
