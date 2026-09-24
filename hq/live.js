/*
 * The control room (/live). Everything is live API data:
 *   /api/agent/live   the nightly Build Agent run (or the last one)
 *   /api/activity     runs, verifications, votes, requests and the AI's replies, treasury, prizes
 *   /api/insights     what verified players did in the last 24 h
 *   /api/vote         tomorrow's ballot
 *   /api/stats        day, live build, players, treasury
 * ?tv=1 is a fixed 1920x1080 stage for streaming (OBS browser source).
 */
(function () {
    'use strict';
    var $ = function (id) {
        return document.getElementById(id);
    };
    var TV = /(?:^|[?&])tv=1(?:&|$)/.test(location.search);
    var ICON = {
        start: '▶',
        context: 'i',
        say: '›',
        tool: '·',
        test: '✓',
        plan: '✎',
        review: '◆',
        gate: '✓',
        cost: '$',
        ship: '⇡',
        done: '■',
        failed: '!',
        run: '▸',
        verified: '✓',
        rejected: '✗',
        vote: '◉',
        request: '+',
        reply: '›',
        fees: '$',
        ledger: '$',
        prize: '★'
    };
    var agent = null;
    var activityItems = [];
    var tab = 'live';
    var seen = {};
    var mounted = null;

    var pad = function (n) {
        return String(n).padStart(2, '0');
    };
    var hms = function (ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        return (
            pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60)
        );
    };
    var mss = function (sec) {
        return Math.floor(sec / 60) + ':' + pad(Math.round(sec % 60));
    };
    var nice = function (id) {
        return String(id || '').replace(/_/g, ' ');
    };
    var nextSession = function () {
        var d = new Date();
        var t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21);
        return t > Date.now() ? t : t + 86400000;
    };
    var getJSON = function (u) {
        return fetch(u, { cache: 'no-cache', headers: { accept: 'application/json' } })
            .then(function (r) {
                return r.ok ? r.json() : null;
            })
            .catch(function () {
                return null;
            });
    };

    // --- TV scaling -----------------------------------------------------------------------------
    if (TV) {
        document.body.classList.add('tv');
        var fit = function () {
            var s = Math.min(innerWidth / 1920, innerHeight / 1080);
            $('room').style.transform = 'scale(' + s + ')';
        };
        addEventListener('resize', fit);
        fit();
        // A stream runs for days: pick up page updates twice a day, never during a build session.
        setInterval(function () {
            if (!(agent && agent.status === 'running') && nextSession() - Date.now() > 30 * 60000)
                location.reload();
        }, 12 * 3600000);
    }

    // --- the game view ------------------------------------------------------------------------
    // Remounts when a new build goes live at 00:00 UTC, so a stream that runs for days shows the latest one.
    function mountGame(n) {
        if (mounted === n || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        mounted = n;
        var old = $('screen').querySelector('iframe');
        if (old) old.remove();
        var f = document.createElement('iframe');
        f.src = '/play?attract=1';
        f.title = 'BEARPROOF, playing on autopilot';
        f.setAttribute('tabindex', '-1');
        f.setAttribute('loading', 'lazy');
        $('screen').insertBefore(f, $('gameTag'));
    }

    // --- rows ---------------------------------------------------------------------------------
    function row(e) {
        var r = document.createElement('div');
        var bad = e.type === 'test' && /fail|FAILED/.test(e.text) && !/, 0 failed/.test(e.text);
        r.className = 'row ' + e.type + (bad ? ' bad' : '');
        var t = document.createElement('time');
        t.dateTime = e.ts;
        t.textContent = e.ts.slice(11, 19);
        var ic = document.createElement('span');
        ic.className = 'ic';
        ic.setAttribute('aria-hidden', 'true');
        ic.textContent = ICON[e.type] || '·';
        var tx = document.createElement('span');
        tx.className = 'tx';
        tx.textContent = e.text;
        if (e.tx && /^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(e.tx)) {
            var a = document.createElement('a');
            a.href = 'https://solscan.io/tx/' + e.tx;
            a.rel = 'noopener';
            a.target = '_blank';
            a.textContent = ' Solscan ↗';
            tx.append(a);
        }
        r.append(t, ic, tx);
        return r;
    }

    function renderFeed() {
        var feed = $('feed');
        var running = agent && agent.status === 'running';
        var showAgent = running || tab === 'log';
        document.querySelector('.tabs').hidden = !!running;
        var items = showAgent
            ? (agent && agent.events) || []
            : activityItems
                  .map(function (i) {
                      return {
                          ts: i.ts,
                          type: i.kind,
                          text: i.text,
                          tx: i.tx,
                          id: i.ts + i.kind + i.text
                      };
                  })
                  .reverse();
        var key = showAgent ? 'agent:' + (agent && agent.run) : 'activity';
        if (feed.dataset.key !== key) {
            feed.textContent = '';
            feed.dataset.key = key;
            seen[key] = {};
        }
        var nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
        var old = feed.querySelector('.cursor, .empty');
        if (old) old.remove();
        if (!items.length) {
            var em = document.createElement('div');
            em.className = 'empty';
            em.textContent = showAgent
                ? 'No build run yet. The first one starts at 21:00 UTC.'
                : 'Quiet for now. New runs, votes and requests show up here as they happen.';
            feed.append(em);
            return;
        }
        var s = seen[key];
        items.forEach(function (e) {
            var id = String(e.id);
            if (s[id]) return;
            s[id] = 1;
            feed.appendChild(row(e));
        });
        while (feed.children.length > 400) feed.firstChild.remove();
        if (running) {
            var c = document.createElement('span');
            c.className = 'cursor';
            c.setAttribute('aria-hidden', 'true');
            feed.appendChild(c);
        }
        if (nearBottom || running || TV) feed.scrollTop = feed.scrollHeight;
        $('consoleTitle').textContent = running
            ? "The AI's console · live"
            : tab === 'log'
              ? 'Replay · the last build session' +
                (agent && agent.build ? ' (Build #' + agent.build + ')' : '')
              : 'Live activity';
    }

    // --- the nightly run: status band + steps ------------------------------------------------
    var STEP_ORDER = ['context', 'plan', 'build', 'playtest', 'review', 'gate', 'ship'];
    function stepOf(e) {
        var t = e.text || '';
        if (e.type === 'context' || e.type === 'start') return 'context';
        if (e.type === 'plan' || e.type === 'say' || /^Writing agent\/plan\.md/.test(t))
            return 'plan';
        if (e.type === 'tool' && /^(Editing|Writing) game\//.test(t)) return 'build';
        if (/^Playtest|^Running node game\/scripts\/playtest/.test(t)) return 'playtest';
        if (e.type === 'review') return 'review';
        if (e.type === 'gate' || e.type === 'cost') return 'gate';
        if (e.type === 'ship' || e.type === 'done') return 'ship';
        return null;
    }
    function renderStatus() {
        var st = $('status');
        var running = agent && agent.status === 'running';
        st.classList.toggle('running', !!running);
        var steps = $('steps');
        if (running) {
            $('pillText').textContent = 'Live now';
            $('headline').innerHTML = '';
            $('headline').append(
                'The AI is building ',
                Object.assign(document.createElement('em'), {
                    textContent: 'Build #' + (agent.build || '?')
                }),
                ' right now.'
            );
            $('sub').textContent =
                'Started ' +
                agent.startedAt.slice(11, 16) +
                ' UTC · running for ' +
                hms(Date.now() - Date.parse(agent.startedAt)) +
                ' · it ships at 00:00 UTC if every gate is green.';
            steps.hidden = false;
            var said = agent.events.filter(function (e) {
                return e.type === 'say' || e.type === 'plan';
            });
            var th = $('thought');
            th.hidden = !said.length;
            if (said.length) th.textContent = said[said.length - 1].text;
            var reached = -1;
            var failed = agent.events.some(function (e) {
                return e.type === 'failed';
            });
            agent.events.forEach(function (e) {
                var k = stepOf(e);
                if (k) reached = Math.max(reached, STEP_ORDER.indexOf(k));
            });
            [].forEach.call(steps.children, function (li, i) {
                li.className = i < reached ? 'done' : i === reached ? (failed ? 'bad' : 'now') : '';
            });
        } else {
            steps.hidden = true;
            $('thought').hidden = true;
            var last = agent && agent.status !== 'none' ? agent : null;
            $('pillText').textContent = 'Next build session in ' + hms(nextSession() - Date.now());
            $('headline').innerHTML = '';
            $('headline').append(
                'An AI is building a game, ',
                Object.assign(document.createElement('em'), { textContent: 'in public' }),
                '.'
            );
            $('sub').textContent = last
                ? 'Last session: Build #' +
                  (last.build || '?') +
                  ', ' +
                  (last.status === 'done'
                      ? 'shipped'
                      : last.status === 'failed'
                        ? 'stopped before shipping, so the current build stayed live'
                        : 'the session went quiet before it finished, so the current build stayed live') +
                  '. Tonight at 21:00 UTC it reads the vote and the player data and builds the next one, live, right here.'
                : 'Tonight at 21:00 UTC it reads the vote and the player data and builds the next version, live, right here. It ships at 00:00 UTC.';
        }
    }

    // --- loaders -------------------------------------------------------------------------------
    function loadAgent() {
        return getJSON('/api/agent/live').then(function (d) {
            if (d) agent = d;
            renderStatus();
            renderFeed();
        });
    }
    function loadActivity() {
        return getJSON('/api/activity').then(function (d) {
            if (d && Array.isArray(d.items)) activityItems = d.items;
            renderFeed();
        });
    }
    function loadStats() {
        return getJSON('/api/stats').then(function (s) {
            if (!s) return;
            if (s.day) $('day').textContent = 'Day ' + s.day;
            if (s.liveBuild) {
                $('buildNow').textContent = 'Build #' + s.liveBuild.n;
                $('gameTag').textContent = 'Autopilot · Build #' + s.liveBuild.n + ', live now';
                mountGame(s.liveBuild.n);
            }
        });
    }
    function loadInsights() {
        return getJSON('/api/insights?hours=24').then(function (d) {
            if (!d || !d.runs) {
                $('knowsNote').textContent =
                    'No verified runs in the last 24 hours yet. Play one and I will know more tomorrow.';
                return;
            }
            $('kRuns').textContent = String(d.runs);
            $('kPlayers').textContent = d.players + ' player' + (d.players === 1 ? '' : 's');
            $('kMedian').textContent = mss(d.survivalSec.median);
            $('kBest').textContent = 'best ' + mss(d.survivalSec.best);
            var death = d.diedTo && d.diedTo[0];
            $('kDeath').textContent = death ? nice(death.id) : '—';
            $('kDeathN').textContent = death ? death.share + '% of deaths' : '';
            var pick = (d.weapons || []).find(function (w) {
                return w.id !== 'horns';
            });
            $('kPick').textContent = pick ? nice(pick.id) : '—';
            $('kPickN').textContent = pick ? pick.share + '% of runs' : '';
            $('knowsNote').textContent =
                d.runs < 5
                    ? 'Only ' +
                      d.runs +
                      ' verified run' +
                      (d.runs === 1 ? '' : 's') +
                      ' in the last 24 hours. Every run you play sharpens what I build next.'
                    : 'Half of you are liquidated before ' +
                      mss(d.survivalSec.median) +
                      (death
                          ? '. The ' +
                            nice(death.id) +
                            ' gets you most often (' +
                            death.share +
                            '%)'
                          : '') +
                      '. I read this before I decide what to build tonight.';
        });
    }
    function loadBallot() {
        return getJSON('/api/vote').then(function (v) {
            var list = $('opts');
            if (!v || !Array.isArray(v.proposals)) return;
            list.textContent = '';
            var opts = v.proposals.slice().sort(function (a, b) {
                return (b.weight || 0) - (a.weight || 0);
            });
            opts.slice(0, 5).forEach(function (o) {
                var li = document.createElement('li');
                if (o.source === 'community') li.className = 'h';
                var name = document.createElement('span');
                var src = document.createElement('span');
                src.className = 'src' + (o.source === 'community' ? ' h' : '');
                src.textContent = o.source === 'community' ? 'Holder' : 'AI';
                name.append(src, o.title);
                var share = document.createElement('b');
                share.textContent = (o.share || 0) + '%';
                var bar = document.createElement('div');
                bar.className = 'bar';
                var fill = document.createElement('i');
                fill.style.width = (o.share || 0) + '%';
                bar.append(fill);
                li.append(name, share, bar);
                list.append(li);
            });
            var voters = v.proposals.reduce(function (n, o) {
                return n + (o.voters || 0);
            }, 0);
            $('ballotMeta').textContent =
                v.status === 'open'
                    ? 'Build #' +
                      v.forBuild +
                      ' · ' +
                      voters +
                      ' voter' +
                      (voters === 1 ? '' : 's') +
                      ' · closes 21:00 UTC'
                    : v.status === 'closed'
                      ? 'Closed · next ballot 00:00 UTC'
                      : 'Opens with the coin';
        });
    }

    // --- tabs, clock, polling -------------------------------------------------------------------
    $('tabLive').addEventListener('click', function () {
        tab = 'live';
        $('tabLive').setAttribute('aria-selected', 'true');
        $('tabLog').setAttribute('aria-selected', 'false');
        renderFeed();
    });
    $('tabLog').addEventListener('click', function () {
        tab = 'log';
        $('tabLog').setAttribute('aria-selected', 'true');
        $('tabLive').setAttribute('aria-selected', 'false');
        renderFeed();
    });
    setInterval(function () {
        var d = new Date();
        $('clock').textContent =
            pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
        renderStatus();
    }, 1000);

    // On a stream, when no session is running, alternate live activity with the last session's log.
    if (TV)
        setInterval(function () {
            var hasLog = agent && agent.status !== 'running' && agent.events && agent.events.length;
            tab = hasLog && tab === 'live' ? 'log' : 'live';
            renderFeed();
        }, 75000);

    function loop(fn, fastMs, slowMs) {
        var run = function () {
            fn().then(function () {
                var running = agent && agent.status === 'running';
                var soon = nextSession() - Date.now() < 10 * 60000;
                setTimeout(run, running || soon ? fastMs : slowMs);
            });
        };
        run();
    }
    loop(loadAgent, 3000, 20000);
    loop(loadActivity, 10000, 15000);
    loop(loadStats, 30000, 30000);
    loop(loadInsights, 60000, 60000);
    loop(loadBallot, 15000, 30000);
})();
