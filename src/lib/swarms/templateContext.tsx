"use client";

import { createContext, useContext, type ReactNode } from "react";

interface SwarmTemplateCtx {
  isTemplate: boolean;
}

const SwarmTemplateContext = createContext<SwarmTemplateCtx>({ isTemplate: false });

export function SwarmTemplateProvider({
  isTemplate,
  children,
}: {
  isTemplate: boolean;
  children: ReactNode;
}) {
  return (
    <SwarmTemplateContext.Provider value={{ isTemplate }}>
      {children}
    </SwarmTemplateContext.Provider>
  );
}

export function useSwarmTemplate(): SwarmTemplateCtx {
  return useContext(SwarmTemplateContext);
}
