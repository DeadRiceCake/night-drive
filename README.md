# Night Drive — Night City

브라우저에서 운전석 시점으로 **나이트시티**(Cyberpunk 2077의 도시를 베이스로 절차 생성한 하나의 거대한 맵)를 끝없이 달리는 3D 웹사이트. three.js로 렌더링하며 외부 모델·텍스처 없이 전부 코드로 만든다.

- 하나의 맵: 코포 플라자 → 다운타운 → 리틀차이나 → 카부키 → 노스사이드 → 아라사카 워터프런트 → 재팬타운 → 차터힐 → 노스오크 → 아로요 → 란초 코로나도 → 배드랜즈 → 비스타 델 레이 → 더 글렌 → 웨스트 윈드 → 퍼시피카 → 웰스프링스 → 코포 플라자, 약 22 km 순환 루트
- 랜드마크: 아라사카 타워, 코포 플라자 메모리얼과 기업 타워들, 곤페키 플라자, 메가빌딩 H10/H8, 카부키 시장, 퍼시피카 스타디움과 그랜드 임페리얼 몰, 아로요 발전소, 아라사카 저택, 고가 순환 고속도로
- 시간대(낮/노을/밤/자동/순환), 날씨(맑음/비/스모그), 속도, 시드
- 길가의 전광판·홀로그램은 광고 슬롯. 자체 광고는 매니페스트로, AdSense는 DOM 오버레이로 붙는다.
- v2.1: 부팅 시 캔버스로 그리는 외벽·노면·콕핏 텍스처(노멀·러프니스 포함), 가로등·네온·헤드라이트 동적 광원, 보도·격자 도로, 구역 경계 블렌딩, 미니맵과 다음 구역 안내

라이브: https://deadricecake.github.io/night-drive/

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: 지도·루트·PRNG
npm run build      # dist/
```

`main` 브랜치에 푸시하면 GitHub Actions가 GitHub Pages로 배포한다.

## URL 파라미터

| 파라미터 | 값 |
|---|---|
| `time` | `night`(기본) `dusk` `day` `auto`(현재 시각) `cycle`(4.5분 주기) |
| `weather` | `clear` `rain` `fog` |
| `at` | 구역 id로 시작 위치 지정: `corpo` `downtown` `littlechina` `kabuki` `northside` `waterfront` `japantown` `charterhill` `northoak` `wellsprings` `glen` `vistadelrey` `arroyo` `rancho` `coastview` `westwind` |
| `seed` | 정수. 같은 시드 = 같은 도시 디테일 |
| `quality` | `high` `low`. 기본은 기기 판별(모바일 → low). low는 DPR 1.0·광원 절반·블룸 절반 해상도. 어느 티어든 FPS가 30 아래로 떨어지면 해상도를 자동으로 낮춘다 |
| `speed` | 0.3 ~ 2 |
| `sound` | `1` (엔진·노면·빗소리, 첫 클릭 후) |
| `fx` | `0` (블룸·필름 효과 끄기) |
| `ads` | `0` (광고 끄기) |
| `debug` | `1` (FPS, 루트 위치, 구역) |

설정 패널(상단 가운데 버튼)에서 같은 것을 바꿀 수 있고, "구역으로 이동"으로 어느 구역이든 바로 워프한다.

## 검증용 스크린샷

헤드리스 Edge(SwiftShader WebGL)로 구역별 스크린샷을 찍는다. 개발 서버를 띄운 뒤:

```bash
node scripts/shot.mjs "http://localhost:5173/?debug=1" shots corpo,downtown,kabuki,japantown,northside,badlands
```

`click:<selector>`(예: `click:.ui-toggle`)로 UI를 열고 찍을 수도 있다.

## 광고

### 자체 광고

`public/ads/manifest.json`의 항목이 아틀라스 슬롯에 그려져 길가 전광판에 붙는다. 이미지(`kind: "image"`, `src`)와 텍스트(`kind: "text"`, `text`, `bg`, `fg`) 모두 지원하며, 클릭하면 `url`이 새 탭으로 열린다.

### 네트워크 광고 (AdSense)

다운타운 진입 구간을 지나는 동안 화면 우측 상단에 300×250 DOM 슬롯이 나타난다. `src/city/ads.ts`의 `AdOverlay.client`/`slot`을 채우고 `public/ads.txt`를 갱신한다. 비어 있으면 자리 표시자가 나온다.

## 구조

```
src/
  main.ts            부트스트랩, 주행 루프, HUD, 설정 연결
  tokens.ts          색·대기(안개/하늘/조명)·주행 상수
  city/
    map.ts           구역 사각형, 해안선, 지형 높이
    route.ts         경유점 → 스플라인 → 2 m 샘플(위치·접선·고도·구역·도로 종류)
    generator.ts     구역 프리셋으로 건물·간판·홀로·프롭·주차 차량·육교 배치
    landmarks.ts     아라사카 타워, 기업 타워, 메가빌딩, 스타디움, 발전소, 저택
    buildings.ts     단일 InstancedMesh + 창문/네온/외벽을 그리는 셰이더
    signs.ts         간판·홀로그램 아틀라스(캔버스), 간판 인스턴스, 발광 포인트
    props.ts         가로등·안테나·컨테이너·크레인·야자수·풍력·가판대… 인스턴스 지오메트리
    roads.ts         도로 리본 셰이더(차선·젖은 반사), 고가 구조, 지형, 바다
    sky.ts           하늘 돔 셰이더
    traffic.ts       차량·AV(에어로다인)와 그 조명
    peds.ts          보행자
    ads.ts           자체 광고 슬롯·클릭, AdSense 오버레이
  cockpit/cockpit.ts 대시보드·핸들·백밀러(렌더타깃)·클러스터
  fx/post.ts         블룸 + 색보정/비네트/색수차/그레인
  fx/weather.ts      비
  ui/settings.ts     설정 패널
  audio.ts           절차 생성 엔진·노면·빗소리
scripts/shot.mjs     스크린샷 검증 도구
```

설계 문서: [PLAN.md](PLAN.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
