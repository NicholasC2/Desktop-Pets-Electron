const { BrowserWindow, app, ipcMain, Menu } = require("electron");
const path = require("path");

let win;
let win2;

function createWindow() {

	win = new BrowserWindow({
		width: 220,
		height: 256,
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

	win2 = new BrowserWindow({
		width: 220,
		height: 256,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		resizable: false,
		focusable: false,

		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	})

	win2.setAlwaysOnTop(true, "screen-saver");
	win2.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
	win2.setIgnoreMouseEvents(true, {
		forward: true
	})

	win2.loadFile(path.join(__dirname, "reflection.html"));

	const syncReflectionPosition = () => {
		const [x, y] = win.getPosition()
		const [w, h] = win.getSize()

		win2.setBounds({
			x,
			y: y + 242,
			width: w,
			height: 256
		})
	}

	syncReflectionPosition()

	win.on('move', syncReflectionPosition)

  	win.setAlwaysOnTop(true, "screen-saver");
  	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

	win.loadFile(path.join(__dirname, "index.html"));


	function close() {
		process.exit();
	}

	win.on("close", close)
	win2.on("close", close)
}

let dragging = false;
let offset = { x: 0, y: 0 };

ipcMain.on("drag-start", (event, mousePos) => {

	win2.webContents.send("drag-start")

	dragging = true;

	const [winX, winY] = win.getPosition();

	offset = {
		x: mousePos.x - winX,
		y: mousePos.y - winY
	};
});

ipcMain.on("drag-move", (event, mousePos) => {

	if (!dragging) return;

	win.setPosition(
		mousePos.x - offset.x,
		mousePos.y - offset.y
	);
});

ipcMain.on("drag-end", () => {
	win2.webContents.send("drag-end")

	dragging = false;
});

ipcMain.on("reflect-state", (e, i) => {
	win2.webContents.send("reflect-state", i);
})

const animations = [
	"Waiting",
	"Stepping",
	"Jumping",
	"Zombie",
	"Waving",
	"Hula",
	"Windmill",
	"Zitabata",
	"Dervish"
];

let currentAnimation = 0;

ipcMain.on("show-context-menu", () => {

	const template = animations.map((name, i) => ({
		label: name,
		type: "radio",
		checked: i === currentAnimation,
		click: () => {
			currentAnimation = i;
			win.webContents.send("set-animation", i);
		}
	}));

	template.push(
		{ type: "separator" },
		{
			label: "Show/Hide Options",
			click: () => {
				win.webContents.send("toggle-options");
			}
		},
		{ type: "separator" },
		{
			label: "Quit",
			role: "quit"
		}
	);

	const menu = Menu.buildFromTemplate(template);

	menu.popup({
		window: win
	});
});

app.whenReady().then(createWindow);