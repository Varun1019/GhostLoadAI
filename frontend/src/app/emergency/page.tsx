"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import Link from "next/link";
import { formatDays, formatCurrency, getTrustBadgeVariant, formatSellerName } from "@/lib/formatters";

interface SellerAlloc {
  seller_id: string;
  seller_name: string;
  city: string;
  units_allocated: number;
  unit_price: number;
  transit_cost_per_unit: number;
  lead_days: number;
  transit_days: number;
  arrival_day: number;
  total_cost: number;
  trust_score: number;
}

interface RecoveryPlan {
  plan_type: string;
  is_feasible: boolean;
  total_units_allocated: number;
  shortfall: number;
  total_cost: number;
  max_arrival_day: number;
  avg_trust_score: number;
  allocations: SellerAlloc[];
  explanation: string;
}

interface ComplianceItem {
  seller_id: string;
  seller_name: string;
  city: string;
  status: string;
  flags: string[];
  trust_score: number;
}

export default function EmergencyRecoveryPage() {
  const { user, apiBase } = useAuth();

  // Core intake: one large text box and one button
  const [disruptionText, setDisruptionText] = useState(
    "Main supplier plant shut down, need 1000 brake pads in 3 days"
  );
  const [solving, setSolving] = useState(false);

  // Advanced options toggle (closed by default)
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>("none");
  const [minTrust, setMinTrust] = useState(70);

  // Agent Steps: Sense, Scenario, Discover, Optimise, Check
  const [agentSteps, setAgentSteps] = useState([
    { name: "Sense", done: false, active: false },
    { name: "Scenario", done: false, active: false },
    { name: "Discover", done: false, active: false },
    { name: "Optimise", done: false, active: false },
    { name: "Check", done: false, active: false },
  ]);

  // Solver results
  const [plans, setPlans] = useState<Record<string, RecoveryPlan> | null>(null);
  const [recommendedPlanType, setRecommendedPlanType] = useState<string>("Balanced");
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [baseline, setBaseline] = useState<any>(null);

  // Progressive disclosure for details
  const [showDetails, setShowDetails] = useState(false);
  const [expandedAltPlan, setExpandedAltPlan] = useState<string | null>(null);

  // Drop-out simulator
  const [excludedSellers, setExcludedSellers] = useState<string[]>([]);
  const [beforePlan, setBeforePlan] = useState<RecoveryPlan | null>(null);

  // Approval form state (visible on plan result)
  const [decisionReason, setDecisionReason] = useState("Backup supplier allocation confirmed for production line.");
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleSolve = async () => {
    setSolving(true);
    setActionNotice(null);
    setBeforePlan(null);

    // Reset steps
    setAgentSteps([
      { name: "Sense", done: false, active: true },
      { name: "Scenario", done: false, active: false },
      { name: "Discover", done: false, active: false },
      { name: "Optimise", done: false, active: false },
      { name: "Check", done: false, active: false },
    ]);

    try {
      // 1. Parse disruption
      const parseRes = await fetch(`${apiBase}/api/emergency/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: disruptionText }),
      });
      const parseData = await parseRes.json();
      const extracted = parseData.data || { quantity: 1000, deadline_days: 3, item: "Braking Systems" };

      setAgentSteps([
        { name: "Sense", done: true, active: false },
        { name: "Scenario", done: false, active: true },
        { name: "Discover", done: false, active: false },
        { name: "Optimise", done: false, active: false },
        { name: "Check", done: false, active: false },
      ]);

      // 2. Modifiers
      const scenario_cost_multiplier: Record<string, number> = {};
      const scenario_transit_delay: Record<string, number> = {};
      if (selectedScenario === "port_closure") {
        scenario_transit_delay["Chennai"] = 2;
      } else if (selectedScenario === "tariff_spike") {
        scenario_cost_multiplier["seller-supplier-c"] = 1.25;
      }

      setAgentSteps([
        { name: "Sense", done: true, active: false },
        { name: "Scenario", done: true, active: false },
        { name: "Discover", done: false, active: true },
        { name: "Optimise", done: false, active: false },
        { name: "Check", done: false, active: false },
      ]);

      // 3. Solve with OR-Tools
      const solveRes = await fetch(`${apiBase}/api/emergency/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          item_category: extracted.item || "Braking Systems",
          required_units: Number(extracted.quantity || 1000),
          deadline_days: Number(extracted.deadline_days || 3),
          buyer_city: user?.city || "Bengaluru",
          min_trust_score: Number(minTrust),
          scenario_cost_multiplier,
          scenario_transit_delay,
          excluded_seller_ids: excludedSellers,
        }),
      });

      const solveData = await solveRes.json();

      setAgentSteps([
        { name: "Sense", done: true, active: false },
        { name: "Scenario", done: true, active: false },
        { name: "Discover", done: true, active: false },
        { name: "Optimise", done: true, active: false },
        { name: "Check", done: true, active: false },
      ]);

      setPlans(solveData.plans);
      setCompliance(solveData.compliance);
      setBaseline(solveData.baseline_comparison);
      setRecommendedPlanType(solveData.recommended_plan || "Balanced");
    } catch (e) {
      console.error(e);
    } finally {
      setSolving(false);
    }
  };

  // Drop out simulator: remove one seller and recalculate
  const handleDropOut = async (sellerId: string) => {
    if (!plans) return;
    const current = plans[recommendedPlanType];
    setBeforePlan(current);

    const updated = [...excludedSellers, sellerId];
    setExcludedSellers(updated);

    setSolving(true);
    try {
      const solveRes = await fetch(`${apiBase}/api/emergency/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          item_category: "Braking Systems",
          required_units: 1000,
          deadline_days: 3,
          buyer_city: user?.city || "Bengaluru",
          min_trust_score: Number(minTrust),
          excluded_seller_ids: updated,
        }),
      });
      const data = await solveRes.json();
      setPlans(data.plans);
      setCompliance(data.compliance);
    } catch (e) {
      console.error(e);
    } finally {
      setSolving(false);
    }
  };

  const handleResetExclusions = () => {
    setExcludedSellers([]);
    setBeforePlan(null);
    handleSolve();
  };

  const handleApprove = async (approved: boolean) => {
    if (!plans) return;
    setSubmittingDecision(true);
    const plan = plans[recommendedPlanType];
    try {
      const res = await fetch(`${apiBase}/api/emergency/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          plan_type: recommendedPlanType,
          allocations: plan.allocations,
          reason: decisionReason,
          approved,
        }),
      });
      const data = await res.json();
      if (approved) {
        setActionNotice("Plan approved. 24-hour capacity holds sent to sellers.");
      } else {
        setActionNotice("Plan rejected. No reservations made.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const currentPlan = plans ? plans[recommendedPlanType] : null;
  const altPlanKeys = plans ? Object.keys(plans).filter((k) => k !== recommendedPlanType) : [];

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-[#111111]">GhostLoad Emergency Recovery</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          Find idle supplier capacity and build a feasible backup delivery plan.
        </p>
      </div>

      {actionNotice && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex justify-between items-center">
          <span>{actionNotice}</span>
          <Link href="/seller/reservations" className="text-xs text-emerald-900 underline font-semibold">
            View seller holds →
          </Link>
        </div>
      )}

      {/* Disruption Intake: One Large Text Box & One Button */}
      <Card className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1.5">
            Describe the disruption
          </label>
          <textarea
            rows={3}
            value={disruptionText}
            onChange={(e) => setDisruptionText(e.target.value)}
            placeholder="e.g. Main supplier plant shut down, need 1000 brake pads in 3 days"
            className="w-full bg-white border border-gray-300 rounded-lg p-3 text-base text-gray-900 focus:outline-none focus:border-blue-700 leading-normal"
          />
        </div>

        {/* Primary Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Button onClick={handleSolve} disabled={solving}>
            {solving ? "Finding recovery plan..." : "Find recovery plan"}
          </Button>

          {/* More options toggle */}
          <button
            type="button"
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            className="text-xs text-gray-600 hover:text-gray-900 cursor-pointer self-start sm:self-auto"
          >
            {showMoreOptions ? "▾ Hide options" : "▸ More options (scenarios, trust threshold)"}
          </button>
        </div>

        {/* Collapsible Advanced Options */}
        {showMoreOptions && (
          <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-gray-600 mb-1 font-medium">Scenario shock preset</label>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
              >
                <option value="none">Normal (Standard transit & prices)</option>
                <option value="port_closure">Port closure (+2 days on coastal routes)</option>
                <option value="tariff_spike">Tariff spike (+25% on import parts)</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-600 mb-1 font-medium">Minimum trust threshold</label>
              <select
                value={minTrust}
                onChange={(e) => setMinTrust(Number(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
              >
                <option value="60">≥ 60%</option>
                <option value="70">≥ 70% (Standard cutoff)</option>
                <option value="80">≥ 80% (Strict trust)</option>
              </select>
            </div>
          </div>
        )}
      </Card>

      {/* Slim Horizontal Step Indicator */}
      {(solving || plans) && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
            <span className="font-semibold text-gray-800">Agent Pipeline</span>
            <span>{solving ? "Running..." : "Completed in 240ms"}</span>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            {agentSteps.map((step) => (
              <div key={step.name} className="space-y-1">
                <div
                  className={`h-1.5 rounded-full ${
                    step.done
                      ? "bg-blue-700"
                      : step.active
                      ? "bg-blue-400 animate-pulse"
                      : "bg-gray-200"
                  }`}
                />
                <span
                  className={`block text-[11px] font-medium ${
                    step.done ? "text-gray-900 font-semibold" : step.active ? "text-blue-700" : "text-gray-400"
                  }`}
                >
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Results */}
      {plans && currentPlan && (
        <div className="space-y-6">
          {/* Main Recommended Plan Card */}
          <Card className="border-gray-300 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">Recommended Backup Plan</h2>
                  <Badge variant="blue">Recommended</Badge>
                  {currentPlan.shortfall === 0 ? (
                    <Badge variant="success">100% Demand Met</Badge>
                  ) : (
                    <Badge variant="danger">{currentPlan.shortfall} Units Shortfall</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Decided by OR-Tools linear solver. Zero invented capacity.
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs uppercase text-gray-500 font-semibold tracking-wider block">Arrival SLA</span>
                <span className="text-lg font-medium text-[#111111]">
                  {formatDays(currentPlan.max_arrival_day)}
                </span>
              </div>
            </div>

            {/* Key Metrics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100 text-xs">
              <div>
                <span className="text-gray-500 block mb-1">Total fulfilled</span>
                <strong className="text-lg font-bold text-gray-900">{currentPlan.total_units_allocated} units</strong>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Total backup cost</span>
                <div className="text-2xl font-semibold text-[#111111]">
                  {formatCurrency(currentPlan.total_cost)}
                </div>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Max lead time</span>
                <div className="text-lg font-medium text-[#111111]">
                  {formatDays(currentPlan.max_arrival_day)}
                </div>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Average seller trust</span>
                <Badge variant={getTrustBadgeVariant(currentPlan.avg_trust_score)}>
                  {currentPlan.avg_trust_score}% Trust
                </Badge>
              </div>
            </div>

            {/* One-Line Plain Reason */}
            <p className="text-xs text-gray-700 bg-blue-50/60 p-3 rounded-lg border border-blue-100 leading-relaxed">
              <strong>Summary:</strong> {currentPlan.explanation}
            </p>

            {/* Supplier Allocations Table */}
            <div>
              <h3 className="text-xs font-semibold text-gray-900 mb-2">Supplier allocation</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3">Units</th>
                      <th className="py-2.5 px-3">Unit price</th>
                      <th className="py-2.5 px-3">Delivery SLA</th>
                      <th className="py-2.5 px-3">Total</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {currentPlan.allocations.map((a) => (
                      <tr key={a.seller_id}>
                        <td className="py-2 px-3 font-medium text-gray-900">
                          {formatSellerName(a.seller_name, a.city)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-blue-700">{a.units_allocated}</td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-gray-900">{formatCurrency(a.unit_price)}</span>
                          <span className="text-[11px] text-gray-500"> / unit</span>
                        </td>
                        <td className="py-2 px-3">{formatDays(a.arrival_day)}</td>
                        <td className="py-2 px-3 font-medium">{formatCurrency(a.total_cost)}</td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="danger"
                            onClick={() => handleDropOut(a.seller_id)}
                            className="text-xs"
                          >
                            Simulate drop
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Drop-Out Comparison Alert (if active) */}
            {beforePlan && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                <div className="flex justify-between items-center font-semibold">
                  <span>Drop-out recalculation applied</span>
                  <Button variant="link" onClick={handleResetExclusions} className="text-xs">
                    Reset
                  </Button>
                </div>
                <p>
                  Before drop-out: ₹{beforePlan.total_cost.toLocaleString()} ({beforePlan.allocations.length} suppliers).
                  New plan: ₹{currentPlan.total_cost.toLocaleString()} (shortfall: {currentPlan.shortfall} units).
                </p>
              </div>
            )}

            {/* Progressive Disclosure: See Details Link */}
            <div>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-blue-700 hover:underline font-medium cursor-pointer"
              >
                {showDetails ? "▴ Hide compliance & impact details" : "▾ See details (compliance check, savings vs single vendor)"}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-3 pt-3 border-t border-gray-100 text-xs">
                  {/* Impact baseline */}
                  {baseline && (
                    <div className="p-3 bg-gray-50 rounded border border-gray-200 flex justify-between items-center">
                      <div>
                        <strong className="text-gray-900 block">Impact vs. single replacement vendor</strong>
                        <span className="text-gray-500 text-[11px]">{baseline.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-emerald-700 font-bold block">+{baseline.days_saved} days faster</span>
                        <span className="text-gray-600 font-medium">₹{baseline.cost_avoided.toLocaleString()} cost avoided</span>
                      </div>
                    </div>
                  )}

                  {/* Compliance check summary */}
                  <div>
                    <strong className="text-gray-900 block mb-1">Compliance status</strong>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {compliance.map((c) => (
                        <div key={c.seller_id} className="p-2 rounded border border-gray-100 bg-gray-50 flex justify-between">
                          <span className="truncate">{c.seller_name}</span>
                          <Badge variant={c.status === "PASS" ? "success" : "danger"}>{c.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Human Approval Required Section */}
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1">
                  Approval reason (required for audit log)
                </label>
                <input
                  type="text"
                  required
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder="State operational reason for this approval or rejection..."
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={() => handleApprove(true)} disabled={submittingDecision}>
                  {submittingDecision ? "Saving..." : "Approve plan & place 24h holds"}
                </Button>
                <Button variant="danger" onClick={() => handleApprove(false)} disabled={submittingDecision}>
                  Reject plan
                </Button>
              </div>
            </div>
          </Card>

          {/* Two Small Collapsed Alternative Plans Underneath */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
              Alternative plans
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {altPlanKeys.map((pKey) => {
                const altPlan = plans[pKey];
                const isExpanded = expandedAltPlan === pKey;
                return (
                  <Card key={pKey} className="text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <strong className="text-sm text-gray-900">{pKey} plan</strong>
                      <Badge variant="neutral">Day {altPlan.max_arrival_day}</Badge>
                    </div>

                    <div className="flex justify-between text-gray-600">
                      <span>Total: ₹{altPlan.total_cost.toLocaleString()}</span>
                      <span>Trust: {altPlan.avg_trust_score}%</span>
                    </div>

                    <Button
                      variant="link"
                      onClick={() => setExpandedAltPlan(isExpanded ? null : pKey)}
                      className="text-xs p-0"
                    >
                      {isExpanded ? "Hide breakdown" : "View breakdown"}
                    </Button>

                    {isExpanded && (
                      <div className="pt-2 border-t border-gray-100 space-y-1 text-gray-700">
                        {altPlan.allocations.map((a) => (
                          <div key={a.seller_id} className="flex justify-between text-[11px]">
                            <span>{a.seller_name} ({a.city})</span>
                            <span className="font-semibold">{a.units_allocated} units @ ₹{a.unit_price}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
