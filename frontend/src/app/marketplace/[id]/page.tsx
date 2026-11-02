"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import Link from "next/link";
import { formatDays, formatCurrency, getTrustBadgeVariant, formatSellerName } from "@/lib/formatters";

interface ProductDetail {
  id: string;
  title: string;
  category: string;
  listing_type: string;
  specs: Record<string, any>;
  units_available: number;
  price_per_unit: number;
  lead_days: number;
  transit_days: number;
  total_lead_days: number;
  transit_cost: number;
  min_order: number;
  city: string;
  avg_quality_rating?: number;
  avg_delivery_rating?: number;
  ratings_count?: number;
  seller: {
    id: string;
    name: string;
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
  };
  certificates: Array<{
    name: string;
    issuer: string;
    number: string;
    status: string;
    expires_in_days: number;
    is_valid: boolean;
  }>;
  reviews: Array<{
    id: string;
    buyer_name: string;
    rating: number;
    quality_rating?: number;
    delivery_rating?: number;
    tags?: string[];
    is_verified_purchase?: boolean;
    comment: string;
    seller_response?: string;
    responded_at?: string;
    created_at: string;
  }>;
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, apiBase } = useAuth();

  const [item, setItem] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderQty, setOrderQty] = useState(50);
  const [ordering, setOrdering] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`${apiBase}/api/products/${id}?buyer_city=${user?.city || "Bengaluru"}`);
        const data = await res.json();
        setItem(data);
        if (data.min_order) setOrderQty(data.min_order);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchDetail();
  }, [id, user, apiBase]);

  const handlePlaceOrder = async () => {
    if (!item) return;
    setOrdering(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/place`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          product_id: item.id,
          quantity: Number(orderQty),
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        router.push("/orders");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setOrdering(false);
    }
  };

  if (loading || !item) {
    return <div className="max-w-[1100px] mx-auto py-16 px-4 text-center text-gray-500">Loading details...</div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      <div>
        <Link href="/marketplace" className="text-xs text-blue-700 hover:underline">
          ← Back to marketplace
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Product Info & Specs */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="neutral">{item.category}</Badge>
                <Badge variant={getTrustBadgeVariant(item.seller.trust_score)}>
                  {item.seller.trust_score}% Trust
                </Badge>
                <span className="text-xs text-gray-500">Dispatch from {item.city}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{item.title}</h1>
              <p className="text-sm text-gray-600 mt-1">
                Sold by <strong className="text-gray-900">{formatSellerName(item.seller.company_name || item.seller.name, item.seller.city)}</strong>
              </p>
              <div className="flex items-center gap-2 pt-1.5 text-sm text-gray-500">
                <span className="text-amber-600 font-medium">★ {item.seller.avg_quality_rating || 4.8} Quality</span>
                <span>·</span>
                <span className="text-gray-700 font-medium">★ {item.seller.avg_delivery_rating || 4.7} Delivery</span>
                <span className="text-gray-400">({item.seller.ratings_count || item.reviews.length || 1} ratings)</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Unit price</span>
                <div className="text-2xl font-semibold text-[#111111]">
                  {formatCurrency(item.price_per_unit)}
                  <span className="text-sm font-normal text-gray-500"> / unit</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Delivery SLA</span>
                <div className="text-lg font-medium text-[#111111]">
                  {formatDays(item.total_lead_days)}
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Stock available</span>
                <div className="text-lg font-medium text-gray-900">
                  {item.units_available} units
                </div>
              </div>
            </div>

            {/* Specifications */}
            <div className="space-y-2 pt-2">
              <h2 className="text-sm font-semibold text-gray-900">Specifications</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(item.specs).map(([k, v]) => (
                  <div key={k} className="p-2.5 rounded bg-gray-50 border border-gray-100 flex justify-between">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium text-gray-900">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Certificates */}
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Accredited certifications</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {item.certificates.map((c, i) => (
                <div key={i} className="p-3 rounded border border-gray-200 space-y-1">
                  <div className="flex justify-between items-center">
                    <strong className="text-gray-900">{c.name}</strong>
                    <Badge variant={c.status === "APPROVED" ? "success" : "warning"}>{c.status}</Badge>
                  </div>
                  <span className="text-gray-500 block">Issuer: {c.issuer}</span>
                  <span className="text-gray-600 block">
                    Valid for {c.expires_in_days} days {c.expires_in_days <= 30 && <span className="text-amber-700 font-semibold">(Expiring soon)</span>}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Verified Reviews with separate quality and delivery ratings */}
          <Card className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900">Verified purchase ratings & reviews ({item.reviews.length})</h2>
              <Badge variant="blue">Verified Purchases</Badge>
            </div>

            {item.reviews.length === 0 ? (
              <p className="text-xs text-gray-500">No reviews yet for this product.</p>
            ) : (
              <div className="space-y-3">
                {item.reviews.map((rev) => (
                  <div key={rev.id} className="p-3.5 rounded border border-gray-200 bg-gray-50 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900">{rev.buyer_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-amber-600 font-medium">★ {rev.quality_rating || rev.rating} Quality</span>
                        <span className="text-gray-700 font-medium">★ {rev.delivery_rating || 5} Delivery</span>
                      </div>
                    </div>

                    {rev.tags && rev.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {rev.tags.map((t, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-[11px] text-gray-600">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {rev.comment && <p className="text-gray-700 pt-1">{rev.comment}</p>}

                    {rev.seller_response && (
                      <div className="mt-2 pl-3 border-l-2 border-blue-600 text-gray-600 text-xs bg-white p-2 rounded">
                        <strong className="text-blue-900 block mb-0.5">Seller response:</strong>
                        {rev.seller_response}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Sidebar: Order Checkout & Trust Breakdown */}
        <div className="space-y-6">
          {/* Order Action Card */}
          <Card className="space-y-4">
            <h2 className="text-base font-bold text-gray-900">Order part</h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-600 mb-1 font-medium">
                  Quantity (min {item.min_order || 1})
                </label>
                <input
                  type="number"
                  min={item.min_order || 1}
                  max={item.units_available}
                  value={orderQty}
                  onChange={(e) => setOrderQty(Number(e.target.value))}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex justify-between text-sm py-2 border-t border-gray-100">
                <span className="text-gray-600">Total cost:</span>
                <span className="font-bold text-gray-900">₹{(orderQty * item.price_per_unit).toLocaleString()}</span>
              </div>

              <Button onClick={handlePlaceOrder} disabled={ordering} className="w-full">
                {ordering ? "Placing order..." : "Place purchase order"}
              </Button>
            </div>
          </Card>

          {/* Seller Trust Score Breakdown */}
          <Card className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-gray-900">Seller Trust Score</span>
              <span className="text-xl font-bold text-emerald-700">{item.seller.trust_score}%</span>
            </div>

            {/* 5 Small Horizontal Bars */}
            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>Certification (30%)</span>
                  <span>{item.seller.breakdown.cert_verified_rate}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${item.seller.breakdown.cert_verified_rate}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>On-time delivery (25%)</span>
                  <span>{item.seller.breakdown.on_time_rate}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${item.seller.breakdown.on_time_rate}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>Low defect rate (20%)</span>
                  <span>{item.seller.breakdown.defect_rate}% defect</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.max(5, 100 - item.seller.breakdown.defect_rate * 5)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>Verified rating (15%)</span>
                  <span>{item.seller.breakdown.avg_rating} / 5</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${(item.seller.breakdown.avg_rating / 5) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>Response time (10%)</span>
                  <span>{item.seller.breakdown.response_time_hours} hrs</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full" style={{ width: `${Math.max(10, 100 - (item.seller.breakdown.response_time_hours / 24) * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Formula toggle */}
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowFormula(!showFormula)}
                className="text-xs text-blue-700 hover:underline cursor-pointer"
              >
                {showFormula ? "Hide calculation formula" : "How is this calculated?"}
              </button>
              {showFormula && (
                <p className="mt-2 text-[11px] text-gray-500 font-mono bg-gray-50 p-2 rounded">
                  {item.seller.formula}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
