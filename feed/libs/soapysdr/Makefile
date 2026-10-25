#
# SoapySDR: vendor-neutral SDR device API and module loader.
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=soapysdr
PKG_VERSION:=0.9.0
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/pothosware/SoapySDR.git
PKG_SOURCE_VERSION:=8b0970debaec4cb206ba76d0a2ef986feaf39534
PKG_MIRROR_HASH:=3cd7060ec0e89b6e6f4e02f9ead1b39d824f421366dd42c1a2d990c705850b02

PKG_LICENSE:=BSL-1.0
PKG_LICENSE_FILES:=LICENSE_1_0.txt

PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk

# ABI version of the module directory, from include/SoapySDR/Version.h
SOAPY_ABI:=0.9

define Package/soapysdr/Default
  URL:=https://github.com/pothosware/SoapySDR
endef

define Package/libsoapysdr
  $(call Package/soapysdr/Default)
  SECTION:=libs
  CATEGORY:=Libraries
  TITLE:=SoapySDR device API library
  DEPENDS:=+libstdcpp +libpthread
endef

define Package/libsoapysdr/description
  SoapySDR loads hardware support modules (HackRF, RTL-SDR, remote) at
  run time and gives every client one API to them.
endef

define Package/soapysdr-util
  $(call Package/soapysdr/Default)
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=SoapySDRUtil (find, probe and rate-test devices)
  DEPENDS:=+libsoapysdr
endef

CMAKE_OPTIONS += \
	-DENABLE_LIBRARY=ON \
	-DENABLE_APPS=ON \
	-DENABLE_TESTS=OFF \
	-DENABLE_DOCS=OFF \
	-DENABLE_PYTHON2=OFF \
	-DENABLE_PYTHON3=OFF \
	-DENABLE_LUAJIT=OFF \
	-DENABLE_CSHARP=OFF

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include $(1)/usr/lib/pkgconfig $(1)/usr/share/cmake
	$(CP) $(PKG_INSTALL_DIR)/usr/include/SoapySDR $(1)/usr/include/
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libSoapySDR.so* $(1)/usr/lib/
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/pkgconfig/SoapySDR.pc $(1)/usr/lib/pkgconfig/
	$(CP) $(PKG_INSTALL_DIR)/usr/share/cmake/SoapySDR $(1)/usr/share/cmake/
endef

define Package/libsoapysdr/install
	$(INSTALL_DIR) $(1)/usr/lib/SoapySDR/modules$(SOAPY_ABI)
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libSoapySDR.so.* $(1)/usr/lib/
endef

define Package/soapysdr-util/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/SoapySDRUtil $(1)/usr/bin/
endef

$(eval $(call BuildPackage,libsoapysdr))
$(eval $(call BuildPackage,soapysdr-util))
