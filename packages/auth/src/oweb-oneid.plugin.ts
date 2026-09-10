import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import {
	getSupabasePublishableKey,
	getSupabaseServiceRoleKey,
	getSupabaseUrl,
	isOwebOneIdEnabled,
	OWEB_ONEID_PROVIDER_ID,
	SALESFLOW_APP_ID,
} from "./oweb-config";
import { isWorkspaceEmail } from "./workspace";

const accessTokenBody = z.object({
	accessToken: z.string().trim().min(1),
});

const launchTokenBody = z.object({
	launchToken: z.string().trim().min(1),
});

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function supabaseAuthClient() {
	const url = getSupabaseUrl();
	const key = getSupabasePublishableKey();
	if (!url || !key) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "OWeb OneID is not configured.",
		});
	}
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

function supabaseAdminClient() {
	const url = getSupabaseUrl();
	const key = getSupabaseServiceRoleKey();
	if (!url || !key) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "OWeb OneID SSO is not configured.",
		});
	}
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

type SupabaseUser = {
	id: string;
	email?: string | null;
	email_confirmed_at?: string | null;
	user_metadata?: Record<string, unknown> | null;
};

async function verifyAccessToken(accessToken: string): Promise<SupabaseUser> {
	const client = supabaseAuthClient();
	const { data, error } = await client.auth.getUser(accessToken);
	if (error || !data.user?.email) {
		throw new APIError("UNAUTHORIZED", {
			message: "Invalid OWeb sign-in.",
		});
	}
	return data.user;
}

function displayName(user: SupabaseUser): string {
	const metadata = user.user_metadata ?? {};
	const fromMetadata =
		(typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
		(typeof metadata.name === "string" && metadata.name.trim());
	if (fromMetadata) return fromMetadata;
	const local = user.email?.split("@")[0]?.trim();
	return local && local.length > 0 ? local : "User";
}

async function resolveCrmUser(
	ctx: {
		context: {
			internalAdapter: {
				findUserByEmail: (
					email: string,
					options: { includeAccounts: boolean },
				) => Promise<{
					user: {
						id: string;
						name: string;
						email: string;
						emailVerified: boolean;
						image?: string | null;
					};
					accounts: { providerId: string }[];
				} | null>;
				createAccount: (account: {
					id: string;
					userId: string;
					providerId: string;
					accountId: string;
				}) => Promise<unknown>;
				createUser: (user: {
					id: string;
					name: string;
					email: string;
					emailVerified: boolean;
					image?: string;
				}) => Promise<{
					id: string;
					name: string;
					email: string;
					emailVerified: boolean;
					image?: string | null;
				}>;
			};
		};
	},
	supabaseUser: SupabaseUser,
) {
	const email = supabaseUser.email?.trim().toLowerCase();
	if (!email || !isWorkspaceEmail(email)) {
		const domain = email?.split("@")[1];
		throw new APIError("FORBIDDEN", {
			message: domain
				? `This CRM is private. Sign in with your allowed address, not @${domain}.`
				: "This CRM is private. That address is not on the allow-list.",
		});
	}

	const existing = await ctx.context.internalAdapter.findUserByEmail(email, {
		includeAccounts: true,
	});

	if (existing) {
		const linked = existing.accounts.some(
			(account) => account.providerId === OWEB_ONEID_PROVIDER_ID,
		);
		if (!linked) {
			await ctx.context.internalAdapter.createAccount({
				id: crypto.randomUUID(),
				userId: existing.user.id,
				providerId: OWEB_ONEID_PROVIDER_ID,
				accountId: supabaseUser.id,
			});
		}
		return existing.user;
	}

	const created = await ctx.context.internalAdapter.createUser({
		id: crypto.randomUUID(),
		name: displayName(supabaseUser),
		email,
		emailVerified: Boolean(supabaseUser.email_confirmed_at),
		image:
			typeof supabaseUser.user_metadata?.avatar_url === "string"
				? supabaseUser.user_metadata.avatar_url
				: undefined,
	});

	await ctx.context.internalAdapter.createAccount({
		id: crypto.randomUUID(),
		userId: created.id,
		providerId: OWEB_ONEID_PROVIDER_ID,
		accountId: supabaseUser.id,
	});

	return created;
}

async function mintSession(
	ctx: Parameters<typeof setSessionCookie>[0],
	userId: string,
) {
	const user = await ctx.context.internalAdapter.findUserById(userId);
	if (!user) {
		throw new APIError("UNAUTHORIZED", {
			message: "Could not start a CRM session.",
		});
	}

	const session = await ctx.context.internalAdapter.createSession(userId);
	if (!session) {
		throw new APIError("UNAUTHORIZED", {
			message: "Could not start a CRM session.",
		});
	}

	await setSessionCookie(ctx, { session, user });

	return { session, user };
}

export function owebOneIdPlugin(): BetterAuthPlugin {
	if (!isOwebOneIdEnabled()) {
		return { id: "oweb-oneid", endpoints: {} };
	}

	return {
		id: "oweb-oneid",
		endpoints: {
			exchange: createAuthEndpoint(
				"/oweb/exchange",
				{
					method: "POST",
					body: accessTokenBody,
				},
				async (ctx) => {
					const supabaseUser = await verifyAccessToken(ctx.body.accessToken);
					const user = await resolveCrmUser(ctx, supabaseUser);
					const result = await mintSession(ctx, user.id);
					return ctx.json({
						user: result.user,
						token: result.session.token,
					});
				},
			),
			ssoRedeem: createAuthEndpoint(
				"/oweb/sso/redeem",
				{
					method: "POST",
					body: launchTokenBody,
				},
				async (ctx) => {
					if (!getSupabaseServiceRoleKey()) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "OWeb OneID SSO is not configured.",
						});
					}

					const tokenHash = hashToken(ctx.body.launchToken);
					const admin = supabaseAdminClient();
					const now = new Date().toISOString();

					const { data: row, error } = await admin
						.from("ao_ecosystem_launch_tokens")
						.select(
							"id, app_id, org_id, user_id, access_token, refresh_token, expires_at, consumed_at",
						)
						.eq("token_hash", tokenHash)
						.maybeSingle();

					if (error) {
						throw new APIError("BAD_REQUEST", { message: error.message });
					}
					if (!row) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid launch token.",
						});
					}
					if (row.consumed_at) {
						throw new APIError("BAD_REQUEST", {
							message: "Launch token already used.",
						});
					}
					if (row.expires_at <= now) {
						throw new APIError("BAD_REQUEST", {
							message: "Launch token expired.",
						});
					}
					if (row.app_id !== SALESFLOW_APP_ID) {
						throw new APIError("BAD_REQUEST", {
							message: "Launch token is for another app.",
						});
					}

					const { error: consumeError } = await admin
						.from("ao_ecosystem_launch_tokens")
						.update({ consumed_at: now })
						.eq("id", row.id)
						.is("consumed_at", null);

					if (consumeError) {
						throw new APIError("BAD_REQUEST", {
							message: consumeError.message,
						});
					}

					const supabaseUser = await verifyAccessToken(row.access_token);
					const user = await resolveCrmUser(ctx, supabaseUser);
					const result = await mintSession(ctx, user.id);

					return ctx.json({
						user: result.user,
						token: result.session.token,
						accessToken: row.access_token,
						refreshToken: row.refresh_token,
						orgId: row.org_id,
					});
				},
			),
		},
	};
}
