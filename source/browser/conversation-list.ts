import {ipcRenderer as ipc} from 'electron-better-ipc';
import elementReady from 'element-ready';
import selectors from './selectors';

const icon = {
	read: 'data-caprine-icon',
	unread: 'data-caprine-icon-unread',
};

const padding = {
	top: 3,
	right: 0,
	bottom: 3,
	left: 0,
};

function drawIcon(size: number, img?: HTMLImageElement): HTMLCanvasElement {
	const canvas = document.createElement('canvas');

	if (img) {
		canvas.width = size + padding.left + padding.right;
		canvas.height = size + padding.top + padding.bottom;

		const context = canvas.getContext('2d')!;
		context.beginPath();
		context.arc((size / 2) + padding.left, (size / 2) + padding.top, (size / 2), 0, Math.PI * 2, true);
		context.closePath();
		context.clip();

		context.drawImage(img, padding.left, padding.top, size, size);
	} else {
		canvas.width = 0;
		canvas.height = 0;
	}

	return canvas;
}

// Return canvas with rounded image
async function urlToCanvas(url: string, size: number): Promise<HTMLCanvasElement> {
	return new Promise(resolve => {
		const img = new Image();

		img.setAttribute('crossorigin', 'anonymous');

		img.addEventListener('load', () => {
			resolve(drawIcon(size, img));
		});

		img.addEventListener('error', () => {
			console.error('Image not found', url);
			resolve(drawIcon(size));
		});

		img.src = url;
	});
}

async function createIcons(element: HTMLElement, url: string): Promise<void> {
	const canvas = await urlToCanvas(url, 50);

	element.setAttribute(icon.read, canvas.toDataURL());

	const markerSize = 8;
	const context = canvas.getContext('2d')!;

	context.fillStyle = '#f42020';
	context.beginPath();
	context.ellipse(canvas.width - markerSize, markerSize, markerSize, markerSize, 0, 0, 2 * Math.PI);
	context.closePath();
	context.fill();

	element.setAttribute(icon.unread, canvas.toDataURL());
}

async function discoverIcons(element: HTMLElement): Promise<void> {
	if (element) {
		return createIcons(element, element.getAttribute('src')!);
	}

	console.warn('Could not discover profile picture. Falling back to default image.');

	// Fall back to messenger favicon
	const messengerIcon = document.querySelector('link[rel~="icon"]');

	if (messengerIcon) {
		return createIcons(element, messengerIcon.getAttribute('href')!);
	}

	// Fall back to facebook favicon
	return createIcons(element, 'https://facebook.com/favicon.ico');
}

async function getIcon(element: HTMLElement, unread: boolean): Promise<string> {
	if (element === null) {
		return icon.read;
	}

	if (!element.getAttribute(icon.read)) {
		await discoverIcons(element);
	}

	return element.getAttribute(unread ? icon.unread : icon.read)!;
}

function isUnread(element: HTMLElement): boolean {
	// Primary check: "Mark as Read" button presence
	const markAsReadButton = element.querySelector('[aria-label="Mark as read"]');
	if (markAsReadButton) {
		return true;
	}

	// Secondary check: Bold text
	// This covers cases where the button is hidden (responsive/maximized view)
	// We look for any text container that has semi-bold/bold font weight
	const candidates = element.querySelectorAll('span, div');
	for (const candidate of candidates) {
		// Optimization: Skip elements with children to focus on leaf/text nodes
		if (candidate.childElementCount > 0) {
			continue;
		}

		const {fontWeight} = getComputedStyle(candidate);
		const weight = Number.parseInt(fontWeight, 10);
		// 600 is usually semi-bold, 700 is bold. Facebook often uses 600 for unread text.
		if (!Number.isNaN(weight) && weight >= 600) {
			return true;
		}
	}

	return false;
}

function extractConversationInfo(element: HTMLElement): {title: string; body: string; icon: string | undefined} {
	// Attempt to find the specific text structure
	// Usually: Title is the first significant text, Body is the next one.
	// We can try to rely on the container structure `[role="link"]` -> text containers

	const link = element.querySelector('[role="link"]');
	if (!link) {
		return {title: '', body: '', icon: undefined};
	}

	// Icon
	const iconImg = element.querySelector<HTMLImageElement>('img');
	const icon = iconImg?.src ?? iconImg?.dataset?.caprineIcon;

	// Text extraction strategy:
	// 1. Get all text-containing elements within the link
	// 2. Filter out timestamps or insignificant text if possible
	// 3. Assume first is Title, second is Body

	// Helper to get text from leaf nodes, ignoring visually hidden ones
	const getTextNodes = (root: Element): string[] => {
		const result: string[] = [];
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
		let node;
		while ((node = walker.nextNode())) {
			const parent = node.parentElement;
			// Skip visually hidden elements (common for "Unread message" sr-only text)
			// Heuristic: check for specific accessibility hiding patterns
			if (parent) {
				const style = getComputedStyle(parent);
				if (
					style.display === 'none'
					|| style.visibility === 'hidden'
					|| style.opacity === '0'
					// "sr-only" / "visually-hidden" patterns often use clip or very small size
					|| (style.clip === 'rect(0px, 0px, 0px, 0px)' && style.position === 'absolute')
					|| (style.width === '1px' && style.height === '1px' && style.overflow === 'hidden')
				) {
					continue;
				}

				// Explicitly skip "Unread message" label if it leaks through
				if (node.textContent?.includes('Unread message')) {
					continue;
				}
			}

			const text = node.textContent?.trim();
			if (text && text.length > 0) {
				result.push(text);
			}
		}

		return result;
	};

	// We look specifically at the text column, which is usually a sibling of the avatar
	// But since we can't reliably pick the column by class, we just scan relevant text in the link
	const texts = getTextNodes(link);

	// Heuristic:
	// - If we have >= 2 strings: Title, Body, (Time/Status...)
	// - Often the Title is the user name.

	if (texts.length >= 2) {
		return {
			title: texts[0],
			body: texts[1], // Often the message preview
			icon,
		};
	}

	return {title: '', body: '', icon};
}

async function createConversationNewDesign(element: HTMLElement): Promise<Conversation> {
	const conversation: Partial<Conversation> = {};

	conversation.selected = Boolean(element.querySelector('[role=row] [role=link][aria-current="page"]'));
	conversation.unread = isUnread(element);

	// Attempt to extract label (title)
	const info = extractConversationInfo(element);
	conversation.label = info.title;

	// Icon
	const iconElement = element.querySelector<HTMLElement>('img');
	conversation.icon = await getIcon(iconElement!, conversation.unread);

	return conversation as Conversation;
}

async function createConversationList(): Promise<Conversation[]> {
	const conversationListSelector = selectors.conversationList;

	const list = await elementReady(conversationListSelector, {
		stopOnDomReady: false,
	});

	if (!list) {
		console.error('Could not find conversation list', conversationListSelector);
		return [];
	}

	const elements: HTMLElement[] = [...list.children] as HTMLElement[];

	// Filter out non-conversation definitions (spinners, spacers, etc)
	// We only want things that look like rows/conversations
	const conversationElements = elements.filter(element => element.querySelector('[role="link"]'));

	const conversations: Conversation[] = await Promise.all(
		conversationElements.map(async element => createConversationNewDesign(element)),
	);

	return conversations;
}

export async function sendConversationList(): Promise<void> {
	const conversationsToRender: Conversation[] = await createConversationList();
	ipc.callMain('conversations', conversationsToRender);
}

// Track the last text content we notified for each conversation href
const knownUnreadMessages = new Map<string, string>();

function countUnread(mutationsList: MutationRecord[]): void {
	const processedHrefs = new Set<string>();

	for (const mutation of mutationsList) {
		const target = mutation.target as HTMLElement;
		// Find the conversation row container
		// We look for the gridcell or row role which usually wraps the conversation
		const conversationRow = target.closest('[role="row"], [role="gridcell"]')?.closest('div[role="none"], div[class="x1n2onr6"]') ?? target.closest('[role="link"]')?.parentElement;

		if (!conversationRow) {
			continue;
		}

		// Ensure we are looking at a conversation list item
		const link = conversationRow.querySelector('[role="link"]');
		if (!link) {
			continue;
		}

		const href = link.getAttribute('href');
		if (!href || processedHrefs.has(href)) {
			continue;
		}

		processedHrefs.add(href);

		// 1. If conversation is READ, clear from our known map so we can notify again later
		if (!isUnread(conversationRow as HTMLElement)) {
			knownUnreadMessages.delete(href);
			continue;
		}

		// 2. If conversation is UNREAD, check if we need to notify

		const info = extractConversationInfo(conversationRow as HTMLElement);

		// If we don't have enough info, skip
		if (!info.title || !info.body) {
			continue;
		}

		// Explicitly skip "self" messages
		// If the preview starts with "You:", it's a message we sent, not an unread one from others.
		// (Even if isUnread() triggered due to bolding artifacts).
		if (info.body.startsWith('You:')) {
			continue;
		}

		// Construct a unique signature for this message state
		// We use body text as the primary differentiator.
		// If the user sends multiple "Hi" messages, this might dedupe them incorrectly adjacent,
		// but given mutation frequency, it's better than infinite loops.
		// Including title helps if multiple people send same text? (Though href is unique per thread).
		const messageSignature = info.body;

		// If we already notified for this exact content in this thread, skip
		if (knownUnreadMessages.get(href) === messageSignature) {
			continue;
		}

		// Send notification
		ipc.callMain('notification', {
			id: 0,
			title: info.title,
			body: info.body,
			icon: info.icon,
			silent: false,
		});

		// Update state
		knownUnreadMessages.set(href, messageSignature);
	}
}

async function updateTrayIcon(): Promise<void> {
	let messageCount = 0;

	await elementReady(selectors.chatsIcon, {stopOnDomReady: false});

	// Count unread messages in Chats, Marketplace, etc.
	for (const element of document.querySelectorAll<HTMLElement>(selectors.chatsIcon)) {
		// Extract messageNumber from ariaLabel
		const messageNumber = element?.ariaLabel?.match(/\d+/g);

		if (messageNumber) {
			messageCount += Number.parseInt(messageNumber[0], 10);
		}
	}

	ipc.callMain('update-tray-icon', messageCount);
}

window.addEventListener('load', async () => {
	const sidebar = await elementReady('[role=navigation]:has([role=grid])', {stopOnDomReady: false});
	const leftSidebar = await elementReady(`${selectors.leftSidebar}:has(${selectors.chatsIcon})`, {stopOnDomReady: false});

	if (sidebar) {
		const conversationListObserver = new MutationObserver(async () => sendConversationList());
		const conversationCountObserver = new MutationObserver(countUnread);

		conversationListObserver.observe(sidebar, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['class', 'aria-current'], // Relevant for selection changes
		});

		conversationCountObserver.observe(sidebar, {
			characterData: true,
			subtree: true,
			childList: true,
			attributes: true,
			// We observe class/style changes for bold check, and structural changes for buttons
		});
	}

	if (leftSidebar) {
		const chatsIconObserver = new MutationObserver(async () => updateTrayIcon());

		chatsIconObserver.observe(leftSidebar, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['aria-label'],
		});
	}
});
