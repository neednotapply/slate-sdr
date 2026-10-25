#!/bin/sh
# Full OpenWrt source build of the slate-sdr firmware for the GL-AR750S
# (NOR/NAND), with the kernel and Wi-Fi drivers rebuilt for spectral scan.
# Takes 1-3 hours and about 20 GB of disk. Needs OpenWrt's build
# prerequisites (https://openwrt.org/docs/guide-developer/toolchain/install-buildsystem)
# and must not run as root.
# Output: out/firmware-full/*-sysupgrade.bin
#
#   ./build-full.sh                 configure and build
#   ./build-full.sh --config-only   configure and check the configuration

set -eu

: "${OPENWRT_VERSION:=25.12.6}"
here=$(cd "$(dirname "$0")" && pwd)
src="${OPENWRT_DIR:-$here/build/openwrt}"

if [ ! -d "$src/.git" ]; then
	git clone --depth 1 --branch "v$OPENWRT_VERSION" https://github.com/openwrt/openwrt.git "$src"
fi
cd "$src"

# The release's feeds, from OpenWrt's GitHub mirrors, plus ours.
sed -E \
	-e 's#https://git.openwrt.org/feed/packages.git#https://github.com/openwrt/packages.git#' \
	-e 's#https://git.openwrt.org/project/luci.git#https://github.com/openwrt/luci.git#' \
	-e '/^src-git (routing|telephony|video) /d' \
	feeds.conf.default > feeds.conf
echo "src-link slatesdr $here/feed" >> feeds.conf
./scripts/feeds update -a
./scripts/feeds install -a

cp "$here/config/full.config" .config
sed 's/#.*//' "$here/config/packages.txt" | xargs -n 1 | sed 's/.*/CONFIG_PACKAGE_&=y/' >> .config
make defconfig

# defconfig drops what it cannot satisfy; stop rather than build without it.
for opt in CONFIG_KERNEL_RELAY=y CONFIG_PACKAGE_ATH_SPECTRAL=y \
	CONFIG_PACKAGE_kmod-ath10k=y CONFIG_PACKAGE_ath10k-firmware-qca9887=y \
	CONFIG_PACKAGE_kmod-ath9k=y CONFIG_PACKAGE_slate-sdr=y CONFIG_PACKAGE_luci=y; do
	grep -qx "$opt" .config || { echo "make defconfig dropped $opt" >&2; exit 1; }
done
if grep -qx 'CONFIG_PACKAGE_kmod-ath10k-ct=y' .config; then
	echo "kmod-ath10k-ct is still selected" >&2
	exit 1
fi

if [ "${1:-}" = --config-only ]; then
	echo "Configuration OK: $src/.config"
	exit 0
fi

make download -j8
make -j"$(nproc)" || make -j1 V=s

mkdir -p "$here/out/firmware-full"
cp bin/targets/ath79/nand/*glinet_gl-ar750s-nor-nand*sysupgrade.bin \
	bin/targets/ath79/nand/*glinet_gl-ar750s-nor-nand*.manifest \
	"$here/out/firmware-full/"
ls -l "$here/out/firmware-full/"
