#!/bin/sh
# Run tests/rootfs-test.sh in OpenWrt's mips_24kc userland (QEMU user mode).
#
#   tests/run.sh <directory with the built .apk files>
#
# Needs docker and a binfmt_misc entry for big-endian MIPS (Debian/Ubuntu:
# apt install qemu-user-static). slate-sdr itself is taken from this tree,
# so the tests always cover the current scripts.

set -e

: "${OPENWRT_VERSION:=25.12.6}"
SDK_IMAGE="openwrt/sdk:ath79-nand-v$OPENWRT_VERSION"
ROOTFS_IMAGE="openwrt/rootfs:mips_24kc-v$OPENWRT_VERSION"

here=$(cd "$(dirname "$0")/.." && pwd)
pkgs=$(cd "${1:?usage: tests/run.sh <directory with .apk files>}" && pwd)
ov=$(mktemp -d)
trap 'rm -rf "$ov"' EXIT

# Unpacked as root, then handed back to the caller so the steps below (and
# the cleanup) can write to it.
docker run --rm --user 0 -e OWNER="$(id -u):$(id -g)" \
	-v "$pkgs:/pkgs:ro" -v "$ov:/ov" "$SDK_IMAGE" sh -c '
	for f in /pkgs/*.apk; do
		case "${f##*/}" in slate-sdr-*) continue ;; esac
		/builder/staging_dir/host/bin/apk extract --allow-untrusted --destination /ov "$f" > /dev/null
	done
	rm -rf /ov/lib/apk
	chown -R "$OWNER" /ov'

f="$here/feed/utils/slate-sdr/files"
mkdir -p "$ov/etc/config" "$ov/etc/init.d" "$ov/usr/libexec" "$ov/usr/sbin" \
	"$ov/usr/share/slate-sdr" "$ov/www/cgi-bin" "$ov/mnt/sdcard"
cp "$f/slate-sdr.config" "$ov/etc/config/slate-sdr"
cp "$f/slate-sdr.init" "$ov/etc/init.d/slate-sdr"
cp "$f/job.sh" "$ov/usr/libexec/slate-sdr-job"
cp "$f/slate-sdr.cli" "$ov/usr/sbin/slate-sdr"
cp "$f/lib.sh" "$ov/usr/share/slate-sdr/lib.sh"
cp "$f/status.cgi" "$ov/www/cgi-bin/slate-sdr"
chmod 755 "$ov/etc/init.d/slate-sdr" "$ov/usr/libexec/slate-sdr-job" \
	"$ov/usr/sbin/slate-sdr" "$ov/www/cgi-bin/slate-sdr"

# The decoders and libraries OpenWrt itself packages come from its
# repository when online; offline, <directory> must hold them too.
docker run --rm -v "$ov:/ov:ro" -v "$here/tests:/tests:ro" "$ROOTFS_IMAGE" sh -c '
	if apk update > /dev/null 2>&1; then
		apk add rtl-sdr rtl_433 rtl-ais libstdcpp6 libusb-1.0-0 > /tmp/apk.log 2>&1 ||
			{ echo "apk add failed:"; cat /tmp/apk.log; }
	else
		echo "(offline: testing with the given packages only)"
	fi
	cp -a /ov/. / && sh /tests/rootfs-test.sh'
