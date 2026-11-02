import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.firefox.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        print("1. Navigating to landing page...")
        await page.goto("http://127.0.0.1:3000", wait_until="networkidle")
        await page.wait_for_selector("text=GhostLoad AI")
        await page.screenshot(path="docs/screens/phase1_landing.png")
        print("Captured docs/screens/phase1_landing.png")

        # Verify 3 lines
        content = await page.content()
        assert "Normal Mode" in content
        assert "GhostLoad Emergency" in content
        assert "Hard Governance" in content
        print("Verified 3-line concept explanation.")

        # Click "Continue as Demo Buyer"
        print("2. Clicking Continue as Demo Buyer...")
        await page.click("text=Continue as Demo Buyer")
        await page.wait_for_timeout(1000)

        # Navigate to Settings
        print("3. Navigating to Settings page...")
        await page.goto("http://127.0.0.1:3000/settings", wait_until="networkidle")
        await page.wait_for_selector("text=Profile & Role Settings")
        await page.screenshot(path="docs/screens/phase1_settings.png")
        print("Captured docs/screens/phase1_settings.png")

        # Test switching role to Seller
        print("4. Switching role to Seller in UI...")
        await page.click("text=I am a Seller")
        await page.click("text=Save Profile & Switch Role")
        await page.wait_for_selector("text=Settings updated successfully!")
        await page.screenshot(path="docs/screens/phase1_role_switched.png")
        print("Captured docs/screens/phase1_role_switched.png")

        print("Browser testing passed completely!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
