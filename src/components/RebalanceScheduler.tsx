/**
 * RebalanceScheduler Component
 * Manages scheduled portfolio rebalancing with SQLite persistence.
 * Checks for overdue schedules on mount and provides a visual timeline.
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Play,
  AlarmClock,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  History,
} from 'lucide-react';
import { invokeWithResilience } from '../services/apiClient';
import { useToast } from './Toast';
import { createLogger } from '../core/logger';
import { Button, IconButton, EmptyState, Tooltip } from '@flowfolio/ui';
import './RebalanceScheduler.css';

const log = createLogger('RebalanceScheduler');

const LEGACY_STORAGE_KEY = 'flowfolio_rebalance_schedules';
// LEGACY: old localStorage key for history — migrated to SQLite user_settings
const LEGACY_HISTORY_KEY = 'flowfolio_rebalance_history';
const HISTORY_SETTING_KEY = 'rebalance_history';

interface RebalanceSchedule {
  id: string;
  planName: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  nextRun: string;
  lastRun?: string;
  enabled: boolean;
  createdAt: string;
}

interface RebalanceHistoryEntry {
  id: string;
  scheduleId: string;
  planName: string;
  executedAt: string;
  status: 'completed' | 'skipped' | 'snoozed';
}

interface RebalanceSchedulerProps {
  onRunRebalance?: (planName: string) => void;
  onNavigate?: (tab: string) => void;
}

type Frequency = RebalanceSchedule['frequency'];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function generateId(): string {
  return `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadHistory(): Promise<RebalanceHistoryEntry[]> {
  try {
    const val = await invokeWithResilience<string | null>('load_setting', { key: HISTORY_SETTING_KEY });
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: RebalanceHistoryEntry[]): void {
  invokeWithResilience('save_setting', { key: HISTORY_SETTING_KEY, value: JSON.stringify(history) })
    .catch((err: unknown) => log.warn('Failed to persist rebalance history', String(err)));
}

function calculateNextRun(
  frequency: Frequency,
  dayOfWeek?: number,
  dayOfMonth?: number,
  fromDate?: Date
): string {
  const now = fromDate || new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly': {
      const target = dayOfWeek ?? 1; // default Monday
      let daysUntil = target - now.getDay();
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
      break;
    }
    case 'monthly': {
      const target = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(target, daysInMonth(next.getFullYear(), next.getMonth())));
      break;
    }
    case 'quarterly': {
      const target = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 3);
      next.setDate(Math.min(target, daysInMonth(next.getFullYear(), next.getMonth())));
      break;
    }
  }

  return next.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function isOverdue(schedule: RebalanceSchedule): boolean {
  if (!schedule.enabled) return false;
  const today = new Date().toISOString().slice(0, 10);
  return schedule.nextRun <= today;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RebalanceScheduler({
  onRunRebalance,
  onNavigate: _onNavigate,
}: RebalanceSchedulerProps) {
  const { addToast } = useToast();

  const [schedules, setSchedules] = useState<RebalanceSchedule[]>([]);
  const [history, setHistory] = useState<RebalanceHistoryEntry[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<string[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  // Form state
  const [formPlanName, setFormPlanName] = useState('');
  const [formFrequency, setFormFrequency] = useState<Frequency>('monthly');
  const [formDayOfWeek, setFormDayOfWeek] = useState(1);
  const [formDayOfMonth, setFormDayOfMonth] = useState(1);

  // Load schedules from SQLite on mount
  useEffect(() => {
    let mounted = true;
    invokeWithResilience<RebalanceSchedule[]>('list_schedules')
      .then(data => { if (mounted) setSchedules(data ?? []); })
      .catch((err: unknown) => {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Failed to load schedules from SQLite', msg);
        setSchedules([]);
      });
    loadHistory().then(data => { if (mounted) setHistory(data); });
    return () => { mounted = false; };
  }, []);

  // Migrate legacy localStorage schedules to SQLite (one-time)
  useEffect(() => {
    let mounted = true;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      try {
        const items: RebalanceSchedule[] = JSON.parse(legacy);
        Promise.all(items.map((s) => invokeWithResilience('save_schedule', { schedule: s })))
          .then(() => {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            return invokeWithResilience<RebalanceSchedule[]>('list_schedules');
          })
          .then(data => { if (mounted) setSchedules(data ?? []); })
          .catch((err: unknown) => {
            if (mounted) log.warn('Legacy schedule migration failed', String(err));
          });
      } catch {
        // ignore malformed legacy data
      }
    }
    return () => { mounted = false; };
  }, []);

  // Migrate legacy localStorage history to SQLite user_settings (one-time)
  useEffect(() => {
    let mounted = true;
    const legacyHistory = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (legacyHistory) {
      try {
        const items: RebalanceHistoryEntry[] = JSON.parse(legacyHistory);
        invokeWithResilience('save_setting', { key: HISTORY_SETTING_KEY, value: JSON.stringify(items) })
          .then(() => {
            localStorage.removeItem(LEGACY_HISTORY_KEY);
            return loadHistory();
          })
          .then(data => { if (mounted) setHistory(data); })
          .catch((err: unknown) => {
            if (mounted) log.warn('Legacy history migration failed', String(err));
          });
      } catch {
        // ignore malformed legacy history
      }
    }
    return () => { mounted = false; };
  }, []);

  // Fetch available plans when form is shown
  useEffect(() => {
    if (!showCreateForm) return;
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlansLoading(true);
    invokeWithResilience<string[]>('list_saved_plans')
      .then((plans) => {
        if (!mounted) return;
        setAvailablePlans(plans);
        if (plans.length > 0 && !formPlanName) {
          setFormPlanName(plans[0]);
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Failed to load plans', msg);
        setAvailablePlans([]);
      })
      .finally(() => { if (mounted) setPlansLoading(false); });
    return () => { mounted = false; };
  }, [showCreateForm, formPlanName]);

  const overdueSchedules = useMemo(
    () => schedules.filter(isOverdue),
    [schedules]
  );

  const nextRunPreview = useMemo(
    () => calculateNextRun(formFrequency, formDayOfWeek, formDayOfMonth),
    [formFrequency, formDayOfWeek, formDayOfMonth]
  );

  const timelineEvents = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    const endStr = end.toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    const events: Array<{
      date: string;
      planName: string;
      isOverdue: boolean;
      dayOffset: number;
    }> = [];

    for (const sched of schedules) {
      if (!sched.enabled) continue;
      let runDate = sched.nextRun;

      // Add the current next run and subsequent ones within 30 days
      let iterations = 0;
      while (runDate <= endStr && iterations < 10) {
        events.push({
          date: runDate,
          planName: sched.planName,
          isOverdue: runDate <= todayStr,
          dayOffset: daysBetween(todayStr, runDate),
        });
        // Calculate next occurrence after this one
        const nextFrom = new Date(runDate + 'T00:00:00');
        runDate = calculateNextRun(
          sched.frequency,
          sched.dayOfWeek,
          sched.dayOfMonth,
          nextFrom
        );
        iterations++;
      }
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules]);

  const refreshSchedules = useCallback(() => {
    invokeWithResilience<RebalanceSchedule[]>('list_schedules')
      .then(data => setSchedules(data ?? []))
      .catch((err: unknown) => log.warn('Failed to refresh schedules', String(err)));
  }, []);

  const updateSchedules = useCallback(
    (updater: (prev: RebalanceSchedule[]) => RebalanceSchedule[]) => {
      setSchedules((prev) => {
        const next = updater(prev);
        // Persist each changed schedule to SQLite
        Promise.all(next.map((s) => invokeWithResilience('save_schedule', { schedule: s })))
          .then(refreshSchedules)
          .catch((err: unknown) => log.warn('Failed to persist schedules', String(err)));
        return next;
      });
    },
    [refreshSchedules]
  );

  const addHistoryEntry = useCallback(
    (entry: RebalanceHistoryEntry) => {
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, 100); // keep last 100
        saveHistory(next);
        return next;
      });
    },
    []
  );

  const handleCreate = useCallback(() => {
    if (!formPlanName.trim()) {
      addToast('Please select or enter a plan name', 'warning');
      return;
    }

    const schedule: RebalanceSchedule = {
      id: generateId(),
      planName: formPlanName.trim(),
      frequency: formFrequency,
      dayOfWeek: formFrequency === 'weekly' ? formDayOfWeek : undefined,
      dayOfMonth:
        formFrequency === 'monthly' || formFrequency === 'quarterly'
          ? formDayOfMonth
          : undefined,
      nextRun: nextRunPreview,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    invokeWithResilience('save_schedule', { schedule })
      .then(refreshSchedules)
      .catch((err: unknown) => log.warn('Failed to save new schedule', String(err)));
    setSchedules((prev) => [...prev, schedule]);
    setShowCreateForm(false);
    setFormPlanName('');
    addToast(`Schedule created for "${schedule.planName}"`, 'success');
    log.info('Schedule created', schedule);
  }, [
    formPlanName,
    formFrequency,
    formDayOfWeek,
    formDayOfMonth,
    nextRunPreview,
    refreshSchedules,
    addToast,
  ]);

  const handleToggle = useCallback(
    (id: string) => {
      updateSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
      );
    },
    [updateSchedules]
  );

  const handleDelete = useCallback(
    (id: string) => {
      invokeWithResilience('delete_schedule', { id })
        .then(refreshSchedules)
        .catch((err: unknown) => log.warn('Failed to delete schedule', String(err)));
      addToast('Schedule deleted', 'info');
    },
    [refreshSchedules, addToast]
  );

  const handleRunNow = useCallback(
    (schedule: RebalanceSchedule) => {
      const now = new Date().toISOString();
      const nextRun = calculateNextRun(
        schedule.frequency,
        schedule.dayOfWeek,
        schedule.dayOfMonth
      );

      updateSchedules((prev) =>
        prev.map((s) =>
          s.id === schedule.id ? { ...s, lastRun: now, nextRun } : s
        )
      );

      addHistoryEntry({
        id: generateId(),
        scheduleId: schedule.id,
        planName: schedule.planName,
        executedAt: now,
        status: 'completed',
      });

      if (onRunRebalance) {
        onRunRebalance(schedule.planName);
      }

      addToast(`Rebalance triggered for "${schedule.planName}"`, 'success');
      log.info(`Manual rebalance run for ${schedule.planName}`);
    },
    [updateSchedules, addHistoryEntry, onRunRebalance, addToast]
  );

  const handleSnooze = useCallback(
    (schedule: RebalanceSchedule) => {
      const nextRun = calculateNextRun(
        schedule.frequency,
        schedule.dayOfWeek,
        schedule.dayOfMonth
      );

      updateSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? { ...s, nextRun } : s))
      );

      addHistoryEntry({
        id: generateId(),
        scheduleId: schedule.id,
        planName: schedule.planName,
        executedAt: new Date().toISOString(),
        status: 'snoozed',
      });

      addToast(`Snoozed until ${formatDate(nextRun)}`, 'info');
    },
    [updateSchedules, addHistoryEntry, addToast]
  );

  return (
    <div className="rebalance-scheduler">
      <div className="page-header">
        <div className="page-title">
          <Calendar size={22} />
          <h2>Rebalance Scheduler</h2>
        </div>
        <div className="header-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            leftIcon={<History size={14} />}
          >
            History
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
            leftIcon={<Plus size={14} />}
          >
            New Schedule
          </Button>
        </div>
      </div>

      {/* Overdue Banner */}
      {overdueSchedules.length > 0 && (
        <div className="overdue-banner">
          <AlertTriangle size={18} />
          <div className="overdue-content">
            {overdueSchedules.map((sched) => {
              const daysAgo = sched.lastRun
                ? daysBetween(sched.lastRun.slice(0, 10), new Date().toISOString().slice(0, 10))
                : null;
              return (
                <div key={sched.id} className="overdue-item">
                  <p className="overdue-message">
                    {FREQUENCY_LABELS[sched.frequency]} rebalance for{' '}
                    <strong>{sched.planName}</strong> is overdue
                    {daysAgo !== null
                      ? ` \u2014 last run was ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`
                      : ' \u2014 never run'}
                    .
                  </p>
                  <div className="overdue-actions">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRunNow(sched)}
                      leftIcon={<Play size={12} />}
                    >
                      Run Now
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSnooze(sched)}
                      leftIcon={<AlarmClock size={12} />}
                    >
                      Snooze
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Schedule Form */}
      {showCreateForm && (
        <div className="create-form card">
          <h3>Create Schedule</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="text-muted">Plan Name</label>
              {plansLoading ? (
                <div className="text-muted" style={{ padding: '0.5rem' }}>
                  Loading plans...
                </div>
              ) : availablePlans.length > 0 ? (
                <div className="select-wrapper">
                  <select
                    className="form-select"
                    value={formPlanName}
                    onChange={(e) => setFormPlanName(e.target.value)}
                  >
                    {availablePlans.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              ) : (
                <input
                  type="text"
                  className="form-input"
                  value={formPlanName}
                  onChange={(e) => setFormPlanName(e.target.value)}
                  placeholder="Enter plan name"
                />
              )}
            </div>

            <div className="form-group">
              <label className="text-muted">Frequency</label>
              <div className="select-wrapper">
                <select
                  className="form-select"
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value as Frequency)}
                >
                  {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="select-icon" />
              </div>
            </div>

            {formFrequency === 'weekly' && (
              <div className="form-group">
                <label className="text-muted">Day of Week</label>
                <div className="select-wrapper">
                  <select
                    className="form-select"
                    value={formDayOfWeek}
                    onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                  >
                    {DAYS_OF_WEEK.map((day, i) => (
                      <option key={i} value={i}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              </div>
            )}

            {(formFrequency === 'monthly' || formFrequency === 'quarterly') && (
              <div className="form-group">
                <label className="text-muted">Day of Month</label>
                <div className="select-wrapper">
                  <select
                    className="form-select"
                    value={formDayOfMonth}
                    onChange={(e) => setFormDayOfMonth(Number(e.target.value))}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              </div>
            )}

            <div className="form-group next-run-preview">
              <label className="text-muted">Next Run</label>
              <span className="font-mono preview-date">{formatDate(nextRunPreview)}</span>
            </div>
          </div>

          <div className="form-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              leftIcon={<Plus size={14} />}
            >
              Create Schedule
            </Button>
          </div>
        </div>
      )}

      {/* Active Schedules List */}
      <div className="schedules-list">
        {schedules.length === 0 ? (
          <EmptyState
            icon={<Calendar size={20} />}
            title="No rebalance schedules"
            description="Create one to get started."
            action={{ label: 'New Schedule', onClick: () => setShowCreateForm(true) }}
          />
        ) : (
          schedules.map((schedule) => {
            const overdue = isOverdue(schedule);
            return (
              <div
                key={schedule.id}
                className={`schedule-card card ${overdue ? 'overdue' : ''} ${!schedule.enabled ? 'disabled' : ''}`}
              >
                <div className="schedule-main">
                  <div className="schedule-info">
                    <div className="schedule-name">
                      {schedule.planName}
                      {overdue && <span className="tag tag-overdue">Due</span>}
                    </div>
                    <div className="schedule-meta text-muted">
                      <span className="tag">{FREQUENCY_LABELS[schedule.frequency]}</span>
                      {schedule.frequency === 'weekly' &&
                        schedule.dayOfWeek !== undefined && (
                          <span>{DAYS_OF_WEEK[schedule.dayOfWeek]}</span>
                        )}
                      {(schedule.frequency === 'monthly' ||
                        schedule.frequency === 'quarterly') &&
                        schedule.dayOfMonth !== undefined && (
                          <span>Day {schedule.dayOfMonth}</span>
                        )}
                    </div>
                  </div>
                  <div className="schedule-dates">
                    <div className="schedule-date">
                      <Clock size={12} />
                      <span className="text-muted">Next:</span>
                      <span className="font-mono">{formatDate(schedule.nextRun)}</span>
                    </div>
                    {schedule.lastRun && (
                      <div className="schedule-date">
                        <CheckCircle size={12} />
                        <span className="text-muted">Last:</span>
                        <span className="font-mono">
                          {formatDate(schedule.lastRun.slice(0, 10))}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="schedule-actions">
                    <Tooltip content={schedule.enabled ? 'Disable' : 'Enable'} side="left">
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(schedule.id)}
                        aria-label={schedule.enabled ? 'Disable schedule' : 'Enable schedule'}
                      >
                        {schedule.enabled ? (
                          <ToggleRight size={18} className="toggle-on" />
                        ) : (
                          <ToggleLeft size={18} className="toggle-off" />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="Delete schedule" side="left">
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(schedule.id)}
                        aria-label="Delete schedule"
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Schedule Timeline */}
      {timelineEvents.length > 0 && (
        <div className="timeline-section card">
          <h3>Upcoming (Next 30 Days)</h3>
          <div className="timeline">
            <div className="timeline-track">
              {timelineEvents.map((event, i) => {
                const leftPercent = Math.min((event.dayOffset / 30) * 100, 100);
                return (
                  <div
                    key={`${event.date}-${event.planName}-${i}`}
                    className={`timeline-marker ${event.isOverdue ? 'overdue' : ''}`}
                    style={{ left: `${leftPercent}%` }}
                    title={`${event.planName} - ${formatDate(event.date)}`}
                  >
                    <div className="timeline-dot" />
                    <div className="timeline-label">
                      <span className="timeline-plan">{event.planName}</span>
                      <span className="timeline-date font-mono">
                        {event.date.slice(5)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="timeline-axis">
              <span>Today</span>
              <span>+30d</span>
            </div>
          </div>
        </div>
      )}

      {/* History Log */}
      {showHistory && (
        <div className="history-section card">
          <h3>Execution History</h3>
          {history.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
              No history yet.
            </p>
          ) : (
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.planName}</td>
                    <td className="font-mono">
                      {formatDate(entry.executedAt.slice(0, 10))}
                    </td>
                    <td>
                      <span className={`tag tag-${entry.status}`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
export { RebalanceScheduler };
export default memo(RebalanceScheduler);
