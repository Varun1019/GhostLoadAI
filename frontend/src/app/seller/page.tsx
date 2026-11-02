"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import Link from "next/link";

interface DashboardData {
  seller_name: string;
  company_name: string;
  city: string;
  trust_score: number;
  avg_quality_rating?: number;
  avg_delivery_rating?: number;
  ratings_count?: number;
  breakdown: {
    cert_verified_rate: number;
    on_time_rate: number;
    raw_on_time_rate?: number;
    defect_rate: number;
    avg_rating: number;
    avg_quality_rating?: number;
    avg_delivery_rating?: number;
    response_time_hours: number;
  };
  formula: string;
  badges: Array<{ name: string; type: string; color: string }>;
  tips: string[];
  counts: {
    active_listings: number;
    incoming_orders: number;
    pending_reservations: number;
    total_orders: number;
  };
}

interface SellerOrder {
  id: string;
  po_number: string;
  buyer_name: string;
  buyer_company: string;
  product_title: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  placed_at: string;
}

export default function SellerDashboardPage() {
  const { user, apiBase } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);

  const fetchDashboard = async () => {
    try {
      const headers = { "X-Demo-User": user?.id || "seller-factory-a" };
      const [dashRes, ordRes] = await Promise.all([
        fetch(`${apiBase}/api/seller/dashboard`, { headers }),
        fetch(`${apiBase}/api/seller/orders`, { headers }),
      ]);
      const dashData = await dashRes.json();
      const ordData = await ordRes.json();
      setData(dashData);
      setOrders(ordData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [user, apiBase]);

  const handleUpdateOrderStatus = async (orderId: string, action: string) => {
    try {
      await fetch(`${apiBase}/api/seller/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "seller-factory-a",
        },
        body: JSON.stringify({ action }),
      });
      fetchDashboard();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading || !data) {
    return <div className="max-w-[1100px] mx-auto py-16 px-4 text-center text-gray-500">Loading seller dashboard...</div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#111111]">{data.seller_name}</h1>
            <Badge variant="success">Active supplier</Badge>
          </div>
          <div className="flex items-center gap-2 pt-1 text-sm text-gray-600">
            <span className="text-amber-600 font-semibold">★ {data.breakdown.avg_quality_rating || 4.8} Quality</span>
            <span>·</span>
            <span className="text-gray-800 font-semibold">★ {data.breakdown.avg_delivery_rating || 4.7} Delivery</span>
            <span className="text-gray-400">({data.counts.total_orders || 12} verified ratings)</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{data.city} · {data.counts.total_orders} total orders completed</p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/seller/listings">
            <Button>Add new listing</Button>
          </Link>
          <Link href="/seller/reservations" className="text-xs text-blue-700 hover:underline font-medium">
            Requests ({data.counts.pending_reservations}) →
          </Link>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Listings</span>
          <span className="text-2xl font-bold text-gray-900 block mt-1">{data.counts.active_listings}</span>
          <Link href="/seller/listings" className="text-xs text-blue-700 hover:underline font-medium mt-1 inline-block">
            Manage listings →
          </Link>
        </Card>

        <Card>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Emergency capacity holds</span>
          <span className="text-2xl font-bold text-gray-900 block mt-1">{data.counts.pending_reservations}</span>
          <Link href="/seller/reservations" className="text-xs text-blue-700 hover:underline font-medium mt-1 inline-block">
            View 24h requests →
          </Link>
        </Card>

        <Card>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Trust score</span>
          <span className="text-2xl font-bold text-emerald-700 block mt-1">{data.trust_score}%</span>
          <a href="#trust" className="text-xs text-blue-700 hover:underline font-medium mt-1 inline-block">
            View breakdown ↓
          </a>
        </Card>
      </div>

      {/* Section 1: Orders Table */}
      <Card className="space-y-4">
        <h2 className="text-base font-bold text-gray-900">Incoming purchase orders ({orders.length})</h2>

        {orders.length === 0 ? (
          <p className="text-xs text-gray-500">No incoming orders yet.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3">PO Number</th>
                  <th className="py-2.5 px-3">Buyer</th>
                  <th className="py-2.5 px-3">Part</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 px-3 font-mono font-medium text-gray-900">{o.po_number}</td>
                    <td className="py-2.5 px-3">{o.buyer_company || o.buyer_name}</td>
                    <td className="py-2.5 px-3">{o.product_title}</td>
                    <td className="py-2.5 px-3">{o.quantity}</td>
                    <td className="py-2.5 px-3 font-semibold">₹{o.total_price.toLocaleString()}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant={o.status === "DELIVERED" ? "success" : o.status === "SHIPPED" ? "blue" : "neutral"}>
                        {o.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      {o.status === "PLACED" && (
                        <>
                          <Button variant="link" onClick={() => handleUpdateOrderStatus(o.id, "ACCEPT")}>
                            Accept
                          </Button>
                          <Button variant="danger" onClick={() => handleUpdateOrderStatus(o.id, "DECLINE")}>
                            Decline
                          </Button>
                        </>
                      )}
                      {o.status === "ACCEPTED" && (
                        <Button variant="link" onClick={() => handleUpdateOrderStatus(o.id, "SHIP")}>
                          Mark shipped
                        </Button>
                      )}
                      {o.status === "SHIPPED" && (
                        <span className="text-gray-400 text-[11px]">In transit</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 2: Trust Score Breakdown */}
      <Card id="trust" className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-gray-900">Trust score: {data.trust_score} / 100</h2>
            <p className="text-xs text-gray-500">Based on verified delivery performance and quality audits.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowFormula(!showFormula)}
            className="text-xs text-blue-700 hover:underline font-medium cursor-pointer"
          >
            {showFormula ? "Hide formula" : "How is this calculated?"}
          </button>
        </div>

        {showFormula && (
          <p className="text-xs font-mono text-gray-600 bg-gray-50 p-2.5 rounded border border-gray-200">
            {data.formula}
          </p>
        )}

        {/* 5 small bars for components */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-3 bg-gray-50 rounded border border-gray-100 space-y-1">
            <span className="text-gray-500 block">Certification (30%)</span>
            <strong className="text-sm text-gray-900">{data.breakdown.cert_verified_rate}%</strong>
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-emerald-600" style={{ width: `${data.breakdown.cert_verified_rate}%` }} />
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded border border-gray-100 space-y-1">
            <span className="text-gray-500 block">On-time (25%)</span>
            <strong className="text-sm text-gray-900">{data.breakdown.on_time_rate}%</strong>
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-blue-600" style={{ width: `${data.breakdown.on_time_rate}%` }} />
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded border border-gray-100 space-y-1">
            <span className="text-gray-500 block">Low defect (20%)</span>
            <strong className="text-sm text-gray-900">{data.breakdown.defect_rate}%</strong>
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-amber-500" style={{ width: `${Math.max(5, 100 - data.breakdown.defect_rate * 5)}%` }} />
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded border border-gray-100 space-y-1">
            <span className="text-gray-500 block">Buyer rating (15%)</span>
            <strong className="text-sm text-gray-900">{data.breakdown.avg_rating} / 5</strong>
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-yellow-500" style={{ width: `${(data.breakdown.avg_rating / 5) * 100}%` }} />
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded border border-gray-100 space-y-1">
            <span className="text-gray-500 block">Response time (10%)</span>
            <strong className="text-sm text-gray-900">{data.breakdown.response_time_hours}h</strong>
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-purple-600" style={{ width: `${Math.max(10, 100 - (data.breakdown.response_time_hours / 24) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="pt-2 text-xs text-gray-600">
          <strong className="text-gray-900 block mb-1">Tips to improve:</strong>
          <ul className="list-disc list-inside space-y-0.5 text-gray-500">
            {data.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
