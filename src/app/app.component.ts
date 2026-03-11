import { ZardButtonComponent } from '@/shared/components/button/button.component';
import { ZardFormLabelComponent } from '@/shared/components/form/form.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ZardCardComponent } from './shared/components/card';
import { ZardInputGroupComponent } from './shared/components/input-group';
import { ZardIconComponent } from './shared/components/icon';
import { ZardSelectComponent } from '@/shared/components/select/select.component';
import { ZardSelectItemComponent } from '@/shared/components/select/select-item.component';

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
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  apiKey = '';
  // currently selected month (first day of month)
  selectedMonth: Date = ((): Date => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  })();
  assignedProjects: any[] = [];
  profileFirstName: string = '';

  selectedProjectId: number | null = null;
  selectedTaskId: number | null = null;
  taskDescription: string = '';

  get tasksForSelectedProject(): any[] {
    const p = this.assignedProjects.find(x => x.id === this.selectedProjectId);
    return p ? p.tasks ?? [] : [];
  }

  clearApiKey() {
    this.apiKey = '';
    this.profileFirstName = '';
    try {
      localStorage.removeItem('apiKey');
    } catch (e) {
      console.warn('Could not remove apiKey from localStorage', e);
    }
  }

  onProjectSelect(value: string | string[]) {
    if (Array.isArray(value)) {
      this.selectedProjectId = value.length ? Number(value[0]) : null;
    } else {
      this.selectedProjectId = value ? Number(value) : null;
    }
    this.selectedTaskId = null;
    this.saveSelectedProjectId();
    this.saveSelectedTaskId();
  }

  onTaskSelect(value: string | string[]) {
    if (Array.isArray(value)) {
      this.selectedTaskId = value.length ? Number(value[0]) : null;
    } else {
      this.selectedTaskId = value ? Number(value) : null;
    }
    console.log('Selected task ID:', this.selectedTaskId);
    console.log('Selected project ID:', this.selectedProjectId);
    this.saveSelectedTaskId();
  }

  activitiesDates = new Set<string>();
  presencesDates = new Set<string>();
  presenceSecondsByDate = new Map<string, number>();
  lazyDates: string[] = [];

  private static readonly API_BASE_URL = 'https://apicodo.mocoapp.com/api/v1/';

  async ngOnInit(): Promise<void> {
    const saved = localStorage.getItem('apiKey');
    if (saved) {
      this.apiKey = saved;
      try {
        await this.getProfile();
      } catch (e) {
        console.warn('getProfile failed', e);
      }
      // fetch everything on startup when an API key is present
      try {
        await this.runAll();
      } catch (e) {
        console.warn('runAll on init failed', e);
      }
    }
  }

  async saveApiKey(value: string) {
    console.log('Saving API key:', value);
    this.apiKey = value ?? '';
    try {
      localStorage.setItem('apiKey', this.apiKey);
    } catch (e) {
      console.warn('Could not save apiKey to localStorage', e);
    }
    // when a new API key is confirmed, fetch all data
    try {
      // fetch profile for the new key first
      try {
        await this.getProfile();
      } catch (e) {
        console.warn('getProfile after saveApiKey failed', e);
      }
      await this.runAll();
    } catch (e) {
      console.warn('runAll after saveApiKey failed', e);
    }
  }

  private async fetchMonthData(): Promise<void> {
    try {
      const presences = await this.getPrecences();
      const activities = await this.getActivities();
      this.parseActivities(activities);
      this.parsePresences(presences);
    } catch (err) {
      console.error('fetchMonthData error:', err);
    }
  }

  async getPrecences(): Promise<any> {
    const apiKey = this.apiKey || localStorage.getItem('apiKey') || '';
    const from = new Date(this.selectedMonth.getFullYear(), this.selectedMonth.getMonth(), 1);
    const to = new Date(this.selectedMonth.getFullYear(), this.selectedMonth.getMonth() + 1, 0);
    const fromParam = from.toISOString().slice(0, 10);
    const toParam = to.toISOString().slice(0, 10);
    const url = `${AppComponent.API_BASE_URL}users/presences?from=${fromParam}&to=${toParam}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        console.log('getPrecences response:', json);
        return json;
      } catch (e) {
        console.log('getPrecences response (text):', text);
        return text;
      }
    } catch (err) {
      console.error('getPrecences fetch error:', err);
      throw err;
    }
  }

  async getActivities(): Promise<any> {
    const apiKey = this.apiKey || localStorage.getItem('apiKey') || '';
    const from = new Date(this.selectedMonth.getFullYear(), this.selectedMonth.getMonth(), 1);
    const to = new Date(this.selectedMonth.getFullYear(), this.selectedMonth.getMonth() + 1, 0);
    const fromParam = from.toISOString().slice(0, 10);
    const toParam = to.toISOString().slice(0, 10);
    const url = `${AppComponent.API_BASE_URL}activities?from=${fromParam}&to=${toParam}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        console.log('getActivities response:', json);
        return json;
      } catch (e) {
        console.log('getActivities response (text):', text);
        return text;
      }
    } catch (err) {
      console.error('getActivities fetch error:', err);
      throw err;
    }
  }

  async getAssigned(): Promise<any> {
    const apiKey = this.apiKey || localStorage.getItem('apiKey') || '';
    const url = `${AppComponent.API_BASE_URL}projects/assigned`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        console.log('getAssigned response:', json);
        return json;
      } catch (e) {
        console.log('getAssigned response (text):', text);
        return text;
      }
    } catch (err) {
      console.error('getAssigned fetch error:', err);
    }
  }

  async getProfile(): Promise<any> {
    const apiKey = this.apiKey || localStorage.getItem('apiKey') || '';
    const url = `${AppComponent.API_BASE_URL}profile`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        console.log('getProfile response:', json);
        this.profileFirstName = json?.first_name ?? '';
        return json;
      } catch (e) {
        console.log('getProfile response (text):', text);
        return text;
      }
    } catch (err) {
      console.error('getProfile fetch error:', err);
      throw err;
    }
  }

  async runAll(): Promise<void> {
    try {
      const presences = await this.getPrecences();
      const activities = await this.getActivities();
      const assigned = await this.getAssigned();

      // normalize and store assigned projects so selects render
      const arr = Array.isArray(assigned) ? assigned : assigned?.data ?? assigned?.items ?? [];
      this.assignedProjects = Array.isArray(arr) ? arr : [];
      // attempt to restore saved selection if present
      const savedProject = (() => {
        try {
          const s = localStorage.getItem('selectedProjectId');
          return s != null ? Number(s) : null;
        } catch (e) {
          return null;
        }
      })();

      const hasSavedProject = savedProject != null && this.assignedProjects.some(p => p.id === savedProject);
      if (hasSavedProject) {
        this.selectedProjectId = savedProject;
      } else if (this.assignedProjects.length > 0 && this.selectedProjectId == null) {
        this.selectedProjectId = this.assignedProjects[0].id;
      }

      // try to restore saved task id if it belongs to the selected project
      const savedTask = (() => {
        try {
          const s = localStorage.getItem('selectedTaskId');
          return s != null ? Number(s) : null;
        } catch (e) {
          return null;
        }
      })();

      if (this.selectedProjectId != null && savedTask != null) {
        const proj = this.assignedProjects.find(p => p.id === this.selectedProjectId);
        const tasks = proj?.tasks ?? [];
        const hasTask = Array.isArray(tasks) && tasks.some((t: any) => t.id === savedTask);
        this.selectedTaskId = hasTask ? savedTask : null;
      }

      // restore saved task description if available
      try {
        const savedDesc = localStorage.getItem('taskDescription');
        if (savedDesc != null) this.taskDescription = savedDesc;
      } catch (e) {
        // ignore
      }

      // persist whichever selection we ended up with
      this.saveSelectedProjectId();
      this.saveSelectedTaskId();

      this.parseActivities(activities);
      this.parsePresences(presences);

      // lazyDates are computed in parse* helpers
      console.log('RUN results:', { presences, activities, assigned });
    } catch (err) {
      console.error('runAll error:', err);
    }
  }

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

  async onSendClicked(): Promise<void> {
    if (!this.canSend) {
      console.warn('Cannot send: missing project, task or description');
      return;
    }

    if (!this.lazyDates || this.lazyDates.length === 0) {
      console.warn('No lazy dates to send');
      return;
    }

    // ensure latest description is persisted
    this.saveTaskDescription();

    const apiKey = this.apiKey || localStorage.getItem('apiKey') || '';
    const url = `${AppComponent.API_BASE_URL}activities/bulk`;

    const activities = this.lazyDates
      .map(d => {
        const seconds = this.presenceSecondsByDate.get(d);
        if (!seconds || seconds <= 0) {
          console.warn('Skipping date with missing or invalid presence duration', d);
          return null;
        }

        return {
          date: d,
          description: this.taskDescription,
          project_id: Number(this.selectedProjectId),
          task_id: Number(this.selectedTaskId),
          seconds,
        };
      })
      .filter((item): item is {
        date: string;
        description: string;
        project_id: number;
        task_id: number;
        seconds: number;
      } => item !== null);

    if (activities.length === 0) {
      console.warn('No activities with valid presence duration to send');
      return;
    }

    const payload = { activities };

    console.log('Sending activities/bulk request with payload:', payload);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = text;
      }

      if (!res.ok) {
        console.error('activities/bulk failed', res.status, json);
        return;
      }

      console.log('activities/bulk response:', json);

      // Refresh data to reflect newly created activities
      try {
        await this.runAll();
      } catch (e) {
        console.warn('runAll after send failed', e);
      }
    } catch (err) {
      console.error('onSendClicked fetch error:', err);
    }
  }

  get canSend(): boolean {
    const hasProject = this.selectedProjectId !== null && this.selectedProjectId !== undefined;
    const hasTask = this.selectedTaskId !== null && this.selectedTaskId !== undefined;
    const hasDesc = !!this.taskDescription && this.taskDescription.trim().length > 0;
    return hasProject && hasTask && hasDesc;
  }

  get presentDaysCount(): number {
    return this.presencesDates.size;
  }

  get activityDaysCount(): number {
    return this.activitiesDates.size;
  }

  private parseActivities(payload: any): void {
    this.activitiesDates.clear();
    if (!payload) return;
    // payload may be array or object containing array
    const items = Array.isArray(payload) ? payload : payload?.data ?? (payload.items ?? []);
    if (!Array.isArray(items)) return;
    for (const it of items) {
      const dateStr = this.extractDateString(it);
      if (dateStr) this.activitiesDates.add(dateStr);
    }
    this.computeLazyDates();
  }

  private parsePresences(payload: any): void {
    this.presencesDates.clear();
    this.presenceSecondsByDate.clear();
    if (!payload) return;
    const items = Array.isArray(payload) ? payload : payload?.data ?? (payload.items ?? []);
    if (!Array.isArray(items)) return;
    for (const it of items) {
      // prefer explicit `date` field when present
      if (typeof it === 'string') {
        this.presencesDates.add(it.slice(0, 10));
        continue;
      }

      if (it && typeof it.date === 'string') {
        const date = it.date.slice(0, 10);
        this.presencesDates.add(date);
        const seconds = this.extractPresenceSlotSeconds(it);
        if (seconds > 0) {
          this.presenceSecondsByDate.set(date, (this.presenceSecondsByDate.get(date) ?? 0) + seconds);
        }
        continue;
      }

      // fallback: presence entries may be ranges or other single-date fields
      const from = it.from ?? it.start ?? it.from_date ?? it.start_date;
      const to = it.to ?? it.end ?? it.to_date ?? it.end_date;
      if (from && to && typeof from === 'string' && typeof to === 'string') {
        this.addDateRangeToSet(from.slice(0, 10), to.slice(0, 10), this.presencesDates);
        continue;
      }

      const single = it.day ?? it.created_at ?? it.activity_date;
      if (single && typeof single === 'string') {
        this.presencesDates.add(single.slice(0, 10));
      }
    }
    this.computeLazyDates();
  }

  private extractPresenceSlotSeconds(item: any): number {
    if (!item || typeof item !== 'object') return 0;

    const from = item.from;
    const to = item.to;
    if (typeof from !== 'string' || typeof to !== 'string') return 0;

    const fromSeconds = this.parseClockToSeconds(from);
    const toSeconds = this.parseClockToSeconds(to);
    if (fromSeconds == null || toSeconds == null || toSeconds <= fromSeconds) return 0;

    return toSeconds - fromSeconds;
  }

  private parseClockToSeconds(value: string): number | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = match[3] != null ? Number(match[3]) : 0;

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      Number.isNaN(seconds) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59 ||
      seconds < 0 ||
      seconds > 59
    ) {
      return null;
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  private computeLazyDates(): void {
    this.lazyDates = Array.from(this.presencesDates).filter(d => !this.activitiesDates.has(d)).sort();
    console.log('Dates with presence but no activity:', this.lazyDates);
  }

  private extractDateString(item: any): string | null {
    if (!item) return null;
    if (typeof item === 'string') return item.slice(0, 10);
    const candidates = ['date', 'day', 'created_at', 'activity_date', 'start', 'from', 'timestamp'];
    for (const key of candidates) {
      if (item[key] && typeof item[key] === 'string') return item[key].slice(0, 10);
    }
    return null;
  }

  private addDateRangeToSet(fromIso: string, toIso: string, set: Set<string>) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      set.add(this.formatDateKey(d));
    }
  }

  get weeks(): Date[][] {
    const monthStart = new Date(this.selectedMonth.getFullYear(), this.selectedMonth.getMonth(), 1);
    const start = this.startOfWeek(monthStart);
    const monthEnd = new Date(this.selectedMonth.getFullYear(), this.selectedMonth.getMonth() + 1, 0);
    const end = this.endOfWeek(monthEnd);
    const weeks: Date[][] = [];
    let cur = new Date(start);
    while (cur <= end) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }

  private endOfWeek(date: Date): Date {
    const s = this.startOfWeek(date);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  }

  /**
   * Returns an array of months. Each month has a label and array of weeks.
   * Weeks are arrays of 7 Date|null values where null represents a day outside the current month.
   */
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
        if (d >= monthStart && d <= monthEnd) {
          week.push(d);
        } else {
          week.push(null);
        }
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    return [{ label: monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' }), weeks }];
  }

  private startOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay(); // Sunday=0
    const diff = (day + 6) % 7; // days since Monday
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  monthLabel(week: Date[]): string {
    if (!week || week.length === 0) return '';
    const d = week[0];
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
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
    return date.toLocaleDateString();
  }

  private saveSelectedProjectId(): void {
    try {
      if (this.selectedProjectId != null) {
        localStorage.setItem('selectedProjectId', String(this.selectedProjectId));
      } else {
        localStorage.removeItem('selectedProjectId');
      }
    } catch (e) {
      console.warn('Could not persist selectedProjectId', e);
    }
  }

  private saveSelectedTaskId(): void {
    try {
      if (this.selectedTaskId != null) {
        localStorage.setItem('selectedTaskId', String(this.selectedTaskId));
      } else {
        localStorage.removeItem('selectedTaskId');
      }
    } catch (e) {
      console.warn('Could not persist selectedTaskId', e);
    }
  }

  private saveTaskDescription(): void {
    try {
      if (this.taskDescription != null && this.taskDescription.trim().length > 0) {
        localStorage.setItem('taskDescription', this.taskDescription);
      } else {
        localStorage.removeItem('taskDescription');
      }
    } catch (e) {
      console.warn('Could not persist taskDescription', e);
    }
  }

  // optional: call from template via (ngModelChange) to auto-save while typing
  onTaskDescriptionChange(value: string): void {
    this.taskDescription = value ?? '';
    this.saveTaskDescription();
  }
}
