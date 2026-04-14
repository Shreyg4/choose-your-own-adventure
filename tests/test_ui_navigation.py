"""Tests for UI navigation and graph UX improvements."""
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="module")
def live_server_url(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("cyoa_ui")
    orig_pages = Path("output/cot-pages-ocr-v2")
    orig_mmd = Path("output/cot-story-graph.mmd")
    pages_dir = tmp / "cot-pages-ocr-v2"
    shutil.copytree(orig_pages, pages_dir)
    mmd_path = tmp / "cot-story-graph.mmd"
    shutil.copy2(orig_mmd, mmd_path)
    meta_path = tmp / "pages-meta.json"

    port = 8769
    env = {
        **dict(__import__("os").environ),
        "CYOA_TEST_PAGES_DIR": str(pages_dir),
        "CYOA_TEST_MMD_PATH": str(mmd_path),
        "CYOA_TEST_META_PATH": str(meta_path),
        "CYOA_TEST_OUTPUT_DIR": str(tmp),
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "web.main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd="/home/cssuwbstudent/vincent/CYOA/choose-your-own-adventure",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    time.sleep(3)
    url = f"http://127.0.0.1:{port}"
    yield url
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def _set_viewport(page: Page):
    page.set_viewport_size({"width": 1280, "height": 800})


# ---------------------------------------------------------------------------
# Root redirect
# ---------------------------------------------------------------------------

def test_root_redirects_to_reader(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/")
    page.wait_for_timeout(500)
    assert "reader.html" in page.url


# ---------------------------------------------------------------------------
# Navigation bar
# ---------------------------------------------------------------------------

def test_reader_has_top_nav(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/reader.html#3")
    page.wait_for_timeout(300)
    nav = page.locator(".top-nav")
    expect(nav).to_be_visible()
    expect(nav.locator("a[href='/graph.html']")).to_be_visible()
    expect(nav.locator("a[href='/paths.html']")).to_be_visible()


def test_graph_has_top_nav(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/graph.html")
    page.wait_for_timeout(300)
    nav = page.locator(".top-nav")
    expect(nav).to_be_visible()
    expect(nav.locator("a[href='/reader.html']")).to_be_visible()
    expect(nav.locator("a[href='/paths.html']")).to_be_visible()


def test_paths_has_top_nav(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/paths.html")
    page.wait_for_timeout(300)
    nav = page.locator(".top-nav")
    expect(nav).to_be_visible()
    expect(nav.locator("a[href='/reader.html']")).to_be_visible()
    expect(nav.locator("a[href='/graph.html']")).to_be_visible()


def test_nav_links_work(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/reader.html")
    page.wait_for_timeout(300)
    page.locator(".top-nav a[href='/graph.html']").click()
    page.wait_for_timeout(500)
    assert "/graph.html" in page.url
    page.locator(".top-nav a[href='/paths.html']").click()
    page.wait_for_timeout(500)
    assert "/paths.html" in page.url
    page.locator(".top-nav a[href='/reader.html']").click()
    page.wait_for_timeout(500)
    assert "/reader.html" in page.url


# ---------------------------------------------------------------------------
# Graph auto-select from hash
# ---------------------------------------------------------------------------

def test_graph_autoselects_node_from_hash(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/graph.html#page=3")
    page.wait_for_timeout(1500)
    panel = page.locator("#side-panel")
    expect(panel).not_to_have_class("hidden")
    expect(page.locator("#panel-page")).to_have_text("3")


# ---------------------------------------------------------------------------
# Graph hint / onboarding
# ---------------------------------------------------------------------------

def test_graph_shows_hint_when_no_node_selected(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/graph.html")
    page.wait_for_timeout(1500)
    hint = page.locator("#graph-hint")
    expect(hint).to_be_visible()
    expect(hint).to_contain_text("Click a node")
    # select a node
    page.evaluate("() => { window.cy.getElementById('P3').emit('tap'); }")
    page.wait_for_timeout(300)
    expect(hint).not_to_be_visible()
    # close panel -> hint reappears
    page.locator("#panel-close").click()
    page.wait_for_timeout(300)
    expect(hint).to_be_visible()


# ---------------------------------------------------------------------------
# Jump to page
# ---------------------------------------------------------------------------

def test_jump_to_page_selects_node(page: Page, live_server_url):
    _set_viewport(page)
    page.goto(f"{live_server_url}/graph.html")
    page.wait_for_timeout(1500)
    page.locator("#jump-to-page").fill("5")
    page.locator("#jump-to-page").press("Enter")
    page.wait_for_timeout(500)
    panel = page.locator("#side-panel")
    expect(panel).not_to_have_class("hidden")
    expect(page.locator("#panel-page")).to_have_text("5")
