import { redirect } from "next/navigation";

import { requireUser } from "../../../platform/auth/session";
import { onboardingDestination } from "../../../platform/auth/validation";

export const dynamic = "force-dynamic";
export default async function CallbackPage() {
  const user = await requireUser();
  redirect(onboardingDestination(user.name));
}
