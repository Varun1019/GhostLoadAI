"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  input_summary: string;
  output_summary: string;
  decision: string;
  reason: string;
}

export default function AuditLogPage() {
  const { apiBase } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${apiBase}/api/audit/logs?limit=150`);
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [apiBase]);

  const handleExportCSV = () => {
    window.open(`${apiBase}/api/audit/export-csv`, "_blank");
  };

  const filteredLogs = logs.filter((l) => {
    const q = searchFilter.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.actor.toLowerCase().includes(q) ||
      l.decision.toLowerCase().includes(q) ||
      l.input_summary.toLowerCase().includes(q) ||
      l.output_summary.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111111]">Audit Log</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Immutable log of all agent reasoning steps, optimizer calculations, and human decisions.
          </p>
        </div>

        <Button variant="link" onClick={handleExportCSV}>
          Export as CSV ↓
        </Button>
      </div>

      {/* Simple Search Box */}
      <div>
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter audit entries by action, actor, or decision..."
          className="w-full sm:max-w-md bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-700"
        />
      </div>

      {/* Simple Table: Time, Who, What, Result */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading audit records...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="p-12 text-center text-gray-500 text-sm border border-gray-200 rounded-lg bg-gray-50">
          No audit records found.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Who</th>
                <th className="py-2.5 px-3">What</th>
                <th className="py-2.5 px-3">Result</th>
                <th className="py-2.5 px-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              {filteredLogs.map((l) => {
                const isPositive =
                  l.decision.includes("APPROV") ||
                  l.decision.includes("ACCEPT") ||
                  l.decision.includes("FEASIBLE");
                const isNegative =
                  l.decision.includes("REJECT") ||
                  l.decision.includes("DECLINE") ||
                  l.decision.includes("SHORTFALL");

                return (
                  <tr key={l.id} className="hover:bg-gray-50/60">
                    <td className="py-2.5 px-3 font-mono text-gray-500 whitespace-nowrap">
                      {l.timestamp.replace("T", " ").split(".")[0]}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">
                      {l.actor}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-700">
                      {l.action}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <Badge variant={isPositive ? "success" : isNegative ? "danger" : "neutral"}>
                        {l.decision}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 max-w-sm truncate" title={l.output_summary || l.reason}>
                      {l.output_summary || l.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
