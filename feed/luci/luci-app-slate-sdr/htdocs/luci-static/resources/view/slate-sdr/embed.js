'use strict';
'require view';
'require dom';
'require rpc';

// One Slate SDR web page shown inside LuCI. Which one comes from the menu
// entry's last path segment: admin/services/slate-sdr/<page>. A page served
// by an RTL-SDR job first hands the RTL-SDR to that job, so opening its tab
// is what switches the radio between pages.

var pages = {
	aircraft:   { title: _('Aircraft map'),  port: 8080, path: '/',           job: 'adsb', use: true },
	recordings: { title: _('Recorded data'), port: 8081, path: '/slate-sdr/', job: null,   use: false }
};

var route = L.env.dispatchpath || L.env.requestpath || [];
var page = pages[route[route.length - 1]] || pages.aircraft;
var url = 'http://%s:%d%s'.format(window.location.hostname, page.port, page.path);

var callUse = rpc.declare({
	object: 'luci.slate-sdr',
	method: 'use',
	params: [ 'job' ]
});

// A no-cors fetch resolves for any answer and rejects when nothing listens,
// but also when a content blocker stops it, so a failure only adds a hint.
function probe() {
	return fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(function() {
		return true;
	}, function() {
		return false;
	});
}

// After a switch the job needs a few seconds, or a respawn if the old job had
// not let go of the radio yet, before its page answers.
function waitUp(tries) {
	return probe().then(function(up) {
		if (up || tries <= 1)
			return up;

		return new Promise(function(resolve) {
			window.setTimeout(resolve, 2000);
		}).then(function() {
			return waitUp(tries - 1);
		});
	});
}

return view.extend({
	load: function() {
		if (!page.use)
			return Promise.resolve({});

		return callUse(page.job).catch(function(err) {
			return { error: err.message };
		});
	},

	render: function(res) {
		var note = E('p', {});
		var body = E('div', { 'class': 'cbi-section' }, [ note ]);
		var stopped = (res.stopped || []).join(', ');
		var wait;

		if (window.location.protocol == 'https:') {
			note.textContent = _('This page is plain HTTP, which the browser will not show inside LuCI opened over HTTPS. Use the link above.');
			wait = null;
		}
		else if (res.error) {
			note.textContent = /-32002|Access denied/.test(res.error)
				? _('LuCI may not switch the RTL-SDR yet: log out and back in once so your login picks up the Slate SDR permission.')
				: _('Could not switch the RTL-SDR: %s').format(res.error);
			wait = probe();
		}
		else if (res.switched) {
			note.textContent = stopped
				? _('Switching the RTL-SDR from %s to %s…').format(stopped, page.job)
				: _('Starting job %s…').format(page.job);
			wait = waitUp(10);
		}
		else {
			wait = probe();
		}

		if (wait) wait.then(function(up) {
			if (res.switched && up)
				note.textContent = stopped
					? _('Switched the RTL-SDR from %s to %s.').format(stopped, page.job)
					: _('Started job %s.').format(page.job);
			else if (!up && !res.error)
				dom.content(note, [
					_('No answer from port %d. If the page below stays empty, check the radio and job status on the ').format(page.port),
					E('a', { 'href': L.url('admin/services/slate-sdr/overview') }, _('Overview')),
					_(' tab.')
				]);

			body.appendChild(E('iframe', {
				'src': url,
				'style': 'width:100%; height:calc(100vh - 16rem); min-height:30rem; border:0; background:#fff'
			}));
		});

		return E('div', {}, [
			E('h2', {}, page.title),
			E('div', { 'class': 'cbi-map-descr' }, [
				E('a', { 'href': url, 'target': '_blank', 'rel': 'noopener' }, url),
				' (', _('open in a new tab'), ')'
			]),
			body
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
