#!/usr/bin/env bash
set -euo pipefail

# Simple LAN static server for iPhone debugging.
# Serves the repo root so /src and /assets both resolve.

PORT="${PORT:-8000}"

# Determine primary network interface and IP on macOS
detect_ip() {
  local iface ip
  if command -v route >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then
    iface=$(route get default 2>/dev/null | awk '/interface:/{print $2}') || true
  fi
  if [[ -n "${iface:-}" ]] && command -v ipconfig >/dev/null 2>&1; then
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
  fi
  if [[ -z "${ip:-}" ]] && command -v ipconfig >/dev/null 2>&1; then
    for cand in en0 en1 en2; do
      ip=$(ipconfig getifaddr "$cand" 2>/dev/null || true)
      [[ -n "$ip" ]] && break
    done
  fi
  if [[ -z "${ip:-}" ]]; then
    # Fallback: first non-loopback inet
    if command -v ifconfig >/dev/null 2>&1; then
      ip=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}') || true
    fi
  fi
  echo "${ip:-127.0.0.1}"
}

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

IP=$(detect_ip)

echo ""
echo "Serving $(basename "$ROOT_DIR") at:"
echo "  Local:   http://127.0.0.1:${PORT}/src/"
echo "  Network: http://${IP}:${PORT}/src/"
echo ""
echo "Open on iPhone Safari: http://${IP}:${PORT}/src/"
echo "(Ensure Mac and iPhone are on the same Wi‑Fi; allow firewall prompt.)"
echo "Press Ctrl+C to stop."
echo ""

# Prefer python3, fallback to python
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 0.0.0.0
elif command -v python >/dev/null 2>&1; then
  exec python -m SimpleHTTPServer "$PORT"
else
  echo "Python is required. Install Xcode Command Line Tools or Python 3." >&2
  exit 1
fi

