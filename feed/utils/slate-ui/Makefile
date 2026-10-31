#
# slate-ui: a cohesive web UI for the Slate, served by uhttpd and driven by
# the existing rpcd/ubus backend (Slate SDR + Network Recon). Static files
# only, no compiled code.
#
# This is free software, licensed under the MIT license.
#
# A plain package (no luci.mk): it needs no LuCI feed to build.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=slate-ui
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/slate-ui
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Slate web UI (cohesive dashboard over ubus)
  DEPENDS:=+uhttpd +uhttpd-mod-ubus +rpcd +tcpdump-mini +iw
  PKGARCH:=all
endef

define Package/slate-ui/description
  A lightweight single-page web interface for the Slate, served by uhttpd at
  /slate-ui/ and talking to the existing rpcd/ubus methods (luci.slate-recon
  and luci.slate-sdr) with a root ubus session. One dashboard for the joined
  network, hosts, Wi-Fi survey, threats, GPS, the radios and the SDR jobs.
  Intended to replace the generic LuCI interface over time.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/slate-ui/install
	$(INSTALL_DIR) $(1)/www/slate-ui
	$(INSTALL_DATA) ./files/index.html $(1)/www/slate-ui/index.html
	$(INSTALL_DATA) ./files/app.js $(1)/www/slate-ui/app.js
	$(INSTALL_DATA) ./files/style.css $(1)/www/slate-ui/style.css
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/95-slate-ui $(1)/etc/uci-defaults/95-slate-ui
	$(INSTALL_DIR) $(1)/usr/sbin $(1)/usr/libexec/rpcd $(1)/usr/share/rpcd/acl.d
	$(INSTALL_BIN) ./root/usr/sbin/slate-router $(1)/usr/sbin/slate-router
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.slate-router $(1)/usr/libexec/rpcd/luci.slate-router
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-slate-router.json $(1)/usr/share/rpcd/acl.d/luci-app-slate-router.json
	$(INSTALL_BIN) ./root/usr/sbin/slate-capture $(1)/usr/sbin/slate-capture
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.slate-capture $(1)/usr/libexec/rpcd/luci.slate-capture
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-slate-capture.json $(1)/usr/share/rpcd/acl.d/luci-app-slate-capture.json
	$(INSTALL_BIN) ./root/usr/sbin/slate-handshake $(1)/usr/sbin/slate-handshake
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.slate-handshake $(1)/usr/libexec/rpcd/luci.slate-handshake
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-slate-handshake.json $(1)/usr/share/rpcd/acl.d/luci-app-slate-handshake.json
	$(INSTALL_BIN) ./root/usr/sbin/slate-firmware $(1)/usr/sbin/slate-firmware
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.slate-firmware $(1)/usr/libexec/rpcd/luci.slate-firmware
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-slate-firmware.json $(1)/usr/share/rpcd/acl.d/luci-app-slate-firmware.json
	$(INSTALL_DIR) $(1)/www/cgi-bin
	$(INSTALL_BIN) ./files/slate-upload $(1)/www/cgi-bin/slate-upload
endef

# On a running router: make sure uhttpd exposes /ubus (what the UI calls), then
# reload it. The uci-defaults script also runs on a fresh boot.
define Package/slate-ui/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	[ -f /etc/uci-defaults/95-slate-ui ] && ( . /etc/uci-defaults/95-slate-ui ) >/dev/null 2>&1
	/etc/init.d/rpcd reload >/dev/null 2>&1
	/etc/init.d/uhttpd reload >/dev/null 2>&1
}
exit 0
endef

$(eval $(call BuildPackage,slate-ui))
