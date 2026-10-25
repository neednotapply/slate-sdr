#
# SoapySDR module for RTL-SDR.
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=soapy-rtlsdr
PKG_VERSION:=0.3.4
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/pothosware/SoapyRTLSDR.git
PKG_SOURCE_VERSION:=5b544e3d3a7ae97952742f42f8bb110fe62c3cd8
PKG_MIRROR_HASH:=6bdd0be690d1b766af4bd47a61bff97965d2c841dc8696fb49230c08a84062f9

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE.txt

PKG_BUILD_DEPENDS:=soapysdr rtl-sdr
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk

SOAPY_ABI:=0.9

define Package/soapy-rtlsdr
  SECTION:=libs
  CATEGORY:=Libraries
  TITLE:=SoapySDR RTL-SDR module
  URL:=https://github.com/pothosware/SoapyRTLSDR
  DEPENDS:=+libsoapysdr +librtlsdr
endef

define Package/soapy-rtlsdr/install
	$(INSTALL_DIR) $(1)/usr/lib/SoapySDR/modules$(SOAPY_ABI)
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/SoapySDR/modules$(SOAPY_ABI)/librtlsdrSupport.so \
		$(1)/usr/lib/SoapySDR/modules$(SOAPY_ABI)/
endef

$(eval $(call BuildPackage,soapy-rtlsdr))
