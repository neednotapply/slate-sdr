#
# luci-app-slate-recon: network recon in LuCI, under Services > Network Recon.
#
# This is free software, licensed under the MIT license.
#
# A plain package rather than luci.mk, so the SDK build needs no LuCI feed.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-slate-recon
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-slate-recon
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Network recon in LuCI (Services > Network Recon)
  DEPENDS:=+luci-base +rpcd +ucode +ucode-mod-fs +arp-scan +arp-scan-database +nmap +ip-full +iw +tcpdump-mini
  PKGARCH:=all
endef

define Package/luci-app-slate-recon/description
  Services > Network Recon in LuCI. "Hosts": what is on the network this
  router has joined — passive host discovery with arp-scan (IP, MAC, vendor)
  and a short nmap port scan of a single host you pick. "Wi-Fi Survey": a
  wardriving-style log of the access points the Slate hears, scanned on a
  free radio and kept with first/last seen, signal, channel and security
  (plus GPS when a gpsd runs). "Threats": passive detection of evil-twin /
  rogue access points over the survey data, and of deauthentication floods
  on the monitor radio. Results are saved to the microSD card.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-slate-recon/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/slate-recon
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/slate-recon/*.js \
		$(1)/www/luci-static/resources/view/slate-recon/
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-slate-recon.json $(1)/usr/share/luci/menu.d/
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-slate-recon.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd $(1)/usr/libexec $(1)/usr/sbin
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.slate-recon $(1)/usr/libexec/rpcd/
	$(INSTALL_BIN) ./root/usr/libexec/slate-survey-merge $(1)/usr/libexec/
	$(INSTALL_BIN) ./root/usr/sbin/slate-recon $(1)/usr/sbin/
	$(INSTALL_BIN) ./root/usr/sbin/slate-survey $(1)/usr/sbin/
	$(INSTALL_BIN) ./root/usr/sbin/slate-threats $(1)/usr/sbin/
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/95-slate-recon-gpsd $(1)/etc/uci-defaults/
endef

# On a running router: rebuild LuCI's menu and load the rpcd plugin and ACL.
# A browser that is logged in keeps its old menu and permissions until the
# next login.
define Package/luci-app-slate-recon/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache*
	rm -rf /tmp/luci-modulecache
	/etc/init.d/rpcd reload
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-slate-recon))
