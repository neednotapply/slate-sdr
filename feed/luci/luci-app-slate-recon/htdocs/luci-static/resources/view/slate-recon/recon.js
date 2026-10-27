'use strict';
'require view';
'require dom';
'require rpc';
'require ui';

// Network Recon: look at the network this router has joined. The joined
// network is whatever its default route points at — the Wi-Fi or wired
// uplink. "Scan network" lists the hosts on it (arp-scan, layer 2); a host's
// "Ports" button runs a short nmap of that one host. Both go through the
// luci.slate-recon rpcd plugin to the slate-recon tool.

var callUplink = rpc.declare({ object: 'luci.slate-recon', method: 'uplink' });
var callHosts = rpc.declare({ object: 'luci.slate-recon', method: 'hosts' });
var callDiscover = rpc.declare({ object: 'luci.slate-recon', method: 'discover' });
var callPorts = rpc.declare({ object: 'luci.slate-recon', method: 'ports', params: [ 'target' ] });

function catchError(err) {
	return { error: err.message };
}

function accessHint(err) {
	return /-32002|Access denied/.test(err || '')
		? _('LuCI may not do this yet: log out and back in once so your login picks up the Network Recon permission.')
		: (err || _('unknown error'));
}

function tagsFor(h) {
	var t = [];
	if (h.gateway) t.push(E('span', { 'class': 'label', 'style': 'background:#5b9bd5;color:#fff' }, _('gateway')));
	if (h.self) t.push(E('span', { 'class': 'label' }, _('this router')));
	return t;
}

return view.extend({
	load: function() {
		return Promise.all([
			callUplink().catch(catchError),
			callHosts().catch(catchError)
		]);
	},

	render: function(res) {
		var uplink = res[0], hosts = res[1];

		var self = this;
		var uplinkLine = E('div', { 'class': 'cbi-value-field' });
		var scanInfo = E('span', { 'style': 'margin-left:1em; color:#888' });
		var table = E('table', { 'class': 'table' });
		var portBox = E('div', { 'class': 'cbi-section', 'style': 'display:none' });

		function showUplink(u) {
			if (!u || u.error) {
				dom.content(uplinkLine, [ E('em', {}, u && u.error ? accessHint(u.error) : _('Not joined to a network.')) ]);
				return;
			}
			dom.content(uplinkLine, [
				u.ssid ? E('strong', {}, u.ssid) : E('strong', {}, _('wired')),
				' — ', _('on %s').format(u.iface),
				', ', _('subnet %s').format(u.subnet),
				', ', _('gateway %s').format(u.gateway),
				u.gateway_mac ? ' (' + u.gateway_mac + ')' : '',
				u.self ? ', ' + _('this router is %s').format(u.self) : ''
			]);
		}

		function hostRows(data) {
			var list = (data && data.hosts) || [];

			if (data && data.error)
				return [ E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': 5 }, accessHint(data.error))) ];
			if (!list.length)
				return [ E('tr', { 'class': 'tr placeholder' }, E('td', { 'class': 'td', 'colspan': 5 }, _('No scan yet. Click "Scan network".'))) ];

			return list.map(function(h) {
				return E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, [ E('strong', {}, h.ip) ]),
					E('td', { 'class': 'td' }, [ h.mac || '-' ]),
					E('td', { 'class': 'td' }, [ (h.vendor && h.vendor != '(Unknown)') ? h.vendor : '-' ]),
					E('td', { 'class': 'td' }, tagsFor(h)),
					E('td', { 'class': 'td' }, [
						E('button', {
							'class': 'btn cbi-button',
							'click': ui.createHandlerFn(self, 'scanPorts', h.ip, portBox)
						}, _('Ports'))
					])
				]);
			});
		}

		function fillTable(data) {
			dom.content(table, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('Address')),
					E('th', { 'class': 'th' }, _('MAC')),
					E('th', { 'class': 'th' }, _('Vendor')),
					E('th', { 'class': 'th' }, ''),
					E('th', { 'class': 'th', 'style': 'width:6em' }, _('Scan'))
				])
			].concat(hostRows(data)));
			scanInfo.textContent = (data && data.scanned)
				? _('%d hosts, scanned %s').format((data.hosts || []).length, data.scanned.replace('T', ' ').replace('Z', ' UTC'))
				: '';
		}

		showUplink(uplink);
		fillTable(hosts);

		this.fillTable = fillTable;
		this.showUplink = showUplink;
		this.portBox = portBox;

		return E('div', {}, [
			E('h2', {}, _('Network Recon')),
			E('div', { 'class': 'cbi-map-descr' },
				_('What is on the network this router has joined. Host discovery is passive (it asks who answers on the local segment); a port scan runs only against the one host whose Ports button you click. Results are saved to the microSD card under recon/.')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Joined network')),
				uplinkLine
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('p', {}, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action important',
						'click': ui.createHandlerFn(this, 'runDiscover')
					}, _('Scan network')),
					scanInfo
				]),
				table
			]),

			portBox,

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Capture')),
				E('p', {}, [
					_('To record traffic, run from a computer: '),
					E('code', {}, 'ssh pirate-radio tcpdump -i br-lan -w /mnt/sdcard/recon/capture.pcap'),
					_(' , or stream it live into Wireshark. Open the files on the '),
					E('a', { 'href': 'http://' + window.location.hostname + ':8081/' }, _('recorded data')),
					_(' page.')
				])
			])
		]);
	},

	runDiscover: function() {
		var self = this;
		return callDiscover().catch(catchError).then(function(data) {
			self.fillTable(data);
			return callUplink().catch(catchError).then(function(u) { self.showUplink(u); });
		});
	},

	scanPorts: function(ip, box) {
		var body = E('div', {}, [ E('em', {}, _('Scanning %s…').format(ip)) ]);
		dom.content(box, [ E('h3', {}, _('Ports on %s').format(ip)), body ]);
		box.style.display = '';
		box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

		return callPorts(ip).catch(catchError).then(function(res) {
			if (res.error) {
				dom.content(body, [ E('em', {}, accessHint(res.error)) ]);
				return;
			}
			var ports = res.ports || [];
			if (!ports.length) {
				dom.content(body, [ E('p', {}, _('No open ports found in the top 100.')) ]);
				return;
			}
			dom.content(body, [
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th', 'style': 'width:6em' }, _('Port')),
						E('th', { 'class': 'th', 'style': 'width:6em' }, _('Proto')),
						E('th', { 'class': 'th' }, _('Service'))
					])
				].concat(ports.map(function(p) {
					return E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, [ E('strong', {}, String(p.port)) ]),
						E('td', { 'class': 'td' }, [ p.proto || '-' ]),
						E('td', { 'class': 'td' }, [ p.service || '-' ])
					]);
				})))
			]);
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
