"use client";

import { OWEB_AUTH_STORAGE_KEY } from "@crm/auth/oweb-config";
import { createClient } from "@supabase/supabase-js";

function createSupabaseClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

	if (!url || !key) {
		throw new Error("OWeb OneID is not configured on this app.");
	}

	return createClient(url, key, {
		auth: {
			storage: typeof window !== "undefined" ? localStorage : undefined,
			storageKey: OWEB_AUTH_STORAGE_KEY,
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: typeof window !== "undefined",
		},
	});
}

let client: ReturnType<typeof createSupabaseClient> | undefined;

export function getOwebSupabase() {
	if (!client) client = createSupabaseClient();
	return client;
}

async function exchangeOwebSession(accessToken: string) {
	const response = await fetch("/api/auth/oweb/exchange", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ accessToken }),
	});

	const payload = (await response.json().catch(() => null)) as {
		message?: string;
		error?: { message?: string };
	} | null;

	if (!response.ok) {
		const message =
			payload?.message ??
			payload?.error?.message ??
			"Could not start a CRM session.";
		throw new Error(message);
	}
}

export async function signInWithOwebEmail(input: {
	email: string;
	password: string;
}) {
	const supabase = getOwebSupabase();
	const { data, error } = await supabase.auth.signInWithPassword(input);
	if (error) throw error;
	if (!data.session?.access_token) {
		throw new Error("Could not read the OWeb session.");
	}
	await exchangeOwebSession(data.session.access_token);
}

export async function signUpWithOwebEmail(input: {
	email: string;
	password: string;
	name: string;
}) {
	const supabase = getOwebSupabase();
	const { data, error } = await supabase.auth.signUp({
		email: input.email,
		password: input.password,
		options: {
			data: { full_name: input.name },
			emailRedirectTo:
				typeof window !== "undefined" ? window.location.origin : undefined,
		},
	});
	if (error) throw error;
	if (data.session?.access_token) {
		await exchangeOwebSession(data.session.access_token);
		return { confirmed: true as const };
	}
	return { confirmed: false as const };
}

export async function redeemOwebLaunchToken(launchToken: string) {
	const response = await fetch("/api/auth/oweb/sso/redeem", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ launchToken }),
	});

	const payload = (await response.json().catch(() => null)) as {
		message?: string;
		error?: { message?: string };
		accessToken?: string;
		refreshToken?: string | null;
	} | null;

	if (!response.ok) {
		const message =
			payload?.message ??
			payload?.error?.message ??
			"Could not complete OWeb sign-in.";
		throw new Error(message);
	}

	if (payload?.accessToken) {
		const supabase = getOwebSupabase();
		await supabase.auth.setSession({
			access_token: payload.accessToken,
			refresh_token: payload.refreshToken ?? "",
		});
	}
}
