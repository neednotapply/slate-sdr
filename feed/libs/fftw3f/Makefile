#
# Single-precision FFTW, needed by hackrf_sweep.
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=fftw3f
PKG_VERSION:=3.3.11
PKG_RELEASE:=1

PKG_SOURCE:=fftw-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://www.fftw.org https://fftw.org
PKG_HASH:=5630c24cdeb33b131612f7eb4b1a9934234754f9f388ff8617458d0be6f239a1
PKG_BUILD_DIR:=$(BUILD_DIR)/fftw-$(PKG_VERSION)

PKG_LICENSE:=GPL-2.0-or-later
PKG_LICENSE_FILES:=COPYING
PKG_CPE_ID:=cpe:/a:fftw:fftw

PKG_INSTALL:=1
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/libfftw3f
  SECTION:=libs
  CATEGORY:=Libraries
  TITLE:=Fast Fourier transform library (single precision)
  URL:=https://www.fftw.org
endef

define Package/libfftw3f/description
  FFTW computes discrete Fourier transforms. This build is single
  precision (float) only, without threads, SIMD or Fortran.
endef

CONFIGURE_ARGS += \
	--enable-float \
	--enable-shared \
	--disable-static \
	--disable-fortran \
	--disable-doc \
	--with-pic

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include
	$(CP) $(PKG_INSTALL_DIR)/usr/include/fftw3.h $(1)/usr/include/
	$(INSTALL_DIR) $(1)/usr/lib/pkgconfig
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libfftw3f.so* $(1)/usr/lib/
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/pkgconfig/fftw3f.pc $(1)/usr/lib/pkgconfig/
endef

define Package/libfftw3f/install
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libfftw3f.so.* $(1)/usr/lib/
endef

$(eval $(call BuildPackage,libfftw3f))
