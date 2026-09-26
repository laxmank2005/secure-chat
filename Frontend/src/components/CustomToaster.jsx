import React from "react";
import { toast, Toaster, useToasterStore } from "react-hot-toast";

/* ─── Icons ──────────────────────────────────────────────────── */
const SuccessIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="12" fill="#203a27"/>
    <circle cx="12" cy="12" r="7" fill="#22c55e"/>
    <path d="M9.5 12.5L11 14L15 10" stroke="#1c1c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ErrorIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="12" fill="#3f1c1c"/>
    <circle cx="12" cy="12" r="7" fill="#ef4444"/>
    <path d="M10 10L14 14M14 10L10 14" stroke="#1c1c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LoadingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
    <circle cx="12" cy="12" r="8" stroke="#3b82f6" strokeWidth="2" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round" />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </svg>
);

/* ─── Single Toast Card ──────────────────────────────────────── */
const ToastCard = ({ t }) => {
  const isError = t.type === "error";
  const isLoading = t.type === "loading";
  const isSuccess = t.type === "success";

  const message =
    typeof t.message === "function"
      ? t.message(t)
      : typeof t.message === "string"
      ? t.message
      : String(t.message ?? "");

  return (
    <div
      role="alert"
      aria-live="polite"
      className="bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-stone-100 border border-gray-100 dark:border-stone-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-xl"
      style={{
        opacity: t.visible ? 1 : 0,
        transform: t.visible ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.95)",
        transition: "opacity 200ms cubic-bezier(0.2, 1, 0.3, 1), transform 200ms cubic-bezier(0.2, 1, 0.3, 1)",
        willChange: "opacity, transform",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "14px",
        padding: "14px 18px",
        borderRadius: "14px",
        fontSize: "14.5px",
        fontWeight: "500",
        fontFamily: "Inter, system-ui, sans-serif",
        lineHeight: "1.4",
        maxWidth: "420px",
        minWidth: "320px",
        cursor: "default",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
        {/* Icon */}
        <div style={{ flexShrink: 0, display: "flex" }}>
          {isSuccess && <SuccessIcon />}
          {isError && <ErrorIcon />}
          {isLoading && <LoadingIcon />}
          {!isSuccess && !isError && !isLoading && <SuccessIcon />}
        </div>

        {/* Message */}
        <span style={{ flex: 1, userSelect: "text" }}>{message}</span>
      </div>

      {/* Dismiss button */}
      <button
        onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
        aria-label="Dismiss notification"
        className="flex shrink-0 items-center justify-center p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-800 transition-colors focus:outline-none"
      >
        <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
};

/* ─── Custom Toaster Container ────────────────────────────────── */
const CustomToaster = () => {
  const { toasts } = useToasterStore();

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        alignItems: "flex-end",
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      {toasts
        .filter((t) => t.visible)
        .slice(0, 4)
        .map((t) => (
          <div key={t.id} style={{ pointerEvents: "auto" }}>
            <ToastCard t={t} />
          </div>
        ))}
    </div>
  );
};

export default CustomToaster;
