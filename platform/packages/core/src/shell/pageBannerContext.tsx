import { createContext, useContext, useEffect, useState, type PropsWithChildren, type ReactNode } from "react";

type PageBannerContextValue = {
  title: ReactNode | null;
  setTitle: (title: ReactNode | null) => void;
  subtitle: ReactNode | null;
  setSubtitle: (subtitle: ReactNode | null) => void;
  crumbExtra: string | null;
  setCrumbExtra: (crumb: string | null) => void;
};

const PageBannerContext = createContext<PageBannerContextValue | null>(null);

// Lets a detail page give PageBanner its record's title and subtitle (wraps the routed area, shell/MainContentArea.tsx).
export const PageBannerProvider = ({ children }: PropsWithChildren) => {
  const [title, setTitle] = useState<ReactNode | null>(null);
  const [subtitle, setSubtitle] = useState<ReactNode | null>(null);
  const [crumbExtra, setCrumbExtra] = useState<string | null>(null);
  return (
    <PageBannerContext.Provider value={{ title, setTitle, subtitle, setSubtitle, crumbExtra, setCrumbExtra }}>
      {children}
    </PageBannerContext.Provider>
  );
};

// The record's title (a node, e.g. "Vessel MSC OSCAR"); null while loading or on unmount falls back to the section label.
export const usePageBannerTitle = (title: ReactNode | null | undefined) => {
  const ctx = useContext(PageBannerContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setTitle(title ?? null);
    return () => ctx.setTitle(null);
  }, [ctx, title]);
};

export const usePageBannerOverride = () => {
  const ctx = useContext(PageBannerContext);
  return ctx?.title ?? null;
};

// Optional line below the title with the record's key details (a vessel's capacity, build, age).
export const usePageBannerSubtitle = (subtitle: ReactNode | null | undefined) => {
  const ctx = useContext(PageBannerContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setSubtitle(subtitle ?? null);
    return () => ctx.setSubtitle(null);
  }, [ctx, subtitle]);
};

export const usePageBannerSubtitleOverride = () => {
  const ctx = useContext(PageBannerContext);
  return ctx?.subtitle ?? null;
};

// An unlinked trailing breadcrumb outside Refine's resource tree ("RADAR / Hull Events / Drydock").
export const usePageBannerCrumbExtra = (crumb: string | null | undefined) => {
  const ctx = useContext(PageBannerContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setCrumbExtra(crumb ?? null);
    return () => ctx.setCrumbExtra(null);
  }, [ctx, crumb]);
};

export const usePageBannerCrumbExtraOverride = () => {
  const ctx = useContext(PageBannerContext);
  return ctx?.crumbExtra ?? null;
};
