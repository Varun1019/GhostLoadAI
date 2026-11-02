import asyncio
from playwright.async_api import async_playwright

async def run_full_demo():
    async with async_playwright() as p:
        browser = await p.firefox.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 850})
        page = await context.new_page()

        print("--- STEP 1: Minimalist Sign-in Page ---")
        await page.goto("http://127.0.0.1:3000", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="docs/screens/01_signin_page.png")
        print("Captured 01_signin_page.png")

        # Click Demo Buyer
        await page.click("text=Demo buyer")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="docs/screens/02_role_selection.png")
        print("Captured 02_role_selection.png")

        # Click 'I buy parts'
        await page.click("text=I buy parts")
        await page.wait_for_timeout(1000)

        # Complete company setup
        await page.click("text=Complete setup & start")
        await page.wait_for_timeout(2000)

        print("--- STEP 2: Marketplace View ---")
        await page.wait_for_selector("text=Marketplace")
        await page.screenshot(path="docs/screens/03_marketplace_view.png")
        print("Captured 03_marketplace_view.png")

        print("--- STEP 3: Side-by-Side Comparison ---")
        checkboxes = await page.query_selector_all("input[type='checkbox']")
        if len(checkboxes) >= 2:
            await checkboxes[0].click()
            await page.wait_for_timeout(300)
            await checkboxes[1].click()
            await page.wait_for_timeout(500)
            await page.click("text=Compare side-by-side")
            await page.wait_for_timeout(1000)
            await page.screenshot(path="docs/screens/04_compare_modal.png")
            print("Captured 04_compare_modal.png")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)

        print("--- STEP 4: Product Detail Page ---")
        await page.goto("http://127.0.0.1:3000/marketplace/prod-slide-a", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="docs/screens/05_product_page.png")
        print("Captured 05_product_page.png")

        print("--- STEP 5: Place Purchase Order ---")
        await page.click("text=Place purchase order")
        await page.wait_for_timeout(2000)
        await page.screenshot(path="docs/screens/06_orders_placed.png")
        print("Captured 06_orders_placed.png")

        print("--- STEP 6: Goods-Receipt Inspection & Delivery ---")
        inspect_btn = await page.query_selector("text=Inspect & deliver")
        if inspect_btn:
            await inspect_btn.click()
            await page.wait_for_timeout(800)
            await page.click("text=Confirm delivery")
            await page.wait_for_timeout(2000)

        print("--- STEP 7: Rate This Order (Two-Factor Rating) ---")
        await page.wait_for_selector("text=Rate this order")
        await page.screenshot(path="docs/screens/07_rate_order_modal.png")
        print("Captured 07_rate_order_modal.png")

        # Select quick tag and submit
        await page.click("text=Matches spec")
        await page.wait_for_timeout(300)
        await page.fill("textarea[placeholder*='Share details']", "Excellent OE specification compliance and packaging.")
        await page.click("text=Submit rating")
        await page.wait_for_timeout(2000)
        await page.screenshot(path="docs/screens/08_order_rated_badge.png")
        print("Captured 08_order_rated_badge.png")

        print("--- STEP 8: Check Seller Trust Score Update ---")
        await page.goto("http://127.0.0.1:3000/seller", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path="docs/screens/09_seller_trust_score.png")
        print("Captured 09_seller_trust_score.png")

        print("--- STEP 9: GhostLoad Emergency Mode ---")
        await page.goto("http://127.0.0.1:3000/emergency", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.click("text=Find recovery plan")
        await page.wait_for_timeout(2500)
        await page.screenshot(path="docs/screens/10_emergency_recovery_plan.png")
        print("Captured 10_emergency_recovery_plan.png")

        print("--- STEP 10: QC Inspector Portal ---")
        await page.goto("http://127.0.0.1:3000/qc", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path="docs/screens/11_qc_audit_portal.png")
        print("Captured 11_qc_audit_portal.png")

        print("--- STEP 11: Enterprise Audit Log Trail ---")
        await page.goto("http://127.0.0.1:3000/audit", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path="docs/screens/12_audit_trail.png")
        print("Captured 12_audit_trail.png")

        print("SUCCESS: ALL 12 SCREENSHOTS CAPTURED!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_full_demo())
