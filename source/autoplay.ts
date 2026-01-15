import {ipcRenderer as ipc} from 'electron-better-ipc';

const originalPlay = HTMLVideoElement.prototype.play;

let isAutoplayDisabled = false;
let lastInteractionTime = 0;

function updateInteractionTime(event: Event): void {
	if (event.isTrusted) {
		lastInteractionTime = Date.now();
	}
}

// Capture user interactions
const interactionEvents = ['mousedown', 'keydown', 'touchstart', 'click'];
for (const type of interactionEvents) {
	window.addEventListener(type, updateInteractionTime, true);
}

function isUserInteraction(): boolean {
	// Check current event
	if ((window as any).event?.isTrusted) {
		return true;
	}

	// Check recent interaction (e.g., within 200ms)
	return Date.now() - lastInteractionTime < 200;
}

// Override play
HTMLVideoElement.prototype.play = async function (this: HTMLVideoElement) {
	if (isAutoplayDisabled && !isUserInteraction()) {
		// Block autoplay
		// Return a rejected promise to simulate blocked autoplay
		throw new DOMException('Autoplay blocked by Caprine', 'NotAllowedError');
	}

	// eslint-disable-next-line prefer-rest-params
	return originalPlay.apply(this, arguments as any);
};

export async function toggleVideoAutoplay(): Promise<void> {
	const autoplayVideos = await ipc.callMain<undefined, boolean>('get-config-autoplayVideos');
	isAutoplayDisabled = !autoplayVideos;
}
