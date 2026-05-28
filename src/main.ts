import { BrowserWindow, app, ipcMain, dialog, screen } from "electron";
import { Animation, Pet } from "./pets";
import Store from "electron-store"
import path from "path";

const store = new Store();

let menuWindow: BrowserWindow | null;
let mainWindow: BrowserWindow | null;
let reflectionWindow: BrowserWindow | null;

let pet: Pet | null;
let currentAnimation = 0;
let holding = false;

let animationSpeed = 60;
let reflection = 0.3;

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function safeCloseMenu() {
	if (!menuWindow || menuWindow.isDestroyed()) return;

	menuWindow.removeAllListeners("blur");
	menuWindow.close();
	menuWindow = null;
}

function showError(html = ""): BrowserWindow {
	const pos = mainWindow?.getPosition();
	const size = mainWindow?.getSize();

	if(!pos || !size) throw new Error("Main Window not defined");

	let errorWindow = new BrowserWindow({
		width: size[0],
		height: 1,
		x: pos[0],
		y: pos[1] + (size[1] / 2),
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

	errorWindow.loadFile(path.join(__dirname, "../html/error.html"));

	errorWindow.webContents.on("did-finish-load", () => {
		if (!errorWindow || errorWindow.isDestroyed()) return;

		errorWindow.webContents.send("menu-content", html);
	});

	return errorWindow;
}

function openMenu(x: number, y: number, html = "") {
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

	menuWindow.loadFile(path.join(__dirname, "../html/menu.html"));

	menuWindow.webContents.on("did-finish-load", () => {
		if (!menuWindow || menuWindow.isDestroyed()) return;

		menuWindow.webContents.send("menu-content", html);
	});

	menuWindow.on("blur", () => {
		safeCloseMenu();
	});

	return menuWindow;
}

function setAnimation(animation: number) {
	if (!mainWindow || !reflectionWindow || !pet) return;

	const selectedAnimation = pet.animations[animation];

	if (!selectedAnimation) return;

	mainWindow.webContents.send(
		"set-animation",
		selectedAnimation
	);

	reflectionWindow.webContents.send(
		"set-animation",
		selectedAnimation
	);

	currentAnimation = animation;

	store.set("animation", animation);
}

function setAnimationSpeed(value: number) {
	animationSpeed = value;

	store.set("speed", animationSpeed);

	mainWindow?.webContents.send(
		"set-animation-speed",
		animationSpeed
	);
}

function setReflection(value: number) {
	reflection = value;

	store.set("reflection", reflection);

	reflectionWindow?.webContents.send(
		"set-animation-reflection",
		reflection
	);
}

function resetPet() {
	store.delete("pet");
	store.delete("animation");
	store.delete("reflection");
	store.delete("speed");

	reflection = 0.3;
	animationSpeed = 60;

	currentAnimation = 0;

	pet = null;

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
		y + h - (pet?.reflectionOffset ?? 0)
	);
}

async function loadPet(filePath: string) {
	try {
		pet = await Pet.fromFile(filePath);
		
		currentAnimation = 0;

		store.set("animation", currentAnimation);
		store.set("pet", pet);
	} catch(err) {
		if(err instanceof Error) {
			showError(err.toString())
		}
	}
}

ipcMain.on("menu-height", (event, height) => {
	const window = BrowserWindow.fromWebContents(event.sender);

	if (!window || window.isDestroyed()) return;

	const bounds = window.getBounds();

	const display = screen.getDisplayNearestPoint(bounds);

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

	window.setBounds({
		x,
		y,
		height: Math.ceil(height)
	});
});

ipcMain.on("click", async (e, i) => {
	if(!mainWindow || mainWindow.isDestroyed()) return;

	if (i.elem == "submit") {
		safeCloseMenu();
	}

	if (i.class === "set-pet") {
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
			await loadPet(result.filePaths[0]);

			setAnimation(currentAnimation);
		}
	}

	if (i.class === "reset") {
		resetPet();
	}

	if (i.class === "quit") {
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
		path.join(__dirname, "../html/index.html")
	);

	reflectionWindow.loadFile(
		path.join(__dirname, "../html/reflection.html")
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
			if(!mainWindow || mainWindow.isDestroyed() || !reflectionWindow || reflectionWindow.isDestroyed()) return;

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
		(e, animation) => {
			setAnimation(animation);
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
			if(!reflectionWindow || reflectionWindow.isDestroyed()) return;

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
		"setRememberWindowPos",
		(e, value)=>{
			if(value) {
				if(!mainWindow || mainWindow.isDestroyed()) return;

				const [x, y] = mainWindow.getPosition();
				store.set("windowPos", {x, y})
			} else {
				store.delete("windowPos")
			}
		}
	)

	ipcMain.on(
		"setAutoStart",
		(e, value)=> {
			app.setLoginItemSettings({
				openAtLogin: value
			});
		}
	)

	ipcMain.on(
		"open-menu",
		(event, { x, y }) => {
			let i = 0;

			openMenu(
				x,
				y,
				`
				<button class='set-pet'>Set Pet</button>

				${
					(!pet || pet?.animations.length === 0)
						? ""
						: `
					<hr>

					${pet?.animations
						.map(
							(anim) => {i++; return`
						<button onclick='setAnimation(${i-1})'>
							${anim.name}
						</button>`
						})
						.join("")}

					<hr>

					Animation Speed (BPM)

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

						<input 
							class="animation-speed-label"
							type="number"
							min="20"
							max="300"
							value="${animationSpeed}"
							onblur="setAnimationSpeed(this.value)"
							onkeydown="if(event.key==='Enter') this.blur()"
						>
					</div>
				`
				}				

				<hr>

				Reflect

				<div class="row">
					<input
						class="reflect-slider"
						type="range"
						min="0"
						max="1"
						step="0.01"
						value="${reflection}"
						oninput="setReflect(this.value)"
					>

					<input 
						class="reflect-label"
						min="0"
						max="1"
						type="number"
						value="${reflection}"
						onblur="setReflect(this.value)"
						onkeydown="if(event.key==='Enter') this.blur()"
					>
				</div>

				<hr>

				<div class="row">
    				<span>Remember Window Position</span>
					<input type="checkbox" oninput="setRememberWindowPos(this.checked)" ${store.get("windowPos") != null ? "checked" : ""}>
				</div>

				<div class="row">
    				<span>Auto Start</span>
					<input type="checkbox" oninput="setAutoStart(this.checked)" ${app.getLoginItemSettings().openAtLogin ? "checked" : ""}>
				</div>

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
		const window = BrowserWindow.fromWebContents(e.sender);

		if(!window || window.isDestroyed()) return;

		isDragging = true;

		const [winX, winY] = window.getPosition();

		dragOffsetX = data.mouseX - winX;
		dragOffsetY = data.mouseY - winY;

		if(pet?.holdingAnimation) {
			window.webContents.send("set-animation", pet.holdingAnimation)
			if(reflectionWindow && !reflectionWindow.isDestroyed()) {
				reflectionWindow.webContents.send("set-animation", pet.holdingAnimation)
			}
		}
	});

	ipcMain.on("drag-move", (e, data) => {
		const window = BrowserWindow.fromWebContents(e.sender);
		
		if(!window || window.isDestroyed()) return;

		if (!isDragging) return;

		window.setPosition(
			data.x - dragOffsetX,
			data.y - dragOffsetY
		);

		if(reflectionWindow && !reflectionWindow.isDestroyed()) {
			reflectionWindow.focus();
		}
	});

	ipcMain.on("drag-end", (e) => {
		const window = BrowserWindow.fromWebContents(e.sender);

		if(!window || window.isDestroyed()) return;

		const [x, y] = window.getPosition();

		if(store.get("windowPos")) {
			store.set("windowPos", {x, y})
		}

		if(pet?.holdingAnimation) {
			window.webContents.send("set-animation", pet.animations[currentAnimation])
			if(reflectionWindow && !reflectionWindow.isDestroyed()) {
				reflectionWindow.webContents.send("set-animation", pet.animations[currentAnimation])
			}
		}

		isDragging = false;
	});

	type AnimationData = {
		name: string;
		url: string;
		width: number;
	};

	type PetData = {
		animations: AnimationData[];
		holdingAnimation: AnimationData | null;
		reflectionOffset: number;
	};

	const petData = store.get("pet") as PetData | undefined;

	if(petData) {
		let holdingAnimationData = petData.holdingAnimation;
		let holdingAnimation = null;

		if(holdingAnimationData) {
			holdingAnimation = new Animation(
				holdingAnimationData.url,
				holdingAnimationData.name,
				holdingAnimationData.width
			);
		}

		pet = new Pet(petData.animations.map(a=>new Animation(a.url, a.name, a.width)), holdingAnimation, petData.reflectionOffset);
	}

	type WindowPos = {
		x: number;
		y: number;
	};

	const reflectionSaved = store.get("reflection");
	const speed = store.get("speed");
	const animation = store.get("animation");
	const windowPos = store.get("windowPos");

	if (
    	windowPos &&
		typeof windowPos === "object" &&
		"x" in windowPos &&
		"y" in windowPos &&
		typeof (windowPos as any).x === "number" &&
		typeof (windowPos as any).y === "number"
	) {
		const pos = windowPos as WindowPos;
		mainWindow?.setPosition(pos.x, pos.y);
	}

	if (typeof reflectionSaved == "number") {
		setReflection(reflectionSaved);
	} else {
		store.delete("reflection")
	}

	if (typeof speed == "number") {
		setAnimationSpeed(speed);
	} else {
		store.delete("speed")
	}

	if(typeof animation == "number") {
		setAnimation(animation);
	} else {
		store.delete("animation")
	}

	setReflectionPos();
});
