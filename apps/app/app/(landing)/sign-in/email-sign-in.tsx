"use client";

import { signIn, signUp } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

type Mode = "sign-in" | "sign-up";

export function EmailSignIn({ domainHint }: { domainHint?: string }) {
	const router = useRouter();
	const emailId = useId();
	const passwordId = useId();
	const nameId = useId();
	const [mode, setMode] = useState<Mode>("sign-in");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const form = new FormData(event.currentTarget);
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");
		const name = String(form.get("name") ?? "").trim();
		const origin = window.location.origin;

		const result =
			mode === "sign-up"
				? await signUp.email({
						email,
						password,
						name,
						callbackURL: `${origin}/`,
					})
				: await signIn.email({
						email,
						password,
						callbackURL: `${origin}/`,
					});

		if (result.error) {
			toast.error(result.error.message ?? "Could not sign in.");
			setPending(false);
			return;
		}

		router.refresh();
		router.replace("/");
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			<FieldGroup>
				{mode === "sign-up" ? (
					<Field>
						<FieldLabel htmlFor={nameId}>Name</FieldLabel>
						<Input
							id={nameId}
							name="name"
							autoComplete="name"
							required
						/>
					</Field>
				) : null}

				<Field>
					<FieldLabel htmlFor={emailId}>Email</FieldLabel>
					<Input
						id={emailId}
						name="email"
						type="email"
						autoComplete="email"
						required
					/>
					{domainHint ? (
						<FieldDescription>
							Use your @{domainHint} address.
						</FieldDescription>
					) : null}
				</Field>

				<Field>
					<FieldLabel htmlFor={passwordId}>Password</FieldLabel>
					<Input
						id={passwordId}
						name="password"
						type="password"
						autoComplete={
							mode === "sign-up" ? "new-password" : "current-password"
						}
						minLength={8}
						required
					/>
				</Field>
			</FieldGroup>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{mode === "sign-up" ? "Create account" : "Sign in"}
			</Button>

			<p className="text-center text-muted-foreground text-sm/5">
				{mode === "sign-up" ? "Already have an account?" : "Need an account?"}{" "}
				<button
					className="text-foreground underline underline-offset-4"
					disabled={pending}
					onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
					type="button"
				>
					{mode === "sign-up" ? "Sign in" : "Create one"}
				</button>
			</p>
		</form>
	);
}
