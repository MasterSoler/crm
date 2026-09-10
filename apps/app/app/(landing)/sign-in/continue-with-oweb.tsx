"use client";

import { owebLoginUrl } from "@crm/auth/oweb-config";
import { Button } from "@crm/ui/components/button";

export function ContinueWithOweb() {
	return (
		<Button asChild className="w-full" type="button" variant="outline">
			<a href={owebLoginUrl({ launch: true })}>Continue with OWeb</a>
		</Button>
	);
}
