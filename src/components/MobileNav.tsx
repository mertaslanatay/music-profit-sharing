"use client";

import clsx from "clsx";
import { useEffect, type ReactNode } from "react";

/**
 * Kenar menüsü kabuğu.
 * Masaüstünde (lg ve üstü) menü her zamanki gibi solda sabit durur.
 * Daha dar ekranlarda menü gizlenir; üst çubuktaki menü düğmesiyle soldan
 * kayan bir çekmece olarak açılır, arka plan karartılır, Escape veya
 * dışarı tıklama kapatır.
 */
export function NavShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div aria-hidden className="fixed inset-0 z-40 bg-black/50 fade-in lg:hidden no-print" onClick={onClose} />
      )}
      <div
        className={clsx(
          "fixed inset-y-0 left-0 z-50 h-full transition-transform duration-300 ease-out",
          "lg:static lg:z-auto lg:translate-x-0 lg:transition-none",
          open ? "translate-x-0 shadow-pop" : "-translate-x-full"
        )}
      >
        {children}
      </div>
    </>
  );
}

/** Üst çubukta, yalnızca dar ekranda görünen menü düğmesi. */
export function MenuButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Menüyü aç"
      aria-expanded={open}
      className="lg:hidden w-11 h-11 -ml-2 rounded-xl grid place-items-center text-ink-700 hover:bg-ink-900/[0.06] shrink-0 no-print"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}
