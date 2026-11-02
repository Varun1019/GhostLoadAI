"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import Link from "next/link";
import { formatSellerName, formatCurrency } from "@/lib/formatters";

interface BuyerOrder {
  id: string;
  po_number: string;
  product_id: string;
  product_title: string;
  seller_name: string;
  seller_city: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  placed_at: string;
  expected_delivery_date?: string;
  received_qty?: number;
  defect_qty?: number;
  inspection_notes?: string;
  has_review: boolean;
}

const QUICK_TAGS = [
  "On time",
  "Late",
  "Matches spec",
  "Damaged packaging",
  "Wrong quantity",
];

export default function BuyerOrdersPage() {
  const { user, apiBase } = useAuth();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Inspection modal
  const [inspectOrder, setInspectOrder] = useState<BuyerOrder | null>(null);
  const [receivedQty, setReceivedQty] = useState(0);
  const [defectQty, setDefectQty] = useState(0);
  const [inspectNotes, setInspectNotes] = useState("");
  const [submittingInspect, setSubmittingInspect] = useState(false);

  // Two-factor Rating card modal
  const [reviewOrder, setReviewOrder] = useState<BuyerOrder | null>(null);
  const [qualityRating, setQualityRating] = useState(5);
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${apiBase}/api/buyer/orders`, {
        headers: { "X-Demo-User": user?.id || "buyer-1" },
      });
      const data = await res.json();
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user, apiBase]);

  const handleInspectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectOrder) return;
    setSubmittingInspect(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${inspectOrder.id}/inspect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          received_qty: Number(receivedQty),
          defect_qty: Number(defectQty),
          notes: inspectNotes,
        }),
      });
      if (res.ok) {
        const orderJustDelivered = inspectOrder;
        setInspectOrder(null);
        await fetchOrders();
        // Immediately trigger the "Rate this order" card upon delivery confirmation!
        setReviewOrder(orderJustDelivered);
        setQualityRating(5);
        setDeliveryRating(5);
        setSelectedTags([]);
        setComment("");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingInspect(false);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewOrder) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${reviewOrder.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          quality_rating: Number(qualityRating),
          delivery_rating: Number(deliveryRating),
          tags: selectedTags,
          comment: comment.trim(),
        }),
      });
      if (res.ok) {
        setReviewOrder(null);
        fetchOrders();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingReview(false);
    }
  };

  const statusVariant = (status: string) => {
    if (status === "DELIVERED") return "success";
    if (status === "SHIPPED") return "blue";
    if (status === "ACCEPTED") return "neutral";
    if (status === "DECLINED") return "danger";
    return "warning";
  };

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#111111]">Orders</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Purchase orders, receipt inspections, and verified delivery ratings.
          </p>
        </div>
        <Link href="/marketplace" className="text-sm text-blue-700 hover:underline font-medium">
          Browse marketplace →
        </Link>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center text-gray-500 text-sm border border-gray-200 rounded-lg bg-gray-50">
          No orders placed yet.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">PO Number</th>
                <th className="py-3 px-4">Part</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4">Quantity</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/60">
                  <td className="py-3 px-4 font-mono font-medium text-gray-900">{o.po_number}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{o.product_title}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {formatSellerName(o.seller_name, o.seller_city)}
                  </td>
                  <td className="py-3 px-4">{o.quantity} units</td>
                  <td className="py-3 px-4 font-semibold text-gray-900">{formatCurrency(o.total_price)}</td>
                  <td className="py-3 px-4">
                    <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {o.status !== "DELIVERED" && o.status !== "DECLINED" && (
                      <Button
                        variant="link"
                        onClick={() => {
                          setInspectOrder(o);
                          setReceivedQty(o.quantity);
                          setDefectQty(0);
                          setInspectNotes("100% passed inspection");
                        }}
                      >
                        Inspect & deliver
                      </Button>
                    )}

                    {o.status === "DELIVERED" && !o.has_review && (
                      <div className="inline-flex items-center gap-2">
                        <Badge variant="warning">Rate your delivery</Badge>
                        <Button
                          variant="link"
                          onClick={() => {
                            setReviewOrder(o);
                            setQualityRating(5);
                            setDeliveryRating(5);
                            setSelectedTags([]);
                            setComment("");
                          }}
                        >
                          Rate now
                        </Button>
                      </div>
                    )}

                    {o.status === "DELIVERED" && o.has_review && (
                      <span className="text-emerald-700 font-medium text-xs">✓ Rated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Goods-Receipt Inspection Modal */}
      {inspectOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 shadow-xl relative text-xs">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Goods-receipt inspection
            </h2>
            <p className="text-gray-500 mb-4">
              Inspect delivery for {inspectOrder.po_number}. Data calibrates seller defect rate automatically.
            </p>

            <form onSubmit={handleInspectSubmit} className="space-y-3">
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <span className="font-semibold text-gray-900 block">{inspectOrder.product_title}</span>
                <span className="text-gray-500">{inspectOrder.quantity} units ordered</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Received quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={receivedQty}
                    onChange={(e) => setReceivedQty(Number(e.target.value))}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Defective units</label>
                  <input
                    type="number"
                    min="0"
                    max={receivedQty}
                    required
                    value={defectQty}
                    onChange={(e) => setDefectQty(Number(e.target.value))}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 mb-1 font-medium">Inspection notes</label>
                <textarea
                  rows={2}
                  value={inspectNotes}
                  onChange={(e) => setInspectNotes(e.target.value)}
                  placeholder="Dimensional tolerance test, surface finish, packaging condition..."
                  className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setInspectOrder(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingInspect}>
                  {submittingInspect ? "Verifying..." : "Confirm delivery"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Two-Factor "Rate this order" Card Modal */}
      {reviewOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-lg w-full p-6 shadow-xl relative text-xs space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-base font-bold text-gray-900">
                    Rate this order
                  </h2>
                  <Badge variant="blue">Verified purchase</Badge>
                </div>
                <p className="text-gray-500">
                  Rate your purchase from <strong className="text-gray-800">{formatSellerName(reviewOrder.seller_name, reviewOrder.seller_city)}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewOrder(null)}
                className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              {/* Product Quality 1-5 Stars */}
              <div className="p-3 rounded-lg border border-gray-100 bg-gray-50 space-y-1">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-gray-800">1. Product quality</label>
                  <span className="text-xs font-semibold text-amber-700">{qualityRating} / 5 stars</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-2">
                  Material conformity, finish, dimensional tolerances, and specs. Feeds 15% Trust Score.
                </p>
                <div className="flex gap-2 text-2xl cursor-pointer">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setQualityRating(star)}
                      className={star <= qualityRating ? "text-amber-500 hover:scale-110 transition" : "text-gray-300 hover:scale-110 transition"}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery Experience 1-5 Stars */}
              <div className="p-3 rounded-lg border border-gray-100 bg-gray-50 space-y-1">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-gray-800">2. Delivery experience</label>
                  <span className="text-xs font-semibold text-gray-800">{deliveryRating} / 5 stars</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-2">
                  On-time arrival, packaging condition, and freight handling. Blended into 25% on-time metric.
                </p>
                <div className="flex gap-2 text-2xl cursor-pointer">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setDeliveryRating(star)}
                      className={star <= deliveryRating ? "text-amber-500 hover:scale-110 transition" : "text-gray-300 hover:scale-110 transition"}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Tags */}
              <div>
                <label className="block text-gray-700 font-medium mb-1.5">Quick feedback tags (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                          isSelected
                            ? "bg-blue-50 border-blue-600 text-blue-700"
                            : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {tag} {isSelected ? "✓" : "+"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Comment */}
              <div>
                <label className="block text-gray-700 font-medium mb-1">Comment (optional)</label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share details on packaging, lead time adherence, or technical match..."
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                />
              </div>

              {qualityRating <= 2 || deliveryRating <= 2 ? (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                  <strong>QC Review Notice:</strong> Ratings of 2 or below automatically flag this order for QC Inspector investigation.
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="secondary" onClick={() => setReviewOrder(null)}>
                  Skip for now
                </Button>
                <Button type="submit" disabled={submittingReview}>
                  {submittingReview ? "Submitting..." : "Submit rating"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
