const { BrowserWindow, app, ipcMain, dialog, screen } = require("electron");
const Store = require("electron-store");
const path = require("path");
const unzipper = require("unzipper");

const store = new Store.default();

let menuWindow = null;
let mainWindow = null;
let reflectionWindow = null;

let petAnimations = [];
let petManifest = null;
let holdingAnimation = null;

let animationSpeed = 60;
let reflect = 0.3;

let currentAnimation = {};

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function safeCloseMenu() {
	if (!menuWindow || menuWindow.isDestroyed()) return;

	menuWindow.removeAllListeners("blur");
	menuWindow.close();
	menuWindow = null;
}

function openMenu(x, y, html = "") {
	safeCloseMenu();

	menuWindow = new BrowserWindow({
		width: 200,
		height: 1,
		x,
		y,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		resizable: false,
		focusable: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	menuWindow.loadFile(path.join(__dirname, "menu.html"));

	menuWindow.webContents.on("did-finish-load", () => {
		if (!menuWindow || menuWindow.isDestroyed()) return;

		menuWindow.webContents.send("menu-content", html);
	});

	menuWindow.on("blur", () => {
		safeCloseMenu();
	});

	return menuWindow;
}

function sendAnimation(animation, width) {
	if (!mainWindow || !reflectionWindow) return;

	mainWindow.webContents.send(
		"set-animation",
		animation,
		width
	);

	reflectionWindow.webContents.send(
		"set-animation",
		animation,
		width
	);

	currentAnimation = { animation, width };

	store.set("animation", animation);
	store.set("animationWidth", width);
}

function setAnimationSpeed(speed) {
	animationSpeed = Number(speed);

	store.set("speed", animationSpeed);

	mainWindow?.webContents.send(
		"set-animation-speed",
		animationSpeed
	);
}

function setReflection(value) {
	reflect = Number(value);

	store.set("reflection", reflect);

	reflectionWindow?.webContents.send(
		"set-animation-reflection",
		reflect
	);
}

function resetPet() {
	store.delete("petPath");
	store.delete("animation");
	store.delete("animationWidth");
	store.delete("reflection");
	store.delete("speed");

	reflect = 0.3;
	animationSpeed = 60;

	currentAnimation = {};

	petManifest = null;
	petAnimations = [];
	holdingAnimation = null;

	mainWindow?.webContents.send("reset-animation");
	reflectionWindow?.webContents.send("reset-animation");
}

function setReflectionPos() {
	if (
		!mainWindow ||
		!reflectionWindow ||
		mainWindow.isDestroyed() ||
		reflectionWindow.isDestroyed()
	) {
		return;
	}

	const [x, y] = mainWindow.getPosition();
	const [, h] = mainWindow.getSize();

	reflectionWindow.setPosition(
		x,
		y + h - (petManifest?.reflectionOffset ?? 0)
	);
}

async function loadPet(filePath) {
	const [x, y] = mainWindow.getPosition();

	const directory = await unzipper.Open.file(filePath);

	petAnimations = [];
	petManifest = null;
	holdingAnimation = null;

	const imageMap = {};

	const tasks = directory.files.map(async (file) => {
		if (file.path.endsWith("manifest.json")) {
			try {
				const parsedManifest = JSON.parse(
					(await file.buffer()).toString("utf8")
				);

				if (Array.isArray(parsedManifest.animations)) {
					petManifest = parsedManifest;

					const menu = openMenu(x, y, "Pet Loaded!");

					setTimeout(() => {
						if (!menu || menu.isDestroyed()) return;

						menu.removeAllListeners("blur");
						menu.close();

						if (menu === menuWindow) {
							menuWindow = null;
						}
					}, 1000);
				}
			} catch {
				openMenu(x, y, "Invalid Manifest!");
			}

			return;
		}

		const ext = file.path
			.split(".")
			.at(-1)
			.toLowerCase();

		if (["png", "jpg", "jpeg"].includes(ext)) {
			const mime = ext === "jpg" ? "jpeg" : ext;

			const buffer = await file.buffer();

			imageMap[file.path] =
				`data:image/${mime};base64,${buffer.toString("base64")}`;
		}
	});

	await Promise.all(tasks);

	if (petManifest?.animations) {
		petAnimations = petManifest.animations.map((anim) => ({
			name: anim.name,
			url: imageMap[anim.path] || null,
			width: anim.width
		}));
	}

	if (petManifest?.holdingAnimation) {
		holdingAnimation = {
			name: petManifest.holdingAnimation.name,
			url:
				imageMap[
					petManifest.holdingAnimation.path
				] || null,
			width: petManifest.holdingAnimation.width
		};
	}

	const savedAnimation = store.get("animation");
	const savedAnimationWidth =
		store.get("animationWidth");

	if (savedAnimation && savedAnimationWidth) {
		sendAnimation(
			savedAnimation,
			savedAnimationWidth
		);
	} else if (petAnimations[0]) {
		sendAnimation(
			petAnimations[0].url,
			petAnimations[0].width
		);
	}
}

ipcMain.on("menu-height", (event, height) => {
	if (!menuWindow || menuWindow.isDestroyed()) return;

	const bounds = menuWindow.getBounds();

	const display =
		screen.getDisplayNearestPoint(bounds);

	const work = display.workArea;

	let x = bounds.x;
	let y = bounds.y;

	const width = bounds.width;

	if (x + width > work.x + work.width) {
		x -= width;
	}

	x = Math.max(work.x, x);

	if (y + height > work.y + work.height) {
		y = work.y + work.height - height;
	}

	y = Math.max(work.y, y);

	menuWindow.setBounds({
		x,
		y,
		height: Math.ceil(height)
	});
});

ipcMain.on("click", async (e, i) => {
	if (
		i.elem === "menu" ||
		i.elem === "row" ||
		i.elem.endsWith("-slider")
	) {
		return;
	}

	safeCloseMenu();

	if (i.elem === "set-pet") {
		const result = await dialog.showOpenDialog(
			mainWindow,
			{
				title: "Select a pet",
				properties: ["openFile"],
				filters: [
					{
						extensions: ["pet"],
						name: "Pet File"
					},
					{
						extensions: ["zip"],
						name: "Zip Archive"
					},
					{
						name: "All Files",
						extensions: ["*"]
					}
				]
			}
		);

		if (!result.canceled) {
			store.delete("animation");
			store.delete("animationWidth");

			store.set(
				"petPath",
				result.filePaths[0]
			);

			await loadPet(result.filePaths[0]);
		}
	}

	if (i.elem === "reset") {
		resetPet();
	}

	if (i.elem === "quit") {
		app.quit();
	}
});

app.whenReady().then(async () => {
	reflectionWindow = new BrowserWindow({
		width: 200,
		height: 200,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		resizable: false,
		skipTaskbar: true,
		focusable: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	mainWindow = new BrowserWindow({
		width: 200,
		height: 200,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		resizable: false,
		focusable: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	reflectionWindow.setIgnoreMouseEvents(true);

	mainWindow.setAlwaysOnTop(
		true,
		"screen-saver"
	);

	reflectionWindow.setAlwaysOnTop(
		true,
		"screen-saver"
	);

	mainWindow.setVisibleOnAllWorkspaces(
		true,
		{
			visibleOnFullScreen: true
		}
	);

	reflectionWindow.setVisibleOnAllWorkspaces(
		true,
		{
			visibleOnFullScreen: true
		}
	);

	mainWindow.loadFile(
		path.join(__dirname, "index.html")
	);

	reflectionWindow.loadFile(
		path.join(__dirname, "reflection.html")
	);

	mainWindow.on("close", () => {
		app.quit();
	});

	reflectionWindow.on("close", () => {
		app.quit();
	})

	mainWindow.on("move", setReflectionPos);
	mainWindow.on("resize", setReflectionPos);

	ipcMain.on(
		"set-size",
		(e, width, height) => {
			width = Math.ceil(width);
			height = Math.ceil(height);

			mainWindow.setBounds({
				width,
				height
			});

			reflectionWindow.setBounds({
				width,
				height
			});
		}
	);

	ipcMain.on(
		"set-animation",
		(e, animation, width) => {
			sendAnimation(animation, width);
		}
	);

	ipcMain.on(
		"set-animation-speed",
		(e, speed) => {
			setAnimationSpeed(speed);
		}
	);

	ipcMain.on(
		"set-animation-pos",
		(e, pos) => {
			reflectionWindow?.webContents.send(
				"set-animation-pos",
				pos
			);
		}
	);

	ipcMain.on(
		"set-animation-reflection",
		(e, reflection) => {
			setReflection(reflection);
		}
	);

	ipcMain.on(
		"open-menu",
		(event, { x, y }) => {
			openMenu(
				x,
				y,
				`
				<button class='set-pet'>Set Pet</button>

				${
					petAnimations.length === 0
						? ""
						: `
					<hr>

					${petAnimations
						.map(
							(anim) => `
						<button onclick='setAnimation("${anim.url}", ${anim.width})'>
							${anim.name}
						</button>
					`
						)
						.join("")}

					<hr>

					Animation Speed

					<div class="row">
						<input
							class="animation-speed-slider"
							type="range"
							min="20"
							max="300"
							step="1"
							value="${animationSpeed}"
							oninput="setAnimationSpeed(this.value)"
						>

						<span class="animation-speed-label">
							${animationSpeed} BPM
						</span>
					</div>

					<hr>

					Reflect

					<div class="row">
						<input
							class="reflect-slider"
							type="range"
							min="0"
							max="1"
							step="0.01"
							value="${reflect}"
							oninput="setReflect(this.value)"
						>

						<span class="reflect-label">
							${reflect}
						</span>
					</div>
				`
				}

				<hr>

				<button class="reset">
					Reset
				</button>

				<button class="quit">
					Quit
				</button>
			`
			);
		}
	);

	ipcMain.on("drag-start", (e, data) => {
		isDragging = true;

		const [winX, winY] =
			mainWindow.getPosition();

		dragOffsetX = data.mouseX - winX;
		dragOffsetY = data.mouseY - winY;

		if (holdingAnimation?.url) {
			mainWindow.webContents.send(
				"set-animation",
				holdingAnimation.url,
				holdingAnimation.width
			);

			reflectionWindow.webContents.send(
				"set-animation",
				holdingAnimation.url,
				holdingAnimation.width
			);
		}
	});

	ipcMain.on("drag-move", (e, data) => {
		if (!isDragging) return;

		mainWindow.setPosition(
			data.x - dragOffsetX,
			data.y - dragOffsetY
		);

		reflectionWindow.focus();
	});

	ipcMain.on("drag-end", () => {
		if (holdingAnimation?.url) {
			sendAnimation(
				currentAnimation.animation,
				currentAnimation.width
			);
		}

		isDragging = false;
	});

	const petPath = store.get("petPath");

	const reflection =
		store.get("reflection");

	const speed = store.get("speed");

	if (petPath) {
		await loadPet(petPath);
	}

	if (reflection !== undefined) {
		setReflection(reflection);
	}

	if (speed !== undefined) {
		setAnimationSpeed(speed);
	}
});