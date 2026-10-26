'use strict';
'require view';
'require poll';

// Slate SDR overview: radio, card and job status from the router's own
// /cgi-bin/slate-sdr page, and every address the receivers serve, built from
// the host name LuCI was opened with.

var host = window.location.hostname;

// [ title, address, job that serves it (null: always on) ]
var pages = [
	[ _('Slate SDR status'), 'http://%s/cgi-bin/slate-sdr', null ],
	[ _('Aircraft map'), 'http://%s:8080/', 'adsb' ],
	[ _('rtl_433 viewer (advanced)'), 'http://%s:8433/', 'ism' ],
	[ _('Recorded data'), 'http://%s:8081/slate-sdr/', null ]
];

var clients = [
	[ _('SoapySDR (SDR++, GQRX, CubicSDR, SDRangel, GNU Radio)'), 'driver=remote,remote=tcp://%s:55132', 'soapy' ],
	[ _('rtl_tcp (SDR#, SDR++, GQRX)'), '%s:1234', 'rtltcp' ],
	[ _('ADS-B, SBS'), '%s:30003', 'adsb' ],
	[ _('ADS-B, Beast'), '%s:30005', 'adsb' ],
	[ _('AIS, NMEA (OpenCPN)'), 'tcp://%s:10110', 'ais' ],
	[ _('MQTT broker (rtl_433 readings under rtl_433/…, while ISM runs)'), 'mqtt://%s:1883', null ]
];

// Jobs whose tab hands them the RTL-SDR when opened (see embed.js).
var tabJobs = {
	adsb: _('Aircraft map'),
	ism: _('ISM sensors')
};

function fetchStatus() {
	return fetch('/cgi-bin/slate-sdr', { cache: 'no-store' }).then(function(res) {
		return res.ok ? res.text() : null;
	}).then(function(html) {
		var pre = html ? new DOMParser().parseFromString(html, 'text/html').querySelector('pre') : null;
		return pre ? pre.textContent.replace(/^\n+|\s+$/g, '') : null;
	}).catch(function() {
		return null;
	});
}

// "  adsb       adsb           rtlsdr   running" -> { adsb: 'running' }
function jobStates(status) {
	var jobs = {};

	(status || '').replace(/^ {2}(\S+) +\S+ +\S+ +(running|stopped|off) *$/mg, function(m, name, state) {
		jobs[name] = state;
	});

	return jobs;
}

function stateText(job, jobs) {
	if (!job)
		return _('always on');

	switch (jobs[job]) {
	case 'running': return _('on (job %s)').format(job);
	case 'stopped': return _('stopped (job %s)').format(job);
	case 'off':
		return tabJobs[job]
			? _('off: opening the %s tab switches the RTL-SDR to it').format(tabJobs[job])
			: _('off: slate-sdr enable %s').format(job);
	default:        return _('job %s').format(job);
	}
}

function table(titles, rows) {
	return E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr table-titles' }, titles.map(function(t) {
			return E('th', { 'class': 'th' }, t);
		}))
	].concat(rows));
}

return view.extend({
	load: fetchStatus,

	render: function(status) {
		var pre = E('pre', {}, [ status || _('No answer from /cgi-bin/slate-sdr.') ]);
		var states = [];

		var pageRows = pages.map(function(p) {
			var url = p[1].format(host), state = E('td', { 'class': 'td' });

			states.push([ state, p[2] ]);

			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, p[0]),
				E('td', { 'class': 'td' }, E('a', { 'href': url, 'target': '_blank', 'rel': 'noopener' }, url)),
				state
			]);
		});

		var clientRows = clients.map(function(c) {
			var state = E('td', { 'class': 'td' });

			states.push([ state, c[2] ]);

			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, c[0]),
				E('td', { 'class': 'td' }, E('code', {}, c[1].format(host))),
				state
			]);
		});

		var update = function(status) {
			var jobs = jobStates(status);

			if (status)
				pre.textContent = status;

			states.forEach(function(s) {
				s[0].textContent = stateText(s[1], jobs);
			});
		};

		update(status);
		poll.add(function() { return fetchStatus().then(update); }, 30);

		return E('div', {}, [
			E('h2', {}, _('Slate SDR')),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Receivers on this router. Jobs are set in /etc/config/slate-sdr; over SSH: '),
				E('code', {}, [ 'slate-sdr enable|disable <job>' ])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Status')),
				pre
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Web pages')),
				table([ _('Page'), _('Address'), _('Runs when') ], pageRows)
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Connect from a computer')),
				table([ _('Client'), _('Address'), _('Runs when') ], clientRows)
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
