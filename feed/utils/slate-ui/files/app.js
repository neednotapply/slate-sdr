/* Slate web UI. A tiny single-page app that talks to the router's rpcd/ubus
   methods (luci.slate-recon, luci.slate-sdr) over /ubus with a root session.
   No framework. Served by uhttpd at /slate-ui/.

   Demo mode: open with ?demo=1 (or from a file:// path) to render built-in
   sample data without a router, for previewing the design. */
(function () {
	"use strict";

	var UBUS = "/ubus";
	var NULL_SID = "00000000-0000-0000-0000-000000000000";
	var DEMO = /[?&]demo=1/.test(location.search) || location.protocol === "file:";
	var SID = null;

	/* ---------- ubus JSON-RPC client ---------- */

	function rpc(method, params) {
		return fetch(UBUS, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
		}).then(function (r) { return r.json(); }).then(function (j) {
			if (j.error) throw new Error(j.error.message || "rpc error");
			return j.result;
		});
	}

	// ubus "call" returns [status, data]; status 0 == ok, 6 == permission.
	function callm(object, method, params) {
		return rpc("call", [SID || NULL_SID, object, method, params || {}]).then(function (r) {
			if (!Array.isArray(r)) throw new Error("bad ubus reply");
			if (r[0] === 6) { SID = null; throw new Error("unauthorized"); }
			if (r[0] !== 0) throw new Error("ubus status " + r[0]);
			return r[1] || {};
		});
	}

	function login(user, pass) {
		return rpc("call", [NULL_SID, "session", "login",
			{ username: user, password: pass, timeout: 3600 }]).then(function (r) {
			if (!Array.isArray(r) || r[0] !== 0 || !r[1] || !r[1].ubus_rpc_session)
				throw new Error("login failed");
			SID = r[1].ubus_rpc_session;
			try { sessionStorage.setItem("slate_sid", SID); } catch (e) {}
			return SID;
		});
	}

	// call(): the one entry point the views use; serves demo data when offline.
	function call(object, method, params) {
		if (DEMO) {
			var d = MOCK[object + ":" + method];
			if (typeof d === "function") d = d(params || {});
			return Promise.resolve(JSON.parse(JSON.stringify(d != null ? d : {})));
		}
		return callm(object, method, params || {});
	}

	/* ---------- demo data ---------- */

	function iso(secAgo) { return new Date(Date.now() - secAgo * 1000).toISOString(); }
	function stamp(secAgo) { return new Date(Date.now() - secAgo * 1000).toISOString().replace("T", " ").replace(/\..*/, ""); }
	function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

	// Mutable demo job table so "Use the radio" visibly switches jobs in demo.
	var DEMO_JOBS = [
		{ name: "soapy", type: "soapy", radio: "hackrf", state: "running" },
		{ name: "adsb", type: "adsb", radio: "rtlsdr", state: "running" },
		{ name: "survey", type: "hackrf_sweep", radio: "hackrf", state: "stopped" },
		{ name: "ism", type: "rtl_433", radio: "rtlsdr", state: "off" },
		{ name: "ais", type: "rtl_ais", radio: "rtlsdr", state: "off" },
		{ name: "rtltcp", type: "rtl_tcp", radio: "rtlsdr", state: "off" }
	];
	function demoStatus() {
		var head = "slate-sdr\n  microSD:  mounted /mnt/sdcard (SLATESDR, 29.7G free)\n" +
			"  RTL-SDR:  present (Realtek RTL2838U, serial 00000001)\n" +
			"  HackRF:   present (serial 457863)\n\n  job        type           radio    state\n";
		return head + DEMO_JOBS.map(function (j) {
			return "  " + pad(j.name, 10) + " " + pad(j.type, 14) + " " + pad(j.radio, 8) + " " + j.state;
		}).join("\n");
	}

	var DEMO_ADB = { on: true };

	var MOCK = {
		"luci.slate-recon:dashboard": {
			uplink: { ssid: "NoInternetHere-5", iface: "phy1-sta0",
				subnet: "192.168.1.0/24", gateway: "192.168.1.1", online: true },
			hosts: { count: 5, scanned: "2026-10-29 14:02" },
			survey: { count: 38 },
			threats: { count: 1, high: 1 },
			gps: { installed: true, running: true },
			radios: [
				{ iface: "wlan0", mode: "Master", ssid: "Pirate Radio", channel: 36 },
				{ iface: "wlan1", mode: "Client", ssid: "NoInternetHere-5", channel: 6 },
				{ iface: "wlan2", mode: "Monitor", ssid: "", channel: 6 }
			],
			sdr: { present: true, running: 3 }
		},
		"luci.slate-recon:uplink": { ssid: "NoInternetHere-5", iface: "phy1-sta0",
			subnet: "192.168.1.0/24", gateway: "192.168.1.1", gateway_mac: "a4:2b:b0:11:22:33" },
		"luci.slate-recon:hosts": {
			scanned: "2026-10-29T14:02:11Z",
			hosts: [
				{ ip: "192.168.1.1", mac: "a4:2b:b0:11:22:33", vendor: "Netgear", gateway: true },
				{ ip: "192.168.1.10", mac: "b8:27:eb:aa:bb:cc", vendor: "Raspberry Pi Foundation" },
				{ ip: "192.168.1.23", mac: "3c:22:fb:12:34:56", vendor: "Apple, Inc." },
				{ ip: "192.168.1.42", mac: "dc:a6:32:77:88:99", vendor: "Raspberry Pi Trading" },
				{ ip: "192.168.1.185", mac: "e4:5f:01:ab:cd:ef", vendor: "(Unknown)", self: true }
			]
		},
		"luci.slate-recon:ports": function (p) {
			return { target: p.target, ports: [
				{ port: 22, proto: "tcp", service: "ssh" },
				{ port: 80, proto: "tcp", service: "http" },
				{ port: 443, proto: "tcp", service: "https" }
			] };
		},
		"luci.slate-recon:survey_networks": function () {
			return { total: 38, networks: [
				{ ssid: "Pirate Radio", bssid: "a4:2b:b0:aa:00:01", channel: 36, security: "WPA3", best_signal: -31, count: 210, last: iso(20), lat: 37.42193, lon: -122.08400 },
				{ ssid: "NoInternetHere-5", bssid: "a4:2b:b0:11:22:34", channel: 6, security: "WPA3", best_signal: -44, count: 142, last: iso(45), lat: 37.42191, lon: -122.08411 },
				{ ssid: "CoffeeShop", bssid: "aa:bb:cc:00:11:22", channel: 1, security: "Open", best_signal: -58, count: 31, last: iso(240), lat: 37.42210, lon: -122.08455 },
				{ ssid: "xfinitywifi", bssid: "06:1d:ac:31:aa:10", channel: 11, security: "Open", best_signal: -73, count: 9, last: iso(1800) },
				{ ssid: "", bssid: "e8:de:27:44:55:66", channel: 11, security: "WPA", best_signal: -81, count: 4, last: iso(7200) }
			] };
		},
		"luci.slate-recon:survey_gps": { installed: true, running: true, device: "/dev/ttyACM0",
			fix: "3D", lat: 37.421925, lon: -122.084102, sats_used: 9, sats: 12 },
		"luci.slate-recon:survey_scan": { phy: "phy1", found: 6, total: 38, gps: true, saved: true },
		"luci.slate-recon:survey_clear": {},
		"luci.slate-recon:threats_rogue": {
			total_networks: 38,
			protected: ["Pirate Radio", "NoInternetHere-5"],
			threats: [{
				type: "evil_twin", severity: "high", ssid: "CoffeeShop",
				detail: "\"CoffeeShop\" is advertised both open and secured — a classic evil-twin setup.",
				bssids: [
					{ bssid: "aa:bb:cc:00:11:22", security: "Open", signal: -58, channel: 1 },
					{ bssid: "aa:bb:cc:00:11:23", security: "WPA", signal: -66, channel: 6 }
				]
			}]
		},
		"luci.slate-recon:threats_deauth": function (p) {
			var secs = Number(p.secs) || 15;
			return { alert: false, total: 4, window_s: secs, channel: 6, deauth: 3, disassoc: 1,
				sources: [{ mac: "de:ad:be:ef:00:01", count: 3 }, { mac: "de:ad:be:ef:00:02", count: 1 }] };
		},
		"luci.slate-sdr:use": function (p) {
			var job = DEMO_JOBS.filter(function (j) { return j.name === p.job; })[0];
			var stopped = [];
			if (job) {
				DEMO_JOBS.forEach(function (j) {
					if (j.radio === job.radio && j.name !== job.name && j.state === "running") { j.state = "off"; stopped.push(j.name); }
				});
				job.state = "running";
			}
			return { job: p.job, radio: job ? job.radio : "", switched: true, stopped: stopped };
		},
		"luci.slate-sdr:devices": function () {
			return { now: Math.floor(Date.now() / 1000), enabled: true,
				frequencies: ["433.92M", "315M", "915M"], hop_interval: 600, decoded: 212,
				devices: [
					{ model: "Acurite-Tower", id: 12345, channel: "A", first: stamp(9000), last: stamp(28), count: 96, freq: "433.92M", readings: { temperature_C: 21.4, humidity: 48, battery_ok: 1 } },
					{ model: "LaCrosse-TX141THBv2", id: 88, channel: 2, last: stamp(140), count: 41, freq: "915M", readings: { temperature_C: 19.8, humidity: 55 } },
					{ model: "Toyota-TPMS", id: "8fa21c", last: stamp(600), count: 6, freq: "315M", readings: { pressure_PSI: 32.1, temperature_C: 27.0 } },
					{ model: "Honeywell-Door", id: 7781, last: stamp(3600), count: 3, freq: "345M", readings: { state: "open", battery_ok: 1 } }
				] };
		},
		"luci.slate-router:status": {
			hostname: "pirate-radio", model: "GL.iNet GL-AR750S (NAND)", firmware: "OpenWrt 25.12.6",
			uptime: 48212, load: "0.42",
			memory: { total: 124416, free: 38160, available: 51232 },
			flash: { total: 98304, free: 72960 }, online: true
		},
		"luci.slate-router:clients": {
			clients: [
				{ mac: "b8:27:eb:aa:bb:cc", ip: "192.168.1.10", host: "raspberrypi" },
				{ mac: "3c:22:fb:12:34:56", ip: "192.168.1.23", host: "nicks-iphone" },
				{ mac: "dc:a6:32:77:88:99", ip: "192.168.1.42", host: "octoprint" },
				{ mac: "e4:5f:01:ab:cd:ef", ip: "192.168.1.185", host: "-" }
			]
		},
		"luci.slate-router:adblock": function (p) {
			if (p && (p.enabled === true || p.enabled === 1 || p.enabled === "1" || p.enabled === "true")) DEMO_ADB.on = true;
			else if (p && (p.enabled === false || p.enabled === 0 || p.enabled === "0" || p.enabled === "false")) DEMO_ADB.on = false;
			return { installed: true, enabled: DEMO_ADB.on, running: DEMO_ADB.on, domains: 58781 };
		}
	};

	/* ---------- dom helpers ---------- */

	function el(tag, attrs) {
		var n = document.createElement(tag), k;
		if (attrs) for (k in attrs) {
			if (k === "class") n.className = attrs[k];
			else if (k === "text") n.textContent = attrs[k];
			else if (k === "html") n.innerHTML = attrs[k];
			else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
			else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
		}
		for (var i = 2; i < arguments.length; i++) {
			var c = arguments[i];
			if (c == null) continue;
			n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
		}
		return n;
	}
	function $(id) { return document.getElementById(id); }
	function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

	function btn(label, o) {
		o = o || {};
		var b = el("button", { type: "button",
			class: "btn" + (o.primary ? " primary" : "") + (o.cls ? " " + o.cls : ""), text: label });
		if (o.onclick) b.addEventListener("click", o.onclick);
		return b;
	}
	function badge(text, cls) { return el("span", { class: "b " + (cls || ""), text: text }); }

	function tableEl(headers, rows) {
		var wrap = el("div", { class: "table-scroll" });
		var t = el("table", { class: "tbl" });
		var head = el("tr");
		headers.forEach(function (h) { head.appendChild(el("th", { text: h })); });
		t.appendChild(head);
		rows.forEach(function (r) {
			var tr = el("tr");
			r.forEach(function (c) {
				var td = el("td");
				if (c != null) td.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
				tr.appendChild(td);
			});
			t.appendChild(tr);
		});
		wrap.appendChild(t);
		return wrap;
	}
	function alertEl(kind, content) {
		var a = el("div", { class: "alert " + kind });
		(Array.isArray(content) ? content : [content]).forEach(function (c) {
			if (c != null) a.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
		});
		return a;
	}
	function ago(time) {
		var t = Date.parse(time), s = Math.max(0, Math.round((Date.now() - t) / 1000));
		if (isNaN(t)) return time || "-";
		if (s < 90) return s + " s ago";
		if (s < 5400) return Math.round(s / 60) + " min ago";
		if (s < 129600) return Math.round(s / 3600) + " h ago";
		return Math.round(s / 86400) + " days ago";
	}
	function dur(sec) {
		sec = +sec || 0;
		var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
		if (d) return d + "d " + h + "h";
		if (h) return h + "h " + m + "m";
		return m + "m";
	}
	function mb(kb) { return Math.round((+kb || 0) / 1024); }
	function secClass(sec) {
		if (sec === "Open") return "sec-open";
		if (sec === "WEP" || sec === "WPA") return "sec-warn";
		if (sec === "WPA3") return "sec-ok";
		return "sec-neutral";
	}
	function sevClass(sev) {
		return sev === "high" ? "sev-high" : (sev === "medium" ? "sev-warn" : "sev-neutral");
	}

	/* ---------- SDR helpers (status text, rtl_433 readings) ---------- */

	// rtl_433 key suffix -> unit shown after the value (from the LuCI ISM page).
	var UNITS = [
		[/_C$/, "°C"], [/_F$/, "°F"], [/_kPa$/, "kPa"], [/_hPa$/, "hPa"],
		[/_PSI$/i, "PSI"], [/_bar$/, "bar"], [/_km_h$/, "km/h"], [/_m_s$/, "m/s"],
		[/_mi_h$/, "mph"], [/_mm$/, "mm"], [/_in$/, "in"], [/_deg$/, "°"],
		[/_lux$/, "lux"], [/_V$/, "V"], [/_mV$/, "mV"], [/^humidity$|_humidity$|^moisture$/, "%"]
	];
	function reading(key, value) {
		if (key === "battery_ok") return value ? "battery OK" : "battery low";
		for (var i = 0; i < UNITS.length; i++)
			if (UNITS[i][0].test(key))
				return (key.replace(UNITS[i][0], "").replace(/_/g, " ") || key) + " " +
					((typeof value === "number") ? +value.toFixed(1) : value) + " " + UNITS[i][1];
		return key.replace(/_/g, " ") + " " + value;
	}
	function mhz(f) { return String(f).replace(/M$/i, "") + " MHz"; }
	function agoIsm(time) {
		return ago(/Z$|[+-]\d\d:?\d\d$/.test(time || "") ? time : time + "Z");
	}
	// "  adsb       adsb           rtlsdr   running" -> {name,type,radio,state}
	function parseJobs(status) {
		var jobs = [], re = /^ {2}(\S+) +(\S+) +(\S+) +(running|stopped|off) *$/mg, m;
		while ((m = re.exec(status || "")) !== null)
			jobs.push({ name: m[1], type: m[2], radio: m[3], state: m[4] });
		return jobs;
	}
	function fetchSdrStatus() {
		if (DEMO) return Promise.resolve(demoStatus());
		return fetch("/cgi-bin/slate-sdr", { cache: "no-store" }).then(function (r) {
			return r.ok ? r.text() : null;
		}).then(function (html) {
			var pre = html ? new DOMParser().parseFromString(html, "text/html").querySelector("pre") : null;
			return pre ? pre.textContent.replace(/^\n+|\s+$/g, "") : null;
		}).catch(function () { return null; });
	}
	var SDR_PAGES = [
		["Slate SDR status", "http://%s/cgi-bin/slate-sdr", null],
		["Aircraft map", "http://%s:8080/", "adsb"],
		["Recorded data", "http://%s:8081/slate-sdr/", null]
	];
	var SDR_CLIENTS = [
		["SoapySDR (SDR++, GQRX, CubicSDR, SDRangel, GNU Radio)", "driver=remote,remote=tcp://%s:55132", "soapy"],
		["rtl_tcp (SDR#, SDR++, GQRX)", "%s:1234", "rtltcp"],
		["ADS-B, SBS", "%s:30003", "adsb"],
		["ADS-B, Beast", "%s:30005", "adsb"],
		["AIS, NMEA (OpenCPN)", "tcp://%s:10110", "ais"]
	];

	/* ---------- view scaffolding ---------- */

	var VIEW = $("view");
	function loading() { clear(VIEW).appendChild(el("div", { class: "loading", text: "Loading…" })); }
	function viewHead(title, sub) {
		return el("div", { class: "view-head" },
			el("h2", { text: title }), sub ? el("span", { class: "sub", text: sub }) : null);
	}
	function panel(title) {
		var p = el("div", { class: "panel" });
		if (title) p.appendChild(el("h3", { class: "sub-h", text: title }));
		return p;
	}

	/* ---------- Dashboard ---------- */

	function tile(o) {
		var t = el(o.tab ? "button" : "div", { class: "tile tone-" + (o.tone || "neutral") });
		if (o.tab) { t.type = "button"; t.addEventListener("click", function () { setTab(o.tab); }); }
		t.appendChild(el("span", { class: "k", text: o.k }));
		t.appendChild(el("span", { class: "v", text: String(o.v) }));
		if (o.s) t.appendChild(el("span", { class: "s", text: o.s }));
		return t;
	}

	function loadDashboard() {
		loading();
		return call("luci.slate-recon", "dashboard").then(renderDashboard).catch(onError);
	}

	function renderDashboard(d) {
		clear(VIEW);
		VIEW.appendChild(viewHead("Dashboard", "where the Slate is and what it sees"));
		var up = d.uplink || {}, online = !!up.online;
		setNetPill(online, up.ssid);

		var grid = el("div", { class: "grid" });
		grid.appendChild(tile({ k: "Uplink", v: up.ssid || "—", tone: online ? "accent" : "bad",
			s: online ? "online · " + (up.subnet || "") : "no internet route", tab: "survey" }));
		grid.appendChild(tile({ k: "Hosts", v: d.hosts ? d.hosts.count : 0, tab: "hosts",
			s: d.hosts && d.hosts.scanned ? "last scan " + d.hosts.scanned : "on the joined network" }));
		grid.appendChild(tile({ k: "Wi-Fi survey", v: d.survey ? d.survey.count : 0, tab: "survey",
			s: "access points logged" }));
		var th = d.threats || { count: 0, high: 0 };
		grid.appendChild(tile({ k: "Threats", v: th.count || 0, tab: "threats",
			tone: th.high > 0 ? "bad" : (th.count > 0 ? "warn" : "ok"), s: (th.high || 0) + " high severity" }));
		var gps = d.gps || {};
		grid.appendChild(tile({ k: "GPS", v: gps.running ? "live" : (gps.installed ? "idle" : "none"),
			tone: gps.running ? "ok" : "neutral",
			s: gps.installed ? (gps.running ? "gpsd running" : "plug in a receiver") : "not installed", tab: "survey" }));
		var sdr = d.sdr;
		grid.appendChild(tile({ k: "SDR jobs", v: sdr && sdr.present ? (sdr.running || 0) : "—", tab: "sdr",
			tone: sdr && sdr.present && sdr.running ? "accent" : "neutral",
			s: sdr && sdr.present ? "receivers running" : "not installed" }));
		VIEW.appendChild(grid);

		var radios = d.radios || [];
		var p = panel("Radios");
		p.style.marginTop = "14px";
		var rows = el("div", { class: "rows" });
		if (!radios.length) rows.appendChild(el("div", { class: "row muted" }, "no radios reported"));
		radios.forEach(function (r) {
			var cls = (r.mode || "").toLowerCase();
			rows.appendChild(el("div", { class: "row" },
				el("span", { class: "tag " + cls, text: r.mode || "?" }),
				el("span", { class: "grow", text: r.ssid || (cls === "monitor" ? "(monitor)" : "(no SSID)") }),
				el("span", { class: "muted", text: "ch " + (r.channel || "—") }),
				el("span", { class: "muted", text: r.iface || "" })));
		});
		p.appendChild(rows);
		VIEW.appendChild(p);
	}

	/* ---------- Hosts ---------- */

	function renderHosts() {
		clear(VIEW);
		VIEW.appendChild(viewHead("Hosts", "what is on the network this router has joined"));

		var secUp = panel("Joined network");
		var uplinkLine = el("div", { class: "muted", text: "Loading…" });
		secUp.appendChild(uplinkLine);

		var secScan = panel();
		secScan.style.marginTop = "14px";
		var scanInfo = el("span", { class: "status" });
		var scanBtn = btn("Scan network", { primary: true, onclick: doDiscover });
		secScan.appendChild(el("div", { class: "toolbar" }, scanBtn, scanInfo));
		var tableWrap = el("div");
		tableWrap.appendChild(el("div", { class: "muted", text: "Loading…" }));
		secScan.appendChild(tableWrap);

		var portWrap = el("div");
		VIEW.appendChild(secUp); VIEW.appendChild(secScan); VIEW.appendChild(portWrap);

		function showUplink(u) {
			if (!u || u.error) { clear(uplinkLine).appendChild(el("em", { text: "Not joined to a network." })); return; }
			clear(uplinkLine);
			uplinkLine.appendChild(el("strong", { text: u.ssid || "wired" }));
			uplinkLine.appendChild(document.createTextNode(
				"  ·  " + (u.iface || "") + "  ·  " + (u.subnet || "") +
				"  ·  gw " + (u.gateway || "-") + (u.gateway_mac ? " (" + u.gateway_mac + ")" : "")));
			setNetPill(true, u.ssid);
		}
		function fillTable(data) {
			var list = (data && data.hosts) || [];
			if (data && data.error) { clear(tableWrap).appendChild(alertEl("warn", data.error)); return; }
			if (!list.length) { clear(tableWrap).appendChild(el("div", { class: "placeholder", html:
				"No scan yet. Click <b>Scan network</b>." })); return; }
			var rows = list.map(function (h) {
				var tags = el("span");
				if (h.gateway) tags.appendChild(badge("gateway", "sec-ok"));
				if (h.self) tags.appendChild(badge("this router", "sec-neutral"));
				return [
					el("strong", { text: h.ip }),
					h.mac || "-",
					(h.vendor && h.vendor !== "(Unknown)") ? h.vendor : "-",
					tags,
					btn("Ports", { cls: "small", onclick: function () { scanPorts(h.ip); } })
				];
			});
			clear(tableWrap).appendChild(tableEl(["Address", "MAC", "Vendor", "", "Scan"], rows));
			scanInfo.textContent = (data && data.scanned)
				? list.length + " hosts, scanned " + String(data.scanned).replace("T", " ").replace("Z", " UTC") : "";
		}
		function doDiscover() {
			scanBtn.disabled = true; scanInfo.textContent = "scanning the local segment…";
			call("luci.slate-recon", "discover").then(function (d) {
				fillTable(d);
				return call("luci.slate-recon", "uplink").then(showUplink);
			}).catch(function (e) { clear(tableWrap).appendChild(alertEl("warn", String(e.message || e))); })
				.then(function () { scanBtn.disabled = false; });
		}
		function scanPorts(ip) {
			var body = el("div", {}, el("em", { text: "Scanning " + ip + "…" }));
			clear(portWrap).appendChild(panel("Ports on " + ip)).appendChild(body);
			portWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
			call("luci.slate-recon", "ports", { target: ip }).then(function (res) {
				if (res.error) { clear(body).appendChild(alertEl("warn", res.error)); return; }
				var ports = res.ports || [];
				if (!ports.length) { clear(body).appendChild(el("p", { class: "muted", text: "No open ports in the top 100." })); return; }
				clear(body).appendChild(tableEl(["Port", "Proto", "Service"], ports.map(function (p) {
					return [el("strong", { text: String(p.port) }), p.proto || "-", p.service || "-"];
				})));
			}).catch(function (e) { clear(body).appendChild(alertEl("warn", String(e.message || e))); });
		}

		call("luci.slate-recon", "uplink").then(showUplink).catch(function () { showUplink(null); });
		call("luci.slate-recon", "hosts").then(fillTable).catch(function (e) {
			if (String(e.message || e) === "unauthorized") return onError(e);
			clear(tableWrap).appendChild(alertEl("warn", String(e.message || e)));
		});
	}

	/* ---------- Wi-Fi Survey ---------- */

	function gpsText(g) {
		if (!g || g.installed === false) return "No GPS tools installed. Add a USB GPS and gpsd to tag sightings.";
		if (!g.running) return "gpsd is not running. Plug in a USB GPS (started on boot).";
		var where = g.device ? " on " + g.device : "";
		if (g.fix === "2D" || g.fix === "3D")
			return "GPS fix (" + g.fix + ")" + where + ": " + g.lat.toFixed(6) + ", " + g.lon.toFixed(6) +
				(g.sats_used != null ? " — " + g.sats_used + " of " + (g.sats || 0) + " satellites" : "");
		return "gpsd running" + where + " but no fix yet" + (g.sats != null ? " (" + g.sats + " satellites seen)" : "") + ".";
	}

	function renderSurvey() {
		clear(VIEW);
		VIEW.appendChild(viewHead("Wi-Fi Survey", "a wardriving-style log of the access points heard"));

		var sec = panel();
		var status = el("span", { class: "status" });
		var scanBtn = btn("Scan now", { primary: true, onclick: doScan });
		var clearBtn = btn("Clear log", { cls: "reset", onclick: doClear });
		sec.appendChild(el("div", { class: "toolbar" }, scanBtn, clearBtn, status));
		var tableWrap = el("div");
		tableWrap.appendChild(el("div", { class: "muted", text: "Loading…" }));
		sec.appendChild(tableWrap);

		var secGps = panel("Location");
		secGps.style.marginTop = "14px";
		var gpsLine = el("p", { class: "muted", text: "Loading…" });
		secGps.appendChild(gpsLine);
		secGps.appendChild(btn("Refresh GPS", { onclick: refreshGps }));

		VIEW.appendChild(sec); VIEW.appendChild(secGps);

		function fill(data) {
			if (data && data.error) { clear(tableWrap).appendChild(alertEl("warn", data.error)); return; }
			var nets = (data && data.networks) || [];
			var hasGps = nets.some(function (n) { return n.lat != null; });
			if (!nets.length) { clear(tableWrap).appendChild(el("div", { class: "placeholder", html:
				"No networks logged yet. Click <b>Scan now</b>." })); status.textContent = ""; return; }
			var headers = ["SSID", "BSSID", "Ch", "Security", "Signal", "Seen", "Last"];
			if (hasGps) headers.push("Location");
			var rows = nets.map(function (n) {
				var cells = [
					n.ssid ? el("strong", { text: n.ssid }) : el("em", { class: "muted", text: "(hidden)" }),
					el("code", { text: n.bssid }),
					String(n.channel),
					badge(n.security || "?", secClass(n.security)),
					n.best_signal != null ? n.best_signal + " dBm" : "-",
					String(n.count),
					ago(n.last)
				];
				if (hasGps) cells.push(n.lat != null ? n.lat.toFixed(5) + ", " + n.lon.toFixed(5) : "-");
				return cells;
			});
			clear(tableWrap).appendChild(tableEl(headers, rows));
			status.textContent = (data && data.total != null) ? data.total + " networks logged" : "";
		}
		function doScan() {
			scanBtn.disabled = true; status.textContent = "scanning on a free radio…";
			call("luci.slate-recon", "survey_scan").then(function (res) {
				if (res.error) throw new Error(res.error);
				return Promise.all([
					call("luci.slate-recon", "survey_networks").then(fill),
					call("luci.slate-recon", "survey_gps").then(function (g) { clear(gpsLine).appendChild(document.createTextNode(gpsText(g))); })
				]);
			}).catch(function (e) { status.textContent = ""; clear(tableWrap).appendChild(alertEl("warn", String(e.message || e))); })
				.then(function () { scanBtn.disabled = false; });
		}
		function doClear() {
			call("luci.slate-recon", "survey_clear").then(function () {
				return call("luci.slate-recon", "survey_networks").then(fill);
			}).catch(function (e) { clear(tableWrap).appendChild(alertEl("warn", String(e.message || e))); });
		}
		function refreshGps() {
			call("luci.slate-recon", "survey_gps").then(function (g) {
				clear(gpsLine).appendChild(document.createTextNode(gpsText(g)));
			}).catch(function (e) { clear(gpsLine).appendChild(document.createTextNode(String(e.message || e))); });
		}

		call("luci.slate-recon", "survey_networks").then(fill).catch(function (e) {
			if (String(e.message || e) === "unauthorized") return onError(e);
			clear(tableWrap).appendChild(alertEl("warn", String(e.message || e)));
		});
		refreshGps();
	}

	/* ---------- Threats ---------- */

	var THREAT_NAME = { evil_twin: "Evil twin", impersonation: "Impersonation", extra_bssid: "Extra access point" };

	function renderThreats() {
		clear(VIEW);
		VIEW.appendChild(viewHead("Threats", "passive Wi-Fi threat detection — listen only"));

		var secRogue = panel("Rogue access points");
		secRogue.appendChild(el("p", { class: "descr", text:
			"Checks the access points the Wi-Fi Survey logged for an SSID advertised both open and secured (an evil twin), and for your own network names being impersonated." }));
		var rogueBtn = btn("Check now", { primary: true, onclick: checkRogue });
		secRogue.appendChild(el("div", { class: "toolbar" }, rogueBtn));
		var protLine = el("p", { class: "muted" });
		var rogueBox = el("div", {}, el("div", { class: "muted", text: "Loading…" }));
		secRogue.appendChild(protLine); secRogue.appendChild(rogueBox);

		var secDeauth = panel("Deauth watch");
		secDeauth.style.marginTop = "14px";
		secDeauth.appendChild(el("p", { class: "descr", text:
			"Listens on the 2.4 GHz monitor radio for the deauth/disassoc frames a jamming or handshake-capture attack floods the air with." }));
		var sel = el("select", { class: "sel" },
			el("option", { value: "15", text: "15 seconds" }),
			el("option", { value: "30", text: "30 seconds" }),
			el("option", { value: "60", text: "60 seconds" }));
		var deauthBtn = btn("Watch now", { onclick: function () { watchDeauth(sel.value); } });
		secDeauth.appendChild(el("div", { class: "toolbar" }, sel, deauthBtn));
		var deauthBox = el("div");
		secDeauth.appendChild(deauthBox);

		VIEW.appendChild(secRogue); VIEW.appendChild(secDeauth);

		function showRogue(data) {
			clear(protLine);
			if (data && data.protected && data.protected.length)
				protLine.textContent = "Protecting: " + data.protected.join(", ");
			clear(rogueBox);
			if (data && data.error) { rogueBox.appendChild(alertEl("warn", data.error)); return; }
			var threats = (data && data.threats) || [];
			if (!threats.length) {
				rogueBox.appendChild(alertEl("success",
					"No rogue access points in the " + ((data && data.total_networks) || 0) + " networks logged."));
				return;
			}
			threats.forEach(function (t) {
				var box = el("div", { class: "threat " + sevClass(t.severity) });
				box.appendChild(el("p", {}, badge((t.severity || "?").toUpperCase(), sevClass(t.severity)),
					document.createTextNode(" "), el("strong", { text: THREAT_NAME[t.type] || t.type }),
					document.createTextNode(" — "), el("strong", { text: t.ssid })));
				if (t.detail) box.appendChild(el("p", { class: "descr", text: t.detail }));
				box.appendChild(tableEl(["BSSID", "Security", "Signal", "Channel"], (t.bssids || []).map(function (b) {
					return [el("code", { text: b.bssid }), b.security || "-",
						b.signal != null ? b.signal + " dBm" : "-", "ch " + (b.channel != null ? b.channel : "?")];
				})));
				rogueBox.appendChild(box);
			});
		}
		function checkRogue() {
			rogueBtn.disabled = true;
			call("luci.slate-recon", "threats_rogue").then(showRogue)
				.catch(function (e) {
					if (String(e.message || e) === "unauthorized") return onError(e);
					clear(rogueBox).appendChild(alertEl("warn", String(e.message || e)));
				}).then(function () { rogueBtn.disabled = false; });
		}
		function watchDeauth(secs) {
			deauthBtn.disabled = true;
			clear(deauthBox).appendChild(el("p", {}, el("em", { text: "Listening for " + secs + " seconds…" })));
			call("luci.slate-recon", "threats_deauth", { secs: secs }).then(function (r) {
				clear(deauthBox);
				if (r.error) { deauthBox.appendChild(alertEl("warn", r.error)); return; }
				deauthBox.appendChild(r.alert
					? alertEl("danger", [badge("HIGH", "sev-high"), document.createTextNode(
						" Possible deauth attack: " + r.total + " frames in " + r.window_s + " s on channel " + r.channel + ".")])
					: alertEl("info", r.total + " deauth/disassoc frames in " + r.window_s + " s on channel " + r.channel + " — nothing unusual."));
				deauthBox.appendChild(el("p", { class: "descr", text: r.deauth + " deauthentication, " + r.disassoc + " disassociation." }));
				if ((r.sources || []).length)
					deauthBox.appendChild(tableEl(["Transmitter (SA)", "Frames"], r.sources.map(function (s) {
						return [el("code", { text: s.mac }), String(s.count)];
					})));
			}).catch(function (e) { clear(deauthBox).appendChild(alertEl("warn", String(e.message || e))); })
				.then(function () { deauthBtn.disabled = false; });
		}

		call("luci.slate-recon", "threats_rogue").then(showRogue).catch(function (e) {
			if (String(e.message || e) === "unauthorized") return onError(e);
			clear(rogueBox).appendChild(alertEl("warn", String(e.message || e)));
		});
	}

	/* ---------- Radios & SDR ---------- */

	function renderSdr() {
		clear(VIEW);
		VIEW.appendChild(viewHead("Radios & SDR", "receivers running on this router"));
		var host = location.hostname || "192.168.1.1";

		var jobsPanel = panel("Jobs");
		jobsPanel.appendChild(el("p", { class: "descr", text:
			"Each radio runs one job at a time. Hand a radio to another job and the service switches it over." }));
		var jobsWrap = el("div", {}, el("div", { class: "muted", text: "Loading…" }));
		jobsPanel.appendChild(jobsWrap);
		var raw = el("details", { class: "raw" }, el("summary", { text: "Raw status" }));
		var rawPre = el("pre", { class: "raw-pre" });
		raw.appendChild(rawPre);
		jobsPanel.appendChild(raw);

		var ismPanel = panel("ISM sensors");
		ismPanel.style.marginTop = "14px";
		var ismStatus = el("p", { class: "descr" });
		var ismWrap = el("div", {}, el("div", { class: "muted", text: "Loading…" }));
		ismPanel.appendChild(ismStatus); ismPanel.appendChild(ismWrap);

		var addrPanel = panel("Addresses");
		addrPanel.style.marginTop = "14px";
		var addrWrap = el("div");
		addrPanel.appendChild(addrWrap);

		VIEW.appendChild(jobsPanel); VIEW.appendChild(ismPanel); VIEW.appendChild(addrPanel);

		var jobsMap = {};
		function stateCls(s) { return s === "running" ? "sec-ok" : (s === "stopped" ? "sec-warn" : "sec-neutral"); }

		function fillAddresses() {
			function sb(job) {
				if (!job) return badge("always on", "sec-ok");
				var s = jobsMap[job] && jobsMap[job].state;
				if (s === "running") return badge("on", "sec-ok");
				if (s === "stopped") return badge("stopped", "sec-warn");
				if (s === "off") return badge("off", "sec-neutral");
				return badge("job " + job, "sec-neutral");
			}
			function fmt(s) { return s.replace("%s", host); }
			clear(addrWrap);
			addrWrap.appendChild(el("h4", { class: "sub-h2", text: "Web pages" }));
			addrWrap.appendChild(tableEl(["Page", "Address", "Runs when"], SDR_PAGES.map(function (p) {
				var u = fmt(p[1]);
				return [p[0], el("a", { href: u, target: "_blank", rel: "noopener", text: u }), sb(p[2])];
			})));
			addrWrap.appendChild(el("h4", { class: "sub-h2", text: "Connect from a computer" }));
			addrWrap.appendChild(tableEl(["Client", "Address", "Runs when"], SDR_CLIENTS.map(function (c) {
				return [c[0], el("code", { text: fmt(c[1]) }), sb(c[2])];
			})));
		}

		function fillJobs(status) {
			rawPre.textContent = status || "No answer from /cgi-bin/slate-sdr.";
			var jobs = parseJobs(status);
			jobsMap = {};
			jobs.forEach(function (j) { jobsMap[j.name] = j; });
			if (!jobs.length) {
				clear(jobsWrap).appendChild(el("div", { class: "muted", text:
					"No job status reported (is slate-sdr installed on this device?)." }));
			} else {
				clear(jobsWrap).appendChild(tableEl(["Job", "Radio", "Type", "State", ""], jobs.map(function (j) {
					var action = j.state === "running"
						? el("span", { class: "muted", text: "—" })
						: btn("Use " + j.radio, { cls: "small", onclick: function () { handTo(j.name); } });
					return [el("strong", { text: j.name }), j.radio, j.type, badge(j.state, stateCls(j.state)), action];
				})));
			}
			fillAddresses();
		}

		function handTo(job) {
			call("luci.slate-sdr", "use", { job: job }).then(function () {
				return fetchSdrStatus().then(fillJobs);
			}).catch(function (e) {
				if (String(e.message || e) === "unauthorized") return onError(e);
				clear(jobsWrap).appendChild(alertEl("warn", String(e.message || e)));
			});
		}

		function fillIsm(data) {
			if (data.error) { ismStatus.textContent = String(data.error); clear(ismWrap); return; }
			ismStatus.textContent = data.frequencies
				? "Listening on " + data.frequencies.map(mhz).join(", ") + ", switching every " + data.hop_interval + " s."
				: "";
			var devs = (data.devices || []).slice().sort(function (a, b) { return String(b.last).localeCompare(String(a.last)); });
			if (!devs.length) {
				clear(ismWrap).appendChild(el("div", { class: "placeholder", text: data.enabled
					? "Nothing decoded yet — rtl_433 hops bands, so give it a few minutes."
					: "Nothing decoded yet, and the ISM job is not running." }));
				return;
			}
			clear(ismWrap).appendChild(tableEl(["Device", "ID", "Latest readings", "Band", "Heard", "Last"], devs.map(function (d) {
				var rd = Object.keys(d.readings || {}).map(function (k) { return reading(k, d.readings[k]); }).join(", ") || "-";
				var idch = ((d.id != null) ? String(d.id) : "-") + ((d.channel != null) ? " / ch " + d.channel : "");
				return [el("strong", { text: String(d.model) }), idch, rd, (d.freq != null ? mhz(d.freq) : "-"), String(d.count), agoIsm(d.last)];
			})));
		}

		fetchSdrStatus().then(fillJobs);
		call("luci.slate-sdr", "devices").then(fillIsm).catch(function (e) {
			if (String(e.message || e) === "unauthorized") return onError(e);
			ismStatus.textContent = String(e.message || e);
		});
	}

	/* ---------- Router ---------- */

	function renderRouter() {
		clear(VIEW);
		VIEW.appendChild(viewHead("Router", "the device itself and its network"));

		var sysPanel = panel("System");
		var sysWrap = el("div", {}, el("div", { class: "muted", text: "Loading…" }));
		sysPanel.appendChild(sysWrap);

		var netPanel = panel("Internet");
		netPanel.style.marginTop = "14px";
		var netWrap = el("div", {}, el("div", { class: "muted", text: "Loading…" }));
		netPanel.appendChild(netWrap);

		var cliPanel = panel("Clients");
		cliPanel.style.marginTop = "14px";
		var cliWrap = el("div", {}, el("div", { class: "muted", text: "Loading…" }));
		cliPanel.appendChild(cliWrap);

		var adbPanel = panel("Ad blocking");
		adbPanel.style.marginTop = "14px";
		var adbWrap = el("div", {}, el("div", { class: "muted", text: "Loading…" }));
		adbPanel.appendChild(adbWrap);

		VIEW.appendChild(sysPanel); VIEW.appendChild(netPanel);
		VIEW.appendChild(cliPanel); VIEW.appendChild(adbPanel);

		function kv(pairs) {
			var dl = el("dl", { class: "kv" });
			pairs.forEach(function (p) {
				if (p[1] == null || p[1] === "") return;
				dl.appendChild(el("dt", { text: p[0] }));
				dl.appendChild(el("dd", { text: String(p[1]) }));
			});
			return dl;
		}

		function fillSys(s) {
			var m = s.memory || {}, f = s.flash || {};
			clear(sysWrap).appendChild(kv([
				["Model", s.model],
				["Firmware", s.firmware],
				["Hostname", s.hostname],
				["Uptime", dur(s.uptime)],
				["Load", s.load],
				["RAM", m.total ? (mb(m.available != null ? m.available : m.free) + " MB free of " + mb(m.total) + " MB") : null],
				["Flash", f.total ? (mb(f.free) + " MB free of " + mb(f.total) + " MB") : null]
			]));
			setNetPill(!!s.online);
		}

		function fillNet(u, online) {
			if (!u || u.error) { clear(netWrap).appendChild(el("div", { class: "muted", text: "Not joined to a network." })); return; }
			clear(netWrap).appendChild(kv([
				["Network", u.ssid || "wired"],
				["Interface", u.iface],
				["Subnet", u.subnet],
				["Gateway", u.gateway ? (u.gateway + (u.gateway_mac ? " (" + u.gateway_mac + ")" : "")) : null],
				["Internet", online ? "reachable" : "no default route"]
			]));
		}

		function fillClients(data) {
			var list = (data && data.clients) || [];
			if (data && data.error) { clear(cliWrap).appendChild(alertEl("warn", data.error)); return; }
			if (!list.length) { clear(cliWrap).appendChild(el("div", { class: "placeholder", text: "No DHCP leases yet." })); return; }
			clear(cliWrap).appendChild(tableEl(["Host", "IP", "MAC"], list.map(function (c) {
				return [
					(c.host && c.host !== "-") ? el("strong", { text: c.host }) : el("em", { class: "muted", text: "(unknown)" }),
					el("code", { text: c.ip }), el("code", { text: c.mac })
				];
			})));
		}

		function fillAdb(a) {
			clear(adbWrap);
			if (a.error) { adbWrap.appendChild(alertEl("warn", a.error)); return; }
			if (!a.installed) { adbWrap.appendChild(el("div", { class: "muted", text: "Adblock is not installed in this image." })); return; }
			var on = !!a.enabled;
			adbWrap.appendChild(el("div", { class: "toolbar" },
				badge(on ? "on" : "off", on ? "sec-ok" : "sec-neutral"),
				el("span", { class: "status", text: a.domains ? a.domains.toLocaleString() + " domains blocked" : (on ? "enabled" : "disabled") }),
				btn(on ? "Disable" : "Enable", { cls: on ? "reset" : "", primary: !on, onclick: function () { toggleAdb(!on); } })));
		}
		function toggleAdb(to) {
			clear(adbWrap).appendChild(el("div", { class: "muted", text: to ? "Enabling…" : "Disabling…" }));
			call("luci.slate-router", "adblock", { enabled: to }).then(fillAdb).catch(function (e) {
				clear(adbWrap).appendChild(alertEl("warn", String(e.message || e)));
			});
		}

		call("luci.slate-router", "status").then(function (s) {
			fillSys(s);
			return call("luci.slate-recon", "uplink").then(function (u) { fillNet(u, s.online); })
				.catch(function () { fillNet(null, s.online); });
		}).catch(function (e) {
			if (String(e.message || e) === "unauthorized") return onError(e);
			clear(sysWrap).appendChild(alertEl("warn", String(e.message || e)));
			clear(netWrap);
		});
		call("luci.slate-router", "clients").then(fillClients).catch(function (e) {
			clear(cliWrap).appendChild(alertEl("warn", String(e.message || e)));
		});
		call("luci.slate-router", "adblock").then(fillAdb).catch(function (e) {
			clear(adbWrap).appendChild(alertEl("warn", String(e.message || e)));
		});
	}

	/* ---------- fallback for an unknown route ---------- */

	function renderPlaceholder(name) {
		clear(VIEW);
		VIEW.appendChild(viewHead(String(name)));
		VIEW.appendChild(el("div", { class: "placeholder", text: "Unknown section." }));
	}

	/* ---------- tabs / router ---------- */

	var TABS = [
		["dashboard", "Dashboard"],
		["sdr", "Radios & SDR"],
		["hosts", "Hosts"],
		["survey", "Wi-Fi Survey"],
		["threats", "Threats"],
		["router", "Router"]
	];
	var current = "dashboard";

	function renderTabs() {
		var nav = clear($("tabs"));
		TABS.forEach(function (t) {
			nav.appendChild(el("button", {
				class: "tab" + (t[0] === current ? " active" : ""),
				type: "button", text: t[1],
				onclick: function () { setTab(t[0]); }
			}));
		});
	}

	function setTab(id) {
		current = id;
		renderTabs();
		try { location.hash = id; } catch (e) {}
		if (id === "dashboard") return loadDashboard();
		if (id === "sdr") return renderSdr();
		if (id === "hosts") return renderHosts();
		if (id === "survey") return renderSurvey();
		if (id === "threats") return renderThreats();
		if (id === "router") return renderRouter();
		renderPlaceholder(id);
	}

	/* ---------- chrome ---------- */

	function setNetPill(online, ssid) {
		var p = $("net-pill");
		if (online == null) { p.className = "pill"; p.textContent = "—"; return; }
		p.className = "pill " + (online ? "ok" : "bad");
		p.textContent = (online ? "online" : "offline") + (ssid ? " · " + ssid : "");
	}

	function onError(e) {
		if (String(e.message || e) === "unauthorized" && !DEMO) { showLogin(); return; }
		clear(VIEW).appendChild(el("div", { class: "placeholder" },
			el("b", { text: "Couldn't reach the Slate" }),
			el("div", { class: "muted", text: String(e.message || e) })));
	}

	/* ---------- login ---------- */

	function showLogin() { $("login").hidden = false; var p = $("p"); if (p) p.focus(); }
	function hideLogin() { $("login").hidden = true; }

	$("login-form").addEventListener("submit", function (ev) {
		ev.preventDefault();
		var err = $("login-err");
		err.hidden = true;
		login($("u").value, $("p").value).then(function () {
			hideLogin();
			setTab(current);
		}).catch(function () {
			err.textContent = "Sign-in failed. Check the password.";
			err.hidden = false;
		});
	});

	/* ---------- boot ---------- */

	function startTab() {
		var h = (location.hash || "").replace("#", "");
		return TABS.some(function (t) { return t[0] === h; }) ? h : "dashboard";
	}

	function boot() {
		current = startTab();
		renderTabs();
		if (DEMO) { $("demo-badge").hidden = false; setTab(current); return; }
		try { SID = sessionStorage.getItem("slate_sid"); } catch (e) { SID = null; }
		if (SID) { setTab(current); } else { showLogin(); }
	}

	window.addEventListener("hashchange", function () {
		var h = startTab();
		if (h !== current) setTab(h);
	});

	boot();
})();
