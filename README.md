# WEEK6 — Prometheus·Grafana로 장애를 발견하고 복구 확인하기

5주차에서 만든 `app1`·`app2`·Nginx·PostgreSQL 구조를 그대로 두고, 옆에 관측 도구를 붙입니다.
앱이 죽었을 때 사람이 로그를 들여다보지 않아도 그래프와 경고로 알 수 있게 만들고,
죽은 앱이 자동으로 살아나는지, 그동안 사용자 요청은 계속 성공했는지를 숫자로 확인합니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [01-환경세팅.md](01-환경세팅.md) | 모임 전에 각자 끝내 두는 준비. 5주차 결과물 확인, 백업, 포트·폴더·이미지 준비 |
| [02-이론.md](02-이론.md) | 지표를 만들고·모으고·보고·알림받는 네 단계와 도구별 역할 |
| [03-실습.md](03-실습.md) | 8단계 실습. 단계마다 검사 목표 → 명령 → 판정 → 설명 |

## 설정 파일

`files/` 폴더에는 실습에서 사용하는 설정 파일이 모두 들어 있습니다.
손으로 입력하기 긴 파일(대시보드 JSON, 경고 규칙, k6 스크립트)은 여기서 복사해 씁니다.

```
files/
├── compose-추가블록.yml                  docker-compose.yml 에 붙여 넣을 조각
├── build.gradle-추가.txt                 의존성 2줄
├── application.properties-추가.txt       Actuator·Metrics 설정
├── gen_dashboard.py                      대시보드 JSON 생성기 (패널을 고칠 때만)
├── monitoring/
│   ├── prometheus/prometheus.yml
│   └── grafana/
│       ├── provisioning/datasources/prometheus.yml
│       ├── provisioning/dashboards/dashboards.yml
│       ├── provisioning/alerting/alert-rules.yml
│       └── dashboards/week6-petclinic.json
└── k6/load.js                            부하 시험 스크립트
```

`files/` 폴더를 통째로 내려받은 뒤, `03-실습.md` 3-1에서 다음처럼 경로를 잡습니다.

```bash
WEEK6_FILES=~/Downloads/WEEK6-main/files
```

## 이번 주차에 사용하는 도구

| 도구 | 역할 |
| --- | --- |
| Spring Boot Actuator · Micrometer | PetClinic의 요청 수, 응답시간, JVM, DB 연결 상태를 측정해 내보낸다 |
| Prometheus | app1·app2의 지표를 5초마다 각각 수집하고 시간순으로 저장한다 |
| Grafana | 저장된 지표를 대시보드와 경고로 표시한다 |
| k6 | 초당 요청 수를 고정한 부하를 보내 응답시간과 실패율을 측정한다 |
| Docker Restart Policy | 비정상 종료된 app 컨테이너를 자동으로 다시 실행한다 |
| Nginx | app 하나가 실패하면 정상 app으로 요청을 우회한다 (5주차와 동일) |

## 한 문장 요약

> 장애를 **복구하는 주체**(Nginx, Docker)와 **관측하는 주체**(Prometheus, Grafana)는 완전히 분리되어 있다.
> Prometheus를 꺼도 서비스는 똑같이 복구되고, 다만 무슨 일이 있었는지 아무도 모르게 될 뿐이다.

## 성공 기준

- Prometheus가 app1·app2의 지표를 각각 수집한다.
- Grafana에서 요청량·응답시간·JVM·DB 상태를 확인할 수 있다.
- k6로 같은 조건의 시험을 반복할 수 있다.
- app1 장애가 Prometheus와 Grafana에 나타난다.
- app1 장애 중에도 Nginx가 app2로 요청을 전달한다.
- Docker가 비정상 종료된 app1을 다시 실행한다.
- app1 복구 후 두 앱이 다시 요청을 나누어 처리한다.
- Grafana 경고가 장애 발생과 복구 상태에 맞게 변한다.
- 장애 전·중·후의 응답시간과 실패율을 비교해 기록한다.
