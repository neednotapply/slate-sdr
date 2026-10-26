'use strict';
'require view';
'require dom';
'require poll';
'require rpc';

// ISM sensors: every device rtl_433 has decoded, newest first, with its
// latest readings. Opening the tab hands the RTL-SDR to the ism job, as the
// embedded tabs do; the list comes from the job's logs on the card through
// the luci.slate-sdr rpcd plugin.

var callUse = rpc.declare({
	object: 'luci.slate-sdr',
	method: 'use',
	params: [ 'job' ]
});

var callDevices = rpc.declare({
	object: 'luci.slate-sdr',
	method: 'devices'
});

// rtl_433 key suffix -> unit shown after the value.
var units = [
	[ /_C$/, '°C' ], [ /_F$/, '°F' ], [ /_kPa$/, 'kPa' ], [ /_hPa$/, 'hPa' ],
	[ /_PSI$/i, 'PSI' ], [ /_bar$/, 'bar' ], [ /_km_h$/, 'km/h' ], [ /_m_s$/, 'm/s' ],
	[ /_mi_h$/, 'mph' ], [ /_mm$/, 'mm' ], [ /_in$/, 'in' ], [ /_deg$/, '°' ],
	[ /_lux$/, 'lux' ], [ /_V$/, 'V' ], [ /_mV$/, 'mV' ], [ /^humidity$|_humidity$|^moisture$/, '%' ]
];

function catchError(err) {
	return { error: err.message };
}

function accessHint(err) {
	return /-32002|Access denied/.test(err)
		? _('LuCI may not do this yet: log out and back in once so your login picks up the Slate SDR permission.')
		: err;
}

function reading(key, value) {
	if (key == 'battery_ok')
		return value ? _('battery OK') : _('battery low');

	for (var i = 0; i < units.length; i++)
		if (units[i][0].test(key))
			return '%s %s %s'.format(key.replace(units[i][0], '').replace(/_/g, ' ') || key,
				(typeof(value) == 'number') ? +value.toFixed(1) : value, units[i][1]);

	return '%s %s'.format(key.replace(/_/g, ' '), value);
}

function ago(time, now) {
	var t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(time || '') ? time : time + 'Z') / 1000;
	var s = Math.max(0, Math.round(now - t));

	if (isNaN(t))
		return time || '-';
	if (s < 90)
		return _('%d s ago').format(s);
	if (s < 5400)
		return _('%d min ago').format(Math.round(s / 60));
	if (s < 129600)
		return _('%d h ago').format(Math.round(s / 3600));

	return _('%d days ago').format(Math.round(s / 86400));
}

function mhz(f) {
	return '%s MHz'.format(String(f).replace(/M$/i, ''));
}

function deviceRows(data) {
	var devices = (data.devices || []).slice().sort(function(a, b) {
		return String(b.last).localeCompare(String(a.last));
	});

	if (!devices.length)
		return [ E('tr', { 'class': 'tr placeholder' }, [
			E('td', { 'class': 'td', 'colspan': 6 }, [
				data.enabled
					? _('Nothing decoded yet. rtl_433 spends %d s on each band in turn, and most sensors send every 30 to 90 seconds, so give it a few minutes. Remotes and key fobs only show up when pressed.').format(data.hop_interval)
					: _('Nothing decoded yet, and the ISM job is not running.')
			])
		]) ];

	return devices.map(function(d) {
		var readings = Object.keys(d.readings || {}).map(function(k) {
			return reading(k, d.readings[k]);
		});

		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, [ E('strong', {}, [ String(d.model) ]) ]),
			E('td', { 'class': 'td' }, [
				(d.id != null) ? String(d.id) : '-',
				(d.channel != null) ? ' / ' + _('ch %s').format(d.channel) : ''
			]),
			E('td', { 'class': 'td' }, [ readings.join(', ') || '-' ]),
			E('td', { 'class': 'td' }, [ (d.freq != null) ? mhz(d.freq) : '-' ]),
			E('td', { 'class': 'td' }, [ String(d.count) ]),
			E('td', { 'class': 'td' }, [ ago(d.last, data.now) ])
		]);
	});
}

return view.extend({
	load: function() {
		return callUse('ism').catch(catchError).then(function(use) {
			return callDevices().catch(catchError).then(function(data) {
				return [ use, data ];
			});
		});
	},

	render: function(res) {
		var use = res[0], data = res[1];
		var status = E('p', {});
		var table = E('table', { 'class': 'table' });
		var stopped = (use.stopped || []).join(', ');
		var url = 'http://%s:8433/'.format(window.location.hostname);

		var update = function(data) {
			if (data.error) {
				status.textContent = accessHint(data.error);
				return;
			}

			var listening = _('Listening on %s, switching every %d s.').format(
				data.frequencies.map(mhz).join(', '), data.hop_interval);

			if (use.error)
				status.textContent = accessHint(use.error) + ' ' + listening;
			else if (use.switched && stopped)
				status.textContent = _('Switched the RTL-SDR from %s to ISM sensors.').format(stopped) + ' ' + listening;
			else
				status.textContent = listening;

			dom.content(table, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('Device')),
					E('th', { 'class': 'th' }, _('ID')),
					E('th', { 'class': 'th' }, _('Latest readings')),
					E('th', { 'class': 'th' }, _('Band')),
					E('th', { 'class': 'th' }, _('Times heard')),
					E('th', { 'class': 'th' }, _('Last heard'))
				])
			].concat(deviceRows(data)));
		};

		update(data);
		poll.add(function() {
			return callDevices().catch(catchError).then(update);
		}, 10);

		return E('div', {}, [
			E('h2', {}, _('ISM sensors')),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Small wireless gadgets nearby, decoded by rtl_433: weather stations, thermometers, doorbells, door and window sensors, tire pressure sensors, remotes and key fobs. Each row is one device with the latest values it sent.')
			]),
			E('div', { 'class': 'cbi-section' }, [ status, table ]),
			E('div', { 'class': 'cbi-section' }, [
				E('p', {}, [
					_('Read from rtl_433\'s log on the microSD card. For more detail, rtl_433 has its own viewer at '),
					E('a', { 'href': url, 'target': '_blank', 'rel': 'noopener' }, url),
					_(' (it loads its interface from triq.org).')
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
