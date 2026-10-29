'use strict';
'require view';
'require dom';
'require rpc';
'require ui';

// Network Recon dashboard: one glance at where the Slate is and what it sees
// — the joined network, hosts and access points logged, GPS, threats, the
// radios and the SDR jobs. One rpcd call (slate-dashboard) gathers it all.

var callDashboard = rpc.declare({ object: 'luci.slate-recon', method: 'dashboard' });

function catchError(err) {
	return { error: err.message };
}

function tile(value, label, opts) {
	opts = opts || {};
	var inner = E('div', { 'style': 'border:1px solid rgba(128,128,128,.3); border-radius:6px; padding:.7em 1em; height:100%' }, [
		E('div', { 'style': 'font-size:1.6em; font-weight:bold; color:' + (opts.color || 'inherit') }, String(value)),
		E('div', { 'style': 'color:#888; font-size:.85em; margin-top:.2em' }, label)
	]);
	return E('div', { 'style': 'flex:1 1 7.5em; min-width:7em; margin:.3em' },
		opts.href ? [ E('a', { 'href': opts.href, 'style': 'text-decoration:none; color:inherit; display:block' }, inner) ] : [ inner ]);
}

function url(path) {
	return L.url(path);
}

function render(d) {
	if (d.error)
		return [ E('p', {}, _('Could not load the dashboard: %s').format(d.error)) ];

	var up = d.uplink || {}, gps = d.gps || {}, th = d.threats || {};
	var tiles = [
		tile(up.online ? _('Online') : _('Offline'),
			up.ssid ? _('Internet · %s').format(up.ssid) : _('Internet'),
			{ color: up.online ? '#27ae60' : '#c0392b' }),
		tile((d.hosts && d.hosts.count != null) ? d.hosts.count : '–', _('Hosts on this network'),
			{ href: url('admin/services/slate-recon/hosts') }),
		tile((d.survey && d.survey.count != null) ? d.survey.count : '–', _('Wi-Fi networks seen'),
			{ href: url('admin/services/slate-recon/survey') }),
		tile(th.count || 0, (th.count > 0) ? _('Threats — check now') : _('Threats'),
			{ href: url('admin/services/slate-recon/threats'), color: (th.count > 0) ? '#c0392b' : '#27ae60' }),
		tile(gps.installed ? (gps.running ? _('On') : _('Off')) : '–', _('GPS'),
			{ href: url('admin/services/slate-recon/survey') })
	];
	if (d.sdr && d.sdr.present)
		tiles.push(tile(d.sdr.running, _('SDR jobs running'), { href: url('admin/services/slate-sdr') }));

	var radioRows = (d.radios || []).map(function(r) {
		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, [ E('code', {}, r.iface) ]),
			E('td', { 'class': 'td' }, [ r.mode || '-' ]),
			E('td', { 'class': 'td' }, [ r.ssid ? r.ssid : E('em', {}, '—') ]),
			E('td', { 'class': 'td' }, [ r.channel ? ('ch ' + r.channel) : '-' ])
		]);
	});

	return [
		E('div', { 'style': 'display:flex; flex-wrap:wrap; margin:-.3em' }, tiles),

		E('div', { 'class': 'cbi-section', 'style': 'margin-top:1em' }, [
			E('h3', {}, _('Joined network')),
			up.ssid || up.iface
				? E('p', {}, [
					up.ssid ? E('strong', {}, up.ssid) : E('em', {}, _('not connected')),
					up.iface ? ' — ' + _('on %s').format(up.iface) : '',
					up.subnet ? ', ' + up.subnet : '',
					up.gateway ? ', ' + _('gateway %s').format(up.gateway) : ''
				])
				: E('p', {}, [ E('em', {}, _('No uplink.')) ])
		]),

		E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Radios')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('Interface')),
					E('th', { 'class': 'th' }, _('Mode')),
					E('th', { 'class': 'th' }, _('Network')),
					E('th', { 'class': 'th' }, _('Channel'))
				])
			].concat(radioRows.length ? radioRows : [ E('tr', { 'class': 'tr placeholder' }, E('td', { 'class': 'td', 'colspan': 4 }, _('no radios'))) ]))
		])
	];
}

return view.extend({
	load: function() {
		return callDashboard().catch(catchError);
	},

	render: function(d) {
		var body = E('div', {}, render(d));
		this.body = body;

		return E('div', {}, [
			E('h2', {}, _('Recon Dashboard')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Where the Slate is and what it sees, at a glance. Each tile links to its tab.')),
			E('p', {}, [
				E('button', {
					'class': 'btn cbi-button',
					'click': ui.createHandlerFn(this, 'refresh')
				}, _('Refresh'))
			]),
			body
		]);
	},

	refresh: function() {
		var self = this;
		return callDashboard().catch(catchError).then(function(d) {
			dom.content(self.body, render(d));
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
