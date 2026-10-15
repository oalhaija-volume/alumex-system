"use client";
import { createContext, useContext } from 'react';

const MobileOutdoorContext = createContext(false);
export const MobileOutdoorProvider = MobileOutdoorContext.Provider;
export function useMobileOutdoor() { return useContext(MobileOutdoorContext); }
