#
# SoapySDR module for HackRF.
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=soapy-hackrf
PKG_VERSION:=0.3.5
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/pothosware/SoapyHackRF.git
PKG_SOURCE_VERSION:=1ec26598444c61076a9ff31e24f596d16b25374c
PKG_MIRROR_HASH:=034987973a0d336f8621091b6401ec45919299d4e4f24e5666e3aa5174f80cb1

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

PKG_BUILD_DEPENDS:=soapysdr hackrf
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk

SOAPY_ABI:=0.9

define Package/soapy-hackrf
  SECTION:=libs
  CATEGORY:=Libraries
  TITLE:=SoapySDR HackRF module
  URL:=https://github.com/pothosware/SoapyHackRF
  DEPENDS:=+libsoapysdr +libhackrf
endef

define Package/soapy-hackrf/install
	$(INSTALL_DIR) $(1)/usr/lib/SoapySDR/modules$(SOAPY_ABI)
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/SoapySDR/modules$(SOAPY_ABI)/libHackRFSupport.so \
		$(1)/usr/lib/SoapySDR/modules$(SOAPY_ABI)/
endef

$(eval $(call BuildPackage,soapy-hackrf))
