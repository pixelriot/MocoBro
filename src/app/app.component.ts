import { ZardButtonComponent } from '@/shared/components/button/button.component';
import { ZardFormLabelComponent } from '@/shared/components/form/form.component';
import { ZardSelectItemComponent } from '@/shared/components/select/select-item.component';
import { ZardSelectComponent } from '@/shared/components/select/select.component';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, MocoAbsenceRequest, MocoActivity, MocoPresence, MocoProject, MocoSchedule } from './services/api.service';
import { ZardToastComponent } from './shared/components/toast/toast.component';
import { ZardCardComponent } from './shared/components/card';
import { ZardIconComponent } from './shared/components/icon';
import { ZardInputGroupComponent } from './shared/components/input-group';
import { ZardDialogService } from './shared/components/dialog';
import { toast } from 'ngx-sonner';

/** Minimalinfo zu einer gebuchten Aktivität – genug zum Löschen. */
export interface ActivityRef {
  id: number;
  billed: boolean;
}

interface ConflictActivity extends ActivityRef {
  date: string;
}

/** Abwesenheit eines einzelnen Tages, zusammengeführt aus Schedules und offenen Anträgen. */
export interface DayAbsence {
  am: boolean;
  pm: boolean;
  label: string;
  /** true, solange für diesen Tag ein Antrag ohne Freigabe existiert. */
  pending: boolean;
}

const ABSENCE_CODE_LABELS: Record<string, string> = {
  '1': 'Nicht planbar',
  '2': 'Feiertag',
  '3': 'Krankheit',
  '4': 'Urlaub',
  '5': 'Abwesend',
};

const ABSENCE_REQUEST_LABELS: Record<MocoAbsenceRequest['type'], string> = {
  vacation: 'Urlaub',
  sickness: 'Krankheit',
  other: 'Abwesend',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ZardFormLabelComponent,
    ZardButtonComponent,
    ZardCardComponent,
    ZardInputGroupComponent,
    ZardIconComponent,
    ZardSelectComponent,
    ZardSelectItemComponent,
    ZardToastComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(ZardDialogService);

  // --- State ---

  selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  apiKey = '';
  isLoggedIn = false;
  profileFirstName = '';
  profileUserId: number | null = null;
  isSending = false;
  assignedProjects: MocoProject[] = [];
  selectedProjectId: number | null = null;
  selectedTaskId: number | null = null;
  taskDescription = '';
  activitiesDates = new Set<string>();
  presencesDates = new Set<string>();
  presenceSecondsByDate = new Map<string, number>();
  absencesByDate = new Map<string, DayAbsence>();
  activitiesByDate = new Map<string, ActivityRef[]>();
  lazyDates: string[] = [];
  isDeletingConflicts = false;
  /** true, wenn der API-Key Abwesenheitsanträge nicht lesen darf (403). */
  absenceRequestsForbidden = false;
  /** Tage mit gebuchten Stunden, die inzwischen ganztägig abwesend sind. */
  conflictDates = new Set<string>();

  // --- Lifecycle ---

  async ngOnInit(): Promise<void> {
    const saved = localStorage.getItem('apiKey');
    if (saved) {
      this.setApiKey(saved);
      try {
        await this.getProfile();
        await this.runAll();
      } catch (e) {
        console.warn('getProfile on init failed', e);
        this.clearApiKey();
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg || 'Login failed');
      }
    }
  }

  // --- API key ---

  private setApiKey(key: string): void {
    this.apiKey = key;
    this.api.setApiKey(key);
    this.absenceRequestsForbidden = false;
  }

  async saveApiKey(value: string) {
    this.setApiKey(value ?? '');
    localStorage.setItem('apiKey', this.apiKey);
    try {
      await this.getProfile();
      await this.runAll();
    } catch (e) {
      this.clearApiKey();
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || 'Login failed');
      throw e;
    }
  }

  clearApiKey() {
    this.setApiKey('');
    this.profileFirstName = '';
    localStorage.removeItem('apiKey');
    this.isLoggedIn = false;
  }

  // --- Project / Task selection ---

  get tasksForSelectedProject(): MocoProject['tasks'] {
    return this.assignedProjects.find(x => x.id === this.selectedProjectId)?.tasks ?? [];
  }

  onProjectSelect(value: string | string[]) {
    this.selectedProjectId = this.toNumberOrNull(value);
    this.selectedTaskId = null;

  }

  onTaskSelect(value: string | string[]) {
    this.selectedTaskId = this.toNumberOrNull(value);

  }

  private toNumberOrNull(value: string | string[]): number | null {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw ? Number(raw) : null;
  }

  // --- API calls ---

  private getMonthRange(): { from: string; to: string } {
    const y = this.selectedMonth.getFullYear();
    const m = this.selectedMonth.getMonth();
    return {
      from: this.formatDateKey(new Date(y, m, 1)),
      to: this.formatDateKey(new Date(y, m + 1, 0)),
    };
  }

  private async getPresences(): Promise<MocoPresence[]> {
    const { from, to } = this.getMonthRange();
    const res = await this.api.getPresences(from, to);
    return res.data;
  }

  private async getActivities(): Promise<MocoActivity[]> {
    const { from, to } = this.getMonthRange();
    const res = await this.api.getActivities(from, to, this.profileUserId);
    return res.data;
  }

  private async getSchedules(): Promise<MocoSchedule[]> {
    const { from, to } = this.getMonthRange();
    const res = await this.api.getSchedules(from, to, this.profileUserId);
    if (!res.ok) {
      console.warn('schedules request failed', res.status, res.data);
      return [];
    }
    return Array.isArray(res.data) ? res.data : [];
  }

  private async getPendingAbsenceRequests(): Promise<MocoAbsenceRequest[]> {
    if (this.absenceRequestsForbidden) return [];

    const res = await this.api.getAbsenceRequests('pending', this.profileUserId);
    if (!res.ok) {
      console.warn('absence_requests request failed', res.status, res.data);
      // 403: der Key darf Anträge nicht lesen – nicht bei jedem Monatswechsel erneut versuchen.
      if (res.status === 403 || res.status === 401) this.absenceRequestsForbidden = true;
      return [];
    }
    return Array.isArray(res.data) ? res.data : [];
  }

  private async getAssigned(): Promise<MocoProject[]> {
    const res = await this.api.getAssigned();
    return res.data;
  }

  async getProfile() {
    const res = await this.api.getProfile();
    if (!res.ok) {
      this.isLoggedIn = false;
      throw new Error(`Profile request failed with status ${res.status}`);
    }
    const data = res.data as { id?: number; first_name?: string } | null;
    if (!data || !data.first_name) {
      this.isLoggedIn = false;
      throw new Error('Invalid profile data received');
    }
    this.profileFirstName = data.first_name;
    this.profileUserId = typeof data.id === 'number' ? data.id : null;
    this.isLoggedIn = true;
    return data;
  }

  // --- Data fetching ---

  async runAll(): Promise<void> {
    try {
      const [presences, activities, assigned, schedules, absenceRequests] = await Promise.all([
        this.getPresences(),
        this.getActivities(),
        this.getAssigned(),
        this.getSchedules(),
        this.getPendingAbsenceRequests(),
      ]);

      console.log('Fetched data:', { presences, activities, assigned, schedules, absenceRequests });

      this.assignedProjects = Array.isArray(assigned) ? assigned : [];
      this.restoreSavedSelections();
      this.parseAbsences(schedules, absenceRequests);
      this.parseActivities(activities);
      this.parsePresences(presences);
    } catch (err) {
      console.error('runAll error:', err);
    }
  }

  private async fetchMonthData(): Promise<void> {
    try {
      const [presences, activities, schedules, absenceRequests] = await Promise.all([
        this.getPresences(),
        this.getActivities(),
        this.getSchedules(),
        this.getPendingAbsenceRequests(),
      ]);
      this.parseAbsences(schedules, absenceRequests);
      this.parseActivities(activities);
      this.parsePresences(presences);
    } catch (err) {
      console.error('fetchMonthData error:', err);
    }
  }

  // --- Month navigation ---

  previousMonth(): void {
    const y = this.selectedMonth.getFullYear();
    const m = this.selectedMonth.getMonth();
    this.selectedMonth = new Date(y, m - 1, 1);
    this.fetchMonthData();
  }

  nextMonth(): void {
    const y = this.selectedMonth.getFullYear();
    const m = this.selectedMonth.getMonth();
    this.selectedMonth = new Date(y, m + 1, 1);
    this.fetchMonthData();
  }

  // --- Send activities ---

  async onSendClicked(): Promise<void> {
    if (!this.canSend || !this.lazyDates.length) return;
    this.saveSelections();

    const activities = this.lazyDates
      .map(d => {
        const seconds = this.presenceSecondsByDate.get(d);
        if (!seconds || seconds <= 0) return null;
        return {
          date: d,
          description: this.taskDescription,
          project_id: this.selectedProjectId!,
          task_id: this.selectedTaskId!,
          seconds,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    console.log('Prepared activities to send:', activities);
    if (activities.length === 0) return;

    this.isSending = true;
    try {
      const res = await this.api.postActivitiesBulk({ activities });
      if (!res.ok) {
        console.error('activities/bulk failed', res.status, res.data);
        const detail = res.data && typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
        toast.error(`Senden fehlgeschlagen (${res.status})` + (detail ? `: ${detail}` : ''));
        return;
      }
      toast.success(`Erfolgreich ${activities.length} Aktivität(en) gesendet`);
      await this.runAll();
    } catch (err) {
      console.error('onSendClicked error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || 'Fehler beim Senden');
    } finally {
      this.isSending = false;
    }
  }

  get canSend(): boolean {
    return this.selectedProjectId != null && this.selectedTaskId != null && !!this.taskDescription?.trim();
  }

  get presentDaysCount(): number {
    return this.presencesDates.size;
  }

  get activityDaysCount(): number {
    return this.activitiesDates.size;
  }

  // --- Parsing ---

  private parseActivities(items: MocoActivity[]): void {
    this.activitiesDates.clear();
    this.activitiesByDate.clear();

    if (!Array.isArray(items)) {
      this.computeLazyDates();
      return;
    }

    for (const it of items) {
      if (typeof it.date !== 'string' || !it.date) continue;

      // Doppelt gesichert: die Abfrage filtert bereits auf den eigenen Nutzer.
      if (this.profileUserId != null && it.user?.id != null && it.user.id !== this.profileUserId) continue;

      const date = it.date.slice(0, 10);
      this.activitiesDates.add(date);

      if (typeof it.id === 'number') {
        const refs = this.activitiesByDate.get(date) ?? [];
        refs.push({ id: it.id, billed: it.billed === true });
        this.activitiesByDate.set(date, refs);
      }
    }

    this.computeLazyDates();
  }

  private parsePresences(items: MocoPresence[]): void {
    this.presencesDates.clear();
    this.presenceSecondsByDate.clear();

    if (!Array.isArray(items)) {
      this.computeLazyDates();
      return;
    }

    for (const it of items) {
      const date = typeof it.date === 'string' ? it.date.slice(0, 10) : null;
      if (!date) continue;

      this.presencesDates.add(date);

      const from = typeof it.from === 'string' ? it.from : null;
      const to = typeof it.to === 'string' ? it.to : null;

      if (!from || !to) continue;

      const seconds = this.clockDiffSeconds(from, to);
      if (seconds > 0) {
        this.presenceSecondsByDate.set(date, (this.presenceSecondsByDate.get(date) ?? 0) + seconds);
      }
    }

    this.computeLazyDates();
  }


  private parseAbsences(schedules: MocoSchedule[], requests: MocoAbsenceRequest[]): void {
    this.absencesByDate.clear();

    for (const it of schedules) {
      const date = typeof it.date === 'string' ? it.date.slice(0, 10) : null;
      if (!date) continue;

      const code = it.assignment?.code ?? '';
      const label = ABSENCE_CODE_LABELS[code] ?? it.assignment?.name ?? 'Abwesend';
      this.mergeAbsence(date, it.am !== false, it.pm !== false, label, false);
    }

    // Offene Anträge kennen keinen Zeitraumfilter – deshalb hier auf den Monat eingrenzen.
    const { from, to } = this.getMonthRange();
    for (const req of requests) {
      const label = ABSENCE_REQUEST_LABELS[req.type] ?? 'Abwesend';
      for (const day of req.days ?? []) {
        const date = typeof day.date === 'string' ? day.date.slice(0, 10) : null;
        if (!date || date < from || date > to) continue;
        this.mergeAbsence(date, day.am !== false, day.pm !== false, label, true);
      }
    }

    this.computeLazyDates();
  }

  private mergeAbsence(date: string, am: boolean, pm: boolean, label: string, pending: boolean): void {
    const existing = this.absencesByDate.get(date);
    if (!existing) {
      this.absencesByDate.set(date, { am, pm, label, pending });
      return;
    }

    existing.am = existing.am || am;
    existing.pm = existing.pm || pm;
    existing.pending = existing.pending || pending;
    if (!existing.label.includes(label)) existing.label = `${existing.label}, ${label}`;
  }

  private clockDiffSeconds(from: string, to: string): number {
    const f = this.parseClockToSeconds(from);
    const t = this.parseClockToSeconds(to);
    return (f != null && t != null && t > f) ? t - f : 0;
  }

  private parseClockToSeconds(value: string): number | null {
    const match = value?.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = match[3] != null ? Number(match[3]) : 0;

    if (h > 23 || m > 59 || (s ?? 0) > 59) return null;
    return h * 3600 + m * 60 + (s ?? 0);
  }

  private computeLazyDates(): void {
    this.lazyDates = [...this.presencesDates]
      .filter(d => !this.activitiesDates.has(d))
      .filter(d => !this.isFullDayAbsence(d))
      .sort();

    this.conflictDates = new Set([...this.activitiesDates].filter(d => this.isFullDayAbsence(d)));
  }

  // --- Abwesenheiten ---

  /**
   * Nur ganztägige Abwesenheiten blocken einen Tag. Bei halben Tagen bildet die
   * Anwesenheitszeit die tatsächlich gearbeiteten Stunden ab und darf gebucht werden.
   */
  isFullDayAbsence(dateKey: string): boolean {
    const absence = this.absencesByDate.get(dateKey);
    return !!absence && absence.am && absence.pm;
  }

  absenceFor(date: Date | null): DayAbsence | undefined {
    return date ? this.absencesByDate.get(this.formatDateKey(date)) : undefined;
  }

  isPendingAbsenceDay(date: Date | null): boolean {
    return this.absenceFor(date)?.pending === true;
  }

  /** Ganztägige Abwesenheiten im angezeigten Monat. */
  get absenceDaysCount(): number {
    return [...this.absencesByDate.values()].filter(a => a.am && a.pm).length;
  }

  get pendingAbsenceDaysCount(): number {
    return [...this.absencesByDate.values()].filter(a => a.pending).length;
  }

  /** Schiefstand: Stunden gebucht, obwohl der Tag inzwischen als Abwesenheit geführt wird. */
  get conflicts(): { key: string; label: string; absence: string; pending: boolean; deletable: number; billed: number }[] {
    return [...this.conflictDates].sort().map(key => {
      const absence = this.absencesByDate.get(key);
      const refs = this.activitiesByDate.get(key) ?? [];
      return {
        key,
        label: this.formatDateLabel(key),
        absence: absence?.label ?? 'Abwesend',
        pending: absence?.pending === true,
        deletable: refs.filter(r => !r.billed).length,
        billed: refs.filter(r => r.billed).length,
      };
    });
  }

  get deletableConflictCount(): number {
    return this.conflictActivitiesFor().filter(a => !a.billed).length;
  }

  private formatDateLabel(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  }

  // --- Schiefstand bereinigen ---

  private conflictActivitiesFor(dateKey?: string): ConflictActivity[] {
    const keys = dateKey ? [dateKey] : [...this.conflictDates].sort();
    return keys
      .filter(key => this.conflictDates.has(key))
      .flatMap(key => (this.activitiesByDate.get(key) ?? []).map(ref => ({ ...ref, date: key })));
  }

  /** Öffnet die Rückfrage. Ohne dateKey werden alle Konflikttage des Monats behandelt. */
  confirmDeleteConflicts(dateKey?: string): void {
    if (this.isDeletingConflicts) return;

    // Ohne eigene ID lässt sich nicht garantieren, dass die Buchungen wirklich uns gehören.
    if (this.profileUserId == null) {
      toast.error('Eigene Nutzer-ID unbekannt – Löschen ist vorsichtshalber deaktiviert.');
      return;
    }

    const entries = this.conflictActivitiesFor(dateKey);
    const deletable = entries.filter(e => !e.billed);

    if (deletable.length === 0) {
      toast.error('Nichts zu löschen – die betroffenen Buchungen sind bereits abgerechnet.');
      return;
    }

    const days = [...new Set(deletable.map(e => e.date))].sort().map(d => this.formatDateLabel(d));
    const skipped = entries.length - deletable.length;

    this.dialog.create({
      zTitle: `${deletable.length} Buchung(en) löschen?`,
      zDescription:
        `Betroffene Tage: ${days.join(', ')}.`
        + (skipped > 0 ? ` ${skipped} bereits abgerechnete Buchung(en) bleiben unberührt.` : '')
        + ' Das lässt sich nicht rückgängig machen.',
      zOkText: 'Löschen',
      zOkDestructive: true,
      zCancelText: 'Abbrechen',
      zOnOk: () => {
        this.deleteActivities(deletable);
      },
    });
  }

  private async deleteActivities(entries: ConflictActivity[]): Promise<void> {
    this.isDeletingConflicts = true;
    let deleted = 0;
    const failedDays: string[] = [];

    try {
      // Nacheinander, damit ein Fehler die übrigen Buchungen nicht mitreißt.
      for (const entry of entries) {
        const res = await this.api.deleteActivity(entry.id);
        if (res.ok) deleted++;
        else {
          console.error('activity delete failed', entry.id, res.status, res.data);
          failedDays.push(this.formatDateLabel(entry.date));
        }
      }
    } catch (err) {
      console.error('deleteActivities error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || 'Fehler beim Löschen');
    } finally {
      this.isDeletingConflicts = false;
    }

    if (deleted > 0) toast.success(`${deleted} Buchung(en) gelöscht`);
    if (failedDays.length > 0) {
      toast.error(`Nicht gelöscht: ${[...new Set(failedDays)].join(', ')}`);
    }

    await this.fetchMonthData();
  }

  dayClasses(date: Date | null): string {
    if (!date) return '';

    const key = this.formatDateKey(date);
    const classes: string[] = [];

    if (this.activitiesDates.has(key)) classes.push('bg-green-400');
    else if (this.isFullDayAbsence(key)) classes.push('bg-blue-300');
    else if (this.presencesDates.has(key)) classes.push('bg-red-600');
    else classes.push('bg-gray-300');

    if (this.presencesDates.has(key)) classes.push('border-2', 'border-gray-700');

    // Konflikt schlägt den Pending-Hinweis – hier muss etwas korrigiert werden.
    if (this.conflictDates.has(key)) classes.push('ring-2', 'ring-purple-600');
    else if (this.isPendingAbsenceDay(date)) classes.push('ring-2', 'ring-amber-500');

    return classes.join(' ');
  }

  // --- Calendar grid ---

  get monthsGrid(): { label: string; weeks: (Date | null)[][] }[] {
    const year = this.selectedMonth.getFullYear();
    const month = this.selectedMonth.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const displayStart = this.startOfWeek(monthStart);
    const displayEnd = this.endOfWeek(monthEnd);

    const weeks: (Date | null)[][] = [];
    let cur = new Date(displayStart);
    while (cur <= displayEnd) {
      const week: (Date | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cur);
        week.push(d >= monthStart && d <= monthEnd ? d : null);
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    return [{ label: monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' }), weeks }];
  }

  private startOfWeek(date: Date): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfWeek(date: Date): Date {
    const s = this.startOfWeek(date);
    s.setDate(s.getDate() + 6);
    s.setHours(23, 59, 59, 999);
    return s;
  }

  formatDateKey(date: Date | null): string {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatDayTitle(date: Date | null): string {
    if (!date) return '';

    const absence = this.absenceFor(date);
    if (!absence) return date.toLocaleDateString();

    const half = absence.am && absence.pm ? '' : absence.am ? ' (vormittags)' : ' (nachmittags)';
    const pending = absence.pending ? ' – noch nicht bestätigt' : '';
    const conflict = this.conflictDates.has(this.formatDateKey(date)) ? ' – ACHTUNG: Stunden gebucht' : '';
    return `${date.toLocaleDateString()} – ${absence.label}${half}${pending}${conflict}`;
  }

  // --- LocalStorage persistence ---

  private restoreSavedSelections(): void {
    const raw = localStorage.getItem('savedSelections');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { projectId?: number | null; taskId?: number | null; description?: string };
        if (parsed.projectId != null && this.assignedProjects.some(p => p.id === parsed.projectId)) {
          this.selectedProjectId = parsed.projectId;
        } else if (this.assignedProjects.length > 0 && this.selectedProjectId == null) {
          this.selectedProjectId = this.assignedProjects[0].id;
        }

        if (this.selectedProjectId != null && parsed.taskId != null) {
          const tasks = this.assignedProjects.find(p => p.id === this.selectedProjectId)?.tasks ?? [];
          this.selectedTaskId = tasks.some(t => t.id === parsed.taskId) ? parsed.taskId : null;
        }

        if (parsed.description) this.taskDescription = parsed.description;
      } catch {
        // ignore malformed savedSelections
        if (this.assignedProjects.length > 0 && this.selectedProjectId == null) {
          this.selectedProjectId = this.assignedProjects[0].id;
        }
      }
    } else {
      if (this.assignedProjects.length > 0 && this.selectedProjectId == null) {
        this.selectedProjectId = this.assignedProjects[0].id;
      }
    }
  }
  private saveSelections(): void {
    const payload = {
      projectId: this.selectedProjectId ?? null,
      taskId: this.selectedTaskId ?? null,
      description: this.taskDescription?.trim() ?? '',
    };
    localStorage.setItem('savedSelections', JSON.stringify(payload));
  }

  onTaskDescriptionChange(value: string): void {
    this.taskDescription = value ?? '';
  }
}
