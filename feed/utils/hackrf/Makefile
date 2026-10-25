#
# HackRF host library and tools (receive works on boards with a dead TX path).
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=hackrf
PKG_VERSION:=2026.01.3
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/greatscottgadgets/hackrf.git
PKG_SOURCE_VERSION:=1cfe7dfe98d333450217d50e3f3a1ad0702e000f
PKG_SOURCE_SUBMODULES:=skip
PKG_MIRROR_HASH:=5306d9035840921515ad121932070801da85f5c89afa80354c1e1de5c689be8e

PKG_LICENSE:=GPL-2.0-or-later
PKG_LICENSE_FILES:=COPYING

CMAKE_SOURCE_SUBDIR:=host
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk

define Package/hackrf/Default
  TITLE:=HackRF
  URL:=https://greatscottgadgets.com/hackrf/
endef

define Package/libhackrf
  $(call Package/hackrf/Default)
  SECTION:=libs
  CATEGORY:=Libraries
  TITLE+= host library
  DEPENDS:=+libusb-1.0 +libpthread
endef

define Package/libhackrf/description
  libhackrf talks to HackRF One (and compatible) boards over USB.
endef

define Package/hackrf
  $(call Package/hackrf/Default)
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE+= tools (hackrf_info, hackrf_transfer, hackrf_sweep, ...)
  DEPENDS:=+libhackrf +libfftw3f
endef

define Package/hackrf/description
  Command line tools for HackRF: device info, raw IQ capture
  (hackrf_transfer), wideband sweeps (hackrf_sweep), clock, bias tee,
  Opera Cake and SPI flash (firmware update) utilities.
endef

CMAKE_OPTIONS += \
	-DINSTALL_UDEV_RULES=OFF \
	-DENABLE_STATIC_LIB=OFF \
	-DENABLE_SHARED_LIB=ON \
	-DENABLE_HACKRF_SWEEP=ON

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include/libhackrf $(1)/usr/lib/pkgconfig
	$(CP) $(PKG_INSTALL_DIR)/usr/include/libhackrf/*.h $(1)/usr/include/libhackrf/
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libhackrf.so* $(1)/usr/lib/
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/pkgconfig/libhackrf.pc $(1)/usr/lib/pkgconfig/
endef

define Package/libhackrf/install
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libhackrf.so.* $(1)/usr/lib/
endef

define Package/hackrf/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/hackrf_* $(1)/usr/bin/
endef

$(eval $(call BuildPackage,libhackrf))
$(eval $(call BuildPackage,hackrf))
