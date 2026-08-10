# Active Liveness Prototype

MediaPipe FaceLandmarker 기반 active liveness UI/UX 프로토타입입니다.

## 기능

- 카메라 권한 요청
- 얼굴 프레이밍 품질 점수화
- 단일 얼굴 감지
- 중앙 정렬, 거리, 조명, 얼굴 가림 상태 표시
- 오른쪽/왼쪽 고개 회전 챌린지
- 눈 깜빡임 챌린지
- PASS 결과 표시

## 실행

```bash
npm install
npm run dev
```

로컬에서는 `http://localhost:3000` 또는 Next가 안내하는 포트로 접속합니다.

## 배포

`main` 브랜치에 push하면 GitHub Actions가 정적 사이트를 빌드해서 GitHub Pages로 배포합니다.

배포 주소:

```text
https://lotusroot-tempura.github.io/livenessproto/
```
