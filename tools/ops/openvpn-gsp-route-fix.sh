#!/usr/bin/env bash
# Pin GSP VPN destination routes to tun0 explicitly.
# Reason: WSL mirrored mode auto-mirrors Windows TAP adapter as eth1 in the same
# 10.255.79.0/24 subnet, so the in-WSL OpenVPN tun0 route gets ambiguous
# (dev [NULL]) and kernel sometimes picks eth1 (which leads nowhere useful).
# This script forces tun0 for the corporate IPs we actually need.
set -eu

# Wait up to 30s for tun0 to appear (OpenVPN startup can take a moment).
for i in $(seq 1 30); do
  if ip link show tun0 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! ip link show tun0 >/dev/null 2>&1; then
  echo "tun0 not present after 30s, aborting" >&2
  exit 1
fi

# Targets to pin. Add more here as the corporate VPN grows new internal IPs.
TARGETS="10.83.81.246/32 10.79.255.2/32"

for t in $TARGETS; do
  ip route del "$t" dev eth1 2>/dev/null || true
  ip route del "$t" 2>/dev/null || true
  ip route add "$t" dev tun0
  echo "pinned $t to tun0"
done

echo "route fix done"
ip route get 10.83.81.246
