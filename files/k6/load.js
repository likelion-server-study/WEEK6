// 6주차 부하 스크립트
//
// 핵심은 constant-arrival-rate 다. 요청을 하나씩 순서대로 보내는 방식이었다면
// 서버가 느려질 때 요청 수도 함께 줄어들어 "같은 부하에서 어떻게 달랐는가"를
// 말할 수 없다. 초당 20건을 무슨 일이 있어도 유지해야 비교가 성립한다.
//
// 실행 예:
//   docker compose --profile load run --rm -e DURATION=2m -e TAG=base k6 run /scripts/load.js

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

// 컨테이너 안에서 실행되므로 localhost 가 아니라 서비스명으로 접속한다.
const BASE_URL = __ENV.BASE_URL || 'http://nginx:80';
const DURATION = __ENV.DURATION || '2m';
const TAG = __ENV.TAG || 'base';
const RATE = Number(__ENV.RATE || 20);

// Nginx 가 붙여 주는 X-Upstream 헤더로 앱별 처리 건수를 센다. (8-2에서 추가)
const app1Hits = new Counter('app1_hits');
const app2Hits = new Counter('app2_hits');

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      // 응답이 느려져도 초당 요청 수를 유지할 수 있도록 여유를 둔다.
      preAllocatedVUs: Math.max(20, RATE * 2),
      maxVUs: Math.max(100, RATE * 10),
      gracefulStop: '10s',
    },
  },
  // 장애를 일부러 만드는 실습이므로 실패해도 시험을 중단하지 않는다.
  thresholds: {
    http_req_failed: [{ threshold: 'rate<1.01', abortOnFail: false }],
  },
  // p99 는 k6 기본 집계에 없다. 요약표에 찍으려면 여기서 요청해야 한다.
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
};

export default function () {
  // 5주차와 같은 방식으로 로그에서 찾을 수 있도록 표식을 붙인다.
  // grep -Rc "study=week6-base" logs/tomcat/app1
  const res = http.get(`${BASE_URL}/owners?study=week6-${TAG}`, {
    tags: { name: '/owners' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  // 어느 앱이 처리했는지 응답 헤더로 센다. 8-2 이전에는 헤더가 없어 0으로 남는다.
  const upstream = res.headers['X-Upstream'] || res.headers['x-upstream'];
  if (upstream) {
    if (upstream.endsWith(':8080')) {
      // 컨테이너 IP 는 매번 달라지므로 최근에 본 순서로 두 갈래만 나눈다.
      if (!globalThis.__firstUpstream) {
        globalThis.__firstUpstream = upstream;
      }
      if (upstream === globalThis.__firstUpstream) {
        app1Hits.add(1, { upstream });
      } else {
        app2Hits.add(1, { upstream });
      }
    }
  }
}

// k6 기본 요약 대신 6주차 기록지에 옮겨 적을 표를 직접 만든다.
export function handleSummary(data) {
  const m = data.metrics;

  const get = (name, field, fallback = 0) => {
    if (!m[name] || m[name].values[field] === undefined) return fallback;
    return m[name].values[field];
  };

  const total = get('http_reqs', 'count');
  const rps = get('http_reqs', 'rate');
  const failRate = get('http_req_failed', 'rate') * 100;
  const p50 = get('http_req_duration', 'med');
  const p95 = get('http_req_duration', 'p(95)');
  const p99 = get('http_req_duration', 'p(99)');
  const avg = get('http_req_duration', 'avg');
  const maxDur = get('http_req_duration', 'max');
  const a1 = get('app1_hits', 'count');
  const a2 = get('app2_hits', 'count');

  const ms = (v) => `${v.toFixed(1)} ms`;
  const row = (label, value) => `  ${label.padEnd(24)} ${value}`;

  const text = [
    '',
    '================ 6주차 기록용 요약 ================',
    row('회차 표식(TAG)', `week6-${TAG}`),
    row('시험 시간', DURATION),
    row('목표 초당 요청 수', `${RATE} req/s`),
    '  ' + '-'.repeat(46),
    row('전체 요청 수', `${total}`),
    row('초당 요청 수', `${rps.toFixed(2)} req/s`),
    row('HTTP 실패율', `${failRate.toFixed(2)} %`),
    '  ' + '-'.repeat(46),
    row('응답시간 평균', ms(avg)),
    row('응답시간 p50', ms(p50)),
    row('응답시간 p95', ms(p95)),
    row('응답시간 p99', ms(p99)),
    row('응답시간 최대', ms(maxDur)),
    '  ' + '-'.repeat(46),
    row('app1 처리 건수', `${a1}`),
    row('app2 처리 건수', `${a2}`),
    '===================================================',
    '',
    '  * app 처리 건수가 0이면 Nginx에 X-Upstream 헤더가 아직 없는 것이다. (8-2)',
    '  * 로그로도 대조한다: grep -Rc "study=week6-' + TAG + '" logs/tomcat/app1',
    '',
  ].join('\n');

  return {
    stdout: text,
    // 회차별로 파일이 남는다. 7단계에서 ls -l k6/summary-*.json 로 확인한다.
    [`/scripts/summary-${TAG}.json`]: JSON.stringify(data, null, 2),
  };
}
