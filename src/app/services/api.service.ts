import { Injectable } from '@angular/core';

export interface MocoProject {
    id: number;
    identifier?: string;
    name: string;
    tasks: MocoTask[];
}

export interface MocoTask {
    id: number;
    name: string;
}

export interface MocoPresence {
    date: string;
    from: string | null;
    to: string | null;
}

export interface MocoActivity {
    id: number;
    date: string;
    seconds?: number;
    /** Abgerechnete Aktivitäten lassen sich nicht mehr löschen. */
    billed?: boolean;
    user?: { id: number };
    [key: string]: unknown;
}

/** Eingetragene Abwesenheit (bestätigt / im Kalender sichtbar). */
export interface MocoSchedule {
    id: number;
    date: string;
    am: boolean;
    pm: boolean;
    comment: string | null;
    assignment: {
        id: number;
        name: string;
        /** 1 = unplanbar, 2 = Feiertag, 3 = Krankheit, 4 = Urlaub, 5 = Abwesenheit */
        code: string;
        type: string;
    } | null;
}

export interface MocoAbsenceRequestDay {
    date: string;
    am: boolean;
    pm: boolean;
}

/** Abwesenheitsantrag – kann noch auf Freigabe warten (status = 'pending'). */
export interface MocoAbsenceRequest {
    id: number;
    type: 'vacation' | 'sickness' | 'other';
    status: 'pending' | 'approved';
    total_days: number;
    days: MocoAbsenceRequestDay[];
    comment: string | null;
    approved_at: string | null;
}

export interface MocoProfile {
    id: number;
    first_name: string;
    [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly base = 'https://apicodo.mocoapp.com/api/v1/';
    private _apiKey = '';

    get apiKey(): string {
        return this._apiKey;
    }

    setApiKey(key: string): void {
        this._apiKey = key;
    }

    private async doFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            ...(init.headers as Record<string, string> || {}),
        };
        if (this._apiKey) headers['Authorization'] = `Bearer ${this._apiKey}`;

        const res = await fetch(url, { ...init, headers });
        const text = await res.text();
        let data: T;
        try {
            data = JSON.parse(text);
        } catch {
            data = text as T;
        }
        return { ok: res.ok, status: res.status, data };
    }

    /**
     * Moco liefert Listen seitenweise (max. 100). Ohne Pagination bricht eine
     * Abfrage still ab – genau das hat den halben Monat verschluckt.
     */
    private async doFetchAllPages<T>(url: string): Promise<ApiResponse<T[]>> {
        const perPage = 100;
        const maxPages = 20;
        const all: T[] = [];
        let status = 200;

        for (let page = 1; page <= maxPages; page++) {
            const separator = url.includes('?') ? '&' : '?';
            const res = await this.doFetch<T[]>(`${url}${separator}page=${page}&per_page=${perPage}`);

            if (!res.ok) return res as ApiResponse<T[]>;
            if (!Array.isArray(res.data)) return { ok: true, status: res.status, data: all };

            status = res.status;
            all.push(...res.data);
            if (res.data.length < perPage) break;
        }

        return { ok: true, status, data: all };
    }

    getPresences(from: string, to: string) {
        return this.doFetchAllPages<MocoPresence>(`${this.base}users/presences?from=${from}&to=${to}`);
    }

    /**
     * Ohne user_id liefert Moco alle für den Account sichtbaren Aktivitäten – bei
     * Vorgesetzten also auch fremde. Deshalb immer auf den eigenen Nutzer einschränken.
     */
    getActivities(from: string, to: string, userId: number | null) {
        const user = userId != null ? `&user_id=${userId}` : '';
        return this.doFetchAllPages<MocoActivity>(`${this.base}activities?from=${from}&to=${to}${user}`);
    }

    deleteActivity(id: number) {
        return this.doFetch(`${this.base}activities/${id}`, { method: 'DELETE' });
    }

    /**
     * Der Abwesenheitskalender ist teamweit sichtbar – ohne user_id kommen die
     * Urlaube der Kolleginnen und Kollegen mit zurück.
     */
    getSchedules(from: string, to: string, userId: number | null) {
        const user = userId != null ? `&user_id=${userId}` : '';
        return this.doFetchAllPages<MocoSchedule>(`${this.base}schedules?from=${from}&to=${to}${user}`);
    }

    /** /users/absence_requests kennt keinen from/to-Filter – Datumsfilter passiert im Client. */
    getAbsenceRequests(status: 'pending' | 'approved' | null, userId: number | null) {
        const params = [
            status ? `status=${status}` : '',
            userId != null ? `user_id=${userId}` : '',
        ].filter(Boolean).join('&');
        return this.doFetchAllPages<MocoAbsenceRequest>(`${this.base}users/absence_requests${params ? '?' + params : ''}`);
    }

    getAssigned() {
        return this.doFetch<MocoProject[]>(`${this.base}projects/assigned`);
    }

    getProfile() {
        return this.doFetch<MocoProfile>(`${this.base}profile`);
    }

    postActivitiesBulk(payload: unknown) {
        return this.doFetch(`${this.base}activities/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }
}
