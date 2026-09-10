import { primaryWorkspaceDomain } from "@crm/auth";
import type { MailboxProviderId } from "@crm/auth/scopes";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ContinueWithOweb } from "./continue-with-oweb";
import { EmailSignIn } from "./email-sign-in";
import { SocialSignIn } from "./social-sign-in";
import { type SsoProvider, SsoSignIn } from "./sso-sign-in";

export const metadata: Metadata = {
	title: "Sign in",
};

type SignInOptions = {
	google: boolean;
	microsoft: boolean;
	emailPassword: boolean;
	owebOneId: boolean;
	providers: SsoProvider[];
};

async function signInOptions(): Promise<SignInOptions | null> {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().sso.signInOptions.queryOptions(),
		);
	} catch (error) {
		unstable_rethrow(error);
		console.error("Sign-in: could not read the sign-in options.", error);
		return null;
	}
}

async function currentSession() {
	try {
		return await getSession();
	} catch (error) {
		unstable_rethrow(error);
		console.error("Sign-in: could not read the session.", error);
		return null;
	}
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
	return (
		<AuthShell>
			<Suspense
				fallback={
					<AuthHeading
						title="Welcome back"
						description="Sign in with your OWeb OneID to continue."
					/>
				}
			>
				<SignIn searchParams={searchParams} />
			</Suspense>
		</AuthShell>
	);
}

async function SignIn({
	searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
	const [session, options, { method }] = await Promise.all([
		currentSession(),
		signInOptions(),
		searchParams,
	]);

	if (session) {
		redirect("/");
	}

	const configured: MailboxProviderId[] = [];
	if (options?.google ?? true) configured.push("google");
	if (options?.microsoft ?? false) configured.push("microsoft");

	const providers = options?.providers ?? [];
	const owebOneId = options?.owebOneId ?? false;
	const emailPassword = options?.emailPassword ?? false;
	const showEmail = owebOneId || emailPassword;
	const domainHint = primaryWorkspaceDomain();

	const insisted = configured.find((provider) => provider === method);
	const showSso = providers.length > 0 && insisted === undefined;
	const social =
		insisted !== undefined
			? [insisted]
			: providers.length === 0
				? configured
				: [];

	if (!showSso && social.length === 0 && !showEmail) {
		return (
			<>
				<AuthHeading
					title="No way in yet"
					description="This CRM has no sign-in method configured, so nobody can get in — including you."
				/>

				<p className="text-center text-muted-foreground text-sm/5">
					For OWeb satellites, set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to
					the shared One OS project. Set ALLOWED_SIGN_IN to your email domain.
					Or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Google sign-in.
				</p>
			</>
		);
	}

	return (
		<>
			<AuthHeading
				title="Welcome back"
				description={
					owebOneId
						? "Sign in with your OWeb OneID email and password."
						: "Sign in with your account to continue."
				}
			/>

			{owebOneId ? <ContinueWithOweb /> : null}
			{showEmail ? (
				<EmailSignIn domainHint={domainHint} owebOneId={owebOneId} />
			) : null}
			{showSso ? <SsoSignIn providers={providers} /> : null}
			{social.map((provider) => (
				<SocialSignIn key={provider} provider={provider} />
			))}
		</>
	);
}
