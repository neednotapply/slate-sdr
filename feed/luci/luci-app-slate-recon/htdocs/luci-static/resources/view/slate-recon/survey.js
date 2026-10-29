'use strict';
'require view';
'require dom';
'require rpc';
'require ui';

// Wi-Fi Survey: a wardriving-style log of the access points the Slate hears.
// "Scan now" runs an ordinary Wi-Fi scan on a free radio (the USB adapter by
// default, so the uplink and the Pirate Radio AP are left alone), and merges
// what it finds into a database on the card: first/last seen, times seen,
// strongest signal, channel, security, and a GPS position when a gpsd runs.
// All through the luci.slate-recon rpcd plugin.

var callScan = rpc.declare({ object: 'luci.slate-recon', method: 'survey_scan' });
var callNetworks = rpc.declare({ object: 'luci.slate-recon', method: 'survey_networks' });
var callClear = rpc.declare({ object: 'luci.slate-recon', method: 'survey_clear' });
var callGps = rpc.declare({ object: 'luci.slate-recon', method: 'survey_gps' });

function gpsText(g) {
	if (!g || g.installed === false)
		return _('No GPS tools installed. Add a USB GPS and gpsd to tag sightings with a position for wardriving.');
	if (!g.running)
		return _('gpsd is not running. Plug in a USB GPS (it is started on boot), or enable it under Services if it stays off.');
	var where = g.device ? _(' on %s').format(g.device) : '';
	if (g.fix == '2D' || g.fix == '3D')
		return _('GPS fix (%s)%s: %s, %s%s. Each sighting is tagged with the position.').format(
			g.fix, where, g.lat.toFixed(6), g.lon.toFixed(6),
			(g.sats_used != null) ? _(' — %d of %d satellites').format(g.sats_used, g.sats || 0) : '');
	return _('gpsd is running%s but has no fix yet%s. Give it a clear view of the sky; positions appear once it locks on.').format(
		where, (g.sats != null) ? _(' (%d satellites seen)').format(g.sats) : '');
}

function catchError(err) {
	return { error: err.message };
}

function accessHint(err) {
	return /-32002|Access denied/.test(err || '')
		? _('LuCI may not do this yet: log out and back in once so your login picks up the Network Recon permission.')
		: (err || _('unknown error'));
}

function secBadge(sec) {
	var color = '#777';
	if (sec == 'Open') color = '#c0392b';
	else if (sec == 'WEP') color = '#e67e22';
	else if (sec == 'WPA') color = '#e67e22';
	else if (sec == 'WPA3') color = '#27ae60';
	return E('span', { 'class': 'label', 'style': 'background:' + color + ';color:#fff' }, sec || '?');
}

function ago(time, now) {
	var t = Date.parse(time), s = Math.max(0, Math.round((now - t) / 1000));
	if (isNaN(t)) return time || '-';
	if (s < 90) return _('%d s ago').format(s);
	if (s < 5400) return _('%d min ago').format(Math.round(s / 60));
	if (s < 129600) return _('%d h ago').format(Math.round(s / 3600));
	return _('%d days ago').format(Math.round(s / 86400));
}

return view.extend({
	load: function() {
		return Promise.all([
			callNetworks().catch(catchError),
			callGps().catch(catchError)
		]);
	},

	render: function(res) {
		var data = res[0], gps = res[1];
		var self = this;
		var status = E('span', { 'style': 'margin-left:1em; color:#888' });
		var table = E('table', { 'class': 'table' });
		var gpsLine = E('p', {}, gpsText(gps));

		function fill(data) {
			var nets = (data && data.networks) || [];
			var now = Date.now();
			var gps = nets.some(function(n) { return n.lat != null; });

			var titles = [ _('SSID'), _('BSSID'), _('Ch'), _('Security'), _('Signal'), _('Seen'), _('Last') ];
			if (gps) titles.push(_('Location'));

			var rows = [ E('tr', { 'class': 'tr table-titles' }, titles.map(function(t) {
				return E('th', { 'class': 'th' }, t);
			})) ];

			if (data && data.error)
				rows.push(E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': titles.length }, accessHint(data.error))));
			else if (!nets.length)
				rows.push(E('tr', { 'class': 'tr placeholder' }, E('td', { 'class': 'td', 'colspan': titles.length }, _('No networks logged yet. Click "Scan now".'))));
			else
				nets.forEach(function(n) {
					var cells = [
						E('td', { 'class': 'td' }, [ n.ssid ? E('strong', {}, n.ssid) : E('em', {}, _('(hidden)')) ]),
						E('td', { 'class': 'td' }, [ E('code', {}, n.bssid) ]),
						E('td', { 'class': 'td' }, [ String(n.channel) ]),
						E('td', { 'class': 'td' }, [ secBadge(n.security) ]),
						E('td', { 'class': 'td' }, [ (n.best_signal != null ? n.best_signal + ' dBm' : '-') ]),
						E('td', { 'class': 'td' }, [ String(n.count) ]),
						E('td', { 'class': 'td' }, [ ago(n.last, now) ])
					];
					if (gps)
						cells.push(E('td', { 'class': 'td' }, [ n.lat != null ? (n.lat.toFixed(5) + ', ' + n.lon.toFixed(5)) : '-' ]));
					rows.push(E('tr', { 'class': 'tr' }, cells));
				});

			dom.content(table, rows);
			status.textContent = (data && data.total != null) ? _('%d networks logged').format(data.total) : '';
		}

		fill(data);
		this.fill = fill;
		this.gpsLine = gpsLine;

		return E('div', {}, [
			E('h2', {}, _('Wi-Fi Survey')),
			E('div', { 'class': 'cbi-map-descr' },
				_('A wardriving-style log of the access points this device hears. A scan is an ordinary Wi-Fi scan on a free radio (the USB adapter by default, so the uplink and the Pirate Radio network are left running). Each access point is kept with when it was first and last seen, how many times, its strongest signal, channel and security. Saved to the microSD card under survey/.')),

			E('div', { 'class': 'cbi-section' }, [
				E('p', {}, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action important',
						'click': ui.createHandlerFn(this, 'doScan')
					}, _('Scan now')),
					' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': ui.createHandlerFn(this, 'doClear')
					}, _('Clear log')),
					status
				]),
				table
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Location')),
				gpsLine,
				E('p', {}, [
					E('button', {
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(this, 'refreshGps')
					}, _('Refresh GPS'))
				])
			])
		]);
	},

	doScan: function() {
		var self = this;
		return callScan().catch(catchError).then(function(res) {
			if (res.error) {
				ui.addNotification(null, E('p', {}, accessHint(res.error)), 'warning');
				return;
			}
			var msg = res.found != null
				? _('Scan on %s: %d found, %d logged in all%s.').format(
					res.phy || '?', res.found, res.total,
					res.gps ? _(', with GPS') : (res.saved ? '' : _(' (not saved: no card)')))
				: _('Scan done.');
			ui.addNotification(null, E('p', {}, msg), 'info');
			return Promise.all([
				callNetworks().catch(catchError).then(function(data) { self.fill(data); }),
				callGps().catch(catchError).then(function(g) { dom.content(self.gpsLine, gpsText(g)); })
			]);
		});
	},

	refreshGps: function() {
		var self = this;
		return callGps().catch(catchError).then(function(g) {
			dom.content(self.gpsLine, gpsText(g));
		});
	},

	doClear: function() {
		var self = this;
		return callClear().catch(catchError).then(function() {
			return callNetworks().catch(catchError).then(function(data) { self.fill(data); });
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
