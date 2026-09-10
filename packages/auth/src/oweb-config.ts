import "@crm/env/load";

const optional = (key: string): string | undefined => {
	const value = process.env[key];
	return value && value.length > 0 ? value : undefined;
};

export const OWEB_ONEID_PROVIDER_ID = "oweb-oneid" as const;

export const SALESFLOW_APP_ID = "salesflow" as const;

export const OWEB_AUTH_STORAGE_KEY = "ao-supabase-auth" as const;

export function getSupabaseUrl(): string | undefined {
	return optional("SUPABASE_URL") ?? optional("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabasePublishableKey(): string | undefined {
	return (
		optional("SUPABASE_PUBLISHABLE_KEY") ??
		optional("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
	);
}

export function getSupabaseServiceRoleKey(): string | undefined {
	return optional("SUPABASE_SERVICE_ROLE_KEY");
}

export function getOwebAppUrl(): string {
	return (optional("OWEB_APP_URL") ?? "https://oweb.one").replace(/\/$/, "");
}

export function isOwebOneIdEnabled(): boolean {
	return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function owebLoginUrl(options?: { launch?: boolean }): string {
	const url = new URL("/login", getOwebAppUrl());
	if (options?.launch) {
		url.searchParams.set("launch", SALESFLOW_APP_ID);
	}
	return url.toString();
}
