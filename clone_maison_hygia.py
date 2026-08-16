#!/usr/bin/env python3
"""Download the Maison Hygia homepage and bundled frontend assets into a local clone."""

import os
import re
import urllib.request
from urllib.parse import urljoin

BASE_URL = "https://maisonhygia.com"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "maison_hygia_clone")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def save_bytes(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def download_asset(asset, root_url=BASE_URL):
    asset_url = asset if asset.startswith("http") else urljoin(root_url, asset)
    local_rel = asset.lstrip("/")
    if asset.startswith("http") and "//" in asset_url:
        host_part = asset_url.split("//", 1)[1]
        if "/" in host_part:
            local_rel = host_part.split("/", 1)[1]
    local_path = os.path.join(OUT_DIR, local_rel)
    try:
        data = fetch(asset_url)
        save_bytes(local_path, data)
        print(f"saved {asset_url} -> {local_path}")
        return True
    except Exception as exc:
        print(f"SKIP {asset_url}: {exc}")
        return False


def main():
    html_bytes = fetch(BASE_URL)
    html_text = html_bytes.decode("utf-8", "replace")
    save_bytes(os.path.join(OUT_DIR, "index.html"), html_bytes)

    asset_paths = []
    for match in re.findall(r'''(?:href|src)=["']([^"']+)["']''', html_text, flags=re.IGNORECASE):
        if match.startswith("/") or match.startswith("./") or match.startswith("http"):
            asset_paths.append(match)

    # Also fetch static asset references embedded in the generated JS bundle, since
    # this site is a React/Vite app that stores product and lifestyle image files there.
    bundle_path = os.path.join(OUT_DIR, "assets", "index-DLFkKnAo.js")
    try:
        bundle_bytes = fetch(urljoin(BASE_URL, "/assets/index-DLFkKnAo.js"))
        save_bytes(bundle_path, bundle_bytes)
        bundle_text = bundle_bytes.decode("utf-8", "replace")
        asset_pattern = r"/(?:assets|public)[^\"'`\s)]+(?:\.(?:png|jpg|jpeg|svg|webp|gif))"
        for match in re.findall(asset_pattern, bundle_text, flags=re.IGNORECASE):
            asset_paths.append(match)
    except Exception as exc:
        print(f"bundle fetch failed: {exc}")

    for asset in sorted(set(asset_paths)):
        if asset.startswith("https://fonts.googleapis.com") or asset.startswith("https://fonts.gstatic.com"):
            continue
        download_asset(asset)

    # Ensure the local HTML references local asset paths, preserving the original app shell.
    index_path = os.path.join(OUT_DIR, "index.html")
    html_local = html_text.replace("src=\"/assets/index-DLFkKnAo.js\"", "src=\"assets/index-DLFkKnAo.js\"")
    html_local = html_local.replace("href=\"/assets/styles-CAF83oNC.css\"", "href=\"assets/styles-CAF83oNC.css\"")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(html_local)

    print(f"Clone created at {OUT_DIR}")


if __name__ == "__main__":
    main()
