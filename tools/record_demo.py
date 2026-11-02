"""Record the real Missing Monday rehearsal. Model calls hit the running local server."""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "05-demo" / "recordings"
OUT.mkdir(parents=True, exist_ok=True)

from playwright.sync_api import sync_playwright

EXPERT = (
    "P-100B can replace P-100 only on machine revision R2, and only with certificate C-B. "
    "Any other revision or certificate is outside this exception."
)
S05_REASON = "Certificate C-A is outside the approved card, which allows only certificate C-B."
MARKS = []
T0 = None


def mark(name):
    MARKS.append({"name": name, "t": round(time.perf_counter() - T0, 3)})
    print(f"BEAT {name} {MARKS[-1]['t']}", flush=True)


def click(page, name, timeout=20000):
    page.get_by_role("button", name=name).click(timeout=timeout)


def hold(page, selector, ms=2500):
    page.locator(selector).first.evaluate(
        "el => el.scrollIntoView({block:'center', inline:'nearest'})"
    )
    page.wait_for_timeout(ms)


def cite(page):
    page.evaluate(
        """() => { for (const box of document.querySelectorAll('#citations input')) box.checked = true; }"""
    )


def wait_model(page, ready, timeout=120000):
    page.wait_for_function(ready, timeout=timeout)


def run(page):
    page.goto("http://127.0.0.1:8766/", wait_until="networkidle")
    mark("start-screen")
    page.wait_for_timeout(8000)
    page.select_option("#case", "S01")
    click(page, "Start a fresh attempt")
    page.wait_for_selector("text=Rehearsal S01")
    mark("s01")
    hold(page, "#facts", 4000)
    click(page, "Open · Order details")
    page.wait_for_selector("text=offered part: P-100B")
    hold(page, "#document", 3500)
    click(page, "Open · Purchasing handbook · version 1")
    page.wait_for_selector("text=consult an approved substitution procedure")
    hold(page, "#document", 4500)
    click(page, "Help me find what’s missing")
    wait_model(
        page,
        """() => {
          const reason = document.getElementById('reason')?.value || '';
          const error = document.getElementById('error');
          const failed = error && !error.hidden && error.textContent;
          return reason.length > 20 || failed;
        }""",
    )
    if page.locator("#error").is_visible():
        raise RuntimeError(page.locator("#error").inner_text())
    mark("question")
    print("QUESTION:", page.locator("#reason").input_value(), flush=True)
    hold(page, "#reason", 9000)
    cite(page)
    click(page, "Save my next step")
    page.wait_for_selector("text=needs help")
    mark("saved-question")
    hold(page, "#capture-question", 4000)
    page.locator("#expert-answer").press_sequentially(EXPERT, delay=28)
    hold(page, "#expert-answer", 3000)
    click(page, "Draft the card")
    wait_model(
        page,
        """() => (document.getElementById('expert-answer')?.value || '').includes('Quote:')""",
    )
    mark("draft")
    hold(page, "#expert-answer", 10000)
    click(page, "Approve this version")
    page.wait_for_selector("text=1 expert card approved")
    mark("approved")
    hold(page, "#guidance-count", 5000)
    page.select_option("#case", "S02")
    click(page, "Start a fresh attempt")
    page.wait_for_selector("text=Fresh case S02")
    mark("s02")
    hold(page, "#facts", 4500)
    click(page, "Open · Approved exception guidance")
    page.wait_for_selector("text=Quote:")
    hold(page, "#document", 7000)
    click(page, "Suggest the next step")
    wait_model(
        page,
        """() => (document.getElementById('reason')?.value || '').length > 20 && !document.getElementById('suggest')?.disabled""",
    )
    hold(page, "#reason", 8000)
    if page.locator("#action").input_value() != "accept":
        page.select_option("#action", "accept")
        page.fill(
            "#reason",
            "Revision R2 and certificate C-B match the approved card. The quantity does not change the exception.",
        )
        hold(page, "#action", 2000)
    cite(page)
    click(page, "Save my next step")
    page.wait_for_selector("text=completed from the approved card")
    mark("s02-result")
    hold(page, "#result", 10000)
    page.select_option("#case", "S05")
    click(page, "Start a fresh attempt")
    page.wait_for_selector("text=Boundary case S05")
    mark("s05")
    hold(page, "#facts", 6000)
    click(page, "Open · Order details")
    page.wait_for_selector("text=certificate: C-A")
    hold(page, "#document", 6000)
    click(page, "Open · Approved exception guidance")
    page.wait_for_selector("#document-content >> text=C-B")
    hold(page, "#document", 4000)
    click(page, "Suggest the next step")
    wait_model(
        page,
        """() => (document.getElementById('reason')?.value || '').length > 20 && !document.getElementById('suggest')?.disabled""",
    )
    hold(page, "#reason", 8000)
    if page.locator("#action").input_value() != "reject":
        page.select_option("#action", "reject")
        page.fill("#reason", S05_REASON)
        hold(page, "#action", 2000)
    cite(page)
    hold(page, "#action", 1500)
    click(page, "Save my next step")
    page.wait_for_selector("text=was not accepted", timeout=20000)
    mark("s05-result")
    hold(page, "#result", 12000)
    mark("summary")
    hold(page, "#summary", 8000)


def main():
    global T0
    video = None
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir=str(OUT),
            record_video_size={"width": 1440, "height": 900},
        )
        page = context.new_page()
        T0 = time.perf_counter()
        try:
            run(page)
            video = page.video.path()
        except Exception:
            shot = OUT / "failure.png"
            page.screenshot(path=str(shot), full_page=True)
            error = page.locator("#error")
            result = page.locator("#result")
            print("ERROR:", error.inner_text() if error.count() and error.is_visible() else "")
            print("RESULT:", result.inner_text() if result.count() else "")
            print("ACTION:", page.locator("#action").input_value() if page.locator("#action").count() else "")
            print("SHOT:", shot)
            raise
        finally:
            (OUT / "beats.json").write_text(json.dumps(MARKS, indent=2))
            context.close()
            browser.close()
    print(video)


if __name__ == "__main__":
    main()
