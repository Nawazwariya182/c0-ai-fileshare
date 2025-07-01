/*
  Copyright © 2025 Nawaz & Tabish All rights reserved.
  Project: Contentify (Proprietary Software)
  
  This code is the exclusive property of the copyright holder.
  Unauthorized copying, modification, redistribution, or use of any part
  of this codebase — including the name "Contentify" — is strictly prohibited.

  This software is confidential and proprietary. By accessing or using this code,
  you agree to comply with the terms set forth in the LICENSE file.
*/
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

export default clerkMiddleware(async (auth, req) => {
    if (isProtectedRoute(req)) await auth.protect();
});

const isProtectedRoute = createRouteMatcher([
    "/dashboard(.*)",
  ]);

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};