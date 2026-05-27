const { BrowserWindow, app, ipcMain, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const unzipper = require("unzipper");

let menuWindow = null;
let mainWindow = null;

let petAnimations = [];
let petManifest = null;

let animationSpeed = 60;
let reflect = 0.3;

function safeCloseMenu() {
	if (!menuWindow || menuWindow.isDestroyed()) return;

	menuWindow.removeAllListeners("blur");
	menuWindow.close();
	menuWindow = null;
}

function openMenu(x, y, html = "") {
	if (menuWindow && !menuWindow.isDestroyed()) {
		safeCloseMenu()
	}

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
		menuWindow.webContents.send("menu-content", html);
	});

	menuWindow.on("blur", () => {
		if (menuWindow && !menuWindow.isDestroyed()) {
			safeCloseMenu();
		}
		menuWindow = null;
	});
}

ipcMain.on("menu-height", (event, height) => {
	if (!menuWindow || menuWindow.isDestroyed()) return;

	const bounds = menuWindow.getBounds();
	const display = screen.getDisplayNearestPoint(bounds);
	const work = display.workArea;

	let x = bounds.x;
	let y = bounds.y;
	const width = bounds.width;

	if (x + width > work.x + work.width) {
		x = x - width;
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

ipcMain.on("click", async(e,i) => {
	if(i.elem == "menu" || i.elem == "row" || i.elem == "animation-speed-slider") return;

	if (menuWindow && !menuWindow.isDestroyed()) {
		safeCloseMenu()
	}
	menuWindow = null;

	if(i.elem == "set-pet") {
		const result = await dialog.showOpenDialog(mainWindow, {
			title: "Select a pet",
			properties: ["openFile"],
			filters: [
				{extensions: ["pet"], name: "Pet File"},
				{extensions: ["zip"], name: "Zip Archive"},
    			{ name: "All Files", extensions: ["*"] }
			]
		})

		if(!result.canceled) {
			loadPet(result.filePaths[0]);
		}
	}

	if(i.elem == "quit") {
		process.exit(0)
	}
});

async function loadPet(path) {
	const [x, y] = mainWindow.getPosition();

	const directory = await unzipper.Open.file(path);

	petAnimations = [];
	petManifest = null;

	const imageMap = {};

	const tasks = directory.files.map(async (file) => {

		if (file.path.endsWith("manifest.json")) {
			try {
				const parsedManifest = JSON.parse(
					(await file.buffer()).toString("utf8")
				);

				if (Array.isArray(parsedManifest.animations)) {
					petManifest = parsedManifest;
					openMenu(x, y, "Pet Loaded!");
				}
			} catch (err) {
				openMenu(x, y, "Invalid Manifest!");
			}
			return;
		}

		const ext = file.path.split(".").at(-1).toLowerCase();

		if (["png", "jpg", "jpeg"].includes(ext)) {
			const mime = ext === "jpg" ? "jpeg" : ext;

			const buffer = await file.buffer();

			imageMap[file.path] =
				`data:image/${mime};base64,${buffer.toString("base64")}`;
		}
	});

	await Promise.all(tasks);

	if (petManifest && Array.isArray(petManifest.animations)) {

		petAnimations = petManifest.animations.map(anim => ({
			name: anim.name,
			url: imageMap[anim.path] || null,
			width: anim.width
		}));
	}
}

app.whenReady().then(()=>{
	let reflectionWindow = new BrowserWindow({
		width: 200,
		height: 200,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		resizable: false,
		focusable: false,

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

	mainWindow.setAlwaysOnTop(true, "screen-saver");
	reflectionWindow.setAlwaysOnTop(true, "screen-saver");

	mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	reflectionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

	function setReflectionPos() {
		const [x, y] = mainWindow.getPosition();
		const [w, h] = mainWindow.getSize();

		reflectionWindow.setPosition(x, y + h - (petManifest?.reflectionOffset ?? 0));
	}

	setReflectionPos()

	mainWindow.loadFile(path.join(__dirname, "index.html"));

	reflectionWindow.loadFile(path.join(__dirname, "reflection.html"))

	mainWindow.on("close", ()=>{
		process.exit(0);
	})

	ipcMain.on("set-size", (e, width, height) => {
		reflectionWindow.setSize(width, height);
		mainWindow.setSize(width, height);
	});

	mainWindow.on("move", setReflectionPos)
	mainWindow.on("resize", setReflectionPos)

	ipcMain.on("set-animation", (event, animation, width) => {
		mainWindow.webContents.send("set-animation", animation, width)
		reflectionWindow.webContents.send("set-animation", animation, width)
	})
	
	ipcMain.on("set-animation-speed", (e, speed) => {
		animationSpeed = speed;

		mainWindow.webContents.send("set-animation-speed", animationSpeed)
	})

	ipcMain.on("set-animation-pos", (e, pos) => {
		reflectionWindow.send("set-animation-pos", pos)
	})

	ipcMain.on("set-animation-reflection", (e,reflection) => {
		reflect = reflection;

		reflectionWindow.webContents.send("set-animation-reflection", reflect)
	})

	ipcMain.on("open-menu", (event, { x, y }) => {
		openMenu(x, y, `
			<button class='set-pet'>Set Pet</button>
			${petAnimations.length == 0 ? "" : `
				<hr>
				${petAnimations.map(anim => `
					<button onclick='setAnimation("${anim.url}", ${anim.width})'>
						${anim.name}
					</button>
				`).join("")}
				<hr>
				Animation Speed
				<div class="row">
					<input class="animation-speed-slider" type="range" min="20" max="300" step="1" value="${animationSpeed}" oninput="setAnimationSpeed(this.value)">
					<span class="animation-speed-label">${animationSpeed}BPM</span>
				</div>
				<hr>
				Reflect
				<div class="row">
					<input class="reflect-slider" type="range" min="0" max="1" step="0.01" value="${reflect}" oninput="setReflect(this.value)">
					<span class="reflect-label">${reflect}</span>
				</div>
			`}
			<hr>
			<button class='quit'>Quit</button>
		`);
	});

	let isDragging = false;

	ipcMain.on("drag-start", () => {
		isDragging = true;
	});

	ipcMain.on("drag-move", (e, data) => {
		if (!isDragging) return;

		const [winX, winY] = mainWindow.getSize();

		const newX = (data.x);
		const newY = (data.y);

		mainWindow.setPosition(newX - winX/2, newY - winY/2);
	});

	ipcMain.on("drag-end", () => {
		isDragging = false;
	});
});