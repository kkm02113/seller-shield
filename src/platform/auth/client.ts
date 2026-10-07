"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Same-origin HTTP calls preserve Better Auth's cookies and rate-limit middleware.
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
