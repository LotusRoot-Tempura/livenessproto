# Grab Ticket Face MVP

암표 방지를 위한 `QR + 얼굴 등록 + 얼굴 인증 기반 티켓 입장 MVP` 웹앱입니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 후 사용합니다.

## 기술 스택

- Next.js App Router
- TypeScript
- CSS
- localStorage + IndexedDB
- `react-qr-code`
- `html5-qrcode`
- `idb`
- `uuid`
- `@mediapipe/tasks-vision`

## 폴더 구조

```text
src/
  app/
    face-register/
    logs/
    tickets/
      create/
    users/
    verify/
  components/
  hooks/
  lib/
  store/
  styles/
  types/
```

## 핵심 흐름

1. 이용자 등록
2. 얼굴 등록 영상 촬영 및 IndexedDB 저장
3. 공연 티켓 생성과 QR 발급
4. 입장자 변경 및 변경 이력 저장
5. QR 스캔과 mock ZK 검증
6. 얼굴 촬영과 mock 유사도 판정
7. 입장 로그 저장

## 저장 구조

- `localStorage`
  - 이용자
  - 얼굴 프로필 메타데이터
  - 티켓
  - 변경 이력
  - mock ZK 데이터
  - 입장 로그
  - 얼굴 캡처 메타데이터
- `IndexedDB`
  - 얼굴 등록 영상 Blob
  - 현장 얼굴 촬영 이미지 Blob

## 구현 메모

- 실제 얼굴 AI 비교는 하지 않고 mock 점수로 판정합니다.
- 실제 ZK 검증도 로컬 mock 데이터로 처리합니다.
- `FaceQualityCheck`는 MediaPipe 로딩 구조를 포함하지만, MVP 특성상 품질 점수는 현장 흐름 중심의 mock 보조 로직으로 동작합니다.
