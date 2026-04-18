"use client";

import { AuthProvider } from "@/components/AuthProvider";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
