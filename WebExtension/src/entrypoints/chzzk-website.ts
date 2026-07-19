/**
 * 치지직 사이트 코드와 같은 공간에서 실행되는 파일들의 시작점입니다.
 * Safari가 일반 확장 코드와 사이트 코드를 서로 분리하기 때문에, 네트워크 요청과
 * 치지직 내부 플레이어 정보가 필요한 세 기능만 이곳에서 불러옵니다.
 */
import { installAdBlockRequestInterceptor } from "../features/ad-block";
import { installBlindedMessageRestorer } from "../features/chat/blinded-message";
import "../features/player/video-quality";
import { installWebsiteStreamStats } from "../features/player/stream-stats";
import { installLivePlaybackController } from "../features/live/playback-bar";

installAdBlockRequestInterceptor();
installBlindedMessageRestorer();
installWebsiteStreamStats();
installLivePlaybackController();
