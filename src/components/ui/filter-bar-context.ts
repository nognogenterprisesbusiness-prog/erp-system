"use client";

import { createContext } from "react";

export const FilterBarContext = createContext<((name: string, value: string) => void) | null>(null);
