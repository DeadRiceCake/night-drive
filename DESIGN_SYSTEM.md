# Night Drive — 디자인 시스템 (v2, 3D Night City)

v1의 픽셀 격자·팔레트 규약은 폐기했다. v2는 **대기(atmosphere) 토큰 + 구역 프리셋 + 발광 규약**으로 "나이트시티 룩"을 고정한다. 값은 모두 `src/tokens.ts`와 `src/city/generator.ts`에 있다.

---

## 1. 색

| 토큰 | 값 | 용도 |
|---|---|---|
| `yellow` | `#fcee0a` | HUD·UI 강조, 브랜드 크라운, 주행 클러스터 숫자 |
| `cyan` | `#37ebf3` | HUD 보조, 네온, 콕핏 인테리어 스트립 |
| `magenta` | `#ff2a6d` | 네온, 홀로그램 |
| `red` / `arasakaRed` | `#ff003c` / `#ff1a2b` | 항공장애등, 미등, 아라사카 |
| `sodium` | `#ff9a3c` | 공업·저소득 구역 가로등, 고가 방음벽 마커 |
| `warmWindow` / `coolWindow` | `#ffd28a` / `#9fd8ff` | 창문 두 계열 (건물마다 주조 하나 + 15% 반대색) |
| `pink` `violet` `green` `gold` | | 구역별 네온 팔레트 |

DOM UI 색: `--ink #06070b`, `--ink-2 #111219`, `--ink-3 #2a2c38`, `--text #e9eaf0`, `--muted #8d90a3`. 폰트는 Rajdhani(CP2077 UI 서체 계열). 패널·버튼 모서리는 `clip-path`로 한쪽을 깎는다.

## 2. 대기 (시간대 프리셋)

| 항목 | night | dusk | day |
|---|---|---|---|
| 안개색 | `#1a1026` | `#4b2a3d` | `#b9b2a8` |
| 안개 밀도 | 0.0012 | 0.0009 | 0.00075 |
| 하늘 상단/수평선/글로우 | `#05040f` / `#3a1a3c` / `#7a2c60` | `#1a1440` / `#ff7a3c` / `#ff4a6a` | `#3f7fd6` / `#c8bfae` / `#e8dcc0` |
| 앰비언트 | `#342c4c` | `#4a3a58` | `#8a8ea0` |
| 태양 강도 | 0.18 | 0.6 | 1.0 |
| 발광 계수 `lights` | 1 | 0.75 | 0.12 |
| 블룸 강도 | 0.6 | 0.6 | 0.25 |

- 안개는 **높이 의존**: `density × (0.3 + 0.7·exp(−(y−20)/260))`. 스모그는 낮게 깔리고 초고층은 멀리서도 보인다.
- 원거리 안개색은 수평선 글로우로 기운다(광해). 
- 날씨: `rain`은 밀도 ×1.35 + 젖음 1.0 + 빗줄기 + 유리창 굴절, `fog`는 밀도 ×2.1.

## 3. 발광 규약 (블룸 임계값 0.95, 선형)

| 요소 | 세기(선형, 밤) | 비고 |
|---|---|---|
| 창문 | 0.2 ~ 0.9 | 대부분 임계값 아래. 번지지 않는다 |
| 네온 스트립(건물 테두리) | ~1.9 | 번짐 |
| 간판 | 1.8 ~ 2.8 × 텍스처 | 번짐. 15%는 깜빡임 |
| 홀로그램 | 1.3 ~ 1.6, 가산 합성, 알파 0.55 | 스캔라인 + 세로 스크롤 |
| 브랜드 크라운 | 2.4 ~ 3.0 | 옥상 로고 |
| 가로등·미등·전조등 | 포인트 스프라이트 | 전조등 4.2, 미등 바 3점 |
| 항공장애등 | 빨강, 0.6 ~ 1.2 Hz 점멸 | 70 m 이상 건물 |

## 4. 구역 프리셋 요약

| 구역 | 블록/도로 | 높이 | 창 점등 | 네온색 | 간판 언어 | 가로등 |
|---|---|---|---|---|---|---|
| Corpo Plaza | 130/34 | 90–280 (30% ×1.7) | 0.30 | cyan, white, red | en | white |
| Downtown | 84/24 | 45–230 | 0.45 | cyan, magenta, yellow, pink | en, jp | white |
| Little China | 72/18 | 18–62 | 0.40 | red, orange, yellow | cn | sodium |
| Kabuki | 62/15 | 12–44 | 0.45 | cyan, magenta, pink | jp | sodium |
| Northside / Waterfront | 120–130/26 | 10–34 | 0.20 | orange, arasaka red | en | sodium |
| Japantown | 68/17 | 24–95 | 0.45 | pink, magenta, red | jp | pink-white |
| Charter Hill | 140/36 | 60–210 | 0.40 | white, gold | en | white |
| North Oak | 220/40 | 7–16 (저택) | 0.50 | gold | — | warm |
| Wellsprings / Glen | 84–96/22 | 14–95 | 0.40 | cyan, green, white | en | white |
| Vista del Rey | 70/16 | 8–30 | 0.38 | yellow, orange | en | sodium |
| Arroyo | 140/28 | 12–42 | 0.28 | orange | en | sodium |
| Rancho Coronado | 64/14 | 5–9 (주택) | 0.35 | — | — | sodium |
| Coastview / West Wind | 92–104/22 | 14–120 (미완성) | 0.06–0.26 | violet | en | 없음/sodium |

건물 셰이더 스타일: `glass`(기업 유리), `residential`(콘크리트·발코니 슬래브·1층 상점), `industrial`, `unfinished`(골조), `mega`(촘촘한 창 + 띠조명), `house`, `arasaka`(검은 모놀리스 + 붉은 홈), `luxury`(수평 띠창).

## 5. 치수

| 항목 | 값 |
|---|---|
| 눈높이 | 1.18 m, 차선 오프셋 3.4 m(우측통행), 룩어헤드 14 m |
| 도로 반폭 | 시가지 7.5 m(2+2차선), 고속도로 9 m, 고가 높이 12 m |
| 루트 코리도 | 26 m 반폭 내 건물 없음 |
| 속도 | 시가지 21 m/s, 고속도로 31 m/s × 설정 배율 |
| 카메라 | FOV 68°(세로 화면 80°), near 0.1, far 6000 |
| 인스턴스 예산 | 건물 ≤ 10k, 간판 ≤ 5k, 발광 포인트 ≤ 30k, 차량 80, AV 40, 보행자 420 |
