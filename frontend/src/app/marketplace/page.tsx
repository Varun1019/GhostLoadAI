"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDays, formatCurrency, getTrustBadgeVariant, formatSellerName } from "@/lib/formatters";

interface ProductItem {
  id: string;
  title: string;
  category: string;
  units_available: number;
  price_per_unit: number;
  lead_days: number;
  transit_days: number;
  total_lead_days: number;
  city: string;
  seller_id: string;
  seller_name: string;
  trust_score: number;
  avg_quality_rating?: number;
  avg_delivery_rating?: number;
  ratings_count?: number;
  badges: string[];
  specs: Record<string, any>;
  min_order: number;
}

const CATEGORIES = [
  "All",
  "Braking Systems",
  "Chassis & Suspension",
  "Drivetrain & Transmission",
  "Engine & Powertrain",
  "Electrical & Electronics",
  "Fasteners & Hardware",
];

export default function MarketplacePage() {
  const { user, apiBase } = useAuth();
  const router = useRouter();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Core search and category
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Advanced options toggle (closed by default)
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [sortBy, setSortBy] = useState("best_match");
  const [minTrust, setMinTrust] = useState<number>(0);
  const [certOnly, setCertOnly] = useState(false);

  // Comparison drawer
  const [compareList, setCompareList] = useState<ProductItem[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Fast order modal
  const [orderProduct, setOrderProduct] = useState<ProductItem | null>(null);
  const [orderQty, setOrderQty] = useState(50);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append("query", searchQuery.trim());
      if (selectedCategory !== "All") params.append("category", selectedCategory);
      if (sortBy) params.append("sort_by", sortBy);
      if (minTrust > 0) params.append("min_trust", String(minTrust));
      if (certOnly) params.append("cert_verified_only", "true");
      params.append("buyer_city", user?.city || "Bengaluru");

      const res = await fetch(`${apiBase}/api/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, sortBy, minTrust, certOnly, user]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts();
  };

  const toggleCompare = (p: ProductItem) => {
    if (compareList.some((item) => item.id === p.id)) {
      setCompareList(compareList.filter((item) => item.id !== p.id));
    } else {
      if (compareList.length >= 3) {
        alert("You can compare up to 3 products at a time.");
        return;
      }
      setCompareList([...compareList, p]);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderProduct) return;
    setSubmittingOrder(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/place`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          product_id: orderProduct.id,
          quantity: Number(orderQty),
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setOrderProduct(null);
        router.push("/orders");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      {/* Page Title & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#111111]">Marketplace</h1>
          <Link href="/emergency" className="text-sm font-semibold text-blue-700 hover:underline">
            Supplier disrupted? Run GhostLoad emergency →
          </Link>
        </div>

        {/* Clean Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parts by name or specification..."
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-700"
          />
          <Button type="submit">Search</Button>
        </form>

        {/* Category Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-sm">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-blue-700 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* More Options Toggle (Closed by default) */}
        <div>
          <button
            type="button"
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            className="text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer inline-flex items-center gap-1"
          >
            <span>{showMoreOptions ? "▾ Hide options" : "▸ More options (sort, minimum trust, compare)"}</span>
          </button>

          {showMoreOptions && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Sort by</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
                >
                  <option value="best_match">Best match</option>
                  <option value="price">Price: lowest first</option>
                  <option value="fastest">Fastest delivery</option>
                  <option value="trust">Highest trust score</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1 font-medium">Minimum trust score</label>
                <select
                  value={minTrust}
                  onChange={(e) => setMinTrust(Number(e.target.value))}
                  className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
                >
                  <option value="0">Any score</option>
                  <option value="70">≥ 70 (Emergency threshold)</option>
                  <option value="80">≥ 80 (Preferred)</option>
                  <option value="90">≥ 90 (Top tier)</option>
                </select>
              </div>

              <div className="flex items-center pt-4">
                <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                  <input
                    type="checkbox"
                    checked={certOnly}
                    onChange={(e) => setCertOnly(e.target.checked)}
                    className="rounded border-gray-300 text-blue-700"
                  />
                  <span>QC Verified sellers only</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Sticky Strip (if items selected) */}
      {compareList.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-blue-900">Comparing {compareList.length} items:</span>
            {compareList.map((c) => (
              <span key={c.id} className="bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-800">
                {c.title}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="link" onClick={() => setCompareList([])}>
              Clear
            </Button>
            <Button onClick={() => setShowCompareModal(true)}>
              Compare side-by-side
            </Button>
          </div>
        </div>
      )}

      {/* Product Grid: Each card shows name, seller, price, delivery days, trust badge */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading parts...</div>
      ) : products.length === 0 ? (
        <div className="p-12 text-center text-gray-500 text-sm border border-gray-200 rounded-lg bg-gray-50">
          No parts found matching your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const isCompared = compareList.some((item) => item.id === p.id);
            return (
              <Card key={p.id} className="flex flex-col justify-between hover:border-gray-400 transition">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/marketplace/${p.id}`} className="hover:text-blue-700">
                      <h3 className="font-semibold text-gray-900 text-base leading-snug">
                        {p.title}
                      </h3>
                    </Link>
                    <Badge variant={getTrustBadgeVariant(p.trust_score)}>
                      {p.trust_score}% Trust
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">
                      Seller: <span className="text-gray-700 font-medium">{formatSellerName(p.seller_name, p.city)}</span>
                    </p>
                    <div className="text-sm text-gray-500 flex items-center gap-1.5">
                      <span className="text-amber-600 font-medium">★ {p.avg_quality_rating || 4.8} Quality</span>
                      <span>·</span>
                      <span className="text-gray-700 font-medium">★ {p.avg_delivery_rating || 4.7} Delivery</span>
                      <span className="text-gray-400">({p.ratings_count || 1})</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-baseline justify-between border-t border-gray-100">
                    <div>
                      <span className="text-2xl font-semibold text-[#111111]">{formatCurrency(p.price_per_unit)}</span>
                      <span className="text-sm font-normal text-gray-500"> / unit</span>
                    </div>
                    <div>
                      <span className="text-lg font-medium text-[#111111]">{formatDays(p.total_lead_days)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <label className="flex items-center gap-1.5 text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isCompared}
                      onChange={() => toggleCompare(p)}
                      className="rounded border-gray-300 text-blue-700"
                    />
                    <span>Compare</span>
                  </label>

                  <div className="flex items-center gap-3">
                    <Link href={`/marketplace/${p.id}`} className="text-blue-700 hover:underline font-medium text-sm">
                      Details
                    </Link>
                    <button
                      onClick={() => {
                        setOrderProduct(p);
                        setOrderQty(p.min_order || 50);
                      }}
                      className="bg-blue-700 hover:bg-blue-800 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Order
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Side-by-Side Comparison Modal */}
      {showCompareModal && compareList.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-4xl w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-gray-200 mb-4">
              <h2 className="text-lg font-bold text-gray-900">Compare products</h2>
              <button onClick={() => setShowCompareModal(false)} className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer">
                ✕
              </button>
            </div>

            {(() => {
              const minPrice = Math.min(...compareList.map((c) => c.price_per_unit));
              const minDays = Math.min(...compareList.map((c) => c.total_lead_days));

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {compareList.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4 space-y-4">
                      <div>
                        <h3 className="font-bold text-gray-900 text-base">{item.title}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{formatSellerName(item.seller_name, item.city)}</p>
                      </div>

                      {/* Price and Delivery first with best value badges */}
                      <div className="space-y-3 py-3 border-y border-gray-100">
                        <div className="space-y-1">
                          <span className="text-xs uppercase text-gray-400 font-semibold tracking-wider">Unit Price</span>
                          <div className="flex items-baseline justify-between">
                            <div>
                              <span className="text-2xl font-semibold text-[#111111]">{formatCurrency(item.price_per_unit)}</span>
                              <span className="text-sm font-normal text-gray-500"> / unit</span>
                            </div>
                            {item.price_per_unit === minPrice && (
                              <Badge variant="success">Best price</Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs uppercase text-gray-400 font-semibold tracking-wider">Delivery SLA</span>
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-medium text-[#111111]">{formatDays(item.total_lead_days)}</span>
                            {item.total_lead_days === minDays && (
                              <Badge variant="blue">Fastest</Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Trust score:</span>
                            <Badge variant={getTrustBadgeVariant(item.trust_score)}>{item.trust_score}%</Badge>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm text-gray-500">Ratings:</span>
                            <span className="text-sm text-gray-700">★ {item.avg_quality_rating || 4.8} Q · ★ {item.avg_delivery_rating || 4.7} D</span>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm text-gray-500">Stock available:</span>
                            <span className="text-sm text-gray-700">{item.units_available} units</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={() => {
                          setShowCompareModal(false);
                          setOrderProduct(item);
                          setOrderQty(item.min_order || 50);
                        }}
                        className="w-full text-sm"
                      >
                        Order this part
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Place Order Modal */}
      {orderProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 shadow-xl relative">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Place order</h2>
            <p className="text-xs text-gray-500 mb-4">
              Issue a mock purchase order to {formatSellerName(orderProduct.seller_name, orderProduct.city)}.
            </p>

            <form onSubmit={handlePlaceOrder} className="space-y-4 text-xs">
              <div className="p-4 bg-gray-50 rounded border border-gray-200 space-y-2">
                <span className="font-semibold text-gray-900 text-sm block">{orderProduct.title}</span>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-semibold text-[#111111]">{formatCurrency(orderProduct.price_per_unit)}</span>
                    <span className="text-sm font-normal text-gray-500"> / unit</span>
                  </div>
                  <div className="text-lg font-medium text-[#111111]">
                    {formatDays(orderProduct.total_lead_days)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  Quantity (Minimum: {orderProduct.min_order || 1})
                </label>
                <input
                  type="number"
                  min={orderProduct.min_order || 1}
                  max={orderProduct.units_available}
                  required
                  value={orderQty}
                  onChange={(e) => setOrderQty(Number(e.target.value))}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex justify-between text-sm py-2 border-t border-gray-100">
                <span className="text-gray-600">Total:</span>
                <span className="font-bold text-gray-900">₹{(orderQty * orderProduct.price_per_unit).toLocaleString()}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setOrderProduct(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingOrder}>
                  {submittingOrder ? "Placing..." : "Confirm order"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
