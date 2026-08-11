# Active Liveness 기술 개념 및 현재 구현 문서

이 문서는 현재 `grabticket-v1-front`에 구현된 Active Liveness 프로토타입을 이해하기 위한 기술 정리다. 목적은 "왜 이 지표가 필요한지", "현재 코드가 어떤 순서로 사람 여부를 판단하는지", "왜 아직 잘못 통과/실패할 수 있는지"를 학습 가능하게 설명하는 것이다.

현재 구현 파일:

- `src/components/ActiveLivenessPrototype.tsx`

## 1. Liveness란 무엇인가

Liveness는 카메라 앞의 대상이 단순한 얼굴 이미지, 녹화 영상, 마스크, 합성 이미지가 아니라 "현재 카메라 앞에 있는 실제 사람"인지 확인하는 기술이다.

얼굴 인증은 크게 두 가지 질문으로 나뉜다.

| 질문 | 의미 | 예시 |
| --- | --- | --- |
| 신원 확인 | 이 사람이 등록된 그 사람인가? | 얼굴 임베딩 비교, Face ID 매칭 |
| 생체/실재성 확인 | 이 입력이 실제 살아있는 사람에게서 온 것인가? | 눈 깜빡임, 고개 회전, 깊이, 반사, 화면 재촬영 탐지 |

현재 프로토타입은 신원 확인을 하지 않는다. 등록된 사용자 DB, 얼굴 임베딩, 백엔드 매칭은 없다. 오직 카메라 프레임 안의 얼굴이 지정된 동작을 수행하는지 보는 Active Liveness UI/UX 프로토타입이다.

## 2. Passive Liveness와 Active Liveness

### Passive Liveness

사용자에게 별도 행동을 요구하지 않고, 한 장 또는 짧은 영상에서 실제 사람 여부를 판단한다.

주요 신호:

- 피부 질감
- 얼굴 깊이감
- 조명 반사
- 화면 재촬영 패턴
- 인쇄물/디스플레이 경계
- 카메라 센서 노이즈

장점은 UX가 편하다는 것이다. 단점은 고품질 합성 이미지, 딥페이크, 화면 재촬영 공격에 대응하려면 별도 학습 모델과 데이터셋이 필요하다는 점이다.

### Active Liveness

사용자에게 특정 행동을 요구하고, 얼굴 랜드마크가 그 행동에 맞게 변하는지 확인한다.

현재 구현의 챌린지:

1. 정면 유지 + 눈 깜빡임
2. 오른쪽 회전
3. 왼쪽 회전
4. 고개 숙이기
5. 고개 들기
6. PASS

장점은 구현이 비교적 명확하고 사용자에게 검증 과정을 설명하기 쉽다는 것이다. 단점은 랜드마크 기반 휴리스틱만으로는 고급 spoofing, 화면 재생, 영상 주입, 3D 마스크 등을 완전히 막을 수 없다는 점이다.

## 3. 현재 구현의 큰 구조

현재 프로토타입은 브라우저에서만 동작한다.

구성 요소:

| 구성 | 역할 |
| --- | --- |
| `getUserMedia` | 전면 카메라 스트림 획득 |
| MediaPipe `FaceLandmarker` | 얼굴 랜드마크 추출 |
| Canvas | 방향 안내 화살표, 랜드마크/벡터 시각화, 내부 픽셀 샘플링 |
| React state/ref | 현재 스텝, hold 타이머, 점수, 오류 메시지 관리 |
| 휴리스틱 계산 | yaw, pitch, EAR, 조명, 가림, 품질 점수 계산 |

중요한 점은 이 구현이 "AI가 최종 판정을 내리는 구조"가 아니라는 것이다. MediaPipe는 얼굴 랜드마크를 제공하고, 실제 통과/실패 판단은 코드에 작성된 수식과 임계값으로 한다.

## 4. MediaPipe Face Landmarker의 역할

MediaPipe Face Landmarker는 얼굴의 여러 지점 좌표를 반환한다. 좌표는 보통 정규화된 값이다.

- `x`: 화면 가로 위치, 대략 0~1
- `y`: 화면 세로 위치, 대략 0~1
- 각 index는 눈, 코, 입, 얼굴 윤곽 등 특정 얼굴 부위에 대응

예시:

| 랜드마크 | 현재 사용 index | 역할 |
| --- | --- | --- |
| 왼쪽 눈 바깥 | `33` | 눈 너비, EAR 계산 |
| 왼쪽 눈 안쪽 | `133` | 눈 너비, EAR 계산 |
| 오른쪽 눈 안쪽 | `362` | 눈 너비, EAR 계산 |
| 오른쪽 눈 바깥 | `263` | 눈 너비, EAR 계산 |
| 왼쪽 눈 위/아래 | `159`, `145` | 눈 뜸/감김 계산 |
| 오른쪽 눈 위/아래 | `386`, `374` | 눈 뜸/감김 계산 |
| 코 끝 | `1` | yaw, pitch 계산 기준 |
| 입꼬리 | `61`, `291` | 입 위치, 입 가림 판정 |
| 윗입술/아랫입술 | `13`, `14` | 입술선, 입 벌림/가림 판정 |

현재 구현은 여기에 더해 눈/코/입 주변 dense landmark 묶음을 사용한다.

| 묶음 | 목적 |
| --- | --- |
| `LEFT_EYE_DENSE` | 왼쪽 눈 주변 형태와 영역 검사 |
| `RIGHT_EYE_DENSE` | 오른쪽 눈 주변 형태와 영역 검사 |
| `NOSE_DENSE` | 코 주변 형태와 영역 검사 |
| `MOUTH_DENSE` | 입 주변 형태와 영역 검사 |

또한 디버깅을 위해 카메라 화면 좌상단에 랜드마크 시각화 칩이 있다.

| 칩 | 표시 내용 | 목적 |
| --- | --- | --- |
| `mesh` | MediaPipe `FACE_LANDMARKS_TESSELATION` 연결선과 전체 landmark dot | dense landmark가 얼굴 표면을 어떻게 추정하는지 확인 |
| `contours` | MediaPipe `FACE_LANDMARKS_CONTOURS` | 얼굴/눈/입 윤곽 흐름 확인 |
| `key points` | 현재 판정에 쓰는 주요 landmark index | yaw, pitch, EAR, 입 가림에 쓰이는 좌표 위치 확인 |
| `vectors` | eye axis, pitch axis, mouth seam, EAR, yaw offset | 실제 판정에 가까운 벡터 변화 확인 |

각 칩은 독립 토글이다. 여러 칩을 동시에 켜서 mesh, 주요 좌표, 벡터를 중첩해서 볼 수 있다.

## 5. 주요 지표와 의미

### 5.1 얼굴 감지 여부: `detected`

얼굴 랜드마크가 하나라도 잡히는지 나타낸다.

필요한 이유:

- 얼굴이 없으면 어떤 동작도 검증할 수 없다.
- 어두운 환경이나 얼굴이 프레임 밖에 있는 상황을 걸러낸다.

현재 처리:

- 랜드마크가 없으면 현재 스텝 hold 타이머를 초기화한다.
- 정면 스텝이면 blink 상태도 초기화한다.

### 5.2 단일 얼굴 여부: `singleFace`

화면에 얼굴이 정확히 한 명인지 본다.

필요한 이유:

- 여러 사람이 화면에 있으면 누구의 동작인지 알 수 없다.
- 옆 사람 얼굴이 랜드마크 판정에 섞이면 통과 조건이 왜곡된다.

현재 처리:

- `numFaces: 2`로 모델을 설정하고, 감지된 얼굴 수가 1개일 때만 통과 가능하다.

### 5.3 얼굴 위치: `centered`

얼굴 중심이 화면 중앙 근처에 있는지 본다.

현재 기준:

- 얼굴 중심 x가 `0.5 ± 0.16` 범위
- 얼굴 중심 y가 `0.51 ± 0.20` 범위

필요한 이유:

- 얼굴이 프레임 밖에 걸치면 yaw/pitch/EAR 계산이 흔들린다.
- 사용자가 너무 옆으로 치우치면 랜드마크가 추정값으로 보정될 수 있다.

### 5.4 얼굴 크기/거리: `properSize`

얼굴 bounding box의 너비/높이가 적절한지 본다.

현재 기준:

- 얼굴 너비: `0.20 ~ 0.68`
- 얼굴 높이: `0.28 ~ 0.88`

필요한 이유:

- 너무 멀면 눈/입 랜드마크가 작아져 오차가 커진다.
- 너무 가까우면 얼굴 일부가 잘려서 가림/회전 판정이 불안정해진다.

### 5.5 조명: `brightness`, `contrast`, `lightingGood`

카메라 프레임을 작은 캔버스로 축소한 뒤 픽셀 밝기와 대비를 계산한다.

현재 기준:

- 밝기: `55 ~ 218`
- 대비: `15` 이상

필요한 이유:

- 너무 어두우면 얼굴 특징점이 흐려진다.
- 너무 밝거나 역광이면 눈, 코, 입 경계가 날아간다.
- 대비가 낮으면 얼굴과 배경, 입술선, 눈매가 분리되지 않는다.

### 5.6 얼굴 품질 점수: `score`

여러 품질 요소를 0~100점으로 합산한 값이다.

현재 점수 구성:

| 요소 | 의미 |
| --- | --- |
| 얼굴 감지 | 얼굴이 잡혔는가 |
| 단일 얼굴 | 얼굴이 한 명인가 |
| 중앙 정렬 | 얼굴이 중앙에 있는가 |
| 거리/크기 | 얼굴 크기가 적절한가 |
| 조명 | 밝기/대비가 적절한가 |
| 가림 | 눈/코/입이 충분히 보이는가 |

현재 기준:

- 통과 기준: `82점 이상`
- 단, `occlusionClear=false`이면 점수는 최대 `68점`으로 제한된다.

필요한 이유:

- 개별 지표가 조금씩 흔들려도 전체 품질을 하나의 값으로 UI에 보여줄 수 있다.
- 하지만 현재 구현에서는 점수만으로 통과하지 않고, 각 스텝별 동작 조건도 같이 만족해야 한다.

### 5.7 Yaw: 좌우 회전 지표

Yaw는 얼굴이 좌우로 얼마나 돌아갔는지를 나타내는 값이다.

현재 계산 개념:

```txt
rawYawRatio = (noseTip.x - eyeCenterX) / faceWidth
yawRatio = -rawYawRatio
```

여기서:

- `noseTip.x`: 코 끝 x 위치
- `eyeCenterX`: 양쪽 눈 기준 중심 x 위치
- `faceWidth`: 얼굴 bounding box 너비

값 해석:

| 값 | 의미 |
| --- | --- |
| `yawRatio`가 0 근처 | 정면 |
| `yawRatio >= 0.13` | 오른쪽 회전으로 판단 |
| `yawRatio <= -0.13` | 왼쪽 회전으로 판단 |

필요한 이유:

- 고개를 좌우로 돌리라는 active challenge를 검증하기 위해 필요하다.
- 단순 사진은 실시간으로 yaw가 바뀌기 어렵다.

주의:

- 카메라 프리뷰는 거울처럼 미러링되어 있다.
- 실제 랜드마크 좌표와 사용자 체감 방향이 반대가 될 수 있어, 현재는 부호를 뒤집어 UX 기준에 맞춘다.

### 5.8 Pitch: 상하 회전 지표

Pitch는 얼굴이 위/아래로 움직였는지를 나타내는 값이다.

현재 계산 개념:

```txt
pitchRatio = (noseTip.y - eyeCenterY) / (mouthCenterY - eyeCenterY)
pitchDelta = currentPitchRatio - baselinePitchRatio
```

여기서:

- `baselinePitchRatio`: 정면 스텝을 통과한 순간의 pitch 기준값
- `pitchDelta`: 현재 pitch가 기준값에서 얼마나 변했는지

현재 기준:

| 조건 | 의미 |
| --- | --- |
| `pitchDelta >= 0.07` | 고개 숙이기 |
| `pitchDelta <= -0.07` | 고개 들기 |

필요한 이유:

- 고개 숙이기/들기 active challenge를 검증하기 위해 필요하다.
- 기준값을 사용하지 않으면 사람마다 기본 얼굴 각도가 달라 오판이 커진다.

주의:

- 이전 구현에서는 `Math.abs(pitchDelta)`를 사용해 위/아래 방향이 뒤섞여 통과되는 문제가 있었다.
- 현재는 양수/음수를 분리해 숙이기와 들기를 별도 조건으로 판단한다.

### 5.9 EAR: Eye Aspect Ratio

EAR은 눈이 열려 있는지 감겨 있는지 판단하기 위한 비율이다.

현재 계산 개념:

```txt
EAR = eyeVerticalDistance / eyeHorizontalDistance
averageEar = (leftEar + rightEar) / 2
```

현재 기준:

| 기준 | 값 |
| --- | --- |
| 눈 뜸 | `averageEar >= 0.21` |
| 눈 감김 | `averageEar <= 0.195` |

현재 blink 판정 순서:

1. `waitingOpen`: 눈 뜬 상태 확인 대기
2. `waitingClosed`: 눈 감김 확인 대기
3. `waitingReopen`: 다시 눈 뜸 확인 대기
4. `confirmed`: 깜빡임 완료

필요한 이유:

- 단순히 한 프레임에서 눈이 작게 잡혔다고 blink로 보면 오탐이 많다.
- 실제 blink는 `뜸 → 감김 → 다시 뜸`의 시간적 패턴이 있어야 한다.

현재 처리:

- 정면 자세가 깨지면 blink phase는 `waitingOpen`으로 초기화된다.
- blink가 `confirmed`가 된 뒤 정면을 3초 유지해야 정면 스텝이 통과된다.

## 6. 가림 판정: `occlusionClear`

가림 판정은 현재 구현에서 가장 어려운 부분이다. MediaPipe는 눈/코/입이 일부 가려져도 랜드마크를 "추정"해서 내놓을 수 있다. 따라서 랜드마크가 존재한다는 사실만으로는 실제로 보인다고 말할 수 없다.

현재 구현은 다음 네 계층을 함께 본다.

1. 랜드마크 형태 기반 검사
2. 픽셀/텍스처 기반 검사
3. 입술선 검사
4. 시간 기반 occlusion history + landmark jitter spike 빈도

### 6.1 프레임 단위 원시 판정: `occlusionRawClear`

`occlusionRawClear`는 현재 프레임 하나만 보고 눈/코/입이 보인다고 판단했는지 나타낸다.

구성:

```txt
occlusionRawClear =
  eyesShapeClear &&
  noseShapeClear &&
  mouthShapeClear &&
  eyesTextureClear &&
  noseTextureClear &&
  mouthTextureClear
```

이 값은 Detail의 `raw`로 표시된다.

주의할 점:

- `raw`는 한 프레임 단위라 `OK`와 `NO`가 빠르게 반복될 수 있다.
- 현재 최종 hold 조건은 `raw`만 보지 않는다.
- `raw`는 디버깅용 원시 신호에 가깝고, 최종 판정은 `occlusionClear`다.

### 6.2 랜드마크 형태 기반 검사

눈/코/입 주변 dense landmark 묶음의 형태가 정상적인지 본다.

눈 검사 예:

- 좌우 눈 너비가 얼굴 대비 충분한가
- 좌우 EAR 차이가 지나치게 크지 않은가
- 눈 영역 면적이 너무 작지 않은가

코 검사 예:

- 코 폭이 얼굴 대비 정상 범위인가
- 콧대-코끝 거리가 정상 범위인가
- 코끝이 눈과 입 사이의 정상 위치에 있는가

입 검사 예:

- 입꼬리 간 거리와 입 영역 크기가 정상 범위인가
- 입 중심이 코 아래 정상 위치에 있는가
- 입술 상하 간격이 비정상적으로 크지 않은가

각 조건은 boolean으로만 쓰이지 않고, `eyesShapeScore`, `noseShapeScore`, `mouthShapeScore` 같은 0~1 점수로도 변환된다. 이 점수들은 뒤의 temporal occlusion score에 반영된다.

### 6.3 픽셀/텍스처 기반 검사

랜드마크 주변의 실제 영상 픽셀을 샘플링한다.

현재 샘플링:

- `128 x 96` 크기의 축소 프레임 생성
- 눈/코/입 ROI 추출
- 각 ROI의 밝기, 대비, edge, saturation 계산

필요한 이유:

- 손이나 마스크로 가려도 MediaPipe가 입/코 위치를 추정할 수 있다.
- 실제 픽셀에서 입술선, 눈매, 코 주변 질감이 사라졌는지를 별도로 확인해야 한다.

### 6.4 입술선 검사

입 가림 대응을 위해 입꼬리 사이 중앙선을 샘플링한다.

현재 계산:

- 입꼬리 `61`, `291` 사이를 여러 지점으로 샘플링
- 윗입술 `13`, 아랫입술 `14` 사이 중앙 라인의 밝기를 측정
- 중앙 라인이 위/아래 주변보다 충분히 어두운지 검사
- 선의 대비와 edge가 있는지 검사

의도:

- 정상적인 다문 입은 입술선이 주변 피부보다 어둡게 잡히는 경향이 있다.
- 손이나 마스크로 입을 가리면 이 선이 사라지거나 주변과 비슷해진다.

주의:

- 입을 크게 벌리거나 조명이 특이하면 실패할 수 있다.
- 현재 UX는 "입은 자연스럽게 다문 상태"를 전제로 보는 편이 더 안정적이다.

### 6.5 Landmark jitter

실기기 테스트에서 중요한 관찰이 있었다.

- 얼굴을 가리지 않은 평상시에는 `jitter`, `mouth jit`가 대체로 `0.0099` 아래에 머문다.
- 얼굴 일부를 가리면 dense landmark의 위치나 면적이 크게 무너지지 않아도, 가린 부위 주변 key point와 vector가 짧은 순간 계속 흔들린다.
- 특히 `0.01`을 넘는 spike가 반복되고, 순간적으로 `0.02 ~ 0.03`까지 튀는 경우가 있다.

이를 반영해 현재 구현은 landmark jitter를 별도 신호로 계산한다.

계산 개념:

1. 최근 프레임의 주요 landmark snapshot을 저장한다.
2. 얼굴 bounding box 중심과 크기로 좌표를 정규화한다.
3. 이전 snapshot과 현재 snapshot의 평균 이동량을 계산한다.
4. `global`, `eyes`, `nose`, `mouth` 부위별 jitter를 구한다.

정규화하는 이유:

- 사용자가 얼굴 전체를 조금 움직인 것과 특정 부위 landmark만 벌벌 떨리는 것을 구분하기 위해서다.
- 픽셀 단위가 아니라 얼굴 크기 대비 흔들림으로 보므로, 얼굴 거리나 기기 해상도 차이를 줄일 수 있다.

Detail 표시:

| 지표 | 의미 |
| --- | --- |
| `jitter` | 얼굴 기준 landmark 전체 흔들림 |
| `mouth jit` | 입 주변 landmark 흔들림 |

### 6.6 Jitter spike 빈도 기반 가림 판정

현재 최종 가림 판정은 `0.01` 초과 spike 빈도를 본다.

기준:

| 항목 | 값 | 의미 |
| --- | --- | --- |
| spike threshold | `0.01` | `jitter` 또는 `mouth jit`가 이 값을 넘으면 spike로 기록 |
| hard spike threshold | `0.02` | 더 강한 흔들림으로 기록 |
| history window | `1400ms` | 최근 약 1.4초 동안 spike 횟수/비율 집계 |

Detail 표시:

| 지표 | 의미 |
| --- | --- |
| `jit hits` | 최근 window 안에서 `jitter > 0.01` 또는 `mouth jit > 0.01`인 프레임 수 |
| `mouth hits` | 최근 window 안에서 `mouth jit > 0.01`인 프레임 수 |
| `jit rate` | 전체 history 중 jitter spike 비율 |
| `mouth rate` | 전체 history 중 mouth jitter spike 비율 |

현재 로직은 다음 상황에서 `occlusionClear=false` 쪽으로 강하게 기운다.

- 최근 window에서 `jit hits`가 충분히 누적됨
- 최근 window에서 `mouth hits`가 충분히 누적됨
- `0.02` 이상 hard spike가 짧은 시간에 반복됨

의도:

- `raw`가 `OK/NO`를 반복하는 상황에서 최종 hold가 한 프레임마다 흔들리지 않게 한다.
- 반대로 `occ`가 계속 95% 이상 유지되면서 가림을 놓치는 문제를 줄인다.
- "가린 부위 landmark가 추정으로 유지되지만 과하게 떨린다"는 현상을 판정 신호로 사용한다.

### 6.7 시간 기반 최종 판정: `occlusionClear`

최종 `occlusionClear`는 현재 프레임 하나가 아니라 최근 history를 본다.

주요 값:

| 항목 | 값 | 의미 |
| --- | --- | --- |
| history window | `1400ms` | 최근 프레임 집계 구간 |
| minimum history | `360ms` | 최소 관찰 시간 |
| dropout grace | `480ms` | 짧은 순간 드랍 허용 시간 |
| pass score | `0.74` | frame occlusion score 기준 |
| pass ratio | `0.62` | history 안에서 통과 프레임 비율 기준 |

최종 판정 개념:

```txt
frameOcclusionScore =
  shape/texture score
  + landmark jitter stability
  - current jitter spike penalty

temporal occlusion =
  최근 1.4초 평균 score
  + 통과 프레임 비율
  - spike 빈도 penalty
```

`occ`는 이 temporal score를 0~100%로 보여준다. `occlusionClear=false`이면 전체 품질 점수 `score`는 최대 `68점`으로 제한된다.

## 7. 현재 판정 프로세스

### 7.1 전체 상태 흐름

```txt
카메라 시작
  ↓
MediaPipe 모델 로드
  ↓
매 프레임 얼굴 랜드마크 추출
  ↓
품질 지표 계산
  ↓
현재 스텝의 요구 동작 검사
  ↓
조건이 유지되면 hold progress 증가
  ↓
hold 시간이 기준 이상이면 다음 스텝
  ↓
모든 스텝 통과 시 PASS
```

### 7.2 공통 통과 조건

정면을 제외한 동작 스텝은 공통적으로 다음 조건을 만족해야 한다.

```txt
qualityReady = score >= 82 && occlusionClear
```

즉, 점수가 높아도 눈/코/입 가림이 감지되면 hold가 쌓이지 않는다.

### 7.3 스텝별 상세 조건

| 스텝 | 조건 | 유지 시간 |
| --- | --- | --- |
| 정면 + 눈깜빡임 | 정면 yaw/pitch 범위 + blink phase confirmed | 3초 |
| 오른쪽 회전 | `yawRatio >= 0.13` | 1.5초 |
| 왼쪽 회전 | `yawRatio <= -0.13` | 1.5초 |
| 고개 숙이기 | `pitchDelta >= 0.07` | 1.5초 |
| 고개 들기 | `pitchDelta <= -0.07` | 1.5초 |

스텝이 통과되면 즉시 넘어가지 않고 `좋아요!` 상태를 약 `1.3초` 보여준 뒤 다음 스텝으로 넘어간다.

## 8. 프로그레스바의 의미

현재 프로그레스바는 전체 진행률이 아니라 "현재 스텝의 hold 진행률"이다.

예:

- 오른쪽 회전 스텝에서 올바른 방향으로 돌리고 품질 조건이 맞으면 0%에서 100%까지 찬다.
- 중간에 방향이 틀리거나 가림/조명/점수가 실패하면 해당 스텝의 hold가 리셋된다.

이렇게 한 이유:

- 전체 진행률로 보이면 사용자가 "무엇을 더 해야 하는지" 이해하기 어렵다.
- Active Liveness에서는 현재 행동을 정확히 유지하는 것이 핵심이므로 개별 스텝 진행률이 더 직접적이다.

## 9. 현재 UI와 Detail 모드

기본 화면은 실제 사용자 인증 화면에 가깝게 구성되어 있다.

기본 화면:

- 카메라 프리뷰
- 원형 얼굴 가이드: 기본은 흰색, 현재 스텝의 hold/progress가 진행될 때 라임색, 오류가 지속될 때 빨간색
- 가이드 바깥 `#000000`, alpha `0.3` 딤드
- 카메라 좌상단 landmark 시각화 칩
- 현재 행동 안내 문구
- 현재 스텝 프로그레스바
- 재시작/초기화

반응형 구조:

- 모바일에서는 `Detail` 버튼을 눌렀을 때 검은 반투명 오버레이로 상세 지표를 보여준다.
- PC/넓은 화면에서는 `Detail` 버튼 없이 오른쪽 사이드바에 상세 지표를 항상 보여준다.

카메라 좌상단 시각화 칩:

- `mesh`
- `contours`
- `key points`
- `vectors`

각 칩은 독립적으로 켜고 끌 수 있다. 여러 칩을 동시에 켜면 dense mesh, contour, 주요 좌표, 판정용 벡터를 중첩해서 볼 수 있다.

Detail 모드:

- 품질 점수
- 개별 품질 badge
- step 번호
- hold 진행률
- ready 여부
- blink phase
- yaw
- pitch
- EAR
- light
- `occ`: 시간 기반 최종 가림 신뢰도
- `raw`: 현재 프레임 단위 원시 가림 판정
- `jitter`: 얼굴 기준 landmark 전체 흔들림
- `mouth jit`: 입 주변 landmark 흔들림
- `jit hits`: 최근 window 안에서 `jitter > 0.01` 또는 `mouth jit > 0.01`인 횟수
- `mouth hits`: 최근 window 안에서 `mouth jit > 0.01`인 횟수
- `jit rate`: jitter spike 비율
- `mouth rate`: mouth jitter spike 비율

Detail 모드는 개발/튜닝용이다. 실제 상용 UX에서는 숨기거나 내부 QA 빌드에서만 노출하는 것이 맞다.

## 10. 왜 오탐/미탐이 생기는가

현재 구현은 "랜드마크 + 휴리스틱" 방식이다. 이 방식은 빠르고 브라우저에서 동작하지만 한계가 명확하다.

### 10.1 MediaPipe는 가려진 부위도 추정할 수 있다

눈, 코, 입이 일부 가려져도 모델이 얼굴 형태를 기반으로 랜드마크를 추정할 수 있다. 이 경우 랜드마크 좌표만 보면 정상처럼 보일 수 있다.

현재 구현은 이 문제를 줄이기 위해 landmark jitter를 본다. 가려진 부위는 좌표 자체가 완전히 무너지지 않더라도 key point와 vector가 짧은 시간 안에 과하게 흔들리는 경우가 많다.

다만 jitter도 완벽한 신호는 아니다. 조명 변화, 손떨림, 저사양 기기의 프레임 드랍, 고개 회전 중 motion blur도 jitter를 키울 수 있다.

### 10.2 2D 좌표만으로 3D 실재성을 보장할 수 없다

현재 yaw/pitch는 2D 랜드마크의 상대 위치 변화다. 실제 3D 깊이를 직접 측정하지 않는다.

### 10.3 조명과 기기 차이가 크다

휴대폰 카메라, 실내 조명, 역광, 안경 반사, 피부톤, 마스크 색상에 따라 픽셀 기반 지표가 크게 달라진다.

### 10.4 공격 방어 모델이 아니다

현재 구현은 PoC 수준의 UX/인터랙션 프로토타입이다. 다음 공격에 대한 완전한 방어를 보장하지 않는다.

- 고품질 녹화 영상 재생
- 카메라 입력 주입
- 딥페이크 영상
- 3D 마스크
- 화면 재촬영
- 랜드마크 모델을 속이는 특수 패턴

## 11. 상용화 수준으로 가려면 필요한 것

현재 구현을 상용 수준으로 끌어올리려면 다음 보강이 필요하다.

### 11.1 데이터 기반 threshold 튜닝

현재 임계값은 실험적 휴리스틱이다. 상용화하려면 실제 사용자 데이터로 조정해야 한다.

필요 데이터:

- 다양한 기기
- 다양한 조명
- 안경/무안경
- 마스크/손/종이/휴대폰 화면 등 가림 케이스
- 정상 사용자 연령/성별/피부톤 다양성
- 공격 시나리오 데이터

측정해야 할 지표:

- FAR: 공격 또는 잘못된 입력을 통과시키는 비율
- FRR: 정상 사용자를 실패시키는 비율
- 단계별 실패율
- 평균 인증 시간
- 사용자 재시도율

### 11.2 랜덤 챌린지

현재 순서는 고정되어 있다. 고정 순서는 녹화 영상 공격에 약하다.

개선:

- 좌/우/상/하/깜빡임 순서를 랜덤화
- 서버에서 nonce와 challenge sequence 발급
- 클라이언트 결과를 서버가 검증

### 11.3 서버 검증과 리플레이 방지

현재는 클라이언트 단독 판정이다. 상용에서는 클라이언트 값을 그대로 믿으면 안 된다.

필요 요소:

- 서버 발급 challenge id
- timestamp
- nonce
- 서명된 결과 payload
- 재사용 방지
- 결과와 프레임 일부 또는 특징량 서버 검증

### 11.4 Anti-spoofing 모델

랜드마크 휴리스틱만으로는 부족하다. 별도 PAD(Presentation Attack Detection) 모델이 필요하다.

가능한 입력:

- RGB 프레임
- 얼굴 ROI
- 광류/움직임
- 텍스처
- 주파수 성분
- 모아레/화면 재촬영 패턴

### 11.5 센서 보강

가능하다면 다음 센서가 실재성 검증에 도움이 된다.

- depth camera
- IR camera
- device motion
- camera intrinsic metadata
- frame timing consistency

일반 모바일 웹에서는 접근 가능한 센서가 제한적이므로, 웹 기반만으로 상용 금융급 보안을 달성하기는 어렵다.

## 12. 현재 구현을 읽는 순서

코드를 분석할 때는 다음 순서로 보면 된다.

1. 상단 constants
   - threshold와 landmark index 확인
2. `getLighting`
   - 밝기/대비 계산 이해
3. `getRegionSignal`
   - 눈/코/입 ROI 픽셀 신호 계산 이해
4. `getMouthLineSignal`
   - 입술선 기반 입 가림 검사 이해
5. `getLandmarkJitterSignal`
   - 얼굴 기준 정규화 landmark jitter 계산 이해
6. `updateTemporalOcclusion`
   - 최근 history, spike count/rate, dropout grace 기반 최종 가림 판정 이해
7. `drawOverlay`
   - mesh/contours/key points/vectors 시각화 이해
8. `buildMetrics`
   - 모든 지표가 만들어지는 핵심 함수
9. `runDetection`
   - 매 프레임 상태머신과 스텝 통과 로직
10. React render 영역
   - UI 표시, Detail overlay/sidebar, visual chips, progressbar 의미

## 13. 현재 핵심 임계값 요약

| 항목 | 값 | 의미 |
| --- | --- | --- |
| 품질 점수 | `82` | 기본 통과 점수 |
| 정면 yaw 제한 | `±0.04` | 정면으로 보는 허용 범위 |
| 오른쪽/왼쪽 yaw | `±0.13` | 좌우 회전 통과 기준 |
| pitch delta | `±0.07` | 고개 숙이기/들기 변화량 |
| 눈 뜸 EAR | `0.21` | 눈이 열린 상태 |
| 눈 감김 EAR | `0.195` | 눈이 감긴 상태 |
| 정면 hold | `3000ms` | blink 후 정면 유지 시간 |
| 동작 hold | `1500ms` | 좌/우/상/하 유지 시간 |
| validation delay | `1500ms` | 오류 메시지 지연 표시 |
| snackbar minimum visible | `2000ms` | 이미 표시된 오류 안내의 최소 읽기 시간 |
| step transition | `1300ms` | 다음 스텝 전환 대기 |
| 가림 실패 점수 cap | `68` | `occlusionClear=false`일 때 최대 점수 |
| occlusion history | `1400ms` | 최근 프레임 기반 가림 판정 집계 구간 |
| occlusion minimum history | `360ms` | temporal 가림 판정을 시작하기 위한 최소 관찰 시간 |
| occlusion dropout grace | `480ms` | 짧은 가림 판정 드랍을 hold 리셋 없이 허용하는 시간 |
| occlusion pass score | `0.74` | frame occlusion score 통과 기준 |
| occlusion pass ratio | `0.62` | history 안에서 통과 프레임 비율 기준 |
| jitter spike | `0.01` | `jitter` 또는 `mouth jit`가 이 값을 넘으면 spike로 집계 |
| hard jitter spike | `0.02` | 더 강한 landmark 흔들림으로 간주 |

## 14. 이 프로토타입의 정확한 의미

현재 구현이 판단하는 것은 다음에 가깝다.

> "카메라 프레임 안에 얼굴이 하나 있고, 조명/거리/가림이 어느 정도 적절하며, 해당 얼굴 랜드마크가 지정된 active challenge 순서에 맞게 변화했다."

현재 구현이 보장하지 못하는 것은 다음이다.

> "이 입력이 공격자가 조작할 수 없는 실제 사람의 생체 신호임을 보안적으로 증명했다."

따라서 이 프로토타입은 사업 과제 PoC나 UX 검증에는 유용하지만, 상용 인증 보안 엔진으로 쓰려면 데이터 기반 threshold 튜닝, 서버 검증, PAD 모델, 리플레이 방지, 랜덤 챌린지, 기기/센서 보강이 필요하다.

## 15. 앞으로 의사결정할 때 볼 포인트

1. UX 우선인가, 보안 우선인가
   - 보안 기준을 올리면 정상 사용자 실패율이 증가한다.
   - UX 기준을 완화하면 spoofing 통과 가능성이 증가한다.

2. 웹만 쓸 것인가, 네이티브 앱까지 갈 것인가
   - 웹은 카메라 접근과 센서 접근이 제한적이다.
   - 네이티브는 더 많은 센서와 보안 저장소를 사용할 수 있다.

3. PoC 목표가 무엇인가
   - "정부 지원 사업 데모"라면 흐름과 설득력 있는 Detail 지표가 중요하다.
   - "상용 인증"이라면 보안 모델과 검증 데이터가 필요하다.

4. 어떤 실패를 더 감수할 것인가
   - false accept를 줄이면 사용자가 더 자주 실패한다.
   - false reject를 줄이면 공격 통과 가능성이 올라간다.

현재 단계에서는 Detail 모드로 각 지표를 보면서 실기기 테스트 데이터를 모으고, 실패/통과 케이스별로 threshold를 조정하는 것이 다음 작업이다.
