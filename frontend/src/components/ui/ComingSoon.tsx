"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { FEATURES, FeatureConfig } from "@/config/features";

interface ComingSoonBadgeProps {
  className?: string;
}

export function ComingSoonBadge({ className = "" }: ComingSoonBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200 tracking-wide ${className}`}
    >
      Coming soon
    </span>
  );
}

interface ComingSoonButtonProps {
  featureKey: string;
  children: React.ReactNode;
  className?: string;
}

export function ComingSoonButton({
  featureKey,
  children,
  className = "",
}: ComingSoonButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const feature: FeatureConfig | undefined = FEATURES[featureKey];
  const tooltipText = feature?.description || "This feature is currently in active development.";

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        disabled
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-xs font-medium cursor-not-allowed select-none opacity-80 ${className}`}
      >
        <span>{children}</span>
        <ComingSoonBadge />
      </button>

      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-[#111111] text-white text-[11px] rounded shadow-md text-center pointer-events-none leading-tight">
          {tooltipText}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111111]" />
        </div>
      )}
    </div>
  );
}

interface ComingSoonPageProps {
  featureKey: string;
  title?: string;
  description?: string;
}

export function ComingSoonPage({
  featureKey,
  title,
  description,
}: ComingSoonPageProps) {
  const router = useRouter();
  const feature = FEATURES[featureKey];
  const displayTitle = title || feature?.name || "Feature in Development";
  const displayDesc = description || feature?.description || "This capability is scheduled for the upcoming release.";

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-20 px-4 max-w-[1100px] mx-auto text-center w-full min-h-[60vh]">
      <div className="max-w-md space-y-4">
        <div className="inline-block">
          <ComingSoonBadge className="text-xs px-2.5 py-1" />
        </div>
        <h1 className="text-2xl font-bold text-[#111111]">{displayTitle}</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{displayDesc}</p>
        <div className="pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer"
          >
            ← Go back
          </button>
        </div>
      </div>
    </div>
  );
}
