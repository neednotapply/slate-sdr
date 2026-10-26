#
# luci-app-slate-sdr: LuCI pages for slate-sdr under Services > Slate SDR.
#
# This is free software, licensed under the MIT license.
#
# A plain package rather than luci.mk, so the SDK build needs no LuCI feed.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-slate-sdr
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-slate-sdr
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI pages for slate-sdr (Services > Slate SDR)
  DEPENDS:=+luci-base +slate-sdr +rpcd +ucode +ucode-mod-fs +ucode-mod-uci
  PKGARCH:=all
endef

define Package/luci-app-slate-sdr/description
  Services > Slate SDR in LuCI: an overview with radio, card and job status
  and every address the receivers serve, the aircraft map, a list of the
  ISM devices rtl_433 has decoded with their latest readings, and the
  recorded files. Opening the Aircraft map or ISM sensors tab hands the
  RTL-SDR to that job.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-slate-sdr/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/slate-sdr
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/slate-sdr/*.js \
		$(1)/www/luci-static/resources/view/slate-sdr/
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-slate-sdr.json $(1)/usr/share/luci/menu.d/
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-slate-sdr.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.slate-sdr $(1)/usr/libexec/rpcd/
	$(INSTALL_BIN) ./root/usr/libexec/luci-slate-sdr-devices $(1)/usr/libexec/
endef

# On a running router: rebuild LuCI's menu and load the rpcd plugin and ACL.
# A browser that is logged in keeps its old menu and permissions until the
# next login.
define Package/luci-app-slate-sdr/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache*
	rm -rf /tmp/luci-modulecache
	/etc/init.d/rpcd reload
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-slate-sdr))
