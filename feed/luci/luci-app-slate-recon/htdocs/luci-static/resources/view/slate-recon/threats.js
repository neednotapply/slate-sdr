'use strict';
'require view';
'require dom';
'require rpc';
'require ui';

// Threats: passive Wi-Fi threat detection. "Rogue access points" checks the
// networks the Wi-Fi survey has logged for evil-twin patterns and for your
// own SSIDs being impersonated. "Deauth watch" listens on the monitor radio
// for the management frames a deauthentication attack sends. Both only
// listen — nothing here transmits or attacks a network. All via the
// luci.slate-recon rpcd plugin.

var callRogue = rpc.declare({ object: 'luci.slate-recon', method: 'threats_rogue' });
var callDeauth = rpc.declare({ object: 'luci.slate-recon', method: 'threats_deauth', params: [ 'secs' ] });

function catchError(err) {
	return { error: err.message };
}

function accessHint(err) {
	return /-32002|Access denied/.test(err || '')
		? _('LuCI may not do this yet: log out and back in once so your login picks up the Network Recon permission.')
		: (err || _('unknown error'));
}

function sevBadge(sev) {
	var color = (sev == 'high') ? '#c0392b' : (sev == 'medium') ? '#e67e22' : '#777';
	return E('span', { 'class': 'label', 'style': 'background:' + color + ';color:#fff' }, (sev || '?').toUpperCase());
}

var typeName = {
	evil_twin: _('Evil twin'),
	impersonation: _('Impersonation'),
	extra_bssid: _('Extra access point')
};

function threatItems(data) {
	if (data && data.error)
		return [ E('p', {}, accessHint(data.error)) ];

	var threats = (data && data.threats) || [];
	if (!threats.length)
		return [ E('p', { 'class': 'alert-message success', 'style': 'padding:.5em 1em' },
			_('No rogue access points in the %d networks logged. Run a Wi-Fi survey to gather more.').format((data && data.total_networks) || 0)) ];

	return threats.map(function(t) {
		var rows = (t.bssids || []).map(function(b) {
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, [ E('code', {}, b.bssid) ]),
				E('td', { 'class': 'td' }, [ b.security || '-' ]),
				E('td', { 'class': 'td' }, [ (b.signal != null ? b.signal + ' dBm' : '-') ]),
				E('td', { 'class': 'td' }, [ 'ch ' + (b.channel != null ? b.channel : '?') ])
			]);
		});
		return E('div', { 'class': 'cbi-section', 'style': 'border-left:4px solid ' + ((t.severity == 'high') ? '#c0392b' : '#e67e22') + '; padding-left:1em' }, [
			E('p', {}, [ sevBadge(t.severity), ' ', E('strong', {}, typeName[t.type] || t.type), ' — ', E('strong', {}, t.ssid) ]),
			E('p', {}, t.detail),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('BSSID')),
					E('th', { 'class': 'th' }, _('Security')),
					E('th', { 'class': 'th' }, _('Signal')),
					E('th', { 'class': 'th' }, _('Channel'))
				])
			].concat(rows))
		]);
	});
}

return view.extend({
	load: function() {
		return callRogue().catch(catchError);
	},

	render: function(rogue) {
		var self = this;
		var rogueBox = E('div', {}, threatItems(rogue));
		var protLine = E('p', { 'style': 'color:#888' },
			(rogue && rogue.protected && rogue.protected.length)
				? _('Protecting your networks: %s').format(rogue.protected.join(', '))
				: '');
		var deauthBox = E('div', { 'class': 'cbi-section' });
		var secsSel = E('select', { 'class': 'cbi-input-select', 'style': 'width:auto' }, [
			E('option', { 'value': '15' }, _('15 seconds')),
			E('option', { 'value': '30' }, _('30 seconds')),
			E('option', { 'value': '60' }, _('60 seconds'))
		]);

		this.rogueBox = rogueBox;
		this.protLine = protLine;
		this.deauthBox = deauthBox;
		this.secsSel = secsSel;

		return E('div', {}, [
			E('h2', {}, _('Threats')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Passive Wi-Fi threat detection on the 2.4 GHz monitor radio and the survey data. It only listens — nothing here transmits or attacks a network.')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Rogue access points')),
				E('p', {}, _('Checks the access points the Wi-Fi Survey has logged for an SSID advertised both open and secured (an evil twin), and for your own network names being impersonated.')),
				E('p', {}, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action important',
						'click': ui.createHandlerFn(this, 'checkRogue')
					}, _('Check now'))
				]),
				protLine,
				rogueBox
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Deauth watch')),
				E('p', {}, _('Listens on the monitor radio for the deauthentication and disassociation frames a Wi-Fi jamming or handshake-capture attack floods the air with. It watches the monitor radio\'s current 2.4 GHz channel.')),
				E('p', {}, [
					secsSel, ' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, 'watchDeauth')
					}, _('Watch now'))
				]),
				deauthBox
			])
		]);
	},

	checkRogue: function() {
		var self = this;
		return callRogue().catch(catchError).then(function(data) {
			dom.content(self.rogueBox, threatItems(data));
			dom.content(self.protLine, (data.protected && data.protected.length)
				? _('Protecting your networks: %s').format(data.protected.join(', ')) : '');
		});
	},

	watchDeauth: function() {
		var self = this;
		var secs = self.secsSel.value;
		dom.content(self.deauthBox, [ E('p', {}, [ E('em', {}, _('Listening for %s seconds…').format(secs)) ]) ]);
		return callDeauth(secs).catch(catchError).then(function(r) {
			if (r.error) {
				dom.content(self.deauthBox, [ E('p', {}, accessHint(r.error)) ]);
				return;
			}
			var head = r.alert
				? E('p', { 'class': 'alert-message danger', 'style': 'padding:.5em 1em' }, [
					sevBadge('high'), ' ',
					_('Possible deauth attack: %d frames in %d s on channel %s.').format(r.total, r.window_s, r.channel) ])
				: E('p', { 'class': 'alert-message', 'style': 'padding:.5em 1em' },
					_('%d deauth/disassoc frames in %d s on channel %s — nothing unusual.').format(r.total, r.window_s, r.channel));

			var body = [ head, E('p', {}, _('%d deauthentication, %d disassociation.').format(r.deauth, r.disassoc)) ];
			if ((r.sources || []).length)
				body.push(E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, _('Transmitter (SA)')),
						E('th', { 'class': 'th' }, _('Frames'))
					])
				].concat(r.sources.map(function(s) {
					return E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, [ E('code', {}, s.mac) ]),
						E('td', { 'class': 'td' }, [ String(s.count) ])
					]);
				}))));
			dom.content(self.deauthBox, body);
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
