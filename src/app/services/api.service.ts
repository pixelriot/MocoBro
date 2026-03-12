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
    date: string;
    seconds?: number;
    [key: string]: unknown;
}

export interface MocoProfile {
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

    getPresences(from: string, to: string) {
        return this.doFetch<MocoPresence[]>(`${this.base}users/presences?from=${from}&to=${to}`);
    }

    getActivities(from: string, to: string) {
        return this.doFetch<MocoActivity[]>(`${this.base}activities?from=${from}&to=${to}`);
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
