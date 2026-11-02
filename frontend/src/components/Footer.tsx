import React from "react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 text-gray-500 py-6 text-xs mt-auto">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <span className="font-semibold text-gray-800">GhostLoad AI</span> · B2B emergency recovery network
          <p className="text-[11px] text-gray-400 mt-0.5">
            Notice: All company profiles, parts catalog, and transactions are hypothetical demonstration data.
          </p>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-gray-500">
          <span>OR-Tools Linear Solver</span>
          <span>·</span>
          <span>SAP AI Core Adapter Ready</span>
          <span>·</span>
          <span>HANA Portable Schema</span>
        </div>
      </div>
    </footer>
  );
}
