"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { redeemOwebLaunchToken } from "@/lib/oweb-supabase";

export default function SsoPage() {
	return (
		<Suspense fallback={<SsoStatus message="Signing you in…" />}>
			<SsoRedeem />
		</Suspense>
	);
}

function SsoRedeem() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const launchToken = searchParams.get("launch_token") ?? "";
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!launchToken) {
			setError(
				"Missing launch token. Open Salesflow from the OWeb App Store or sign in again.",
			);
			return;
		}

		let cancelled = false;

		void redeemOwebLaunchToken(launchToken)
			.then(() => {
				if (cancelled) return;
				router.replace("/");
				router.refresh();
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setError(
					cause instanceof Error
						? cause.message
						: "Could not complete OWeb sign-in.",
				);
			});

		return () => {
			cancelled = true;
		};
	}, [launchToken, router]);

	if (error) {
		return (
			<SsoStatus
				error={error}
				message="Could not sign you in"
				secondaryHref="/sign-in"
				secondaryLabel="Back to sign in"
			/>
		);
	}

	return <SsoStatus message="Signing you in…" />;
}

function SsoStatus({
	message,
	error,
	secondaryHref,
	secondaryLabel,
}: {
	message: string;
	error?: string;
	secondaryHref?: string;
	secondaryLabel?: string;
}) {
	return (
		<main className="flex min-h-screen items-center justify-center px-6">
			<div className="max-w-md text-center">
				<h1 className="font-semibold text-lg">{message}</h1>
				{error ? (
					<p className="mt-2 text-muted-foreground text-sm/5">{error}</p>
				) : (
					<p className="mt-2 text-muted-foreground text-sm/5">
						Completing secure handoff from OWeb.
					</p>
				)}
				{secondaryHref && secondaryLabel ? (
					<a
						className="mt-4 inline-block text-foreground text-sm underline underline-offset-4"
						href={secondaryHref}
					>
						{secondaryLabel}
					</a>
				) : null}
			</div>
		</main>
	);
}
