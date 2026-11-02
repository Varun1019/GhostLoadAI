"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import Link from "next/link";

interface Reservation {
  id: string;
  plan_id: string;
  buyer_name: string;
  buyer_city: string;
  product_title: string;
  quantity: number;
  status: string;
  hours_remaining: number;
  expires_at: string;
  created_at: string;
}

export default function SellerReservationsPage() {
  const { user, apiBase } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const headers = { "X-Demo-User": user?.id || "seller-factory-a" };
      const res = await fetch(`${apiBase}/api/seller/reservations`, { headers });
      const json = await res.json();
      setReservations(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, apiBase]);

  const handleReservationResponse = async (resId: string, action: "ACCEPT" | "DECLINE") => {
    try {
      const res = await fetch(`${apiBase}/api/seller/reservations/${resId}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "seller-factory-a",
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.status === "success") {
        if (action === "DECLINE") {
          setActionNotice("Reservation declined. Capacity released back to inventory.");
        } else {
          setActionNotice("Reservation accepted. Capacity allocated for buyer.");
        }
        setTimeout(() => setActionNotice(null), 4000);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#111111]">Emergency Reservation Requests</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Capacity held by GhostLoad for 24 hours. Released if declined or expired.
          </p>
        </div>

        <Link href="/seller" className="text-xs text-blue-700 hover:underline font-medium">
          ← Back to seller dashboard
        </Link>
      </div>

      {actionNotice && (
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-800">
          {actionNotice}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading requests...</div>
      ) : reservations.length === 0 ? (
        <div className="p-12 text-center text-gray-500 text-sm border border-gray-200 rounded-lg bg-gray-50">
          No capacity reservation requests active.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">Hold ID</th>
                <th className="py-3 px-4">Buyer</th>
                <th className="py-3 px-4">Part</th>
                <th className="py-3 px-4">Held quantity</th>
                <th className="py-3 px-4">Time remaining</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 px-4 font-mono font-medium text-gray-900">{r.id}</td>
                  <td className="py-3 px-4">{r.buyer_name} ({r.buyer_city})</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{r.product_title}</td>
                  <td className="py-3 px-4 font-semibold text-blue-700">{r.quantity} units</td>
                  <td className="py-3 px-4 font-medium text-amber-700">{r.hours_remaining} hrs left</td>
                  <td className="py-3 px-4">
                    <Badge variant={r.status === "PENDING" ? "warning" : r.status === "ACCEPTED" ? "success" : "neutral"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {r.status === "PENDING" ? (
                      <>
                        <Button
                          variant="link"
                          onClick={() => handleReservationResponse(r.id, "ACCEPT")}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => handleReservationResponse(r.id, "DECLINE")}
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <span className="text-gray-400 text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
