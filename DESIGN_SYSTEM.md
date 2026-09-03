# Night Drive — 디자인 시스템

PLAN.md의 "격자가 어긋나지 않는다" 원칙을 **토큰과 컴포넌트 규약**으로 고정한 문서.
캔버스 안의 월드 요소와 캔버스 밖의 DOM UI(설정 패널 등) 모두 이 시스템을 따른다.

---

## 0. 원칙

1. **1px = 1 world unit.** 모든 치수는 320×180 백버퍼 기준 정수. CSS px는 배율(`scale`)을 곱해 파생될 뿐, 직접 지정하지 않는다.
2. **색은 인덱스다.** 스프라이트·코드·문서 어디에도 hex를 쓰지 않는다. 팔레트 이름과 램프 단계(`sky.3`, `road.1`)로 참조한다.
3. **그라데이션은 디더다.** 알파, 블러, 그림자 오프셋(box-shadow) 금지. 밝기 차이는 램프 단계 + 베이어 패턴.
4. **움직임은 프레임이다.** 이징 곡선 대신 프레임 시퀀스와 고정 60Hz 틱 수로 정의한다.
5. **DOM UI도 같은 격자.** 설정 패널의 폰트·여백·테두리는 `scale`의 정수 배수만 허용.

---

## 1. 디자인 토큰

### 1.1 격자 (Grid)

| 토큰 | 값 | 설명 |
|---|---|---|
| `grid.base.w` / `grid.base.h` | 480 / 270 | 백버퍼 해상도 (2026-09-03에 320×180에서 상향; 코드의 `K = W/320` 배율로 레이아웃 파생) |
| `grid.scale` | `floor(min(vw/480, vh/270))`, 최소 1 | 정수 업스케일 배율. 런타임 계산 |
| `grid.unit` | 1 | 최소 단위(px). 반 픽셀 없음 |
| `grid.tile` | 8 | 스프라이트·UI 정렬 기준. 대부분의 프롭은 8의 배수 폭 |
| `grid.safe` | 상 8 / 하 0 / 좌우 16 | 미러·필러가 가리지 않는 영역. 광고 오버레이는 반드시 이 안 |

### 1.2 색 (Palette)

전체 팔레트는 **64색 인덱스**. 0번은 투명. 램프(ramp)는 어두움 → 밝음 순서로 4~6단계.

| 램프 | 단계 | 용도 |
|---|---|---|
| `sky` | 6 | 하늘 그라데이션, 은하 코어 |
| `star` | 3 | 별(원/근/반짝임) |
| `far` | 4 | 원경 산·스카이라인 실루엣 |
| `road` | 4 | 노면(어두운/밝은 밴드 교대) |
| `lane` | 2 | 차선, 갓길 흰선 |
| `rumble` | 2 | 갓길 적백 줄무늬 |
| `veg` | 4 | 나무, 논, 풀 |
| `struct` | 5 | 건물, 전봇대, 가드레일, 기둥 |
| `glass` | 4 | 건물 창(꺼짐/켜짐 2단계 포함) |
| `light.warm` | 4 | 전조등, 가로등, 계기판 주황 |
| `light.cool` | 3 | 네온, 형광등, LED 흰색 |
| `tail` | 3 | 미등, 브레이크등 |
| `neon.a` / `neon.b` | 3 / 3 | 도시 간판 두 계열(핑크·시안 등) |
| `cockpit` | 5 | 대시보드, 핸들, 필러 |
| `gauge` | 3 | 계기판 눈금·바늘 |
| `ad.frame` | 3 | 광고 슬롯 프레임 |
| `ui` | 5 | DOM UI 배경/테두리/텍스트 |

**시간대 프리셋**은 램프의 실제 RGB만 바꾼다. 인덱스와 단계 수는 불변.

| 프리셋 | 특징 |
|---|---|
| `day` | `sky` 파랑 계열, `light.*` 거의 노면과 동일 명도(꺼진 상태처럼 보임), `glass` 반사 톤 |
| `dusk` | `sky` 주황→보라, `far` 채도 낮은 자주, `light.warm` 켜지기 시작 |
| `night` | `sky` 남색→검정, `star` 활성, `light.*`·`tail`·`neon.*` 최대 명도, `road` 전체 1단계 어둡게 |

**조명 시프트 테이블**: 전조등 원뿔·가로등 아래는 픽셀의 램프 단계를 `+1` 올린다(램프 끝이면 유지). 알파 블렌딩 대신 이 규칙만 쓴다.

### 1.3 디더 (Dither)

| 토큰 | 패턴 | 용도 |
|---|---|---|
| `dither.0` | 0% | 단색 |
| `dither.25` | 베이어 4×4, 25% | 하늘 밴드 경계, 안개 시작 |
| `dither.50` | 체커보드 | 밴드 중간, 유리 반사 |
| `dither.75` | 베이어 4×4, 75% | 밴드 끝 |

두 램프 단계 사이는 항상 `25 → 50 → 75` 세 밴드를 거친다. 밴드 높이는 최소 2px.

### 1.4 스케일 단계 (Depth Scale)

원근 표현용. 스프라이트는 아래 단계로만 존재한다.

| 토큰 | 배율 | 세그먼트 거리(대략) |
|---|---|---|
| `depth.0` | 1/8 | 지평선 부근. 1~3px 점 |
| `depth.1` | 1/4 | 원거리 |
| `depth.2` | 1/2 | 중거리 |
| `depth.3` | 1 | 기준 크기(원본 스프라이트) |
| `depth.4` | 2 | 통과 직전. 화면 밖으로 잘림 |

원본은 `depth.3`으로 제작. `depth.0~2`는 빌드 시 최근접 축소 후 손보정, `depth.4`는 최근접 확대(추가 작업 없음).

> **구현 메모(M2)**: 현재 구현은 이산 단계 대신 **정수 목적 크기로의 최근접 리샘플**(`blitScaled`)을 쓴다. 출력 픽셀은 항상 정수 위치의 온전한 픽셀이므로 격자는 유지되며, 단계별 손보정 스프라이트는 나중에 `depth.*` 캐시로 교체할 수 있다.

### 1.5 타이포그래피

| 토큰 | 값 | 용도 |
|---|---|---|
| `font.pixel` | 5×7 비트맵(자체 제작 또는 오픈 픽셀 폰트) | 계기판 숫자, 표지판, 캔버스 내 텍스트 |
| `font.ui` | 픽셀 폰트 웹폰트(예: "Silkscreen", "Press Start 2P" 계열) | DOM 설정 패널 |
| `font.ui.size` | `8 * scale` px | DOM UI 본문. 다른 크기 없음 |
| `font.ui.size.lg` | `16 * scale` px | DOM UI 제목(2배만 허용) |
| `font.ko` | 한글 비트맵(둥근모꼴 등, 라이선스 확인) | 현수막·표지판 한글 |

캔버스 내 텍스트는 `font.pixel`을 정수 위치에 블릿. 브라우저 텍스트 렌더링을 캔버스에 쓰지 않는다.

### 1.6 간격 (Spacing)

백버퍼 px 기준. DOM에서는 `× scale`.

| 토큰 | 값 | 용도 |
|---|---|---|
| `space.1` | 1 | 테두리, 픽셀 줄 |
| `space.2` | 2 | 텍스트와 테두리 사이 |
| `space.4` | 4 | UI 내부 여백, 버튼 패딩 |
| `space.8` | 8 | 요소 간 간격 |
| `space.16` | 16 | 패널 외곽 여백 |

### 1.7 테두리 & 고도 (Border / Elevation)

| 토큰 | 값 |
|---|---|
| `border.w` | 1 (배율 곱) |
| `border.radius` | 0. 모서리를 둥글게 보이려면 코너 1px을 비우는 "픽셀 라운드"만 허용 |
| `elev.0` | 없음 |
| `elev.1` | 우하단 1px 어두운 램프(`ui.0`) 오프셋 |
| `elev.2` | 우하단 2px + 체커 디더 |

CSS `box-shadow`, `filter`, `opacity` 사용 금지.

### 1.8 모션 (Motion)

고정 60Hz 틱. 프레임 애니메이션은 `hold` 틱 수로 정의.

| 토큰 | 값 | 용도 |
|---|---|---|
| `motion.blink` | 30틱 on / 30틱 off | 경고등, 커서 |
| `motion.neonFlicker` | [12, 2, 6, 1] 틱 시퀀스 랜덤 | 네온 깜빡임 |
| `motion.bannerWave` | 3프레임, 10틱 hold | 현수막 흔들림 |
| `motion.wheelStep` | 커브 변화당 1단계, 4틱 hold | 핸들 회전 |
| `motion.needle` | 목표 프레임까지 1틱에 1단계 | 계기판 바늘 |
| `motion.uiOpen` | 4프레임 슬라이드(4px씩), 2틱 hold | 설정 패널 |
| `motion.speed.cruise` | 세그먼트/틱 상수 | 기본 주행 속도 |

이징 함수 없음. "부드러움"은 프레임 수로 조절한다.

---

## 2. 컴포넌트

### 2.1 캔버스 월드 컴포넌트

#### Prop (도로변 오브젝트)

| 속성 | 타입 | 기본 | 설명 |
|---|---|---|---|
| `sprite` | `SpriteId` | — | `depth.3` 기준 원본 |
| `anchor` | `'bottom-center'` | 고정 | 노면 접점 |
| `side` | `'left' \| 'right' \| 'both'` | — | 배치 면 |
| `offset` | int | 0 | 갓길로부터 거리(px) |
| `lit` | `LightSource?` | null | 밤에 주변 시프트 반경 |
| `frames` | `Frame[]?` | — | 애니메이션 |

변형: `lamp`, `pole`, `tree.{pine,broad,palm}`, `sign.{speed,exit,warn}`, `building.{low,mid,tower}`, `guardrail`, `wall`, `overpass`, `busStop`, `field`
상태: `depth.0~4` 5단계 + `lit/unlit`

#### Vehicle

| 속성 | 타입 | 설명 |
|---|---|---|
| `kind` | `sedan \| hatch \| van \| truck \| bus` | 5종 |
| `view` | `rear \| front \| rearL \| rearR` | 후면·전면·약간 옆 |
| `lights` | `{ head, tail, brake, signalL, signalR }` | 각각 램프 단계 인덱스 |
| `adSurface` | `AdSurface?` | `van`, `bus`, `truck`만 |

상태: `cruise`, `braking`(`tail` +1단계), `signaling`(`motion.blink`), `passing`

#### AdSurface

| 속성 | 타입 | 설명 |
|---|---|---|
| `kind` | `billboard \| banner \| neon \| busSide \| gantry` | |
| `slot` | `{w, h}` | 슬롯 내부 픽셀. 표준: `48×24`(2:1), `48×16`(3:1), `40×32`(1.25:1) |
| `frame` | `SpriteId` | 프레임 스프라이트. `ad.frame` 램프 사용 |
| `provider` | `self \| overlay \| empty` | 소재 출처 |
| `content` | `IndexBuffer \| null` | `self`일 때 픽셀화된 소재 |

상태

| 상태 | 시각 | 동작 |
|---|---|---|
| `empty` | 프레임 안 `struct.1` 단색 + "AD" 픽셀 텍스트 없음(빈 간판처럼) | 클릭 없음 |
| `loaded` | 픽셀화 소재 | 스크린 사각형 히트테스트 → 링크 |
| `overlay-armed` | 프레임만 캔버스, 내부는 `ui.0` 단색 | 화면 도달 시 DOM 광고 겹침 |
| `overlay-active` | 위와 동일, 정지 위치 고정 | DOM 요소 `visible`. 캔버스 요소가 위를 덮지 않음 |
| `lit` (밤) | 상단 조명 스프라이트 + 슬롯 상단 2px `+1` 시프트 | |

Do / Don't
- ✅ 슬롯 크기는 표준 3종만. 새 비율이 필요하면 토큰에 추가
- ✅ 오버레이 슬롯은 `grid.safe` 안에만
- ❌ 오버레이 위에 미러, 필러, 와이퍼, 안개 디더를 그리지 않는다
- ❌ 네트워크 광고 소재를 `pixelize`에 통과시키지 않는다

#### Cockpit

| 하위 컴포넌트 | 프레임 수 | 상태 |
|---|---|---|
| `dashboard` | 1 | `day`(무광) / `night`(계기 백라이트 `light.warm.2`) |
| `gauge.speed` | 24 | 바늘 프레임 = `round(speed / max * 23)` |
| `gauge.rpm` | 24 | 동일 |
| `warningLights` | 2 (on/off) | `motion.blink` |
| `wheel` | 15 (−7..+7) | `motion.wheelStep` |
| `mirror.rear` | 동적 | 후방 렌더 버퍼 `64×20` 반전 블릿 |
| `mirror.side` | 동적 | `32×16` |
| `pillar.left/right` | 1 | 고정 |

#### Sky

| 속성 | 설명 |
|---|---|
| `preset` | `day \| dusk \| night` |
| `stars` | 시드 기반 좌표, `star` 램프, 반짝임은 `motion.blink` 비동기 오프셋 |
| `galaxy` | 밤 전용 대형 스프라이트(`sky` 램프 + `star` 램프), 시차 계수 0.02 |
| `sun/moon` | 원형 디더 스프라이트 |

### 2.2 DOM UI 컴포넌트

DOM은 최소한만: 설정 패널, 토글 버튼, 광고 오버레이 컨테이너, 정책 링크.

#### Button

| 속성 | 타입 | 기본 |
|---|---|---|
| `variant` | `primary \| ghost` | `ghost` |
| `size` | `md`만 | — |
| `icon` | 픽셀 아이콘(8×8) 선택 | — |

| 상태 | 시각 |
|---|---|
| default | `ui.1` 배경, `ui.3` 테두리, `ui.4` 텍스트 |
| hover | 테두리 `ui.4` |
| active | 배경 `ui.0`, 1px 우하단 이동(`elev.1` 제거) |
| focus | 바깥 1px `light.warm.3` 점선(픽셀 패턴) |
| disabled | 텍스트 `ui.2`, 체커 디더 오버레이 |

접근성: `<button>`, 키보드 Tab/Enter/Space 기본, 아이콘 전용이면 `aria-label`.

#### SegmentedControl (시간대/지역 선택)

- 옵션 2~4개, 하나만 선택. `role="radiogroup"`, 방향키 이동
- 선택된 옵션은 `primary` Button 시각, 나머지 `ghost`
- 옵션 사이 간격 0(테두리 공유), 바깥 `border.w`

#### Slider (속도, 시드)

- 네이티브 `<input type="range">`에 스타일 오버라이드. 트랙 `ui.1`, 썸 8×8 `ui.4`
- 값 표시는 `font.ui` 숫자, 우측 정렬
- 시드는 숫자 입력 + "🎲" 버튼(무작위)

#### Panel (설정)

- 우상단 `space.16` 여백. 폭 `96 * scale`px
- 배경 `ui.0`, 테두리 `ui.3`, `elev.2`
- 열림/닫힘 `motion.uiOpen`. `Esc`로 닫힘
- 유휴 5초 후 토글 버튼 페이드 대신 **숨김**(opacity 금지) — 마우스 이동 시 재표시

#### AdOverlay

- `position: absolute`, 좌표·크기는 매 프레임 캔버스 슬롯 사각형 × `scale`로 동기화
- 내부는 광고 네트워크 iframe 원본. 스타일 변형 없음
- 광고 없음 상태에서는 `display: none`(캔버스 슬롯은 `empty` 상태로 렌더)

---

## 3. 패턴

### 3.1 설정 → URL → 렌더

```
Panel 변경 → state → URL 쿼리 갱신(replaceState) → localStorage → world.rebuild(seed, biome) / palette.apply(time)
```
바이옴 변경은 즉시 재생성이 아니라 **전환 청크**를 앞에 삽입해 자연스럽게 바뀐다.

### 3.2 광고 슬롯 배치 리듬

| 바이옴 | billboard | banner | neon | gantry | 최소 간격 |
|---|---|---|---|---|---|
| 시골 | 낮음 | 중간 | 없음 | 매우 낮음 | 60 세그먼트 |
| 도시 | 중간 | 낮음 | 높음 | 낮음 | 30 세그먼트 |

오버레이 슬롯은 **화면에 동시에 1개**. 오버레이 활성 중에는 다른 슬롯이 `empty`로 강등된다.

### 3.3 피드백

캔버스 세계는 토스트나 모달을 쓰지 않는다. 상태 변화는 세계 안에서 표현한다.
- 설정 변경: 계기판 경고등 1회 깜빡임
- 로딩: 검은 화면 + 계기판만 켜진 상태 → 전조등 점등 → 세계 등장
- 오류(에셋 실패): 표지판 프롭에 "!" 픽셀 텍스트

### 3.4 반응형

| 조건 | 처리 |
|---|---|
| `scale ≥ 3` | 정상 |
| `scale == 2` | UI 폰트 `font.ui.size` 그대로(16px), 패널 폭 축소 |
| `scale == 1` 또는 세로 화면 | 백버퍼 `240×135` 폴백, 콕핏 하단 부분 잘라냄, 설정 패널 하단 시트로 |

---

## 4. 파일 규약

```
public/palettes/base.json        # 64색 인덱스 → 램프 이름/단계 매핑
public/palettes/day.json         # 램프별 RGB
public/palettes/dusk.json
public/palettes/night.json
public/sprites/<group>/<name>.aseprite  # 원본
public/sprites/<group>.png + .json      # 빌드 산출물(depth 단계 포함)
src/tokens.ts                    # 이 문서의 토큰을 상수로. 문서와 1:1
```

`tokens.ts`와 이 문서가 어긋나면 문서가 아니라 코드를 고친다.

---

## 5. 열린 질문

1. 팔레트 64색이 낮·노을·밤 셋을 다 커버하는지 — 램프별 RGB만 바꾸는 방식이라 가능하지만, 밤의 네온 대비가 부족하면 `neon.*`를 4단계로 늘려야 할 수 있음
2. 한글 비트맵 폰트 선택(둥근모꼴은 무료지만 라이선스 표기 필요). 영어 표지판만으로 시작할지
3. 오버레이 슬롯 크기를 `300×250`에 맞출지 `320×100`에 맞출지 — 배율 4 기준 `80×62` vs `80×25`. 전광판 비율상 전자, 육교 간판은 후자
4. 콕핏 좌·우핸들 결정에 따라 `grid.safe` 좌우 값이 비대칭이 됨
