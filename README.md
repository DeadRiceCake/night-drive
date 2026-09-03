# Night Drive

끝없이 달리는 1인칭 픽셀 드라이브. 모든 그래픽은 480×270 인덱스 프레임버퍼 하나에 소프트웨어로 그려지고 정수 배율로만 확대되므로 픽셀 격자가 절대 어긋나지 않습니다.

- 시간대: 낮 / 노을 / 밤 / 자동(현재 시각)
- 지역: 시골 / 도시 / 고속도로 / 혼합
- 시드 기반 무작위 풍경. URL을 공유하면 같은 풍경이 나옵니다.
- 길가의 전광판·현수막·트럭 뒷면은 광고 슬롯입니다.

## 실행

```bash
npm install
npm run dev
```

`npm run build`로 `dist/`에 정적 파일이 생성됩니다. `main` 브랜치에 푸시하면 GitHub Pages로 배포됩니다(저장소 설정에서 Pages 소스를 "GitHub Actions"로 지정).

## URL 파라미터

| 파라미터 | 값 |
|---|---|
| `time` | `day` `dusk` `night` `auto`(현재 시각) `cycle`(4분 주기 순환) |
| `scene` | `countryside` `city` `highway` `mixed` |
| `weather` | `clear` `rain` `fog` |
| `seed` | 정수 |
| `speed` | 0.4 ~ 1.8 |
| `sound` | `1` (엔진·노면·빗소리, 첫 클릭 후 재생) |
| `crt` | `1` |
| `ads` | `0` (광고 끄기) |
| `debug` | `1` (FPS, 세그먼트, 바이옴 표시) |

세로 화면(휴대폰)에서는 무대 전체가 정확히 90° 회전되어 가로로 표시됩니다.

## 광고

### 자체 광고 (캔버스 안에 완전히 통합)

`public/ads/manifest.json`에 광고를 나열합니다. 이미지는 슬롯 크기로 리샘플된 뒤 팔레트로 양자화·디더링되어 픽셀 세계에 녹아듭니다.

```json
{ "id": "coffee", "kind": "image", "src": "ads/coffee.svg", "url": "https://...", "weight": 2 }
{ "id": "motel",  "kind": "text",  "text": "MOTEL\n24H", "bg": "lightWarm", "fg": "mono", "url": "https://...", "weight": 1 }
```

전광판·현수막·트럭 뒷면에 무작위 배치되고, 클릭하면 `url`이 새 탭으로 열립니다. 텍스트 광고의 `bg`/`fg`는 팔레트 램프 이름(`tail`, `carB`, `carC`, `veg`, `struct`, `lightWarm`, `neonA`, `mono` 등)입니다. 기본 매니페스트에는 유튜브·구글·테슬라·엔비디아·애플로 연결되는 텍스트 광고 5개가 들어 있습니다.

### 네트워크 광고 (AdSense)

AdSense 소재는 정책상 변형할 수 없으므로 캔버스에 그리지 않습니다. 대신 도시 구간의 "광고 벽" 섹션에서 화면 우측에 픽셀로 그린 전광판 프레임이 나타나고, 그 안쪽 사각형에 원본 광고 iframe이 DOM으로 겹쳐집니다.

`src/ads/overlay.ts`의 `ADSENSE.client`와 `ADSENSE.slot`을 채우고 `public/ads.txt`를 갱신하세요. 비어 있으면 자리 표시자가 나옵니다.

## 구조

- `src/core` — 프레임버퍼, 팔레트, 스프라이트, 폰트, 루프
- `src/road` — 세그먼트 생성기, 스캔라인 투영/렌더, 야간 조명
- `src/world` — 하늘, 원경, 프롭 스프라이트, 바이옴 생성기, 교통, 월드 스트리밍
- `src/cockpit` — 대시보드, 계기판, 핸들, 미러
- `src/ads` — 픽셀화, 자체 광고 레지스트리, DOM 오버레이
- `src/ui` — 설정 패널

설계 문서: [PLAN.md](PLAN.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
