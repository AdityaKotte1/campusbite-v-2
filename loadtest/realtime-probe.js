// Realtime connection-cap probe.
//
// Opens concurrent Supabase Realtime websockets and holds them, ramping past the
// Free-tier limit (~200 concurrent connections). Each active-order student in the
// real app holds one such socket for live status updates, so this measures how
// many simultaneously-active-order students you can support before Realtime
// degrades and the app must fall back to polling.
//
// Watch Supabase dashboard → Realtime → Connections while this runs. On Free you
// should see new connections start failing around the cap.
//
//   k6 run --env SUPABASE_URL=... --env SUPABASE_ANON_KEY=... loadtest/realtime-probe.js

import ws from 'k6/ws';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON = __ENV.SUPABASE_ANON_KEY;
const HOLD_MS = parseInt(__ENV.HOLD_MS || '60000', 10);

const opened = new Counter('ws_opened');
const failed = new Counter('ws_failed');

export const options = {
  scenarios: {
    connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      // Each VU = one held connection. Ramp past 200 to find the Free cap.
      stages: [
        { duration: '1m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 300 },
        { duration: '2m', target: 300 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '5s',
    },
  },
};

export default function () {
  if (!SUPABASE_URL || !ANON) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  const url = `${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      opened.add(1);
      // Join a channel so the connection is a realistic subscriber, not just an idle socket.
      socket.send(JSON.stringify({
        topic: 'realtime:loadtest',
        event: 'phx_join',
        payload: { config: { broadcast: { ack: false }, presence: { key: '' } } },
        ref: '1',
      }));
      // Phoenix heartbeat so the server doesn't drop us as idle.
      socket.setInterval(() => {
        socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
      }, 25000);
      // Hold the connection, then close cleanly.
      socket.setTimeout(() => socket.close(), HOLD_MS);
    });
    socket.on('error', () => failed.add(1));
  });

  check(res, { 'ws upgraded (101)': (r) => r && r.status === 101 });
  if (!res || res.status !== 101) failed.add(1);
}
