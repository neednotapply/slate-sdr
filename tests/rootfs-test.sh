#!/bin/sh
# shellcheck disable=SC2034,SC2009  # STORE_* are read by the sourced lib.sh
# Runs inside openwrt/rootfs:mips_24kc (under QEMU user mode) with the built
# packages unpacked over it: checks that the binaries run on the router's
# userland, and drives slate-sdr's scripts against mock radios.

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "ok   - $*"; }
nok() { FAIL=$((FAIL + 1)); echo "FAIL - $*"; }
near() { [ $(($1 - $2)) -ge -1 ] && [ $(($1 - $2)) -le 1 ]; }
check() {
	local desc="$1"
	shift
	if "$@"; then ok "$desc"; else nok "$desc"; fi
}
has() { grep -q -- "$2" "$1" 2>/dev/null; }

T=/tmp/slate-test
rm -rf "$T"
mkdir -p "$T"

echo "# binaries on the target userland"
# No USB bus in the container: hackrf_info gets as far as libusb's init.
check "hackrf_info runs" sh -c 'hackrf_info 2>&1 | grep -q -e "hackrf_info version" -e "hackrf_init()"'
check "hackrf_sweep runs" sh -c 'hackrf_sweep -h 2>&1 | grep -q "Usage"'
check "hackrf_transfer runs" sh -c 'hackrf_transfer -h 2>&1 | grep -q "Usage"'
check "SoapySDR loads the HackRF module" sh -c 'SoapySDRUtil --info 2>&1 | grep -q "Available factories.*hackrf"'
check "SoapySDR loads the RTL-SDR module" sh -c 'SoapySDRUtil --info 2>&1 | grep -q "Available factories.*rtlsdr"'
check "SoapySDRServer runs" sh -c 'SoapySDRServer --help 2>&1 | grep -q "Soapy Server"'
check "rtl_433 runs" sh -c 'rtl_433 -V 2>&1 | grep -q "rtl_433 version"'
check "rtl_power runs" sh -c 'rtl_power 2>&1 | grep -q "No frequency range provided"'
check "rtl_ais runs" sh -c 'rtl_ais -x 2>&1 | grep -q "rtl_ais"'
check "shell has 64-bit arithmetic" [ $((20000000 * 3600)) = 72000000000 ]

echo "# lib.sh"
. /lib/functions.sh
. /usr/share/slate-sdr/lib.sh
check "to_hz 433.92M" [ "$(slate_to_hz 433.92M)" = 433920000 ]
check "to_hz 2.4G" [ "$(slate_to_hz 2.4G)" = 2400000000 ]
check "to_hz 100k" [ "$(slate_to_hz 100k)" = 100000 ]
check "to_hz 1090000000" [ "$(slate_to_hz 1090000000)" = 1090000000 ]
check "to_hz rejects 12abc" sh -c '. /usr/share/slate-sdr/lib.sh; ! slate_to_hz 12abc'
b=$(slate_secs_to_boundary hour)
e=$((3600 - $(date +%s) % 3600))
check "seconds to the next hour ($b)" near "$b" "$e"
b=$(slate_secs_to_boundary day)
e=$((86400 - $(date +%s) % 86400))
check "seconds to midnight ($b, UTC)" near "$b" "$e"

# Two radios on a fake USB bus, plus a root hub that must be ignored.
mkusb() {
	mkdir -p "$T/sys/bus/usb/devices/$1"
	echo "$2" > "$T/sys/bus/usb/devices/$1/idVendor"
	echo "$3" > "$T/sys/bus/usb/devices/$1/idProduct"
	[ -n "$4" ] && echo "$4" > "$T/sys/bus/usb/devices/$1/serial"
	[ -n "$5" ] && echo "$5" > "$T/sys/bus/usb/devices/$1/product"
}
mkusb usb1 1d6b 0002
mkusb 1-1 0bda 2838 00000001 RTL2838UHIDIR
mkusb 1-2 1d50 6089 0000000000000000a06063c8234e925f "HackRF One"
export SLATE_SYSFS="$T/sys"
check "finds both radios" [ "$(slate_usb_radios | wc -l)" = 2 ]
check "rtlsdr present" slate_radio_present rtlsdr
check "hackrf present" slate_radio_present hackrf
check "HackRF product name" sh -c '. /usr/share/slate-sdr/lib.sh; slate_usb_radios | grep -q "^hackrf 1d50:6089 0000000000000000a06063c8234e925f HackRF One$"'

# A fake /proc/mounts: card in or out.
export SLATE_PROC="$T/proc"
mkdir -p "$SLATE_PROC" /mnt/sdcard
card_out() { echo "rootfs / rootfs rw 0 0" > "$SLATE_PROC/mounts"; }
card_in() { card_out; echo "/dev/sda1 /mnt/sdcard exfat rw,noatime 0 0" >> "$SLATE_PROC/mounts"; }

cp /etc/config/slate-sdr "$T/slate-sdr.default"
card_out
config_load slate-sdr
slate_storage_load
check "no card -> nocard" [ "$(slate_storage_state)" = nocard ]
card_in
check "card in -> ok" [ "$(slate_storage_state)" = ok ]
STORE_MIN_FREE_MB=999999999
check "card full -> full" [ "$(slate_storage_state)" = full ]

echo "# mock radios"
M="$T/mock"
mkdir -p "$M"
mock() {
	{
		echo '#!/bin/sh'
		echo "echo \"\$(basename \"\$0\") \$*\" >> $T/calls.log"
		echo 'trap "exit 0" TERM INT'
		cat
	} > "$M/$1"
	chmod +x "$M/$1"
}
mock hackrf_sweep <<-'EOF'
	case " $* " in *" -1 "*) echo "2026-10-24, 12:00:00, 1000000, 6000000, 1000000.00, 20, -60.1, -61.2"; exit 0 ;; esac
	while :; do echo "2026-10-24, 12:00:00, 1000000, 6000000, 1000000.00, 20, -60.1"; sleep 1; done
EOF
mock rtl_power <<-'EOF'
	case " $* " in *" -1 "*) echo "2026-10-24, 12:00:00, 24000000, 26000000, 250000, 4, -30.1"; exit 0 ;; esac
	while :; do echo "2026-10-24, 12:00:00, 24000000, 26000000, 250000, 4, -30.1"; sleep 1; done
EOF
mock hackrf_transfer <<-'EOF'
	f=; n=
	while [ $# -gt 0 ]; do case "$1" in -r) f=$2; shift ;; -n) n=$2; shift ;; esac; shift; done
	if [ -n "$n" ]; then head -c 4096 /dev/zero > "$f"; exit 0; fi
	while :; do head -c 4096 /dev/zero >> "$f"; sleep 1; done
EOF
mock rtl_sdr <<-'EOF'
	for f; do :; done
	while :; do head -c 4096 /dev/zero >> "$f"; sleep 1; done
EOF
mock rtl_433 <<-'EOF'
	f=
	for a; do case "$a" in json:*) f=${a#json:} ;; esac; done
	while :; do echo '{"time":"2026-10-24T12:00:00Z","model":"Mock-Sensor","id":1}' >> "$f"; sleep 1; done
EOF
mock rtl_ais <<-'EOF'
	while :; do echo '!AIVDM,1,1,,A,13u?etPv2;0n:dDPwUM1U1Cb069D,0*23' >&2; sleep 1; done
EOF
mock dump1090 <<-'EOF'
	while :; do echo '{ "now" : 1, "aircraft" : [ { "hex" : "abc123" } ] }' > /var/run/dump1090/aircraft.json; sleep 1; done
EOF
mock SoapySDRServer <<-'EOF'
	while :; do sleep 1; done
EOF
export PATH="$M:$PATH"

# set_job <section> <option=value>...
set_job() {
	local s="$1"
	shift
	for kv; do uci set "slate-sdr.$s.$kv"; done
	uci commit slate-sdr
}
# run_job <section> <seconds>: run the runner, stop it, return its output
run_job() {
	/usr/libexec/slate-sdr-job "$1" > "$T/$1.out" 2>&1 &
	local pid=$!
	sleep "$2"
	kill -TERM "$pid"
	local i=0
	while kill -0 "$pid" 2>/dev/null && [ $i -lt 20 ]; do sleep 1; i=$((i + 1)); done
	if kill -0 "$pid" 2>/dev/null; then
		nok "$1: runner did not stop within 20 s of TERM"
		kill -KILL "$pid"
	else
		ok "$1: runner stops on TERM"
	fi
}
no_strays() {
	sleep 2
	! ps w | grep -v grep | grep -q "$M/"
}
DATA=/mnt/sdcard/slate-sdr
TODAY=$(date +%Y-%m-%d)
card_in

echo "# job: iq (hackrf, 12 s segments)"
set_job iq segment=12
run_job iq 30
check "iq: hackrf_transfer arguments" has "$T/calls.log" "hackrf_transfer -r $DATA/iq/$TODAY/iq-hackrf-433920000Hz-2000000sps-.*.sigmf-data -f 433920000 -s 2000000 -l 16 -g 20 -a 0"
n=$(ls "$DATA/iq/$TODAY/"*.sigmf-data 2>/dev/null | wc -l)
check "iq: at least 2 segments ($n)" [ "$n" -ge 2 ]
meta=$(ls "$DATA/iq/$TODAY/"*.sigmf-meta | head -n 1)
check "iq: SigMF datatype ci8" [ "$(jsonfilter -i "$meta" -e '@.global["core:datatype"]')" = ci8 ]
check "iq: SigMF frequency" [ "$(jsonfilter -i "$meta" -e '@.captures[0]["core:frequency"]')" = 433920000 ]
check "iq: SigMF sample rate" [ "$(jsonfilter -i "$meta" -e '@.global["core:sample_rate"]')" = 2000000 ]
check "iq: every recording has metadata" [ "$(ls "$DATA/iq/$TODAY/"*.sigmf-meta | wc -l)" = "$n" ]
check "iq: no stray receivers" no_strays

echo "# job: iq (rtlsdr)"
: > "$T/calls.log"
set_job iq radio=rtlsdr rate=2.4M gain=30
run_job iq 5
check "iq: rtl_sdr arguments" has "$T/calls.log" "rtl_sdr -d 0 -f 433920000 -s 2400000 -g 30 $DATA/iq/$TODAY/iq-rtlsdr-"
meta=$(ls -t "$DATA/iq/$TODAY/"iq-rtlsdr-*.sigmf-meta | head -n 1)
check "iq: SigMF datatype cu8 for RTL-SDR" [ "$(jsonfilter -i "$meta" -e '@.global["core:datatype"]')" = cu8 ]

echo "# job: survey (hackrf, one sweep every 5 s)"
: > "$T/calls.log"
set_job survey interval=5
run_job survey 17
check "survey: hackrf_sweep arguments" has "$T/calls.log" "hackrf_sweep -f 1:6000 -w 1000000 -l 16 -g 20 -a 0 -1"
n=$(grep -c hackrf_sweep "$T/calls.log")
check "survey: 3 or 4 sweeps in 17 s ($n)" sh -c "[ $n -ge 3 ] && [ $n -le 4 ]"
csv=$DATA/survey/$TODAY/sweep-hackrf-$(date +%Y%m%d-%H)00.csv
check "survey: sweeps appended to the hour's CSV" [ "$(grep -c '^2026' "$csv")" -ge 3 ]

echo "# job: rtlsurvey (continuous, files rotated every 12 s and compressed)"
: > "$T/calls.log"
set_job rtlsurvey interval=0 rotate=12
run_job rtlsurvey 32
check "rtlsurvey: rtl_power arguments" has "$T/calls.log" "rtl_power -d 0 -f 24M:1766M:250k -i 10 -"
check "rtlsurvey: a closed segment was compressed" sh -c "ls $DATA/rtlsurvey/$TODAY/*.csv.gz >/dev/null 2>&1"
gz=$(ls "$DATA/rtlsurvey/$TODAY/"*.csv.gz 2>/dev/null | head -n 1)
check "rtlsurvey: compressed CSV is intact" sh -c "gzip -dc '$gz' | grep -q '^2026'"
check "rtlsurvey: no stray receivers" no_strays

echo "# job: ism (two frequencies)"
: > "$T/calls.log"
uci add_list slate-sdr.ism.frequency=868M
uci commit slate-sdr
run_job ism 6
check "ism: rtl_433 arguments" has "$T/calls.log" "rtl_433 -d 0 -M time:iso:utc -M level -M protocol -F json:$DATA/ism/$TODAY/ism-$(date +%Y%m%d).json -F http:0.0.0.0:8433 -f 433.92M -f 868M -H 600"
check "ism: events logged" [ "$(grep -c Mock-Sensor "$DATA/ism/$TODAY/ism-$(date +%Y%m%d).json")" -ge 3 ]

echo "# job: ism without a card, then the card goes in"
: > "$T/calls.log"
card_out
/usr/libexec/slate-sdr-job ism > "$T/ism2.out" 2>&1 &
pid=$!
sleep 5
check "ism: runs without a card (to /dev/null)" has "$T/calls.log" "json:/dev/null"
before=$(grep -c Mock-Sensor "$DATA/ism/$TODAY/ism-$(date +%Y%m%d).json")
card_in
sleep 38
after=$(grep -c Mock-Sensor "$DATA/ism/$TODAY/ism-$(date +%Y%m%d).json")
check "ism: logs to the card once it is in ($before -> $after)" [ "$after" -gt "$before" ]
check "ism: says so" has "$T/ism2.out" "microSD card ready"
kill -TERM "$pid"
wait "$pid" 2>/dev/null

echo "# job: ais"
: > "$T/calls.log"
run_job ais 5
check "ais: rtl_ais arguments" has "$T/calls.log" "rtl_ais -d 0 -T -P 10110 -n"
check "ais: NMEA logged" has "$DATA/ais/$TODAY/ais-$(date +%Y%m%d).nmea" "^!AIVDM"

echo "# job: adsb (snapshot every 3 s)"
: > "$T/calls.log"
set_job adsb log_every=3 lat=51.5 lon=-0.1
run_job adsb 11
check "adsb: dump1090 arguments" has "$T/calls.log" "dump1090 --quiet --net --device-index 0 --write-json /var/run/dump1090 --lat 51.5 --lon -0.1"
n=$(grep -c abc123 "$DATA/adsb/$TODAY/aircraft-$(date +%Y%m%d).json" 2>/dev/null)
check "adsb: aircraft snapshots on the card ($n)" [ "${n:-0}" -ge 2 ]
check "adsb: no stray receivers" no_strays

echo "# job: soapy server"
: > "$T/calls.log"
run_job soapy 3
check "soapy: SoapySDRServer --bind" has "$T/calls.log" "SoapySDRServer --bind$"

echo "# configuration errors"
uci set slate-sdr.bogus=job
uci set slate-sdr.bogus.type=nonsense
uci commit slate-sdr
run_job bogus 3
check "unknown type is reported" has "$T/bogus.out" "unknown type 'nonsense'"
set_job iq frequency=abc
run_job iq 3
check "bad frequency is reported" has "$T/iq.out" "set a frequency"

echo "# Wi-Fi spectral sweep (fake debugfs)"
export SLATE_DEBUGFS="$T/dbg"
mkdir -p "$T/dbg/ieee80211/phy0/ath9k" "$T/dbg/ieee80211/phy1/ath10k" "$T/spec"
for d in phy0/ath9k phy1/ath10k; do
	: > "$T/dbg/ieee80211/$d/spectral_scan_ctl"
	printf 'FFTDATA' > "$T/dbg/ieee80211/$d/spectral_scan0"
done
mock iw <<-'EOF'
	exit 0
EOF
mock ip <<-'EOF'
	exit 0
EOF
: > "$T/calls.log"
slate_spectral_sweep "$T/spec" "2g 5g" 2> "$T/spec.err"
check "spectral: finds both radios" [ "$(slate_spectral_dirs | wc -l)" = 2 ]
check "spectral: 2.4 GHz samples saved" sh -c "cat $T/spec/2g-*.bin | grep -q FFTDATA"
check "spectral: 5 GHz samples saved" sh -c "cat $T/spec/5g-*.bin | grep -q FFTDATA"
check "spectral: scan disabled afterwards" [ "$(cat "$T/dbg/ieee80211/phy0/ath9k/spectral_scan_ctl")" = disable ]
check "spectral: temporary interface added and removed" sh -c "grep -q 'iw phy phy0 interface add sdrphy0 type managed' $T/calls.log && grep -q 'iw dev sdrphy0 del' $T/calls.log"
rm -f "$T/spec/"*
slate_spectral_sweep "$T/spec" "5g" 2>/dev/null
check "spectral: band filter" sh -c "! ls $T/spec/2g-* >/dev/null 2>&1 && ls $T/spec/5g-* >/dev/null 2>&1"

echo "# init script (procd calls stubbed)"
cp "$T/slate-sdr.default" /etc/config/slate-sdr
cat > "$T/init-harness.sh" <<-'EOF'
	. /lib/functions.sh
	procd_open_instance() { printf 'instance %s:' "$1"; }
	procd_set_param() { [ "$1" = command ] && shift && printf ' %s' "$*"; }
	procd_close_instance() { echo; }
	logger() { shift 2; echo "log: $*"; }
	. /etc/init.d/slate-sdr
	start_service
EOF
SLATE_DEBUGFS="$T/nodbg" sh "$T/init-harness.sh" > "$T/init.out" 2>&1
check "init: default jobs soapy, adsb, survey" sh -c "grep -c '^instance' $T/init.out | grep -qx 3 && grep -q 'instance soapy: /usr/libexec/slate-sdr-job soapy' $T/init.out && grep -q 'instance adsb:' $T/init.out && grep -q 'instance survey:' $T/init.out"
uci set slate-sdr.ism.enabled=1
uci set slate-sdr.wifi.enabled=1
uci commit slate-sdr
SLATE_DEBUGFS="$T/nodbg" sh "$T/init-harness.sh" > "$T/init.out" 2>&1
check "init: second job on the RTL-SDR is refused" sh -c "grep -q \"job 'ism' not started: its rtlsdr is taken\" $T/init.out && ! grep -q 'instance ism' $T/init.out"
check "init: wifi job skipped without spectral scan" grep -q "job 'wifi' not started: this firmware has no Wi-Fi spectral scan" "$T/init.out"
sh "$T/init-harness.sh" > "$T/init.out" 2>&1
check "init: wifi job starts with spectral scan" grep -q "instance wifi:" "$T/init.out"

echo "# command line and status page"
cp "$T/slate-sdr.default" /etc/config/slate-sdr
mock ubus <<-'EOF'
	echo '{"slate-sdr":{"instances":{"soapy":{"running":true},"adsb":{"running":true}}}}'
EOF
slate-sdr status > "$T/status.out" 2>&1
check "status: radios" sh -c "grep -q 'rtlsdr  0bda:2838' $T/status.out && grep -q 'hackrf  1d50:6089' $T/status.out"
check "status: card" grep -q "mounted, .* MiB free, data in /mnt/sdcard/slate-sdr" "$T/status.out"
check "status: running job" grep -q "adsb .*adsb .*rtlsdr .*running" "$T/status.out"
check "status: stopped job" grep -q "survey .*sweep .*hackrf .*stopped" "$T/status.out"
check "status: disabled job" grep -q "ism .*ism .*rtlsdr .*off" "$T/status.out"
slate-sdr record hackrf 433.92M 2M 1 > "$T/record.out" 2>&1
check "record: writes a SigMF pair" sh -c "ls $DATA/recordings/$TODAY/iq-hackrf-433920000Hz-2000000sps-*.sigmf-data >/dev/null 2>&1 && ls $DATA/recordings/$TODAY/iq-hackrf-433920000Hz-2000000sps-*.sigmf-meta >/dev/null 2>&1"
check "record: hackrf_transfer sample count" grep -q -- "-n 2000000" "$T/calls.log"
check "record: rejects a bad radio" sh -c "! slate-sdr record airspy 100M 2M 1 2>/dev/null"
card_out
check "record: refuses without a card" sh -c "slate-sdr record hackrf 100M 2M 1 2>&1 | grep -q 'missing or full'"
card_in
HTTP_HOST='x"><script>alert(1)</script>' /www/cgi-bin/slate-sdr > "$T/cgi.out" 2>&1
check "cgi: hostile Host header is not echoed" sh -c "! grep -q '<script>' $T/cgi.out && grep -q 'http://192.168.1.1:8080/' $T/cgi.out"
HTTP_HOST="$(printf 'evil<b>\n10.0.0.5')" /www/cgi-bin/slate-sdr > "$T/cgi.out" 2>&1
check "cgi: multi-line Host header is not echoed" sh -c "! grep -q 'evil' $T/cgi.out"
HTTP_HOST='[fd00::1]:80' /www/cgi-bin/slate-sdr > "$T/cgi.out" 2>&1
check "cgi: IPv6 host" grep -q 'http://\[fd00::1\]:8080/' "$T/cgi.out"
HTTP_HOST='10.0.0.5:80' /www/cgi-bin/slate-sdr > "$T/cgi.out" 2>&1
check "cgi: links use the browser's host" grep -q 'remote=tcp://10.0.0.5:55132' "$T/cgi.out"
check "cgi: status is HTML-escaped" grep -q 'Jobs:' "$T/cgi.out"

echo "# LuCI pages (luci-app-slate-sdr)"
cp "$T/slate-sdr.default" /etc/config/slate-sdr
P=/usr/libexec/rpcd/luci.slate-sdr
check "luci: menu and ACL are valid JSON" sh -c 'jsonfilter -i /usr/share/luci/menu.d/luci-app-slate-sdr.json -e "@" >/dev/null && jsonfilter -i /usr/share/rpcd/acl.d/luci-app-slate-sdr.json -e "@" >/dev/null'
check "luci: plugin offers use and devices" [ "$("$P" list | jsonfilter -e '@.use.job') $("$P" list | jsonfilter -t '@.devices')" = "str object" ]

# use_job <name>: the rpcd call, with the init script's reload stubbed
use_job() { echo "{\"job\":\"$1\"}" | SLATE_INIT=true "$P" call use > "$T/use.out"; }
use_field() { jsonfilter -i "$T/use.out" -e "@.$1"; }
use_job ism
check "luci use: hands the RTL-SDR to ism, stopping adsb" [ "$(use_field switched) $(use_field 'stopped[0]')" = "true adsb" ]
check "luci use: config switched, HackRF job untouched" [ "$(uci get slate-sdr.ism.enabled)$(uci get slate-sdr.adsb.enabled)$(uci get slate-sdr.survey.enabled)" = 101 ]
use_job ism
check "luci use: nothing changes when the job holds the radio" [ "$(use_field switched)" = false ]
use_job 'x; reboot'
check "luci use: rejects a bad job name" [ "$(use_field error)" = "invalid job name" ]
use_job nosuch
check "luci use: rejects an unknown job" [ "$(use_field error)" = "no job 'nosuch' in /etc/config/slate-sdr" ]
cp "$T/slate-sdr.default" /etc/config/slate-sdr

# Two days of rtl_433 JSON lines, with a broken line and a cut-off one.
I="$T/ism"
mkdir -p "$I/2026-10-23" "$I/2026-10-24"
cat > "$I/2026-10-23/ism-20261023.json" <<-'EOF'
	{"time":"2026-10-23T22:00:00Z","model":"Acurite-Tower","id":1234,"channel":"A","battery_ok":1,"humidity":50,"freq":433.92}
EOF
cat > "$I/2026-10-24/ism-20261024.json" <<-'EOF'
	{"time":"2026-10-24T12:00:00Z","model":"Acurite-Tower","id":1234,"channel":"A","battery_ok":1,"humidity":47,"freq":433.91}
	not json
	{"time":"2026-10-24T12:01:00Z","model":"Schrader","type":"TPMS","id":"1A2B3C4D","pressure_kPa":227,"freq":315.02}
	{"time":"2026-10-24T12:02:00Z","model":"Acurite-Tower","id":1234,"cha
EOF
SLATE_ISM_DIR="$I" /usr/libexec/luci-slate-sdr-devices > "$T/devices.out" 2>&1
dev() { jsonfilter -i "$T/devices.out" -e "@.$1"; }
check "luci devices: one row per device, broken lines skipped" [ "$(dev decoded) $(dev 'devices[*].model' | xargs)" = "3 Acurite-Tower Schrader" ]
check "luci devices: merged across days, latest readings" [ "$(dev 'devices[0].count') $(dev 'devices[0].readings.humidity') $(dev 'devices[0].first')" = "2 47 2026-10-23T22:00:00Z" ]
check "luci devices: the ISM job's bands" [ "$(dev 'frequencies[0]') $(dev hop_interval)" = "433.92M 600" ]

echo "# network recon (luci-app-slate-recon)"
RP=/usr/libexec/rpcd/luci.slate-recon
check "recon: menu and ACL are valid JSON" sh -c 'jsonfilter -i /usr/share/luci/menu.d/luci-app-slate-recon.json -e "@" >/dev/null && jsonfilter -i /usr/share/rpcd/acl.d/luci-app-slate-recon.json -e "@" >/dev/null'
check "recon: plugin offers uplink, discover, hosts, ports" sh -c '"'"$RP"'" list | jsonfilter -e "@.ports.target" | grep -qx str && "'"$RP"'" list | jsonfilter -e "@.uplink" >/dev/null'
# A valid target with no nmap present still yields valid JSON and no ports.
slate-recon ports 203.0.113.1 > "$T/ports.out" 2>&1
check "recon: port scan output is valid JSON" jsonfilter -i "$T/ports.out" -e '@.target' -q
check "recon: port scan target echoed" [ "$(jsonfilter -i "$T/ports.out" -e '@.target')" = 203.0.113.1 ]
check "recon: rejects a shell-injection target" sh -c 'slate-recon ports "x; reboot" | jsonfilter -e "@.error" | grep -q "give one host"'
check "recon: rejects an empty target" sh -c 'slate-recon ports "" | jsonfilter -e "@.error" >/dev/null'
check "recon: hosts with no scan is valid JSON" sh -c 'SLATE_RECON_STORE=/nonexistent slate-recon hosts | jsonfilter -e "@.hosts" >/dev/null'
check "recon: unknown command fails" sh -c '! slate-recon wat 2>/dev/null'

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
