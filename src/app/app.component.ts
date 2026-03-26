import { ZardButtonComponent } from '@/shared/components/button/button.component';
import { ZardFormLabelComponent } from '@/shared/components/form/form.component';
import { ZardSelectItemComponent } from '@/shared/components/select/select-item.component';
import { ZardSelectComponent } from '@/shared/components/select/select.component';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, MocoActivity, MocoPresence, MocoProject } from './services/api.service';
import { ZardToastComponent } from './shared/components/toast/toast.component';
import { ZardCardComponent } from './shared/components/card';
import { ZardIconComponent } from './shared/components/icon';
import { ZardInputGroupComponent } from './shared/components/input-group';
import { toast } from 'ngx-sonner';

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

  // --- State ---

  selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  apiKey = '';
  isLoggedIn = false;
  profileFirstName = '';
  isSending = false;
  assignedProjects: MocoProject[] = [];
  selectedProjectId: number | null = null;
  selectedTaskId: number | null = null;
  taskDescription = '';
  activitiesDates = new Set<string>();
  presencesDates = new Set<string>();
  presenceSecondsByDate = new Map<string, number>();
  lazyDates: string[] = [];

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
      from: new Date(y, m, 1).toISOString().slice(0, 10),
      to: new Date(y, m + 1, 0).toISOString().slice(0, 10),
    };
  }

  private async getPresences(): Promise<MocoPresence[]> {
    const { from, to } = this.getMonthRange();
    const res = await this.api.getPresences(from, to);
    return res.data;
  }

  private async getActivities(): Promise<MocoActivity[]> {
    const { from, to } = this.getMonthRange();
    const res = await this.api.getActivities(from, to);
    return res.data;
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
    const data = res.data as { first_name?: string } | null;
    if (!data || !data.first_name) {
      this.isLoggedIn = false;
      throw new Error('Invalid profile data received');
    }
    this.profileFirstName = data.first_name;
    this.isLoggedIn = true;
    return data;
  }

  // --- Data fetching ---

  async runAll(): Promise<void> {
    try {
      const [presences, activities, assigned] = await Promise.all([
        this.getPresences(),
        this.getActivities(),
        this.getAssigned(),
      ]);

      console.log('Fetched data:', { presences, activities, assigned });

      this.assignedProjects = Array.isArray(assigned) ? assigned : [];
      this.restoreSavedSelections();
      this.parseActivities(activities);
      this.parsePresences(presences);
    } catch (err) {
      console.error('runAll error:', err);
    }
  }

  private async fetchMonthData(): Promise<void> {
    try {
      const [presences, activities] = await Promise.all([
        this.getPresences(),
        this.getActivities(),
      ]);
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

    if (!Array.isArray(items)) {
      this.computeLazyDates();
      return;
    }

    for (const it of items) {
      if (typeof it.date === 'string' && it.date) {
        this.activitiesDates.add(it.date.slice(0, 10));
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
    this.lazyDates = [...this.presencesDates].filter(d => !this.activitiesDates.has(d)).sort();
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
    return date?.toLocaleDateString() ?? '';
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
