"use client";

import { createContext, useContext } from "react";

const DarkModeContext = createContext(false);

export const DarkModeProvider = DarkModeContext.Provider;

export function useDarkMode(): boolean {
  return useContext(DarkModeContext);
}
