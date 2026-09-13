"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin requests work in local development and on a configured custom domain.
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
