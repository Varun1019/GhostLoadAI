"use client";

import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";

export default function PlaceholderPage({ 
  title = "Module Coming in Next Phase", 
  phase = "Phase 2",
  description = "This module will be activated in the upcoming phase."
}: { 
  title?: string; 
  phase?: string; 
  description?: string; 
}) {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider mb-4">
        <Clock className="w-3.5 h-3.5 text-blue-400" />
        {phase}
      </div>
      <h1 className="text-3xl font-extrabold text-white mb-2">{title}</h1>
      <p className="text-slate-400 max-w-md mx-auto text-sm mb-8">{description}</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
    </div>
  );
}
